# backend/server.py - ClearScope Pro v14.0 FastAPI Backend
import os
import sys

# 🌟 DLL Path Fix for PyInstaller builds
if getattr(sys, 'frozen', False):
    backend_dir = os.path.dirname(sys.executable)
    internal_dir = os.path.join(backend_dir, "_internal")
    if hasattr(os, 'add_dll_directory'):
        os.add_dll_directory(backend_dir)
        if os.path.exists(internal_dir):
            os.add_dll_directory(internal_dir)
    os.environ['PATH'] = backend_dir + os.pathsep + internal_dir + os.pathsep + os.environ['PATH']

import traceback
import sqlite3
import tempfile
import uuid
import numpy as np
import laspy
try:
    import e57
except ImportError:
    e57 = None  # fallback: pye57 used directly in /load-file endpoint
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import io

# Windows Unicode/Emoji crash fix
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = FastAPI(title="Cloudify Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# High-speed memory cache
global_cloud_cache = {
    "points": None,       # float32 numpy array
    "colors": None,       # uint8 numpy array
    "intensities": None,  # float32 numpy array
    "metadata": None
}


def extract_geoslam_laz(file_path: str) -> str:
    """Extract LAZ data from a GeoSLAM SQLite container."""
    try:
        conn = sqlite3.connect(file_path)
        cur = conn.cursor()
        cur.execute("SELECT data FROM post_slam_data WHERE name='post_slam_laz' LIMIT 1")
        row = cur.fetchone()
        conn.close()
        if not row or row[0] is None:
            raise ValueError("No post_slam_laz found in this .geoslam file!")
        temp_laz_path = os.path.join(tempfile.gettempdir(), f"geoslam_extracted_{uuid.uuid4().hex}.laz")
        with open(temp_laz_path, "wb") as wf:
            wf.write(row[0])
        return temp_laz_path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GeoSlam extraction failed: {str(e)}")


@app.post("/load-file")
async def load_file(file_path: str, max_points: int = 3000000):
    """Load a point cloud file into memory cache and return metadata."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="File path does not exist!")

    ext = os.path.splitext(file_path)[1].lower()
    temp_file_to_clean = None

    if ext == ".geoslam":
        file_path = extract_geoslam_laz(file_path)
        temp_file_to_clean = file_path
        ext = ".laz"

    try:
        points = None
        colors = None
        intensities = None
        has_color = False
        has_intensity = False

        if ext in [".las", ".laz"]:
            with laspy.open(file_path) as f:
                las = f.read()
                num_points = len(las.x)
                points = np.empty((num_points, 3), dtype=np.float32)
                points[:, 0] = las.x
                points[:, 1] = las.y
                points[:, 2] = las.z

                if hasattr(las, 'red'):
                    has_color = True
                    red = np.array(las.red)
                    green = np.array(las.green)
                    blue = np.array(las.blue)
                    if np.max(red) > 255:
                        scale = 255.0 / 65535.0
                        colors = np.vstack((red * scale, green * scale, blue * scale)).transpose().astype(np.uint8)
                    else:
                        colors = np.vstack((red, green, blue)).transpose().astype(np.uint8)

                if hasattr(las, 'intensity'):
                    has_intensity = True
                    intensities = np.array(las.intensity).astype(np.float32)

        elif ext == ".e57":
            try:
                import pye57
                e57_file = pye57.E57(file_path)
                data = e57_file.read_scan(0, ignore_missing_fields=True)

                x = np.array(data.get("cartesianX", []), dtype=np.float32)
                y = np.array(data.get("cartesianY", []), dtype=np.float32)
                z = np.array(data.get("cartesianZ", []), dtype=np.float32)
                points = np.column_stack((x, y, z)).astype(np.float32)

                if "colorRed" in data and "colorGreen" in data and "colorBlue" in data:
                    has_color = True
                    r = np.array(data["colorRed"], dtype=np.float32)
                    g = np.array(data["colorGreen"], dtype=np.float32)
                    b = np.array(data["colorBlue"], dtype=np.float32)
                    # Normalize to 0-255 if float 0-1 range
                    if np.max(r) <= 1.0:
                        r = r * 255; g = g * 255; b = b * 255
                    colors = np.column_stack((r, g, b)).astype(np.uint8)

                if "intensity" in data:
                    has_intensity = True
                    intensities = np.array(data["intensity"], dtype=np.float32)

            except Exception as e57_err:
                raise HTTPException(status_code=500, detail=f"E57 Read Failed: {str(e57_err)}")

        if temp_file_to_clean and os.path.exists(temp_file_to_clean):
            os.remove(temp_file_to_clean)

        if points is None or len(points) == 0:
            raise ValueError("No valid points could be extracted from the file.")

        # Dynamic density downsampling
        total_points = len(points)
        if max_points > 0 and total_points > max_points:
            import math
            step = int(math.ceil(total_points / max_points))
            points = points[::step]
            if colors is not None:
                colors = colors[::step]
            if intensities is not None:
                intensities = intensities[::step]

        # WebGL precision centering
        data_center = np.mean(points, axis=0)
        points = (points - data_center).astype(np.float32)

        global_cloud_cache["points"] = points
        global_cloud_cache["colors"] = colors
        global_cloud_cache["intensities"] = intensities

        return {
            "points_count": len(points),
            "has_color": has_color,
            "has_intensity": has_intensity
        }

    except Exception as e:
        if temp_file_to_clean and os.path.exists(temp_file_to_clean):
            os.remove(temp_file_to_clean)
        raise HTTPException(status_code=500, detail=f"Failed to parse point cloud: {str(e)}")


@app.get("/points-binary")
async def get_points_binary():
    """Stream raw float32 XYZ point data directly to GPU buffer."""
    points = global_cloud_cache["points"]
    if points is None:
        raise HTTPException(status_code=404, detail="No points loaded")
    return Response(content=points.tobytes(), media_type="application/octet-stream")


@app.get("/colors-binary")
async def get_colors_binary():
    """Stream raw uint8 RGB color data directly to GPU buffer."""
    colors = global_cloud_cache["colors"]
    if colors is None:
        return Response(content=b"", media_type="application/octet-stream")
    return Response(content=colors.tobytes(), media_type="application/octet-stream")


@app.get("/intensities-binary")
async def get_intensities_binary():
    """Stream raw float32 intensity data directly to GPU buffer."""
    intensities = global_cloud_cache["intensities"]
    if intensities is None:
        return Response(content=b"", media_type="application/octet-stream")
    return Response(content=intensities.tobytes(), media_type="application/octet-stream")


@app.post("/export-e57")
async def export_e57(source_path: str, output_path: str):
    """Export a full-resolution point cloud to E57 format without downsampling."""
    if not os.path.exists(source_path):
        raise HTTPException(status_code=400, detail="Source file not found")

    ext = os.path.splitext(source_path)[1].lower()
    temp_laz_to_clean = None

    try:
        import laspy
        import pye57

        if ext == ".geoslam":
            conn = sqlite3.connect(source_path)
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM post_slam_data WHERE name='post_slam_laz' LIMIT 1")
            row = cursor.fetchone()
            conn.close()
            if not row or row[0] is None:
                raise ValueError("Invalid GeoSLAM data.")
            temp_laz_to_clean = os.path.join(tempfile.gettempdir(), f"exp_{uuid.uuid4().hex}.laz")
            with open(temp_laz_to_clean, "wb") as wf:
                wf.write(row[0])
            source_path = temp_laz_to_clean
            ext = ".laz"

        if ext in [".las", ".laz"]:
            with laspy.open(source_path) as f:
                las = f.read()
                pts = np.vstack((las.x, las.y, las.z)).transpose()

                if hasattr(las, 'red'):
                    r_raw = np.array(las.red, dtype=np.float64)
                    g_raw = np.array(las.green, dtype=np.float64)
                    b_raw = np.array(las.blue, dtype=np.float64)
                    div = 256.0 if np.max(r_raw) > 255 else 1.0
                    color_r = (r_raw / div).astype(np.int32)
                    color_g = (g_raw / div).astype(np.int32)
                    color_b = (b_raw / div).astype(np.int32)
                else:
                    z = pts[:, 2]
                    z_min, z_max = np.min(z), np.max(z)
                    z_range = z_max - z_min if (z_max - z_min) != 0 else 1.0
                    z_norm = (z - z_min) / z_range
                    r = np.clip(np.minimum(4*z_norm-1.5, -4*z_norm+4.5), 0, 1)
                    g = np.clip(np.minimum(4*z_norm-0.5, -4*z_norm+3.5), 0, 1)
                    b = np.clip(np.minimum(4*z_norm+0.5, -4*z_norm+2.5), 0, 1)
                    color_r = (r * 255).astype(np.int32)
                    color_g = (g * 255).astype(np.int32)
                    color_b = (b * 255).astype(np.int32)

                intensity = np.array(las.intensity, dtype=np.int32) if hasattr(las, 'intensity') else np.full(len(pts), 255, dtype=np.int32)

                e57_writer = pye57.E57(output_path, mode='w')
                e57_writer.write_scan_raw({
                    'cartesianX': pts[:, 0], 'cartesianY': pts[:, 1], 'cartesianZ': pts[:, 2],
                    'colorRed': color_r, 'colorGreen': color_g, 'colorBlue': color_b,
                    'intensity': intensity
                })
                e57_writer.close()

        if temp_laz_to_clean and os.path.exists(temp_laz_to_clean):
            os.remove(temp_laz_to_clean)

        return {"status": "success", "message": "Exported with Baked 8-bit Colors"}

    except Exception as e:
        if temp_laz_to_clean and os.path.exists(temp_laz_to_clean):
            os.remove(temp_laz_to_clean)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shutdown")
async def shutdown_server():
    """Gracefully shut down this backend instance (used by compare viewport on close)."""
    import threading
    def _stop():
        import time, os, signal
        time.sleep(0.3)
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Thread(target=_stop, daemon=True).start()
    return {"status": "shutting down"}


if __name__ == "__main__":
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args, unknown = parser.parse_known_args()

    print(f"Cloudify Backend starting on port: {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
