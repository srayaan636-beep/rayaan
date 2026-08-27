// renderer.js - Cloudify
// Full WebGL Point Cloud Engine with Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ◐ DYNAMIC PORT ENGINE FOR MULTI-WINDOW SUPPORT
if (typeof window.current_backend_port === 'undefined') {
    window.current_backend_port = 8000;
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) {
                const port = ipcRenderer.sendSync('get-backend-port');
                if (port) {
                    window.current_backend_port = port;
                    console.log(`📡 WebGL synced with Dynamic Python Port: ${port}`);
                }

                // POINT DENSITY PERSISTENCE
                const densityCombo = document.getElementById('combo-density');
                if (densityCombo) {
                    const savedMaxPoints = localStorage.getItem('user_max_points') || "3000000";
                    densityCombo.value = savedMaxPoints;
                    densityCombo.addEventListener('change', () => {
                        localStorage.setItem('user_max_points', densityCombo.value);
                    });
                }

                // main.js থেকে assigned port sync (init-backend-port event)
                ipcRenderer.on('init-backend-port', (event, port) => {
                    if (port) {
                        window.current_backend_port = port;
                        console.log(`📡 Port synced via init event: ${port}`);
                    }
                });

                // File menu → "Open Scan (This Window)" trigger
                ipcRenderer.on('open-file-shortcut-trigger', () => {
                    const btn = document.getElementById('btn-load');
                    if (btn) btn.click();
                });

                // Double-click / file association open listener
                ipcRenderer.on('open-file-shortcut', (event, filePath) => {
                    if (!filePath) return;
                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.innerText = `⏳ Loading: ${filePath.split('\\').pop()}`;
                        statusEl.style.color = "#ff9800";
                    }
                    // processFileLoad module scope এ define হয় — retry দিয়ে call করা
                    const tryLoad = (attempts) => {
                        if (typeof processFileLoad === 'function') {
                            const mockFile = { path: filePath, name: filePath.split('\\').pop(), size: 0 };
                            processFileLoad(mockFile);
                        } else if (attempts > 0) {
                            setTimeout(() => tryLoad(attempts - 1), 500);
                        }
                    };
                    tryLoad(10);
                });
            }
        }
    } catch (e) {
        console.error("Electron IPC context not ready yet:", e);
    }
});

// ১. loaders.gl LAZ support
let LASLoader = null;
const searchContexts = [window, window.loaders];
if (window.loaders) {
    for (const ctx of searchContexts) {
        if (!ctx) continue;
        for (const key in ctx) {
            if (key.toLowerCase().includes('lasloader')) { LASLoader = ctx[key]; break; }
        }
        if (LASLoader) break;
    }
}
if (typeof window !== 'undefined' && window.loaders && window.loaders.registerLoaders && LASLoader) {
    window.loaders.registerLoaders(LASLoader);
}

// ২. Helper methods
function receivedLengthFromChunks(chunks) {
    return chunks.reduce((acc, chunk) => acc + chunk.length, 0);
}
function assembleChunks(chunks, outputBuffer) {
    let position = 0;
    for (let chunk of chunks) { outputBuffer.set(chunk, position); position += chunk.length; }
}
function getJetColor(v) {
    const r = Math.max(0.0, Math.min(1.0, Math.min(4.0 * v - 1.5, -4.0 * v + 4.5)));
    const g = Math.max(0.0, Math.min(1.0, Math.min(4.0 * v - 0.5, -4.0 * v + 3.5)));
    const b = Math.max(0.0, Math.min(1.0, Math.min(4.0 * v + 0.5, -4.0 * v + 2.5)));
    return { r, g, b };
}

// ৩. Scene, Camera, Renderer setup
const scene = new THREE.Scene();

function createPythonGradientBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 512, 0, 0);
    gradient.addColorStop(0, '#f1f3f4');
    gradient.addColorStop(1, '#e8eaed');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
scene.background = createPythonGradientBackground();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10);

const aspect = window.innerWidth / window.innerHeight;
const orthoCamera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 1000);
let activeCamera = camera;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.localClippingEnabled = true;
document.getElementById('viewport').appendChild(renderer.domElement);

// ৪. OrbitControls
const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = false;
controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
};

// ৪.১ UCS Ruler variables
let isUcsActive = false, ucsPlaced = false;
let ucsHandleA = null, ucsHandleB = null, ucsLineX = null, ucsLineZ = null;
let isDraggingHandleA = false, isDraggingHandleB = false;
let currentViewMode = 'iso';
let ucsSpawnOffset = 2.5;

function initUcsWidget() {
    const handleGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const handleMat = new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.85, depthTest: false });
    ucsHandleA = new THREE.Mesh(handleGeom, handleMat); ucsHandleA.visible = false; scene.add(ucsHandleA);
    ucsHandleB = new THREE.Mesh(handleGeom, handleMat.clone()); ucsHandleB.visible = false; scene.add(ucsHandleB);
    ucsLineX = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.9 }));
    ucsLineX.visible = false; ucsLineX.renderOrder = 999; scene.add(ucsLineX);
    ucsLineZ = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.9 }));
    ucsLineZ.visible = false; ucsLineZ.renderOrder = 999; scene.add(ucsLineZ);
}
initUcsWidget();

function updateUcsLineGeometry() {
    if (!ucsHandleA || !ucsHandleB || !ucsLineX || !ucsLineZ) return;
    const pA = ucsHandleA.position, pB = ucsHandleB.position;
    const distX = pA.distanceTo(pB);
    if (distX > 0.001) {
        ucsLineX.geometry.dispose();
        ucsLineX.geometry = new THREE.CylinderGeometry(0.015, 0.015, distX, 8);
        ucsLineX.geometry.translate(0, distX / 2, 0);
        ucsLineX.geometry.rotateX(Math.PI / 2);
        ucsLineX.position.copy(pA); ucsLineX.lookAt(pB);
    }
    const dirX = new THREE.Vector3().subVectors(pB, pA);
    const length = dirX.length();
    const dirZ = new THREE.Vector3(-dirX.z, 0, dirX.x).normalize().multiplyScalar(length);
    const pC = new THREE.Vector3().addVectors(pA, dirZ);
    const distZ = pA.distanceTo(pC);
    if (distZ > 0.001) {
        ucsLineZ.geometry.dispose();
        ucsLineZ.geometry = new THREE.CylinderGeometry(0.015, 0.015, distZ, 8);
        ucsLineZ.geometry.translate(0, distZ / 2, 0);
        ucsLineZ.geometry.rotateX(Math.PI / 2);
        ucsLineZ.position.copy(pA); ucsLineZ.lookAt(pC);
    }
}

// Global variables
let activePointCloud = null;
window.isMeasureActive = false;
window.isAreaModeActive = false;
window.pickedPoints = [];
window.snapToDominantAxis = function(p1, p2) {
    // p1 থেকে p2-এর দিকে যে axis (X/Y/Z)-এ সবচেয়ে বেশি দূরত্ব, সেই axis বরাবর line-টা সোজা করে দেয়
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const snapped = p2.clone();
    if (ax >= ay && ax >= az) { snapped.y = p1.y; snapped.z = p1.z; }
    else if (ay >= ax && ay >= az) { snapped.x = p1.x; snapped.z = p1.z; }
    else { snapped.x = p1.x; snapped.y = p1.y; }
    return snapped;
};
let draggedAnchor = null;
const draggedAnchorPlane = new THREE.Plane();
window.areaPoints = [];
window.measureColor = "#00ffcc";
window.permanentMeasurements = [];
window.permanentLabels = [];
window.cameraFacingRings = [];
let isDraggingArea = false;
let areaStartPoint = null;
let areaMouseDownPos = null;
const DRAG_THRESHOLD = 5; // pixels

// Floating HUD
const floatingHudEl = document.createElement('div');
floatingHudEl.id = 'universal-floating-hud';
floatingHudEl.style.cssText = "position:absolute; top:20px; right:20px; color:white; padding:10px 18px; border-radius:8px; font-weight:bold; font-size:13px; display:none; z-index:1000; box-shadow:0 4px 15px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); transition: all 0.2s ease;";
document.body.appendChild(floatingHudEl);
window.showHudNotification = function(text, bgColor, borderColor) {
    floatingHudEl.innerText = text; floatingHudEl.style.background = bgColor;
    floatingHudEl.style.borderColor = borderColor; floatingHudEl.style.display = 'block';
};
window.hideHudNotification = function() { floatingHudEl.style.display = 'none'; };

let liveLineMesh = null, liveAreaMesh = null, liveDistanceLabelEl = null;
document.getElementById('measure-color-picker').addEventListener('input', (e) => { window.measureColor = e.target.value; });

// Memory cache
let loadedPointCloudData = { positions: null, originalPositions: null, colors: null, intensities: null, count: 0 };
const fileInput = document.getElementById('file-input');
const btnLoad = document.getElementById('btn-load');
const statusEl = document.getElementById('status');
const ptsizeSlider = document.getElementById('slider-ptsize');
const ptsizeLabel = document.getElementById('lbl-ptsize');
const colorModeCombo = document.getElementById('combo-color');
const chkShading = document.getElementById('chk-shading');
const btnSlice = document.getElementById('btn-slice');
const btnResetSlice = document.getElementById('btn-reset-slice');

// ৭. Clipping planes (GPU Slice Box)
const clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 1000),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1000),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 1000),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000)
];

let sliceBoxMesh = null, isSliceActive = false, activeFaceNormal = null;
let initialIntersectionPoint = new THREE.Vector3();
let initialBoxPosition = new THREE.Vector3();
let initialBoxScale = new THREE.Vector3();
let isDraggingFace = false;

window.highlightSliceFace = function(normal, isHighlight) {
    if (!sliceBoxMesh || !normal) return;
    let idx = -1;
    if (normal.x === 1) idx = 0; else if (normal.x === -1) idx = 1;
    else if (normal.y === 1) idx = 2; else if (normal.y === -1) idx = 3;
    else if (normal.z === 1) idx = 4; else if (normal.z === -1) idx = 5;
    if (idx !== -1) {
        sliceBoxMesh.material[idx].opacity = isHighlight ? 0.50 : 0.12;
        sliceBoxMesh.material[idx].color.setHex(isHighlight ? 0xaa0000 : 0xff3333);
        sliceBoxMesh.material[idx].needsUpdate = true;
    }
};

function initSliceTool() {
    const boxGeom = new THREE.BoxGeometry(12, 12, 12);
    const materials = [];
    for (let i = 0; i < 6; i++) {
        materials.push(new THREE.MeshBasicMaterial({
            color: 0xff3333, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide
        }));
    }
    sliceBoxMesh = new THREE.Mesh(boxGeom, materials);
    sliceBoxMesh.position.set(0, 5, 0);
    sliceBoxMesh.visible = false;
    const edgesGeometry = new THREE.EdgesGeometry(boxGeom);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff1111, linewidth: 2.5 });
    const boxOutline = new THREE.LineSegments(edgesGeometry, lineMaterial);
    sliceBoxMesh.add(boxOutline);
    scene.add(sliceBoxMesh);
}
initSliceTool();

function updateClippingPlanes() {
    if (!sliceBoxMesh || !isSliceActive) return;
    const box3 = new THREE.Box3().setFromObject(sliceBoxMesh);
    clippingPlanes[0].constant = -box3.min.x;
    clippingPlanes[1].constant = box3.max.x;
    clippingPlanes[2].constant = -box3.min.y;
    clippingPlanes[3].constant = box3.max.y;
    clippingPlanes[4].constant = -box3.min.z;
    clippingPlanes[5].constant = box3.max.z;
    const thicknessCm = Math.round((box3.max.y - box3.min.y) * 100);
    const inputThickness = document.getElementById('input-slice-thickness');
    if (inputThickness && document.activeElement !== inputThickness) inputThickness.value = thicknessCm;
}

function resetClippingPlanes() { clippingPlanes.forEach(plane => plane.constant = 1000); }

// Pre-allocated orbit cache
if (!window._orbitCache) {
    window._orbitCache = {
        rotMatrix: new THREE.Matrix4(), elevMatrix: new THREE.Matrix4(),
        camOffset: new THREE.Vector3(), targetOffset: new THREE.Vector3(),
        worldY: new THREE.Vector3(0, 1, 0), camRight: new THREE.Vector3(), lookDir: new THREE.Vector3()
    };
}

// ৮. Mouse event handlers
window.addEventListener('mousedown', (event) => {
    if (event.target.closest('#sidebar') || event.target.tagName === 'SELECT' || event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON') return;
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, activeCamera);

    // Grab measurement anchor
    if (!window.isMeasureActive && !window.isAreaModeActive && !isUcsActive && !isSliceActive && activePointCloud) {
        const anchors = [];
        window.measLayers.forEach(layer => {
            if (layer.meshes && layer.meshes[1] && layer.meshes[2]) anchors.push(layer.meshes[1], layer.meshes[2]);
        });
        if (anchors.length > 0) {
            const intersects = raycaster.intersectObjects(anchors);
            if (intersects.length > 0) {
                draggedAnchor = intersects[0].object;
                controls.enabled = false;
                const normal = new THREE.Vector3();
                activeCamera.getWorldDirection(normal); normal.negate();
                draggedAnchorPlane.setFromNormalAndCoplanarPoint(normal, draggedAnchor.position);
                return;
            }
        }
    }

    // Orbit pivot lock
    const isOrbitTriggered = event.ctrlKey || (!window.isMeasureActive && !window.isAreaModeActive && !isUcsActive && !isSliceActive);
    if (isOrbitTriggered && activePointCloud && currentViewMode === 'iso') {
        raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
        const orbitIntersects = raycaster.intersectObject(activePointCloud);
        if (orbitIntersects.length > 0) {
            let validPoint = null;
            for (let i = 0; i < orbitIntersects.length; i++) {
                const pt = orbitIntersects[i].point;
                let isClipped = false;
                for (let j = 0; j < clippingPlanes.length; j++) {
                    if (clippingPlanes[j].distanceToPoint(pt) < 0) { isClipped = true; break; }
                }
                if (!isClipped) { validPoint = pt; break; }
            }
            if (validPoint) {
                if (!window.orbitPivotMarker) {
                    const pGeom = new THREE.SphereGeometry(0.05, 16, 16);
                    const pMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, depthTest: false, transparent: true, opacity: 0.9 });
                    window.orbitPivotMarker = new THREE.Mesh(pGeom, pMat);
                    window.orbitPivotMarker.renderOrder = 9999;
                    scene.add(window.orbitPivotMarker);
                }
                window.orbitPivotMarker.position.copy(validPoint);
                window.orbitPivotMarker.visible = true;
                if (window.orbitPivotTimeout) clearTimeout(window.orbitPivotTimeout);
                window.orbitPivotTimeout = setTimeout(() => { if (window.orbitPivotMarker) window.orbitPivotMarker.visible = false; }, 700);
                window.customPivot = validPoint.clone();
                window.isCustomOrbit = true;
                window.lastMouseX = event.clientX;
                window.lastMouseY = event.clientY;
                window.customOrbitDist = activeCamera.position.distanceTo(validPoint);
                controls.enabled = false;
            }
        }
    }

    // UCS ruler place (1st click)
    if (isUcsActive && !ucsPlaced && activePointCloud) {
        raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.12);
        const intersects = raycaster.intersectObject(activePointCloud);
        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;
            ucsHandleA.position.set(hitPoint.x, hitPoint.y + 0.05, hitPoint.z);
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(activeCamera.quaternion);
            cameraRight.y = 0; cameraRight.normalize();
            const spawnPosB = new THREE.Vector3().addVectors(hitPoint, cameraRight.multiplyScalar(ucsSpawnOffset));
            ucsHandleB.position.copy(spawnPosB);
            ucsHandleB.position.y = hitPoint.y + 0.05;
            ucsHandleA.visible = true; ucsHandleB.visible = true;
            ucsLineX.visible = true; ucsLineZ.visible = true;
            updateUcsLineGeometry();
            ucsPlaced = true;
            btnApplyUcs.style.display = "block";
            statusEl.innerText = "▱ UCS Ruler Placed! Drag the Golden Spheres to align.";
        }
        return;
    }

    // UCS handle drag detection
    if (isUcsActive && ucsPlaced && ucsHandleA && ucsHandleB) {
        const intersectsA = raycaster.intersectObject(ucsHandleA);
        const intersectsB = raycaster.intersectObject(ucsHandleB);
        if (intersectsA.length > 0) {
            isDraggingHandleA = true; controls.enabled = false;
            initialIntersectionPoint.copy(intersectsA[0].point); return;
        } else if (intersectsB.length > 0) {
            isDraggingHandleB = true; controls.enabled = false;
            initialIntersectionPoint.copy(intersectsB[0].point); return;
        }
    }

    // Area measurement click/drag
    if (window.isAreaModeActive && activePointCloud) {
        let hitPoint = null;
        if (isOrthoMode) {
            const planeNormal = new THREE.Vector3();
            activeCamera.getWorldDirection(planeNormal);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, controls.target);
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, intersection)) hitPoint = intersection.clone();
        } else {
            raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
            const intersects = raycaster.intersectObject(activePointCloud);
            if (intersects.length > 0) hitPoint = intersects[0].point.clone();
        }
        if (hitPoint) {
            if (clippingPlanes[3].constant !== 1000) {
                if (currentViewMode === 'top') hitPoint.y = clippingPlanes[3].constant;
                else if (hitPoint.y > clippingPlanes[3].constant) hitPoint.y = clippingPlanes[3].constant;
            }
            const shapeMode = document.getElementById('combo-area-shape').value;
            if (!window.areaPoints) window.areaPoints = [];
            
            if (shapeMode === "Polygon") {
                let finalPoint = hitPoint.clone();
                if (event.shiftKey && window.areaPoints.length > 0) {
                    const lastPt = window.areaPoints[window.areaPoints.length - 1];
                    const dx = Math.abs(finalPoint.x - lastPt.x), dy = Math.abs(finalPoint.y - lastPt.y), dz = Math.abs(finalPoint.z - lastPt.z);
                    if (dx > dy && dx > dz) finalPoint.set(finalPoint.x, lastPt.y, lastPt.z);
                    else if (dy > dx && dy > dz) finalPoint.set(lastPt.x, finalPoint.y, lastPt.z);
                    else finalPoint.set(lastPt.x, lastPt.y, finalPoint.z);
                }
                window.areaPoints.push(finalPoint);
                console.log('Polygon click added, total points:', window.areaPoints.length);
                if (window.drawLivePolygon) window.drawLivePolygon(window.areaPoints);
                statusEl.innerText = `▱ Polygon: ${window.areaPoints.length} points (Double-click to finish)`;
            } else if (shapeMode === "Rectangle" || shapeMode === "Circle") {
                // Store initial position and point, but don't start drag yet
                areaMouseDownPos = { x: event.clientX, y: event.clientY };
                areaStartPoint = hitPoint;
                window.areaPoints = [hitPoint];
                // Don't disable controls yet - wait for drag threshold
                statusEl.innerText = `▱ ${shapeMode}: Drag to draw...`;
            }
            return;
        }
    }

    // Slice box face drag
    if (isSliceActive && sliceBoxMesh && !event.ctrlKey) {
        const intersects = raycaster.intersectObject(sliceBoxMesh, false);
        if (intersects.length > 0) {
            const hit = (event.shiftKey && intersects.length > 1) ? intersects[1] : intersects[0];
            initialIntersectionPoint.copy(hit.point);
            initialBoxPosition.copy(sliceBoxMesh.position);
            initialBoxScale.copy(sliceBoxMesh.scale);
            controls.enabled = false; isDraggingFace = true;
            if (hit && hit.face && !isOrthoMode) {
                const normal = hit.face.normal.clone();
                normal.transformDirection(sliceBoxMesh.matrixWorld);
                activeFaceNormal = normal.round();
            } else {
                activeFaceNormal = new THREE.Vector3();
                const box3 = new THREE.Box3().setFromObject(sliceBoxMesh);
                const threshold = 0.40;
                if (currentViewMode === 'front' || currentViewMode === 'back') {
                    const dists = [Math.abs(hit.point.x - box3.max.x), Math.abs(hit.point.x - box3.min.x), Math.abs(hit.point.y - box3.max.y), Math.abs(hit.point.y - box3.min.y)];
                    const minD = Math.min(...dists);
                    if (minD < threshold) {
                        if (minD === dists[0]) activeFaceNormal.set(1,0,0);
                        else if (minD === dists[1]) activeFaceNormal.set(-1,0,0);
                        else if (minD === dists[2]) activeFaceNormal.set(0,1,0);
                        else activeFaceNormal.set(0,-1,0);
                    }
                }
            }
            if (activeFaceNormal) window.highlightSliceFace(activeFaceNormal, true);
        }
    }
});

window.addEventListener('mousemove', (event) => {
    // Drag anchor
    if (draggedAnchor) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        let intersection = null;
        if (activePointCloud) {
            raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
            const cloudIntersects = raycaster.intersectObject(activePointCloud);
            if (cloudIntersects.length > 0) intersection = cloudIntersects[0].point.clone();
        }
        if (!intersection) {
            intersection = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(draggedAnchorPlane, intersection)) return;
        }
        // Shift চেপে থাকলে, অন্য প্রান্তের সাপেক্ষে axis-এ snap করা (edit mode-এও কাজ করবে)
        const measObjPre = draggedAnchor.userData.measObj;
        if (event.shiftKey && measObjPre) {
            const s1pre = measObjPre.meshes[1], s2pre = measObjPre.meshes[2];
            const otherPoint = (draggedAnchor === s1pre) ? s2pre.position : s1pre.position;
            intersection = window.snapToDominantAxis(otherPoint, intersection);
        }
        draggedAnchor.position.copy(intersection);
        const measObj = draggedAnchor.userData.measObj;
        if (measObj) {
            const line = measObj.meshes[0], s1 = measObj.meshes[1], s2 = measObj.meshes[2];
            const p1 = s1.position, p2 = s2.position;
            const distance = p1.distanceTo(p2);
            line.geometry.dispose();
            const cylGeom = new THREE.CylinderGeometry(0.007, 0.007, distance, 8);
            cylGeom.translate(0, distance / 2, 0); cylGeom.rotateX(Math.PI / 2);
            line.geometry = cylGeom; line.position.copy(p1); line.lookAt(p2);
            const dx = Math.abs(p2.x-p1.x), dy = Math.abs(p2.y-p1.y), dz = Math.abs(p2.z-p1.z);
            const dxy = Math.sqrt(dx*dx + dz*dz);
            const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            if (measObj.label) measObj.label.innerHTML = `Dist: ${distance.toFixed(3)}m\nXY: ${dxy.toFixed(3)}m\nX: ${dx.toFixed(3)}m\nY: ${dy.toFixed(3)}m\nZ: ${dz.toFixed(3)}m`;
            const labelObj = window.permanentLabels.find(l => l.element === measObj.label);
            if (labelObj) labelObj.position.copy(midPoint);
            measObj.name = `Dist: ${distance.toFixed(2)}m`;
        }
        return;
    }

    // Custom orbit
    if (window.isCustomOrbit && window.customPivot) {
        const deltaX = event.clientX - window.lastMouseX;
        const deltaY = event.clientY - window.lastMouseY;
        window.lastMouseX = event.clientX; window.lastMouseY = event.clientY;
        const sensitivity = 0.010;
        const angleAzimuth = -deltaX * sensitivity;
        const angleElevation = -deltaY * sensitivity;
        const P = window.customPivot;
        const cache = window._orbitCache;
        cache.camRight.set(1, 0, 0).applyQuaternion(activeCamera.quaternion).normalize();
        cache.lookDir.set(0, 0, -1).applyQuaternion(activeCamera.quaternion);
        const dotTest = Math.abs(cache.lookDir.dot(cache.worldY));
        if (dotTest > 0.96 && (angleElevation * (cache.lookDir.y > 0 ? 1 : -1)) > 0) {
            cache.rotMatrix.makeRotationAxis(cache.worldY, angleAzimuth);
        } else {
            cache.rotMatrix.makeRotationAxis(cache.worldY, angleAzimuth);
            cache.elevMatrix.makeRotationAxis(cache.camRight, angleElevation);
            cache.rotMatrix.multiply(cache.elevMatrix);
        }
        cache.camOffset.copy(activeCamera.position).sub(P).applyMatrix4(cache.rotMatrix);
        activeCamera.position.copy(P).add(cache.camOffset);
        cache.targetOffset.copy(controls.target).sub(P).applyMatrix4(cache.rotMatrix);
        controls.target.copy(P).add(cache.targetOffset);
        activeCamera.lookAt(controls.target);
        activeCamera.updateMatrixWorld(true);
        if (activeCamera.isOrthographicCamera) activeCamera.updateProjectionMatrix();
        return;
    }

    // UCS handle drag
    if ((isDraggingHandleA || isDraggingHandleB) && isUcsActive) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        let planeNormal = new THREE.Vector3(0, 1, 0);
        if (currentViewMode === 'front' || currentViewMode === 'back') planeNormal.set(0, 0, 1);
        else if (currentViewMode === 'left' || currentViewMode === 'right') planeNormal.set(1, 0, 0);
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(planeNormal, initialIntersectionPoint);
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersection)) {
            if (isDraggingHandleA) {
                const shiftOffset = new THREE.Vector3().subVectors(intersection, ucsHandleA.position);
                ucsHandleA.position.copy(intersection);
                ucsHandleB.position.add(shiftOffset);
            } else if (isDraggingHandleB) {
                if (currentViewMode === 'front' || currentViewMode === 'back')
                    ucsHandleB.position.set(intersection.x, intersection.y, ucsHandleA.position.z);
                else if (currentViewMode === 'left' || currentViewMode === 'right')
                    ucsHandleB.position.set(ucsHandleA.position.x, intersection.y, intersection.z);
                else ucsHandleB.position.copy(intersection);
            }
            updateUcsLineGeometry();
        }
        return;
    }

    // Area drag preview - check threshold first
    if (areaMouseDownPos && areaStartPoint && !isDraggingArea) {
        const dx = event.clientX - areaMouseDownPos.x;
        const dy = event.clientY - areaMouseDownPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > DRAG_THRESHOLD) {
            // Started dragging - disable controls and show preview
            isDraggingArea = true;
            controls.enabled = false;
            areaMouseDownPos = null; // Clear so we don't check again
        }
    }
    
    if (isDraggingArea && areaStartPoint && activePointCloud) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        let currentPt = new THREE.Vector3();
        
        if (isOrthoMode) {
            const planeNormal = new THREE.Vector3();
            activeCamera.getWorldDirection(planeNormal);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, areaStartPoint);
            if (raycaster.ray.intersectPlane(plane, currentPt)) currentPt = currentPt.clone();
        } else {
            raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
            const intersects = raycaster.intersectObject(activePointCloud);
            if (intersects.length > 0) currentPt = intersects[0].point.clone();
        }
        
        if (currentPt) {
            if (clippingPlanes[3].constant !== 1000) {
                if (currentViewMode === 'top') currentPt.y = clippingPlanes[3].constant;
                else if (currentPt.y > clippingPlanes[3].constant) currentPt.y = clippingPlanes[3].constant;
            }
            
            const shapeMode = document.getElementById('combo-area-shape').value;
            if (shapeMode === "Rectangle") {
                window.updateLiveAreaTracking([areaStartPoint, currentPt], "Rectangle");
            } else if (shapeMode === "Circle") {
                window.updateLiveAreaTracking([areaStartPoint, currentPt], "Circle");
            }
        }
    }

    // Distance live preview
    if (window.isMeasureActive && window.pickedPoints && window.pickedPoints.length === 1 && activePointCloud) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        const p1 = window.pickedPoints[0];
        let currentPt = new THREE.Vector3();
        const planeNormal = new THREE.Vector3();
        activeCamera.getWorldDirection(planeNormal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, p1);
        if (raycaster.ray.intersectPlane(plane, currentPt)) {
            if (clippingPlanes[3].constant !== 1000) {
                if (currentViewMode === 'top') currentPt.y = clippingPlanes[3].constant;
                else if (currentPt.y > clippingPlanes[3].constant) currentPt.y = clippingPlanes[3].constant;
            }
            if (event.shiftKey) currentPt = window.snapToDominantAxis(p1, currentPt);
            window.lastLiveDirection = new THREE.Vector3().subVectors(currentPt, p1).normalize();
            window.lastLiveDistancePoint = currentPt.clone();
            if (window.updateLiveDistanceTracking) window.updateLiveDistanceTracking(p1, currentPt);
        }
    }

    // Slice box face drag
    if (isDraggingFace && sliceBoxMesh) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        const planeNormal = new THREE.Vector3();
        activeCamera.getWorldDirection(planeNormal); planeNormal.negate();
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(planeNormal, initialIntersectionPoint);
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersection)) {
            const displacement = new THREE.Vector3().subVectors(intersection, initialIntersectionPoint);
            const dragDistance = displacement.dot(activeFaceNormal);
            const geomSize = 12.0;
            const scaleDelta = dragDistance / geomSize;
            if (activeFaceNormal.x !== 0) {
                const newScaleX = Math.max(0.00833, initialBoxScale.x + scaleDelta);
                const actualDeltaX = (newScaleX - initialBoxScale.x) * geomSize;
                sliceBoxMesh.scale.x = newScaleX;
                sliceBoxMesh.position.x = initialBoxPosition.x + (actualDeltaX / 2) * activeFaceNormal.x;
            } else if (activeFaceNormal.y !== 0) {
                const newScaleY = Math.max(0.00833, initialBoxScale.y + scaleDelta);
                const actualDeltaY = (newScaleY - initialBoxScale.y) * geomSize;
                sliceBoxMesh.scale.y = newScaleY;
                sliceBoxMesh.position.y = initialBoxPosition.y + (actualDeltaY / 2) * activeFaceNormal.y;
            } else if (activeFaceNormal.z !== 0) {
                const newScaleZ = Math.max(0.00833, initialBoxScale.z + scaleDelta);
                const actualDeltaZ = (newScaleZ - initialBoxScale.z) * geomSize;
                sliceBoxMesh.scale.z = newScaleZ;
                sliceBoxMesh.position.z = initialBoxPosition.z + (actualDeltaZ / 2) * activeFaceNormal.z;
            }
            updateClippingPlanes();
        }
    }
});

window.addEventListener('mouseup', () => {
    if (draggedAnchor) { draggedAnchor = null; controls.enabled = true; }
    if (window.isCustomOrbit) {
        window.isCustomOrbit = false;
        if (window._orbitCache) {
            const cache = window._orbitCache;
            activeCamera.getWorldDirection(cache.lookDir);
            controls.target.copy(activeCamera.position).addScaledVector(cache.lookDir, window.customOrbitDist || 20);
            controls.update();
        }
    }
    if (isDraggingFace) {
        if (activeFaceNormal) window.highlightSliceFace(activeFaceNormal, false);
        isDraggingFace = false; activeFaceNormal = null;
    }
    if (isDraggingHandleA || isDraggingHandleB) { isDraggingHandleA = false; isDraggingHandleB = false; }
    
    // Handle area measurement - check if it was a drag or just a click
    if (areaMouseDownPos && areaStartPoint && !isDraggingArea) {
        // It was just a click, not a drag - cancel and allow orbit
        areaMouseDownPos = null;
        areaStartPoint = null;
        window.areaPoints = [];
        statusEl.innerText = "◎ Standard View Mode";
    }
    
    // Finish area drag
    if (isDraggingArea && areaStartPoint) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        let endPoint = new THREE.Vector3();
        
        if (isOrthoMode) {
            const planeNormal = new THREE.Vector3();
            activeCamera.getWorldDirection(planeNormal);
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(planeNormal, areaStartPoint);
            if (raycaster.ray.intersectPlane(plane, endPoint)) endPoint = endPoint.clone();
        } else {
            raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
            const intersects = raycaster.intersectObject(activePointCloud);
            if (intersects.length > 0) endPoint = intersects[0].point.clone();
        }
        
        if (endPoint) {
            if (clippingPlanes[3].constant !== 1000) {
                if (currentViewMode === 'top') endPoint.y = clippingPlanes[3].constant;
                else if (endPoint.y > clippingPlanes[3].constant) endPoint.y = clippingPlanes[3].constant;
            }
            
            const shapeMode = document.getElementById('combo-area-shape').value;
            if (shapeMode === "Rectangle") {
                if (window.finalizeAreaShape) window.finalizeAreaShape("Rectangle", [areaStartPoint, endPoint]);
            } else if (shapeMode === "Circle") {
                const radius = areaStartPoint.distanceTo(endPoint);
                if (window.finalizeAreaShape) window.finalizeAreaShape("Circle", [areaStartPoint, radius]);
            }
        }
        
        isDraggingArea = false;
        areaStartPoint = null;
        window.areaPoints = [];
        if (liveAreaMesh) { scene.remove(liveAreaMesh); liveAreaMesh = null; }
        controls.enabled = true;
    }
    
    controls.enabled = true;
});

// ৯. File load (Drag & Drop + Button)
let electron = null;
let webUtils = null;
try {
    electron = window.require('electron');
    webUtils = electron.webUtils;
} catch (err) {
    console.error('Could not load electron module at top level:', err);
}

btnLoad.addEventListener('click', async () => {
    try {
        const { ipcRenderer } = window.require('electron');
        const filePath = await ipcRenderer.invoke('open-file-dialog');
        if (filePath) {
            processFileLoad({ path: filePath, name: filePath.split('\\').pop() });
        }
    } catch(err) {
        console.error('Dialog error:', err);
        statusEl.innerText = "❌ Could not open file dialog: " + err.message;
    }
});

window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (['las','laz','geoslam','e57'].includes(ext)) {
            // webUtils দিয়ে real path বের করা
            try {
                const { webUtils } = window.require('electron');
                const realPath = webUtils.getPathForFile(file);
                if (realPath) { processFileLoad({ path: realPath, name: file.name }); return; }
            } catch(_) {}
            processFileLoad(file);
        } else {
            statusEl.innerText = "❌ Unsupported format! Use .las .laz .e57 .geoslam";
            statusEl.style.color = "#ff3d00";
        }
    }
});

const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

async function processFileLoad(file) {
    window.processFileLoad = processFileLoad; // global expose করা হলো
    window.isRestoring = true;
    statusEl.innerText = "⏳ Opening File on Python Server...";
    statusEl.style.color = "#ff9800";
    if (progressContainer) { progressContainer.style.display = 'block'; progressBar.style.width = '0%'; }

    // Cleanup previous session
    if (window.measLayers && window.measLayers.length > 0) window.measLayers.forEach(layer => { if (layer.meshes) layer.meshes.forEach(m => scene.remove(m)); });
    if (window.viewLayers && window.viewLayers.length > 0) window.viewLayers.forEach(layer => { if (layer.mesh) scene.remove(layer.mesh); });
    if (window.permanentLabels && window.permanentLabels.length > 0) window.permanentLabels.forEach(item => { if (item.element) item.element.remove(); });
    window.permanentLabels = []; window.cameraFacingRings = [];
    window.ucsLayers = []; window.measLayers = []; window.viewLayers = [];
    window.undoStack = []; window.redoStack = []; window.mainStateBackup = null;
    ['list-ucs','list-meas','list-layers'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    if (typeof removeLiveElements === "function") removeLiveElements();
    if (typeof resetClippingPlanes === "function") resetClippingPlanes();
    if (typeof isSliceActive !== 'undefined' && isSliceActive && sliceBoxMesh) {
        isSliceActive = false; sliceBoxMesh.visible = false;
        document.getElementById('btn-slice').style.background = "#2e7d32";
    }

    try {
        // file.path (mock object) অথবা real File object দুটোই handle করা
        let realFilePath = null;
        if (file && file.path && typeof file.path === 'string' && file.path.length > 3) {
            realFilePath = file.path;
        } else if (typeof File !== 'undefined' && file instanceof File && electron && electron.webUtils && electron.webUtils.getPathForFile) {
            realFilePath = electron.webUtils.getPathForFile(file);
        }
        if (!realFilePath) throw new Error("Could not resolve absolute file path.");
        window.globalExportFilePath = realFilePath;

        const maxPoints = document.getElementById('combo-density').value;
        let currentFakePercent = 0;
        const progressTimer = setInterval(() => {
            if (currentFakePercent < 85) {
                currentFakePercent += Math.floor(Math.random() * 3) + 1;
                if (currentFakePercent > 85) currentFakePercent = 85;
                if (statusEl) statusEl.innerText = `⏳ Python Server Parsing: ${currentFakePercent}%`;
                if (progressBar) progressBar.style.width = `${currentFakePercent}%`;
            }
        }, 250);

        let response = null;
        let retryCount = 0;
        const maxRetries = 15;
        while (retryCount < maxRetries) {
            try {
                response = await fetch(`http://127.0.0.1:${window.current_backend_port}/load-file?file_path=${encodeURIComponent(realFilePath)}&max_points=${maxPoints}`, { method: 'POST' });
                break;
            } catch (err) {
                retryCount++;
                if (statusEl) { statusEl.innerText = `⏳ Starting Backend... (${retryCount}/15)`; statusEl.style.color = "#ffeb3b"; }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        clearInterval(progressTimer);
        if (!response) throw new Error("Python Backend failed to start!");
        if (!response.ok) { const errData = await response.json(); throw new Error(errData.detail || "Failed to load file!"); }

        const metadata = await response.json();
        const pointsCount = metadata.points_count;

        statusEl.innerText = "⏳ Streaming Points to WebGL Buffer: 0%";
        const pointsResponse = await fetch(`http://127.0.0.1:${window.current_backend_port}/points-binary`);
        const pointsReader = pointsResponse.body.getReader();
        const totalBytes = pointsCount * 3 * 4;
        let receivedBytes = 0, pointsChunks = [];
        while (true) {
            const { done, value } = await pointsReader.read();
            if (done) break;
            pointsChunks.push(value); receivedBytes += value.length;
            const percent = Math.round((receivedBytes / totalBytes) * 100);
            statusEl.innerText = `⏳ Streaming Points: ${percent}%`;
            if (progressBar) progressBar.style.width = `${percent}%`;
        }
        let pointsBuffer = new Uint8Array(receivedLengthFromChunks(pointsChunks));
        assembleChunks(pointsChunks, pointsBuffer);
        const positions = new Float32Array(pointsBuffer.buffer);

        let colors = null;
        if (metadata.has_color) {
            const colorsResponse = await fetch(`http://127.0.0.1:${window.current_backend_port}/colors-binary`);
            const colorsReader = colorsResponse.body.getReader();
            let colorsChunks = [];
            while (true) { const { done, value } = await colorsReader.read(); if (done) break; colorsChunks.push(value); }
            let colorsBuffer = new Uint8Array(receivedLengthFromChunks(colorsChunks));
            assembleChunks(colorsChunks, colorsBuffer);
            colors = colorsBuffer;
        }

        let intensities = null;
        if (metadata.has_intensity) {
            const intResponse = await fetch(`http://127.0.0.1:${window.current_backend_port}/intensities-binary`);
            const intReader = intResponse.body.getReader();
            let intChunks = [];
            while (true) { const { done, value } = await intReader.read(); if (done) break; intChunks.push(value); }
            let intBuffer = new Uint8Array(receivedLengthFromChunks(intChunks));
            assembleChunks(intChunks, intBuffer);
            intensities = new Float32Array(intBuffer.buffer);
        }

        loadedPointCloudData.positions = positions;
        loadedPointCloudData.originalPositions = positions.slice();
        loadedPointCloudData.colors = colors;
        loadedPointCloudData.intensities = intensities;
        loadedPointCloudData.count = pointsCount;

        colorModeCombo.value = 'rgb';
        renderBinaryPointCloud(true);
        statusEl.innerText = `✅ Loaded: ${pointsCount.toLocaleString()} points`;
        statusEl.style.color = "#76ff03";

        // Auto-save session
        window.saveProjectSession = function() {
            if (!realFilePath) return;
            try {
                const fs = window.require('fs');
                const jsonPath = realFilePath.substring(0, realFilePath.lastIndexOf('.')) + '.json';
                const savedMeasurements = [];
                if (window.measLayers) window.measLayers.forEach(l => {
                    if (l.userData && l.userData.rawPoints) savedMeasurements.push({ type: "area", name: l.name, shapeType: l.userData.shapeType || "Polygon", rawPoints: l.userData.rawPoints });
                    else if (l.meshes && l.meshes.length >= 3 && l.meshes[1] && l.meshes[2]) savedMeasurements.push({ type: "distance", name: l.name, p1: l.meshes[1].position, p2: l.meshes[2].position });
                });
                const savedUCSList = (window.ucsLayers || []).map(u => ({ id: u.id, name: u.name, origin: u.origin, angle: u.angle, viewMode: u.viewMode, steps: u.steps }));
                const savedViewsList = (window.viewLayers || []).map(v => ({ id: v.id, name: v.name, camPos: v.camPos, camFocal: v.camFocal, camUp: v.camUp, clippingPlanesData: v.clippingPlanesData || [], colorMode: v.colorMode || 'rgb', opacity: v.opacity !== undefined ? v.opacity : 1.0, activeUcsIndex: v.activeUcsIndex !== undefined ? v.activeUcsIndex : -1 }));
                const sessionData = { measurements: savedMeasurements, ucsLayers: savedUCSList, viewLayers: savedViewsList, camera: { position: activeCamera.position, target: controls.target } };
                fs.writeFileSync(jsonPath, JSON.stringify(sessionData, null, 4), 'utf-8');
            } catch (err) { console.error("Auto-save failed:", err); }
        };

        // Auto-restore session after load
        setTimeout(() => {
            try {
                const fs = window.require('fs');
                const jsonPath = realFilePath.substring(0, realFilePath.lastIndexOf('.')) + '.json';
                if (fs.existsSync(jsonPath)) {
                    const sessionData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    if (sessionData.measurements) sessionData.measurements.forEach(m => {
                        if (m.type === "distance" && typeof window.createPermanentDistance === 'function')
                            window.createPermanentDistance(new THREE.Vector3(m.p1.x, m.p1.y, m.p1.z), new THREE.Vector3(m.p2.x, m.p2.y, m.p2.z));
                        else if (m.type === "area" && typeof window.finalizeAreaShape === 'function') {
                            const rawPts = m.rawPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
                            if (m.shapeType === "Rectangle") window.finalizeAreaShape("Rectangle", [rawPts[0], rawPts[2]]);
                            else window.finalizeAreaShape(m.shapeType, rawPts);
                        }
                    });
                    if (sessionData.ucsLayers && window.ucsLayers) sessionData.ucsLayers.forEach((u, index) => {
                        const ucsObj = { id: u.id || (Date.now() + index), name: u.name, origin: u.origin, angle: u.angle, viewMode: u.viewMode, steps: u.steps };
                        window.ucsLayers.push(ucsObj);
                        if (window.addLayerUI) window.addLayerUI('list-ucs', ucsObj, window.ucsLayers);
                    });
                    if (sessionData.camera) { activeCamera.position.set(sessionData.camera.position.x, sessionData.camera.position.y, sessionData.camera.position.z); controls.target.set(sessionData.camera.target.x, sessionData.camera.target.y, sessionData.camera.target.z); controls.update(); }
                }
            } catch (err) { console.error("Session restore failed:", err); }
            finally { setTimeout(() => { window.isRestoring = false; }, 2000); }
        }, 1200);

    } catch (err) {
        console.error(err);
        statusEl.innerText = "❌ Error: " + err.message;
        statusEl.style.color = "#ff3d00";
        if (progressContainer) progressContainer.style.display = 'none';
    }
}

// ১০. Point cloud builder
function renderBinaryPointCloud(resetCamera = false) {
    const positions = loadedPointCloudData.positions;
    const colors = loadedPointCloudData.colors;
    const intensities = loadedPointCloudData.intensities;
    const count = loadedPointCloudData.count;
    if (!positions) return;

    let sumX = 0, sumY = 0, sumZ = 0;
    const step = Math.max(1, Math.floor(count / 100000));
    let sampledCount = 0;
    for (let i = 0; i < positions.length; i += 3 * step) { sumX += positions[i]; sumY += positions[i+1]; sumZ += positions[i+2]; sampledCount++; }
    const centerX = sumX / sampledCount, centerY = sumY / sampledCount, centerZ = sumZ / sampledCount;

    const centeredPositions = new Float32Array(positions.length);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        centeredPositions[i]   = positions[i] - centerX;
        centeredPositions[i+1] = positions[i+2] - centerZ;
        centeredPositions[i+2] = -(positions[i+1] - centerY);
        const xVal = centeredPositions[i], yVal = centeredPositions[i+1], zVal = centeredPositions[i+2];
        if (xVal < minX) minX = xVal; if (xVal > maxX) maxX = xVal;
        if (yVal < minY) minY = yVal; if (yVal > maxY) maxY = yVal;
        if (zVal < minZ) minZ = zVal; if (zVal > maxZ) maxZ = zVal;
    }
    const yShift = -minY;
    for (let i = 0; i < centeredPositions.length; i += 3) centeredPositions[i+1] += yShift;
    maxY += yShift; minY = 0;

    const colorMode = colorModeCombo.value;
    const renderedColors = new Float32Array(positions.length);
    if (colorMode === 'rgb' && colors) {
        for (let i = 0; i < renderedColors.length; i++) renderedColors[i] = colors[i] / 255.0;
    } else if (colorMode === 'intensity' && intensities) {
        let maxIntensity = 0;
        for (let i = 0; i < intensities.length; i++) if (intensities[i] > maxIntensity) maxIntensity = intensities[i];
        const divisor = maxIntensity || 1.0;
        for (let i = 0; i < positions.length; i += 3) {
            const val = intensities[i/3] / divisor;
            const jetColor = getJetColor(val);
            renderedColors[i] = jetColor.r; renderedColors[i+1] = jetColor.g; renderedColors[i+2] = jetColor.b;
        }
    } else if (colorMode === 'solid') {
        for (let i = 0; i < renderedColors.length; i++) renderedColors[i] = 1.0;
    } else {
        const yRange = maxY - minY || 1.0;
        for (let i = 0; i < positions.length; i += 3) {
            const yNorm = (centeredPositions[i+1] - minY) / yRange;
            const jetColor = getJetColor(yNorm);
            renderedColors[i] = jetColor.r; renderedColors[i+1] = jetColor.g; renderedColors[i+2] = jetColor.b;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(centeredPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(renderedColors, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();

    const opacitySlider = document.getElementById('slider-opacity');
    const chkSmartOpacity = document.getElementById('chk-smart-opacity');
    const isTransparent = (parseFloat(opacitySlider.value) < 100) || chkSmartOpacity.checked;

    const material = new THREE.PointsMaterial({
        size: parseFloat(ptsizeSlider.value), vertexColors: true, sizeAttenuation: false,
        clippingPlanes: clippingPlanes, clipShadows: true,
        transparent: isTransparent, opacity: parseFloat(opacitySlider.value) / 100.0, depthWrite: !isTransparent
    });

    // Solid Wall Shader (Q key)
    material.userData = { uSolidMode: { value: window.isSolidWallMode || false } };
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSolidMode = material.userData.uSolidMode;
        shader.fragmentShader = `uniform bool uSolidMode;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            if (!uSolidMode) {
                vec2 tempCoord = gl_PointCoord - vec2(0.5);
                if (dot(tempCoord, tempCoord) > 0.25) discard;
            }`
        );
    };

    const oldCloud = activePointCloud;
    activePointCloud = new THREE.Points(geometry, material);
    scene.add(activePointCloud);
    if (oldCloud) scene.remove(oldCloud);

    const centerHeight = maxY / 2;
    if (resetCamera) {
        controls.target.set(0, centerHeight, 0);
        activeCamera.position.set(25, centerHeight + 10, 25);
        controls.update();
        const btnIso = document.getElementById('btn-view-iso');
        if (btnIso) btnIso.click();
    }

    if (sliceBoxMesh) {
        if (!isSliceActive && clippingPlanes[0].constant === 1000) {
            const boxWidth = (maxX - minX) || 12, boxHeight = (maxY - minY) || 12, boxDepth = (maxZ - minZ) || 12;
            sliceBoxMesh.scale.set(boxWidth / 12, boxHeight / 12, boxDepth / 12);
            sliceBoxMesh.position.set(0, centerHeight, 0);
            updateClippingPlanes();
            ucsSpawnOffset = Math.max(0.2, boxWidth * 0.1);
        } else { updateClippingPlanes(); }
    }
}

// ১১. View controls
document.getElementById('btn-view-top').addEventListener('click', () => setViewDirection('top'));
document.getElementById('btn-view-front').addEventListener('click', () => setViewDirection('front'));
document.getElementById('btn-view-left').addEventListener('click', () => setViewDirection('left'));
document.getElementById('btn-view-right').addEventListener('click', () => setViewDirection('right'));
document.getElementById('btn-view-back').addEventListener('click', () => setViewDirection('back'));
document.getElementById('btn-view-iso').addEventListener('click', () => setViewDirection('iso'));

function setViewDirection(dir) {
    if (!activePointCloud) return;
    const T = controls.target.clone();
    const d = activeCamera.position.distanceTo(T) || 20;
    controls.enableRotate = (dir === 'iso');

    if (dir === 'iso') {
        if (isOrthoMode) { isOrthoMode = false; btnOrtho.innerText = "Ortho: OFF"; btnOrtho.style.background = "#4a148c"; setCameraMode(false); }
    } else {
        if (!isOrthoMode) { isOrthoMode = true; btnOrtho.innerText = "Ortho: LOCKED"; btnOrtho.style.background = "#d50000"; setCameraMode(true); }
    }
    activeCamera.up.set(0, 1, 0);
    if (dir === 'top') { activeCamera.position.set(T.x, T.y + d, T.z); activeCamera.up.set(0, 0, -1); }
    else if (dir === 'front') activeCamera.position.set(T.x, T.y, T.z + d);
    else if (dir === 'left') activeCamera.position.set(T.x - d, T.y, T.z);
    else if (dir === 'right') activeCamera.position.set(T.x + d, T.y, T.z);
    else if (dir === 'back') activeCamera.position.set(T.x, T.y, T.z - d);
    else if (dir === 'iso') { const f = d / Math.sqrt(3); activeCamera.position.set(T.x + f, T.y + f, T.z + f); }
    controls.target.copy(T); controls.update();
    currentViewMode = dir;
    statusEl.innerText = `◎ View: ${dir.toUpperCase()}`;
}

let isOrthoMode = false;
const btnOrtho = document.getElementById('btn-view-ortho');
btnOrtho.addEventListener('click', () => {
    isOrthoMode = !isOrthoMode;
    if (isOrthoMode) { btnOrtho.innerText = "Ortho: ON"; btnOrtho.style.background = "#0078d7"; setCameraMode(true); controls.enableRotate = false; }
    else { btnOrtho.innerText = "Ortho: OFF"; btnOrtho.style.background = "#4a148c"; setCameraMode(false); controls.enableRotate = true; }
});

function setCameraMode(isOrtho) {
    const currentDistance = activeCamera.position.distanceTo(controls.target);
    const aspect = window.innerWidth / window.innerHeight;
    if (isOrtho) {
        const frustumSize = currentDistance * 0.8;
        orthoCamera.left = -frustumSize * aspect / 2; orthoCamera.right = frustumSize * aspect / 2;
        orthoCamera.top = frustumSize / 2; orthoCamera.bottom = -frustumSize / 2;
        orthoCamera.updateProjectionMatrix();
        orthoCamera.position.copy(camera.position); orthoCamera.rotation.copy(camera.rotation); orthoCamera.up.copy(camera.up);
        activeCamera = orthoCamera; controls.object = orthoCamera;
    } else {
        camera.position.copy(activeCamera.position); camera.rotation.copy(activeCamera.rotation); camera.up.copy(activeCamera.up);
        activeCamera = camera; controls.object = camera;
    }
    controls.update();
}

// ১২. Slice box button controls
btnSlice.addEventListener('click', () => {
    if (!sliceBoxMesh) return;
    isSliceActive = !isSliceActive;
    if (isSliceActive) {
        if (window.isMeasureActive) document.getElementById('btn-measure-dist').click();
        if (window.isAreaModeActive) document.getElementById('btn-measure-area').click();
        if (typeof removeLiveElements === "function") removeLiveElements();
        window.pickedPoints = []; window.areaPoints = [];
        sliceBoxMesh.visible = true; btnSlice.style.background = "#1b5e20";
        updateClippingPlanes();
        window.showHudNotification("✂️ Slice Box Active: Drag Edges | Hold CTRL to Orbit", "rgba(198, 40, 40, 0.9)", "#ff8a80");
    } else { sliceBoxMesh.visible = false; btnSlice.style.background = "#2e7d32"; window.hideHudNotification(); }
});

btnResetSlice.addEventListener('click', () => {
    isSliceActive = false;
    if (sliceBoxMesh) { sliceBoxMesh.position.set(0, 5, 0); sliceBoxMesh.scale.set(1, 1, 1); sliceBoxMesh.visible = false; btnSlice.style.background = "#2e7d32"; }
    resetClippingPlanes();
    const inputThickness = document.getElementById('input-slice-thickness');
    if (inputThickness) inputThickness.value = "";
});

const inputThickness = document.getElementById('input-slice-thickness');
if (inputThickness) {
    inputThickness.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmValue = parseFloat(inputThickness.value);
            if (!isNaN(cmValue) && cmValue >= 10 && sliceBoxMesh && isSliceActive) {
                const heightInMeters = cmValue / 100.0, geomSize = 12.0;
                const oldScaleY = sliceBoxMesh.scale.y, oldBottom = sliceBoxMesh.position.y - (geomSize * oldScaleY) / 2.0;
                const newScaleY = heightInMeters / geomSize, newPosY = oldBottom + heightInMeters / 2.0;
                sliceBoxMesh.scale.y = newScaleY; sliceBoxMesh.position.y = newPosY;
                updateClippingPlanes(); renderer.render(scene, activeCamera);
                statusEl.innerText = `✂️ Slice Thickness: ${cmValue}cm`;
                inputThickness.blur();
            } else if (!isSliceActive) statusEl.innerText = "⚠️ Enable Slice Box first!";
        }
    });
}

// ১৩. Color combo & slider controls
colorModeCombo.addEventListener('change', () => {
    if (loadedPointCloudData.positions) { renderBinaryPointCloud(); statusEl.innerText = `✅ Loaded: ${loadedPointCloudData.count.toLocaleString()} points`; }
});
ptsizeSlider.addEventListener('input', (e) => {
    ptsizeLabel.innerText = e.target.value;
    if (activePointCloud) { activePointCloud.material.size = parseFloat(e.target.value); activePointCloud.material.needsUpdate = true; }
});

// ১৪. EDL (Eye Dome Lighting) Post-Processing
const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
renderTarget.depthBuffer = true;
renderTarget.depthTexture = new THREE.DepthTexture();

const edlShader = {
    uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uStrength: { value: 6.5 }
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform vec2 uResolution; uniform float uStrength;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).r;
            float offsetRadius = 1.2;
            vec2 texelSize = offsetRadius / uResolution;
            float dL = texture2D(tDepth, vUv + vec2(-texelSize.x, 0.0)).r;
            float dR = texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).r;
            float dT = texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).r;
            float dB = texture2D(tDepth, vUv + vec2(0.0, -texelSize.y)).r;
            float dTL = texture2D(tDepth, vUv + vec2(-texelSize.x * 0.7, texelSize.y * 0.7)).r;
            float dTR = texture2D(tDepth, vUv + vec2(texelSize.x * 0.7, texelSize.y * 0.7)).r;
            float dBL = texture2D(tDepth, vUv + vec2(-texelSize.x * 0.7, -texelSize.y * 0.7)).r;
            float dBR = texture2D(tDepth, vUv + vec2(texelSize.x * 0.7, -texelSize.y * 0.7)).r;
            float response = 0.0;
            response += max(0.0, depth - dL); response += max(0.0, depth - dR);
            response += max(0.0, depth - dT); response += max(0.0, depth - dB);
            response += max(0.0, depth - dTL) * 0.7; response += max(0.0, depth - dTR) * 0.7;
            response += max(0.0, depth - dBL) * 0.7; response += max(0.0, depth - dBR) * 0.7;
            float shade = exp(-response * uStrength * 1600.0);
            shade = clamp(shade, 0.15, 1.0);
            gl_FragColor = vec4(color.rgb * shade, color.a);
        }
    `
};

const edlMaterial = new THREE.ShaderMaterial(edlShader);
const edlQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), edlMaterial);
const postScene = new THREE.Scene();
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(edlQuad);

// ১৫. Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (isUcsActive && ucsHandleA && ucsHandleB) { ucsHandleA.lookAt(activeCamera.position); ucsHandleB.lookAt(activeCamera.position); }
    if (window.cameraFacingRings && window.cameraFacingRings.length > 0) window.cameraFacingRings.forEach(r => { if (r) r.lookAt(activeCamera.position); });

    // Permanent label rendering
    const leaderCanvas = document.getElementById('leader-canvas');
    if (leaderCanvas) {
        const ctx = leaderCanvas.getContext('2d');
        ctx.clearRect(0, 0, leaderCanvas.width, leaderCanvas.height);
        if (window.permanentLabels && window.permanentLabels.length > 0) {
            window.permanentLabels.forEach(item => {
                const wp = item.position.clone().project(activeCamera);
                if (item.isHidden || wp.z > 1) { item.element.style.display = 'none'; return; }
                item.element.style.display = 'block';
                item.element.style.pointerEvents = currentViewMode === 'iso' ? 'none' : 'auto';
                const anchorX = (wp.x * .5 + .5) * window.innerWidth;
                const anchorY = (-(wp.y * .5) + .5) * window.innerHeight;
                const targetX = anchorX + item.offsetX, targetY = anchorY + item.offsetY;
                item.element.style.left = `${targetX}px`; item.element.style.top = `${targetY}px`;
                if (item.offsetX !== 0 || item.offsetY !== 0) {
                    ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(targetX, targetY - 10);
                    ctx.strokeStyle = item.color || '#ff9800'; ctx.lineWidth = 2.2;
                    ctx.setLineDash([4, 4]); ctx.stroke();
                }
            });
        }
    }

    if (chkShading.checked && activePointCloud) {
        renderer.setRenderTarget(renderTarget); renderer.render(scene, activeCamera);
        edlMaterial.uniforms.tDiffuse.value = renderTarget.texture;
        edlMaterial.uniforms.tDepth.value = renderTarget.depthTexture;
        edlMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        renderer.setRenderTarget(null); renderer.render(postScene, postCamera);
    } else {
        renderer.setRenderTarget(null); renderer.render(scene, activeCamera);
    }
}
animate();

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    if (orthoCamera) {
        const currentDistance = activeCamera.position.distanceTo(controls.target);
        const frustumSize = currentDistance * 0.8;
        orthoCamera.left = -frustumSize * aspect / 2; orthoCamera.right = frustumSize * aspect / 2;
        orthoCamera.top = frustumSize / 2; orthoCamera.bottom = -frustumSize / 2;
        orthoCamera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    const leaderCanvas = document.getElementById('leader-canvas');
    if (leaderCanvas) { leaderCanvas.width = window.innerWidth; leaderCanvas.height = window.innerHeight; }
});
const initialCanvas = document.getElementById('leader-canvas');
if (initialCanvas) { initialCanvas.width = window.innerWidth; initialCanvas.height = window.innerHeight; }

// Ctrl key bypass for OrbitControls inversion fix
const bypassOrbitCtrlInversion = (e) => {
    if (e.ctrlKey) Object.defineProperty(e, 'ctrlKey', { value: false, enumerable: true, configurable: true });
};
renderer.domElement.addEventListener('pointerdown', bypassOrbitCtrlInversion, true);
renderer.domElement.addEventListener('pointermove', bypassOrbitCtrlInversion, true);
renderer.domElement.addEventListener('pointerup', bypassOrbitCtrlInversion, true);

// ১৬. Smart Opacity, Black BG, White BG, UCS, Measurement controls
const chkSmartOpacity = document.getElementById('chk-smart-opacity');
const chkBlackBg = document.getElementById('chk-black-bg');
const chkWhiteBg = document.getElementById('chk-white-bg');
const opacitySlider = document.getElementById('slider-opacity');
const opacityLabel = document.getElementById('lbl-opacity');

opacitySlider.addEventListener('input', (e) => {
    opacityLabel.innerText = e.target.value;
    if (activePointCloud) {
        const isTransparent = parseFloat(e.target.value) < 100;
        activePointCloud.material.transparent = isTransparent;
        activePointCloud.material.depthWrite = !isTransparent;
        activePointCloud.material.opacity = parseFloat(e.target.value) / 100.0;
        activePointCloud.material.needsUpdate = true;
    }
});

// Reset buttons for point size and opacity
const btnResetPtsize = document.getElementById('btn-reset-ptsize');
const btnResetOpacity = document.getElementById('btn-reset-opacity');

if (btnResetPtsize) {
    btnResetPtsize.addEventListener('click', () => {
        ptsizeSlider.value = 2;
        ptsizeLabel.innerText = '2';
        if (activePointCloud) {
            activePointCloud.material.size = 2;
            activePointCloud.material.needsUpdate = true;
        }
    });
}

if (btnResetOpacity) {
    btnResetOpacity.addEventListener('click', () => {
        opacitySlider.value = 100;
        opacityLabel.innerText = '100';
        if (activePointCloud) {
            activePointCloud.material.transparent = false;
            activePointCloud.material.depthWrite = true;
            activePointCloud.material.opacity = 1.0;
            activePointCloud.material.needsUpdate = true;
        }
    });
}

chkSmartOpacity.addEventListener('change', () => {
    if (chkSmartOpacity.checked) {
        chkBlackBg.checked = true; chkWhiteBg.checked = false; colorModeCombo.value = 'solid';
        scene.background = new THREE.Color('#000000');
        opacitySlider.value = 10; opacityLabel.innerText = 10;
    } else {
        chkBlackBg.checked = false; chkWhiteBg.checked = false; colorModeCombo.value = 'rgb';
        scene.background = createPythonGradientBackground();
        opacitySlider.value = 100; opacityLabel.innerText = 100;
    }
    renderBinaryPointCloud();
});

chkBlackBg.addEventListener('change', () => {
    if (chkBlackBg.checked) {
        chkWhiteBg.checked = false;
        scene.background = new THREE.Color('#000000');
        // Enhance visibility on black background
        if (activePointCloud) {
            activePointCloud.material.vertexColors = true;
            activePointCloud.material.color.setHex(0xffffff);
            activePointCloud.material.size = parseFloat(ptsizeSlider.value) * 1.2;
            activePointCloud.material.opacity = 1.0;
            activePointCloud.material.transparent = false;
            activePointCloud.material.depthWrite = true;
            activePointCloud.material.needsUpdate = true;
        }
    } else {
        scene.background = createPythonGradientBackground();
        // Smart colors for light background
        if (activePointCloud) {
            activePointCloud.material.vertexColors = true;
            activePointCloud.material.color.setHex(0x333333);
            activePointCloud.material.size = parseFloat(ptsizeSlider.value);
            activePointCloud.material.opacity = 0.95;
            activePointCloud.material.transparent = true;
            activePointCloud.material.depthWrite = true;
            activePointCloud.material.needsUpdate = true;
            renderBinaryPointCloud(false);
        }
    }
    renderer.render(scene, activeCamera);
});

chkWhiteBg.addEventListener('change', () => {
    if (chkWhiteBg.checked) {
        chkBlackBg.checked = false;
        scene.background = new THREE.Color('#ffffff');
        // Dark points for white background with enhanced contrast
        if (activePointCloud) {
            activePointCloud.material.color.setHex(0x1a1a1a);
            activePointCloud.material.size = parseFloat(ptsizeSlider.value) * 1.1;
            activePointCloud.material.opacity = 1.0;
            activePointCloud.material.transparent = false;
            activePointCloud.material.depthWrite = true;
        }
    } else {
        scene.background = createPythonGradientBackground();
        // Smart colors for light background
        if (activePointCloud) {
            activePointCloud.material.vertexColors = true;
            activePointCloud.material.color.setHex(0x333333);
            activePointCloud.material.size = parseFloat(ptsizeSlider.value);
            activePointCloud.material.opacity = 0.95;
            activePointCloud.material.transparent = true;
            activePointCloud.material.depthWrite = true;
        }
    }
    renderer.render(scene, activeCamera);
});

// UCS Controls
const btnUcs = document.getElementById('btn-ucs');
const btnApplyUcs = document.getElementById('btn-apply-ucs');
const btnResetUcs = document.getElementById('btn-reset-ucs');

btnUcs.addEventListener('click', () => {
    if (!activePointCloud) return;
    isUcsActive = !isUcsActive;
    if (isUcsActive) {
        ucsPlaced = false; btnUcs.style.background = "#d84315"; btnApplyUcs.style.display = "none";
        if (ucsHandleA) ucsHandleA.visible = false; if (ucsHandleB) ucsHandleB.visible = false;
        if (ucsLineX) ucsLineX.visible = false; if (ucsLineZ) ucsLineZ.visible = false;
        statusEl.innerText = "▱ Click on wall to place the UCS Ruler...";
        window.showHudNotification("▱ UCS Ruler: Pick 1st Point on Wall", "rgba(230, 81, 0, 0.9)", "#ffb74d");
        if (toolbarUcs) toolbarUcs.classList.add('active');
    } else { closeUcsWidget(); }
});

function closeUcsWidget() {
    isUcsActive = false; btnUcs.style.background = "#e65100"; btnApplyUcs.style.display = "none";
    if (ucsHandleA) ucsHandleA.visible = false; if (ucsHandleB) ucsHandleB.visible = false;
    if (ucsLineX) ucsLineX.visible = false; if (ucsLineZ) ucsLineZ.visible = false;
    statusEl.innerText = "◎ Standard View Mode"; window.hideHudNotification();
    if (toolbarUcs) toolbarUcs.classList.remove('active');
}

btnApplyUcs.addEventListener('click', () => {
    if (!ucsHandleA || !ucsHandleB) return;
    const pos = loadedPointCloudData.positions;
    const pA = ucsHandleA.position, pB = ucsHandleB.position;
    const originX = pA.x, originY = pA.y, originZ = pA.z;
    let angle = 0, cos = 1, sin = 0;

    if (currentViewMode === 'top' || currentViewMode === 'iso') {
        angle = Math.atan2(-(pB.z - pA.z), pB.x - pA.x);
        cos = Math.cos(-angle); sin = Math.sin(-angle);
        for (let i = 0; i < pos.length; i += 3) {
            const rx = pos[i] - originX, ry = pos[i+1] - (-originZ);
            pos[i] = rx * cos - ry * sin + originX; pos[i+1] = rx * sin + ry * cos + (-originZ);
        }
    } else if (currentViewMode === 'front' || currentViewMode === 'back') {
        angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        cos = Math.cos(-angle); sin = Math.sin(-angle);
        for (let i = 0; i < pos.length; i += 3) {
            const rx = pos[i] - pA.x, rz = pos[i+2] - pA.y;
            pos[i] = rx * cos - rz * sin + pA.x; pos[i+2] = rx * sin + rz * cos + pA.y;
        }
    } else if (currentViewMode === 'left' || currentViewMode === 'right') {
        angle = -Math.atan2(pB.y - pA.y, pB.z - pA.z);
        cos = Math.cos(-angle); sin = Math.sin(-angle);
        for (let i = 0; i < pos.length; i += 3) {
            const ry = pos[i+1] - (-pA.z), rz = pos[i+2] - pA.y;
            pos[i+1] = (ry * cos - rz * sin) + (-pA.z); pos[i+2] = (ry * sin + rz * cos) + pA.y;
        }
    }

    renderBinaryPointCloud(false);
    closeUcsWidget();

    let stepHistory = [];
    const activeRadio = document.querySelector('input[name="list-ucs_radio"]:checked');
    if (activeRadio) {
        const activeUcs = window.ucsLayers.find(u => u.id == activeRadio.value);
        if (activeUcs && activeUcs.steps) stepHistory = JSON.parse(JSON.stringify(activeUcs.steps));
        else if (activeUcs && activeUcs.angle !== undefined) stepHistory.push({ origin: activeUcs.origin, angle: activeUcs.angle, viewMode: activeUcs.viewMode });
    }
    stepHistory.push({ origin: { x: originX, y: originY, z: originZ }, angle, viewMode: currentViewMode });

    const id = Date.now();
    const ucsObj = { id, name: "UCS Align " + (window.ucsLayers.length + 1), origin: { x: originX, y: originY, z: originZ }, angle, viewMode: currentViewMode, steps: stepHistory };
    window.ucsLayers.push(ucsObj);
    if (window.addLayerUI) {
        window.addLayerUI('list-ucs', ucsObj, window.ucsLayers);
        window.pushToUndoOnAdd('list-ucs', ucsObj, window.ucsLayers);
        const newlyAddedRadio = document.querySelector(`input[name="list-ucs_radio"][value="${id}"]`);
        if (newlyAddedRadio) { newlyAddedRadio.checked = true; newlyAddedRadio.wasChecked = true; }
    }
    if (typeof window.saveProjectSession === 'function') window.saveProjectSession();
    statusEl.innerText = "✅ UCS Successfully Aligned!";
});

// Measurement tool buttons
const btnDist = document.getElementById('btn-measure-dist');
const btnArea = document.getElementById('btn-measure-area');

// Toolbar buttons
const toolbarUcs = document.getElementById('toolbar-ucs');
const toolbarDist = document.getElementById('toolbar-distance');
const toolbarArea = document.getElementById('toolbar-area');

btnDist.addEventListener('click', () => {
    if (!activePointCloud) return;
    window.isMeasureActive = !window.isMeasureActive; window.isAreaModeActive = false; window.pickedPoints = [];
    if (window.isMeasureActive) { btnDist.style.background = "#1b5e20"; btnArea.style.background = "#1565c0"; statusEl.innerText = "↔ Distance Mode: Click to measure..."; window.showHudNotification("↔ Distance Measure Active (Type Value + Enter for CM Snap)", "rgba(46, 125, 50, 0.9)", "#a1ffaf"); if (toolbarDist) toolbarDist.classList.add('active'); }
    else { btnDist.style.background = "#2e7d32"; statusEl.innerText = "◎ Standard View Mode"; removeLiveElements(); window.hideHudNotification(); if (toolbarDist) toolbarDist.classList.remove('active'); }
});
btnArea.addEventListener('click', () => {
    if (!activePointCloud) return;
    window.isAreaModeActive = !window.isAreaModeActive; window.isMeasureActive = false; window.areaPoints = [];
    const currentShape = document.getElementById('combo-area-shape').value;
    console.log('Area button clicked, isAreaModeActive:', window.isAreaModeActive, 'shape:', currentShape);
    if (window.isAreaModeActive) { btnArea.style.background = "#0d47a1"; btnDist.style.background = "#2e7d32"; statusEl.innerText = `▱ Area Mode [${currentShape}]: Click to draw...`; window.showHudNotification(`▱ Area Active: [${currentShape}] - Shift for Straight/Square`, "rgba(21, 101, 192, 0.9)", "#90caf9"); if (toolbarArea) toolbarArea.classList.add('active'); }
    else { btnArea.style.background = "#1565c0"; statusEl.innerText = "◎ Standard View Mode"; window.hideHudNotification(); if (toolbarArea) toolbarArea.classList.remove('active'); }
});

// Toolbar button event listeners
if (toolbarUcs) {
    toolbarUcs.addEventListener('click', () => {
        if (btnUcs) btnUcs.click();
    });
}
if (toolbarDist) {
    toolbarDist.addEventListener('click', () => {
        btnDist.click();
    });
}
if (toolbarArea) {
    toolbarArea.addEventListener('click', () => {
        btnArea.click();
    });
}
document.getElementById('combo-area-shape').addEventListener('change', (e) => {
    if (window.isAreaModeActive) window.showHudNotification(`▱ Area Active: [${e.target.value}] - Shift for Straight/Square`, "rgba(21, 101, 192, 0.9)", "#90caf9");
});

btnResetUcs.addEventListener('click', () => {
    if (loadedPointCloudData.originalPositions) {
        loadedPointCloudData.positions.set(loadedPointCloudData.originalPositions);
        renderBinaryPointCloud(false); closeUcsWidget();
        statusEl.innerText = "✅ UCS Reset to Original Scan!";
    }
});

// ১৭. Live drawing methods
window.updateLiveDistanceTracking = function(p1, currentPt) {
    if (!liveLineMesh) {
        const geom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        liveLineMesh = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: window.measureColor, linewidth: 8, depthTest: false }));
        liveLineMesh.renderOrder = 1000; liveLineMesh.frustumCulled = false;
        scene.add(liveLineMesh);
    }
    const arr = liveLineMesh.geometry.attributes.position.array;
    arr[0]=p1.x; arr[1]=p1.y; arr[2]=p1.z; arr[3]=currentPt.x; arr[4]=currentPt.y; arr[5]=currentPt.z;
    liveLineMesh.geometry.attributes.position.needsUpdate = true;
    if (!window.liveRing1) {
        window.liveRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 16, 32), new THREE.MeshBasicMaterial({ color: window.measureColor, depthTest: false, depthWrite: false, transparent: true }));
        window.liveRing1.renderOrder = 9999; scene.add(window.liveRing1);
    }
    if (!window.liveRing2) {
        window.liveRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 16, 32), new THREE.MeshBasicMaterial({ color: window.measureColor, depthTest: false, depthWrite: false, transparent: true }));
        window.liveRing2.renderOrder = 9999; scene.add(window.liveRing2);
    }
    window.liveRing1.position.copy(p1); window.liveRing1.lookAt(activeCamera.position);
    window.liveRing2.position.copy(currentPt); window.liveRing2.lookAt(activeCamera.position);
};

window.updateLiveAreaTracking = function(points, type) {
    if (window.liveAreaPreview) { scene.remove(window.liveAreaPreview); window.liveAreaPreview = null; }
    if (points.length < 2) return;
    let drawPts = [];
    if (type === "Rectangle") {
        const p1 = points[0], p2 = points[1];
        let p3 = new THREE.Vector3(), p4 = new THREE.Vector3();
        if (currentViewMode === 'front' || currentViewMode === 'back') { p3.set(p1.x, p2.y, p1.z); p4.set(p2.x, p1.y, p1.z); }
        else if (currentViewMode === 'left' || currentViewMode === 'right') { p3.set(p1.x, p2.y, p1.z); p4.set(p1.x, p1.y, p2.z); }
        else { p3.set(p1.x, p1.y, p2.z); p4.set(p2.x, p1.y, p1.z); }
        drawPts = [p1, p3, p2, p4, p1];
    } else if (type === "Circle") {
        const center = points[0], radius = center.distanceTo(points[1]);
        for (let i = 0; i <= 36; i++) {
            const theta = (i / 36) * Math.PI * 2, dx = radius * Math.cos(theta), dy = radius * Math.sin(theta);
            if (currentViewMode === 'front' || currentViewMode === 'back') drawPts.push(new THREE.Vector3(center.x + dx, center.y + dy, center.z));
            else if (currentViewMode === 'left' || currentViewMode === 'right') drawPts.push(new THREE.Vector3(center.x, center.y + dy, center.z + dx));
            else drawPts.push(new THREE.Vector3(center.x + dx, center.y, center.z + dy));
        }
    } else { drawPts = [...points, points[0]]; }
    if (drawPts.length > 0) {
        const geom = new THREE.BufferGeometry().setFromPoints(drawPts);
        window.liveAreaPreview = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: window.measureColor, linewidth: 5, depthTest: false }));
        window.liveAreaPreview.renderOrder = 1000; scene.add(window.liveAreaPreview);
    }
};

window.updateLiveDistanceLabel = function(pos, text) {
    if (!liveDistanceLabelEl) {
        liveDistanceLabelEl = document.createElement('div');
        liveDistanceLabelEl.className = 'measure-float-label';
        document.body.appendChild(liveDistanceLabelEl);
    }
    const wp = pos.clone().project(activeCamera);
    liveDistanceLabelEl.style.left = `${(wp.x * .5 + .5) * window.innerWidth + 15}px`;
    liveDistanceLabelEl.style.top = `${(-(wp.y * .5) + .5) * window.innerHeight - 15}px`;
    if (window.distanceInputBuffer && window.distanceInputBuffer.length > 0) {
        liveDistanceLabelEl.style.border = "2px solid #ff9800";
        liveDistanceLabelEl.innerHTML = `<span style="color:#ff9800; font-weight:900; font-size:14px;">▱ Input: ${window.distanceInputBuffer} cm</span>\n<span style="color:#aaa; font-size:10px;">Press Enter to Apply</span>`;
    } else { liveDistanceLabelEl.style.border = "1px solid #ff9800"; liveDistanceLabelEl.innerText = text; }
};

function removeLiveElements() {
    if (liveLineMesh) { scene.remove(liveLineMesh); liveLineMesh = null; }
    if (liveDistanceLabelEl) { liveDistanceLabelEl.remove(); liveDistanceLabelEl = null; }
    if (window.liveRing1) { scene.remove(window.liveRing1); window.liveRing1 = null; }
    if (window.liveRing2) { scene.remove(window.liveRing2); window.liveRing2 = null; }
    if (window.liveAreaPreview) { scene.remove(window.liveAreaPreview); window.liveAreaPreview = null; }
}

window.drawLivePolygon = function(points) {
    if (liveAreaMesh) scene.remove(liveAreaMesh);
    if (points.length < 2) return;
    const geom = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
    liveAreaMesh = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: window.measureColor, linewidth: 3, depthTest: false }));
    liveAreaMesh.renderOrder = 1000; scene.add(liveAreaMesh);
    console.log('Polygon points:', points.length, points);
};

// 1st click distance measurement
window.addEventListener('mousedown', (e) => {
    if (e.target.closest('#sidebar') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    if (window.isMeasureActive && activePointCloud && e.button === 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, activeCamera);
        raycaster.params.Points.threshold = Math.max(0.15, parseFloat(ptsizeSlider.value) * 0.15);
        const intersects = raycaster.intersectObject(activePointCloud);
        if (intersects.length > 0) {
            let pickedPt = intersects[0].point.clone();
            if (clippingPlanes[3].constant !== 1000) {
                if (currentViewMode === 'top') pickedPt.y = clippingPlanes[3].constant;
                else if (pickedPt.y > clippingPlanes[3].constant) pickedPt.y = clippingPlanes[3].constant;
            }
            if (window.pickedPoints.length === 0) {
                window.pickedPoints.push(pickedPt);
                if (window.updateLiveDistanceTracking) window.updateLiveDistanceTracking(pickedPt, pickedPt);
            } else {
                if (e.shiftKey) pickedPt = window.snapToDominantAxis(window.pickedPoints[0], pickedPt);
                window.createPermanentDistance(window.pickedPoints[0], pickedPt);
                window.pickedPoints = []; removeLiveElements();
                statusEl.innerText = "✅ Distance measured!";
            }
        }
    }
});

// Double-click to finish polygon area measurement
window.addEventListener('dblclick', (e) => {
    console.log('Double-click detected, target:', e.target.tagName, 'isAreaModeActive:', window.isAreaModeActive, 'shape:', document.getElementById('combo-area-shape').value);
    if (e.target.closest('#sidebar') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    if (window.isAreaModeActive && activePointCloud && document.getElementById('combo-area-shape').value === "Polygon") {
        console.log('Polygon double-click conditions met, points:', window.areaPoints?.length);
        if (window.areaPoints && window.areaPoints.length >= 3) {
            if (window.finalizeAreaShape) {
                console.log('Finalizing polygon with', window.areaPoints.length, 'points');
                window.finalizeAreaShape("Polygon", window.areaPoints);
                window.areaPoints = [];
                if (liveAreaMesh) { scene.remove(liveAreaMesh); liveAreaMesh = null; }
                statusEl.innerText = "✅ Polygon Area measured!";
            }
        } else {
            console.log('Not enough points for polygon:', window.areaPoints?.length);
            statusEl.innerText = "❌ Need at least 3 points for polygon!";
        }
    }
});

// ১৮. Permanent measurement creators
window.addPermanentLabel = function(position, text, color) {
    const el = document.createElement('div');
    el.className = 'measure-permanent-label';
    el.style.borderColor = color; el.innerHTML = text;
    document.body.appendChild(el);
    const itemObj = { element: el, position: position.clone(), isHidden: false, offsetX: 0, offsetY: 0, color };
    let isDragging = false, startX, startY;
    el.addEventListener('wheel', (e) => { renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); });
    let isRightClickPanning = false, lastMouseX = 0, lastMouseY = 0;
    el.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            isRightClickPanning = true; lastMouseX = e.clientX; lastMouseY = e.clientY;
            renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { clientX: e.clientX, clientY: e.clientY, button: 2, bubbles: true, pointerId: 1 }));
            e.preventDefault(); e.stopPropagation(); return;
        }
        if (currentViewMode === 'iso' || e.button !== 0) return;
        isDragging = true; startX = e.clientX - itemObj.offsetX; startY = e.clientY - itemObj.offsetY;
        e.stopPropagation();
    });
    window.addEventListener('mousemove', (e) => {
        if (isRightClickPanning) {
            const mX = e.clientX - lastMouseX, mY = e.clientY - lastMouseY;
            lastMouseX = e.clientX; lastMouseY = e.clientY;
            renderer.domElement.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY, button: 2, bubbles: true, movementX: mX, movementY: mY, pointerId: 1 }));
            return;
        }
        if (!isDragging) return;
        itemObj.offsetX = e.clientX - startX; itemObj.offsetY = e.clientY - startY;
    });
    window.addEventListener('mouseup', (e) => {
        if (isRightClickPanning && e.button === 2) {
            isRightClickPanning = false;
            renderer.domElement.dispatchEvent(new PointerEvent('pointerup', { clientX: e.clientX, clientY: e.clientY, button: 2, bubbles: true, pointerId: 1 }));
            return;
        }
        isDragging = false;
    });
    window.permanentLabels.push(itemObj);
};

window.createPermanentDistance = function(p1, p2) {
    const distance = p1.distanceTo(p2);
    const cylGeom = new THREE.CylinderGeometry(0.007, 0.007, distance, 8);
    cylGeom.translate(0, distance / 2, 0); cylGeom.rotateX(Math.PI / 2);
    cylGeom.computeBoundingSphere(); cylGeom.computeBoundingBox();
    const mat = new THREE.MeshBasicMaterial({ color: window.measureColor, depthTest: false, depthWrite: false, transparent: true });
    const line = new THREE.Mesh(cylGeom, mat);
    line.frustumCulled = false; line.position.copy(p1); line.lookAt(p2); line.renderOrder = 9998;
    scene.add(line);
    const ringGeom = new THREE.TorusGeometry(0.06, 0.006, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: window.measureColor, depthTest: false, depthWrite: false, transparent: true });
    const s1 = new THREE.Mesh(ringGeom, ringMat); s1.position.copy(p1); s1.renderOrder = 9999; s1.frustumCulled = false;
    const s2 = new THREE.Mesh(ringGeom, ringMat.clone()); s2.position.copy(p2); s2.renderOrder = 9999; s2.frustumCulled = false;
    s1.lookAt(activeCamera.position); s2.lookAt(activeCamera.position);
    scene.add(s1); scene.add(s2);
    if (!window.cameraFacingRings) window.cameraFacingRings = [];
    window.cameraFacingRings.push(s1, s2);
    const dist = p1.distanceTo(p2), dx = Math.abs(p2.x-p1.x), dy = Math.abs(p2.y-p1.y), dz = Math.abs(p2.z-p1.z), dxy = Math.sqrt(dx*dx+dz*dz);
    const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const textInfo = `Dist: ${dist.toFixed(3)}m\nXY: ${dxy.toFixed(3)}m\nX: ${dx.toFixed(3)}m\nY: ${dy.toFixed(3)}m\nZ: ${dz.toFixed(3)}m`;
    window.addPermanentLabel(midPoint, textInfo, window.measureColor);
    const id = Date.now();
    const lastLabel = window.permanentLabels[window.permanentLabels.length - 1].element;
    const measObj = { id, name: `Dist: ${dist.toFixed(2)}m`, meshes: [line, s1, s2], label: lastLabel };
    s1.userData = { isAnchor: true, measObj }; s2.userData = { isAnchor: true, measObj };
    window.measLayers.push(measObj);
    if (window.addLayerUI) { window.addLayerUI('list-meas', measObj, window.measLayers); window.pushToUndoOnAdd('list-meas', measObj, window.measLayers); }
    if (!window.isRestoring && typeof window.saveProjectSession === 'function') window.saveProjectSession();
};

window.finalizeAreaShape = function(type, data) {
    let points = [], areaValue = 0, centerPos = new THREE.Vector3();
    if (type === "Rectangle") {
        const [p1, p2] = data; let p3 = new THREE.Vector3(), p4 = new THREE.Vector3();
        if (currentViewMode === 'front' || currentViewMode === 'back') { p3.set(p1.x, p2.y, p1.z); p4.set(p2.x, p1.y, p1.z); areaValue = Math.abs(p2.x-p1.x) * Math.abs(p2.y-p1.y); }
        else if (currentViewMode === 'left' || currentViewMode === 'right') { p3.set(p1.x, p2.y, p1.z); p4.set(p1.x, p1.y, p2.z); areaValue = Math.abs(p2.z-p1.z) * Math.abs(p2.y-p1.y); }
        else { p3.set(p1.x, p1.y, p2.z); p4.set(p2.x, p1.y, p1.z); areaValue = Math.abs(p2.x-p1.x) * Math.abs(p2.z-p1.z); }
        points = [p1, p3, p2, p4]; centerPos.addVectors(p1, p2).multiplyScalar(0.5);
    } else if (type === "Circle") {
        const [center, radius] = data; centerPos.copy(center); areaValue = Math.PI * radius * radius;
        for (let i = 0; i <= 36; i++) {
            const theta = (i / 36) * Math.PI * 2, dx = radius * Math.cos(theta), dy = radius * Math.sin(theta);
            if (currentViewMode === 'front' || currentViewMode === 'back') points.push(new THREE.Vector3(center.x + dx, center.y + dy, center.z));
            else if (currentViewMode === 'left' || currentViewMode === 'right') points.push(new THREE.Vector3(center.x, center.y + dy, center.z + dx));
            else points.push(new THREE.Vector3(center.x + dx, center.y, center.z + dy));
        }
    } else {
        points = data; points.forEach(p => centerPos.add(p)); centerPos.divideScalar(points.length);
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const curr = points[i], next = points[(i+1) % points.length];
            if (currentViewMode === 'front' || currentViewMode === 'back') sum += (curr.x * next.y) - (next.x * curr.y);
            else if (currentViewMode === 'left' || currentViewMode === 'right') sum += (curr.z * next.y) - (next.z * curr.y);
            else sum += (curr.x * next.z) - (next.x * curr.z);
        }
        areaValue = Math.abs(sum) / 2.0;
    }
    const edgeGeom = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
    const lineMat = new THREE.LineBasicMaterial({ color: window.measureColor, linewidth: 5, depthTest: false, depthWrite: false, transparent: true });
    const outline = new THREE.Line(edgeGeom, lineMat); outline.renderOrder = 9999; outline.frustumCulled = false; scene.add(outline);
    const fillGeom = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < points.length; i++) {
        const pCurrent = points[i], pNext = points[(i+1) % points.length];
        vertices.push(centerPos.x, centerPos.y, centerPos.z, pCurrent.x, pCurrent.y, pCurrent.z, pNext.x, pNext.y, pNext.z);
    }
    fillGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const fillMat = new THREE.MeshBasicMaterial({ color: window.measureColor, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const fillMesh = new THREE.Mesh(fillGeom, fillMat); fillMesh.renderOrder = 9998; fillMesh.frustumCulled = false; scene.add(fillMesh);
    window.addPermanentLabel(centerPos, `▱ Area: ${areaValue.toFixed(2)} m²`, window.measureColor);
    if (liveAreaMesh) { scene.remove(liveAreaMesh); liveAreaMesh = null; }
    statusEl.innerText = `✅ ${type} Area: ${areaValue.toFixed(2)} m²`;
    const id = Date.now();
    const lastLabel = window.permanentLabels[window.permanentLabels.length - 1].element;
    const measObj = { id, name: `${type}: ${areaValue.toFixed(2)}`, meshes: [outline, fillMesh], label: lastLabel };
    measObj.userData = { shapeType: type, rawPoints: points.map(p => ({x:p.x, y:p.y, z:p.z})) };
    window.measLayers.push(measObj);
    if (window.addLayerUI) { window.addLayerUI('list-meas', measObj, window.measLayers); window.pushToUndoOnAdd('list-meas', measObj, window.measLayers); }
    if (!window.isRestoring && typeof window.saveProjectSession === 'function') window.saveProjectSession();
};

// ১৯. Layer management system
window.ucsLayers = []; window.measLayers = []; window.viewLayers = [];
window.undoStack = []; window.redoStack = [];

function toggleLayerVisibility(itemObj, show) {
    if (Array.isArray(itemObj.meshes)) itemObj.meshes.forEach(m => m.visible = show);
    else if (itemObj.mesh) itemObj.mesh.visible = show;
    if (itemObj.label) { const labelItem = window.permanentLabels.find(l => l.element === itemObj.label); if (labelItem) labelItem.isHidden = !show; itemObj.label.style.display = show ? 'block' : 'none'; }
    if (window.viewLayers && window.viewLayers.includes(itemObj)) {
        const anyViewActive = window.viewLayers.some(layer => layer.uiChk && layer.uiChk.checked);
        if (activePointCloud) { activePointCloud.visible = !anyViewActive; const chkMain = document.getElementById('chk-main-vis'); if (chkMain) chkMain.checked = !anyViewActive; }
    }
    renderer.render(scene, activeCamera);
}

window.addLayerUI = function(listId, itemObj, arrayRef) {
    const list = document.getElementById(listId);
    const div = document.createElement('div'); div.className = 'list-item';
    const leftWrap = document.createElement('div'); leftWrap.style = "display:flex; align-items:center;";
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = true; chk.style.marginRight = "6px";
    let radio = null;
    if (listId !== 'list-layers') {
        radio = document.createElement('input');
        radio.type = 'radio'; radio.name = listId + '_radio'; radio.value = itemObj.id;
        radio.style.margin = "0 6px 0 0"; radio.style.cursor = "pointer";
    }
    chk.onchange = () => {
        toggleLayerVisibility(itemObj, chk.checked);
        if (listId !== 'list-layers') { if (chk.checked && radio && !radio.checked) radio.click(); }
    };
    if (radio) {
        radio.onclick = function(e) {
            if (this.wasChecked) {
                this.checked = false; this.wasChecked = false;
                if (listId === 'list-ucs') document.getElementById('btn-reset-ucs').click();
            } else {
                document.querySelectorAll(`input[name="${listId}_radio"]`).forEach(r => r.wasChecked = false);
                this.wasChecked = true;
                if (listId === 'list-ucs' && (itemObj.angle !== undefined || itemObj.steps)) {
                    if (loadedPointCloudData.originalPositions) loadedPointCloudData.positions.set(loadedPointCloudData.originalPositions);
                    const pos = loadedPointCloudData.positions;
                    const stepsToApply = itemObj.steps ? itemObj.steps : [itemObj];
                    for (let step of stepsToApply) {
                        const originX = step.origin.x, originY = step.origin.y, originZ = step.origin.z;
                        const angle = step.angle, mode = step.viewMode || 'top';
                        const cos = Math.cos(-angle), sin = Math.sin(-angle);
                        if (mode === 'top' || mode === 'iso') {
                            for (let i = 0; i < pos.length; i += 3) { const rx = pos[i]-originX, ry = pos[i+1]-(-originZ); pos[i]=rx*cos-ry*sin+originX; pos[i+1]=rx*sin+ry*cos+(-originZ); }
                        } else if (mode === 'front' || mode === 'back') {
                            for (let i = 0; i < pos.length; i += 3) { const rx = pos[i]-originX, rz = pos[i+2]-originY; pos[i]=rx*cos-rz*sin+originX; pos[i+2]=rx*sin+rz*cos+originY; }
                        } else if (mode === 'left' || mode === 'right') {
                            for (let i = 0; i < pos.length; i += 3) { const ry = pos[i+1]-(-originZ), rz = pos[i+2]-originY; pos[i+1]=(ry*cos-rz*sin)+(-originZ); pos[i+2]=(ry*sin+rz*cos)+originY; }
                        }
                    }
                    renderBinaryPointCloud(false);
                }
            }
        };
        leftWrap.appendChild(radio);
    }
    leftWrap.appendChild(chk);
    leftWrap.appendChild(document.createTextNode(itemObj.name));
    const delBtn = document.createElement('span');
    delBtn.innerHTML = '❌'; delBtn.className = 'del-icon'; delBtn.title = "Delete this layer";
    delBtn.onclick = () => {
        // Remove meshes from scene
        if (Array.isArray(itemObj.meshes)) {
            itemObj.meshes.forEach(m => {
                if (m) {
                    scene.remove(m);
                    if (m.geometry) m.geometry.dispose();
                    if (m.material) {
                        if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
                        else m.material.dispose();
                    }
                }
            });
        } else if (itemObj.mesh) {
            scene.remove(itemObj.mesh);
            if (itemObj.mesh.geometry) itemObj.mesh.geometry.dispose();
            if (itemObj.mesh.material) itemObj.mesh.material.dispose();
        }
        
        // Remove label
        if (itemObj.label) {
            const labelItem = window.permanentLabels.find(l => l.element === itemObj.label);
            if (labelItem) {
                itemObj.label.remove();
                window.permanentLabels = window.permanentLabels.filter(l => l !== labelItem);
            }
        }
        
        // Remove from camera facing rings if distance measurement
        if (itemObj.meshes && itemObj.meshes.length >= 3) {
            window.cameraFacingRings = window.cameraFacingRings.filter(r => r !== itemObj.meshes[1] && r !== itemObj.meshes[2]);
        }
        
        toggleLayerVisibility(itemObj, false); div.style.display = 'none';
        const idx = arrayRef.findIndex(i => i.id === itemObj.id);
        if (idx > -1) arrayRef.splice(idx, 1);
        if (typeof window.saveProjectSession === 'function') window.saveProjectSession();
        window.undoStack.push({ action: 'delete', listId, itemObj, arrayRef, idx, uiDiv: div, chk });
        window.redoStack = [];
        statusEl.innerText = "🗑️ Layer Deleted! (Ctrl+Z to Undo)";
    };
    div.appendChild(leftWrap); div.appendChild(delBtn);
    list.appendChild(div);
    itemObj.uiElement = div; itemObj.uiChk = chk;
};

window.processUndoRedo = function(isUndo) {
    const stack = isUndo ? window.undoStack : window.redoStack;
    const oppositeStack = isUndo ? window.redoStack : window.undoStack;
    if (stack.length === 0) return;
    const op = stack.pop();
    if (op.action === 'add') {
        if (isUndo) { toggleLayerVisibility(op.itemObj, false); op.uiDiv.style.display = 'none'; const idx = op.arrayRef.findIndex(i => i.id === op.itemObj.id); if (idx > -1) op.arrayRef.splice(idx, 1); }
        else { op.arrayRef.push(op.itemObj); op.uiDiv.style.display = 'flex'; toggleLayerVisibility(op.itemObj, op.itemObj.uiChk ? op.itemObj.uiChk.checked : true); }
        oppositeStack.push(op);
    } else if (op.action === 'delete') {
        if (isUndo) { op.arrayRef.splice(op.idx, 0, op.itemObj); op.uiDiv.style.display = 'flex'; toggleLayerVisibility(op.itemObj, op.chk.checked); }
        else { toggleLayerVisibility(op.itemObj, false); op.uiDiv.style.display = 'none'; const idx = op.arrayRef.findIndex(i => i.id === op.itemObj.id); if (idx > -1) op.arrayRef.splice(idx, 1); }
        oppositeStack.push(op);
    }
    statusEl.innerText = isUndo ? "↩️ Undo" : "↪️ Redo";
};

window.pushToUndoOnAdd = function(listId, itemObj, arrayRef) {
    window.undoStack.push({ action: 'add', listId, itemObj, arrayRef, uiDiv: itemObj.uiElement });
    window.redoStack = [];
};

// Save View Layer
window.saveViewLayer = function() {
    if (!activePointCloud) return;
    const id = Date.now();
    const layerName = "Saved View " + (window.viewLayers.length + 1);
    const newGeom = activePointCloud.geometry.clone();
    const newMat = activePointCloud.material.clone();
    if (activePointCloud.material.clippingPlanes && activePointCloud.material.clippingPlanes.length > 0) newMat.clippingPlanes = activePointCloud.material.clippingPlanes.map(p => p.clone());
    else newMat.clippingPlanes = [];
    const newCloud = new THREE.Points(newGeom, newMat);
    newCloud.visible = false; scene.add(newCloud);
    let activePlanesData = [];
    if (activePointCloud.material.clippingPlanes) {
        activePlanesData = activePointCloud.material.clippingPlanes.map(p => ({ normal: { x: p.normal.x, y: p.normal.y, z: p.normal.z }, constant: p.constant }));
    }
    const chkSmartOp = document.getElementById('chk-smart-opacity');
    let dynamicColorMode = document.getElementById('combo-color').value;
    let currentOpacity = activePointCloud.material.opacity;
    if (chkSmartOp && chkSmartOp.checked) { dynamicColorMode = 'solid'; currentOpacity = 0.10; }
    let activeUcsIdx = -1;
    const ucsRadios = document.querySelectorAll('input[name="list-ucs_radio"]');
    if (ucsRadios.length > 0) ucsRadios.forEach((radio, idx) => { if (radio.checked) activeUcsIdx = idx; });
    const layerObj = { id, name: layerName, mesh: newCloud, camPos: activeCamera.position.clone(), camFocal: controls.target.clone(), camUp: activeCamera.up.clone(), clippingPlanesData: activePlanesData, colorMode: dynamicColorMode, opacity: currentOpacity, activeUcsIndex: activeUcsIdx };
    window.viewLayers.push(layerObj);
    if (window.addLayerUI) { window.addLayerUI('list-layers', layerObj, window.viewLayers); window.pushToUndoOnAdd('list-layers', layerObj, window.viewLayers); if (layerObj.uiChk) layerObj.uiChk.checked = false; }
    if (typeof window.saveProjectSession === 'function') window.saveProjectSession();
    statusEl.innerText = `✅ Saved View: ${layerName}`;
};
document.getElementById('btn-save-layer').addEventListener('click', window.saveViewLayer);

// ২০. Export functions
window.exportAppImage = function(toClipboard = false) {
    const resRatio = document.querySelector('input[name="export_res"]:checked').value;
    const origW = window.innerWidth, origH = window.innerHeight;
    const scale = parseInt(resRatio);
    statusEl.innerText = "⏳ Rendering Export...";
    renderer.setSize(origW * scale, origH * scale);
    renderer.render(scene, activeCamera);
    const compCanvas = document.createElement('canvas');
    compCanvas.width = origW * scale; compCanvas.height = origH * scale;
    const ctx = compCanvas.getContext('2d');
    ctx.drawImage(renderer.domElement, 0, 0, compCanvas.width, compCanvas.height);
    ctx.scale(scale, scale); ctx.textBaseline = "top";
    window.permanentLabels.forEach(item => {
        if (item.element.style.display !== 'none') {
            const wp = item.position.clone().project(activeCamera);
            if (wp.z <= 1) {
                const anchorX = (wp.x * .5 + .5) * origW, anchorY = (-(wp.y * .5) + .5) * origH;
                const targetX = anchorX + item.offsetX, targetY = anchorY + item.offsetY;
                if (item.offsetX !== 0 || item.offsetY !== 0) {
                    ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(targetX, targetY - 10);
                    ctx.strokeStyle = item.color || '#ff9800'; ctx.lineWidth = 2.2;
                    ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
                }
                const lines = item.element.innerText.split('\n');
                const color = item.element.style.borderColor || '#ff9800';
                ctx.font = "bold 12px 'Segoe UI'";
                let maxWidth = 0; lines.forEach(l => maxWidth = Math.max(maxWidth, ctx.measureText(l).width));
                const boxWidth = maxWidth + 24, boxHeight = (lines.length * 15) + 12;
                const boxLeft = targetX - (boxWidth / 2), boxTop = targetY - 10 - boxHeight;
                ctx.fillStyle = "rgba(10,10,10,0.85)"; ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
                ctx.fillStyle = color; ctx.fillRect(boxLeft, boxTop, 3, boxHeight);
                ctx.fillStyle = "#ffffff"; lines.forEach((l, i) => ctx.fillText(l, boxLeft + 12, boxTop + 6 + (i * 15)));
            }
        }
    });
    const dataURL = compCanvas.toDataURL("image/png");
    renderer.setSize(origW, origH);
    if (toClipboard) {
        fetch(dataURL).then(res => res.blob()).then(blob => {
            navigator.clipboard.write([new window.ClipboardItem({'image/png': blob})]);
            statusEl.innerText = "⧉ ✅ Copied to Clipboard!";
        });
    } else {
        const a = document.createElement('a'); a.href = dataURL; a.download = "Cloudify_Export.png"; a.click();
        statusEl.innerText = "⬇ ✅ Image Exported!";
    }
};
document.getElementById('btn-export-img').addEventListener('click', () => window.exportAppImage(false));
document.getElementById('btn-copy-img').addEventListener('click', () => window.exportAppImage(true));

// E57 Export
window.triggerE57Export = async function() {
    const targetFilePath = window.globalExportFilePath;
    if (!targetFilePath) { alert("❌ Please open a Point Cloud file first!"); return; }
    try {
        const remote = window.require('@electron/remote');
        const dialog = remote.dialog;
        const defaultOutputPath = targetFilePath.substring(0, targetFilePath.lastIndexOf('.')) + '_exported.e57';
        const result = await dialog.showSaveDialog({ title: 'Export to E57', defaultPath: defaultOutputPath, filters: [{ name: 'E57 Point Cloud', extensions: ['e57'] }] });
        if (result.canceled || !result.filePath) return;
        statusEl.innerText = "⏳ Exporting to E57..."; statusEl.style.color = "#ff9800";
        const btnExportE57 = document.getElementById('btn-export-e57');
        if (btnExportE57) { btnExportE57.disabled = true; btnExportE57.style.opacity = "0.5"; }
        const response = await fetch(`http://127.0.0.1:${window.current_backend_port}/export-e57?source_path=${encodeURIComponent(targetFilePath)}&output_path=${encodeURIComponent(result.filePath)}`, { method: 'POST' });
        if (!response.ok) { const errData = await response.json(); throw new Error(errData.detail || "Export failed."); }
        const resData = await response.json();
        statusEl.innerText = `✅ ${resData.message || "Exported Successfully!"}`; statusEl.style.color = "#76ff03";
        alert("⎘ E57 exported successfully!");
    } catch (err) {
        console.error("E57 Export Error:", err);
        statusEl.innerText = "❌ Export Failed: " + err.message; statusEl.style.color = "#ff3d00";
        alert("❌ Export Failed: " + err.message);
    } finally {
        const btnExportE57 = document.getElementById('btn-export-e57');
        if (btnExportE57) { btnExportE57.disabled = false; btnExportE57.style.opacity = "1"; }
    }
};

// Solid Wall Mode (Q key)
window.isSolidWallMode = false; window.prevPointSize = 2;
window.toggleSolidWallMode = function() {
    if (!activePointCloud) return;
    window.isSolidWallMode = !window.isSolidWallMode;
    if (activePointCloud.material.userData && activePointCloud.material.userData.uSolidMode) activePointCloud.material.userData.uSolidMode.value = window.isSolidWallMode;
    if (window.isSolidWallMode) {
        window.prevPointSize = parseFloat(ptsizeSlider.value);
        activePointCloud.material.size = window.prevPointSize < 2.5 ? 3.5 : window.prevPointSize * 1.5;
        activePointCloud.material.opacity = 1.0; activePointCloud.material.transparent = false;
        activePointCloud.material.depthWrite = true; activePointCloud.material.needsUpdate = true;
        if (!chkShading.checked) chkShading.checked = true;
        statusEl.innerText = "🧱 Solid Surface Mode: ON";
        window.showHudNotification("🧱 Solid Wall Mode: Enabled", "rgba(60,60,60,0.95)", "#ffffff");
    } else {
        activePointCloud.material.size = window.prevPointSize;
        const currentOpacity = parseFloat(opacitySlider.value) / 100.0;
        activePointCloud.material.opacity = currentOpacity;
        activePointCloud.material.transparent = currentOpacity < 1.0 || chkSmartOpacity.checked;
        activePointCloud.material.depthWrite = !(currentOpacity < 1.0 || chkSmartOpacity.checked);
        activePointCloud.material.needsUpdate = true;
        statusEl.innerText = "◎ Standard Point Cloud Mode"; window.hideHudNotification();
    }
    renderer.render(scene, activeCamera);
};

// Zoom to Fit (W key)
function zoomToFitAll() {
    if (!activePointCloud) return;
    const box = new THREE.Box3().setFromObject(activePointCloud);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    const direction = new THREE.Vector3().subVectors(activeCamera.position, controls.target).normalize();
    controls.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const aspect = window.innerWidth / window.innerHeight;
    if (activeCamera.isPerspectiveCamera) {
        const fov = activeCamera.fov * (Math.PI / 180);
        let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;
        activeCamera.position.copy(center).add(direction.multiplyScalar(dist));
    } else {
        const frustumSize = maxDim * 1.2;
        activeCamera.left = -frustumSize * aspect / 2; activeCamera.right = frustumSize * aspect / 2;
        activeCamera.top = frustumSize / 2; activeCamera.bottom = -frustumSize / 2;
        activeCamera.updateProjectionMatrix();
        activeCamera.position.copy(center).add(direction.multiplyScalar(maxDim * 2));
    }
    controls.update(); statusEl.innerText = "🔍 Zoom All: Balanced";
}

document.getElementById('btn-set-default').addEventListener('click', () => {
    statusEl.innerText = "⏳ Building association protocols..."; statusEl.style.color = "#ff9800";
    setTimeout(() => { statusEl.innerText = "✅ Package the app to register file associations."; statusEl.style.color = "#76ff03"; }, 1200);
});

// ২১. Full Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey, isShift = e.shiftKey, key = e.key.toLowerCase();
    const isTextInput = e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number'));

    // AutoCAD-style numeric distance input
    if (window.isMeasureActive && window.pickedPoints && window.pickedPoints.length === 1 && !isTextInput) {
        if (!window.distanceInputBuffer) window.distanceInputBuffer = "";
        if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
            window.distanceInputBuffer += e.key;
            statusEl.innerText = `↔ Enter Distance (cm): ${window.distanceInputBuffer}`;
            if (window.lastLiveDistancePoint && window.updateLiveDistanceLabel) window.updateLiveDistanceLabel(window.lastLiveDistancePoint, "");
            return;
        }
        if (e.key === 'Backspace') {
            window.distanceInputBuffer = window.distanceInputBuffer.slice(0, -1);
            statusEl.innerText = `↔ Enter Distance (cm): ${window.distanceInputBuffer}`;
            if (window.lastLiveDistancePoint && window.updateLiveDistanceLabel) window.updateLiveDistanceLabel(window.lastLiveDistancePoint, "");
            return;
        }
        if (e.key === 'Enter' && window.distanceInputBuffer.length > 0) {
            const cmValue = parseFloat(window.distanceInputBuffer); window.distanceInputBuffer = "";
            if (!isNaN(cmValue) && cmValue > 0) {
                const p1 = window.pickedPoints[0];
                let targetDir = window.lastLiveDirection;
                if (!targetDir && window.lastLiveDistancePoint) targetDir = new THREE.Vector3().subVectors(window.lastLiveDistancePoint, p1).normalize();
                if (!targetDir || targetDir.lengthSq() === 0) targetDir = new THREE.Vector3(1, 0, 0).applyQuaternion(activeCamera.quaternion).normalize();
                const p2 = new THREE.Vector3().copy(p1).addScaledVector(targetDir, cmValue / 100.0);
                window.createPermanentDistance(p1, p2); window.pickedPoints = [];
                if (typeof removeLiveElements === "function") removeLiveElements();
                statusEl.innerText = `✅ Distance: ${cmValue}cm`;
                return;
            }
        }
    }

    if (isTextInput) return;

    if (e.key === 'F1' || key === 'f1') { e.preventDefault(); const modal = document.getElementById('shortcuts-help-modal'); if (modal) modal.style.display = modal.style.display === 'block' ? 'none' : 'block'; return; }
    if (key === 'escape') {
        const modal = document.getElementById('shortcuts-help-modal'); if (modal) modal.style.display = 'none';
        if (window.isAreaModeActive && document.getElementById('combo-area-shape').value === "Polygon") { if (window.areaPoints && window.areaPoints.length >= 3 && window.finalizeAreaShape) window.finalizeAreaShape("Polygon", window.areaPoints); window.areaPoints = []; if (liveAreaMesh) { scene.remove(liveAreaMesh); liveAreaMesh = null; } }
        if (window.isAreaModeActive) document.getElementById('btn-measure-area').click();
        if (window.isMeasureActive) document.getElementById('btn-measure-dist').click();
        if (isUcsActive) { closeUcsWidget(); document.getElementById('btn-ucs').style.background = "#e65100"; }
        if (isSliceActive) { isSliceActive = false; if (sliceBoxMesh) sliceBoxMesh.visible = false; document.getElementById('btn-slice').style.background = "#2e7d32"; }
        if (window.isSolidWallMode) window.toggleSolidWallMode();
        if (typeof removeLiveElements === "function") removeLiveElements();
        statusEl.innerText = "◎ Standard View Mode"; window.hideHudNotification();
    }
    else if (key === 'q' && !isCtrl) window.toggleSolidWallMode();
    else if (key === 'w' && !isCtrl) zoomToFitAll();
    else if (key === 'o' && !isCtrl) document.getElementById('btn-load').click();
    else if (key === 't' && !isCtrl) document.getElementById('btn-view-top').click();
    else if (key === 'f' && !isCtrl) document.getElementById('btn-view-front').click();
    else if (key === 'l' && !isCtrl) document.getElementById('btn-view-left').click();
    else if (key === 'r' && !isShift) document.getElementById('btn-view-iso').click();
    else if (key === 'r' && isShift) document.getElementById('btn-view-right').click();
    else if (key === 'b' && isShift) document.getElementById('btn-view-back').click();
    else if (key === 'b' && !isShift && !isCtrl) {
        if (window.isMeasVisible === undefined) window.isMeasVisible = true;
        window.isMeasVisible = !window.isMeasVisible;
        if (window.measLayers && window.measLayers.length > 0) {
            window.measLayers.forEach(layer => { const shouldShow = window.isMeasVisible && (layer.uiChk ? layer.uiChk.checked : true); if (typeof toggleLayerVisibility === 'function') toggleLayerVisibility(layer, shouldShow); });
            statusEl.innerText = window.isMeasVisible ? "◎ Measurements: ON" : "◎ Measurements: OFF";
        }
    }
    else if (key === 's' && !isCtrl && !isShift) document.getElementById('btn-slice').click();
    else if (key === 'm' && !isShift) document.getElementById('btn-measure-dist').click();
    else if (key === 'm' && isShift) document.getElementById('btn-measure-area').click();
    else if (key === 'u' && !isCtrl) document.getElementById('btn-ucs').click();
    else if (key === 'p' && !isCtrl) window.exportAppImage(false);
    else if (key === 'p' && isCtrl) window.exportAppImage(true);
    else if (key === 's' && isCtrl) window.saveViewLayer();
    else if (key === 'z' && isCtrl) window.processUndoRedo(true);
    else if (key === 'y' && isCtrl) window.processUndoRedo(false);
    else if (key === 'enter' && isUcsActive && document.getElementById('btn-apply-ucs').style.display !== 'none') document.getElementById('btn-apply-ucs').click();
    else if (key === 's' && isShift) document.getElementById('chk-smart-opacity').click();
    else if (key === 'e' && isShift) document.getElementById('chk-shading').click();
    else if (key === 'h' && !isCtrl) { const pnl = document.getElementById('sidebar'); pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none'; }
});

// ──────────────────────────────────────────────────────────────────────────────
// ২২. COMPARE ANOTHER SCAN — Split-screen second viewport
// ──────────────────────────────────────────────────────────────────────────────
(function initCompareViewport() {
    // ---- State ----
    let compareRenderer   = null;
    let compareScene      = null;
    let compareCamera     = null;
    let compareControls   = null;
    let compareCloud      = null;
    let compareBackendPort = null;
    let compareAnimId     = null;
    let compareActive     = false;

    // ---- Helper: receivedLength / assemble (local copies so no closure issues) ----
    function rcLen(chunks) { return chunks.reduce((a, c) => a + c.length, 0); }
    function rcAssemble(chunks, out) { let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; } }

    // ---- Jet colour (same formula as main) ----
    function jetC(v) {
        const clamp = (x) => Math.max(0, Math.min(1, x));
        return {
            r: clamp(Math.min(4*v - 1.5, -4*v + 4.5)),
            g: clamp(Math.min(4*v - 0.5, -4*v + 3.5)),
            b: clamp(Math.min(4*v + 0.5, -4*v + 2.5))
        };
    }

    // ---- Gradient background (light grey) ----
    function makeGradBg() {
        const c = document.createElement('canvas'); c.width = 2; c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 512, 0, 0);
        g.addColorStop(0, '#f1f3f4'); g.addColorStop(1, '#e8eaed');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    // ---- Tear down compare viewport ----
    function destroyCompare() {
        if (compareAnimId) { cancelAnimationFrame(compareAnimId); compareAnimId = null; }
        if (compareCloud)   { compareScene.remove(compareCloud); compareCloud.geometry.dispose(); compareCloud.material.dispose(); compareCloud = null; }
        if (compareControls) { compareControls.dispose(); compareControls = null; }
        if (compareRenderer) { compareRenderer.dispose(); compareRenderer.domElement.remove(); compareRenderer = null; }
        compareScene = null; compareCamera = null; compareActive = false;

        // Kill extra backend
        if (compareBackendPort) {
            try { fetch(`http://127.0.0.1:${compareBackendPort}/shutdown`, { method: 'POST' }).catch(() => {}); } catch(_) {}
            compareBackendPort = null;
        }

        // Hide pane-2 and restore grid
        const pane2 = document.getElementById('pane-2');
        if (pane2) pane2.style.display = 'none';
        const grid = document.getElementById('viewport-grid');
        if (grid) { grid.classList.remove('panes-2'); grid.classList.add('panes-1'); }

        // Resize main renderer
        resizeMainRenderer();
    }

    // ---- Resize main renderer to fill its pane ----
    function resizeMainRenderer() {
        const pane1 = document.getElementById('pane-1');
        if (!pane1) return;
        const w = pane1.offsetWidth, h = pane1.offsetHeight;
        if (w > 0 && h > 0) {
            renderer.setSize(w, h);
            camera.aspect = w / h; camera.updateProjectionMatrix();
            const aspect = w / h;
            orthoCamera.left   = -10 * aspect; orthoCamera.right  =  10 * aspect;
            orthoCamera.top    =  10;           orthoCamera.bottom = -10;
            orthoCamera.updateProjectionMatrix();
        }
    }

    // ---- Build the compare THREE scene + renderer inside viewport-2 ----
    function buildCompareRenderer() {
        const container = document.getElementById('viewport-2');
        if (!container) { console.error('[Compare] #viewport-2 not found'); return false; }

        compareScene = new THREE.Scene();
        compareScene.background = makeGradBg();

        const w = container.offsetWidth  || 600;
        const h = container.offsetHeight || 500;

        compareCamera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
        compareCamera.position.set(10, 10, 10);

        compareRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        compareRenderer.setSize(w, h);
        compareRenderer.setPixelRatio(1);
        container.appendChild(compareRenderer.domElement);

        compareControls = new OrbitControls(compareCamera, compareRenderer.domElement);
        compareControls.enableDamping = false;
        compareControls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

        // Animate loop
        function loop() {
            compareAnimId = requestAnimationFrame(loop);
            compareControls.update();
            compareRenderer.render(compareScene, compareCamera);
        }
        loop();

        // Resize observer
        const ro = new ResizeObserver(() => {
            const nw = container.offsetWidth, nh = container.offsetHeight;
            if (nw > 0 && nh > 0) {
                compareRenderer.setSize(nw, nh);
                compareCamera.aspect = nw / nh;
                compareCamera.updateProjectionMatrix();
            }
        });
        ro.observe(container);

        return true;
    }

    // ---- Load scan into compare scene ----
    async function loadCompare(filePath) {
        const statusEl = document.getElementById('status');
        const fileName = filePath.split('\\').pop();

        // Update pane-2 label
        const label = document.getElementById('pane-2-label');
        if (label) label.textContent = '🗂 ' + fileName;

        statusEl.innerText = `⏳ Compare: Starting backend for "${fileName}"...`;
        statusEl.style.color = '#ff9800';

        // Spawn extra backend
        try {
            const { ipcRenderer } = window.require('electron');
            compareBackendPort = await ipcRenderer.invoke('spawn-extra-backend');
        } catch(err) {
            statusEl.innerText = '❌ Compare: Backend spawn failed – ' + err.message;
            statusEl.style.color = '#ff3d00';
            destroyCompare(); return;
        }

        statusEl.innerText = `⏳ Compare: Loading "${fileName}"...`;

        try {
            const maxPoints = document.getElementById('combo-density').value;
            let response = null;
            for (let i = 0; i < 15; i++) {
                try {
                    response = await fetch(`http://127.0.0.1:${compareBackendPort}/load-file?file_path=${encodeURIComponent(filePath)}&max_points=${maxPoints}`, { method: 'POST' });
                    break;
                } catch(_) {
                    statusEl.innerText = `⏳ Compare Backend Starting… (${i+1}/15)`;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            if (!response || !response.ok) { const d = response ? await response.json() : {}; throw new Error(d.detail || 'Load failed'); }

            const meta = await response.json();
            const nPts = meta.points_count;

            // Stream positions
            const pResp = await fetch(`http://127.0.0.1:${compareBackendPort}/points-binary`);
            const pReader = pResp.body.getReader();
            let pChunks = [], pBytes = 0;
            const totalBytes = nPts * 3 * 4;
            while (true) {
                const { done, value } = await pReader.read();
                if (done) break;
                pChunks.push(value); pBytes += value.length;
                if (statusEl) statusEl.innerText = `⏳ Compare Streaming: ${Math.round(pBytes/totalBytes*100)}%`;
            }
            let pBuf = new Uint8Array(rcLen(pChunks)); rcAssemble(pChunks, pBuf);
            const positions = new Float32Array(pBuf.buffer);

            // Stream colors
            let colors = null;
            if (meta.has_color) {
                const cResp = await fetch(`http://127.0.0.1:${compareBackendPort}/colors-binary`);
                const cReader = cResp.body.getReader();
                let cChunks = [];
                while (true) { const { done, value } = await cReader.read(); if (done) break; cChunks.push(value); }
                let cBuf = new Uint8Array(rcLen(cChunks)); rcAssemble(cChunks, cBuf);
                colors = cBuf;
            }

            // Stream intensities
            let intensities = null;
            if (meta.has_intensity) {
                const iResp = await fetch(`http://127.0.0.1:${compareBackendPort}/intensities-binary`);
                const iReader = iResp.body.getReader();
                let iChunks = [];
                while (true) { const { done, value } = await iReader.read(); if (done) break; iChunks.push(value); }
                let iBuf = new Uint8Array(rcLen(iChunks)); rcAssemble(iChunks, iBuf);
                intensities = new Float32Array(iBuf.buffer);
            }

            // ---- Build geometry (centred + Y-up swap, identical to main) ----
            let sumX = 0, sumY = 0, sumZ = 0;
            const step = Math.max(1, Math.floor(nPts / 100000));
            let sc = 0;
            for (let i = 0; i < positions.length; i += 3*step) { sumX += positions[i]; sumY += positions[i+1]; sumZ += positions[i+2]; sc++; }
            const cx = sumX/sc, cy = sumY/sc, cz = sumZ/sc;

            const cPos = new Float32Array(positions.length);
            let minY = Infinity;
            for (let i = 0; i < positions.length; i += 3) {
                cPos[i]   = positions[i]   - cx;
                cPos[i+1] = positions[i+2] - cz;
                cPos[i+2] = -(positions[i+1] - cy);
                if (cPos[i+1] < minY) minY = cPos[i+1];
            }
            for (let i = 0; i < cPos.length; i += 3) cPos[i+1] -= minY;

            // ---- Colours ----
            const colMode = document.getElementById('combo-color').value;
            const rendC = new Float32Array(positions.length);
            if (colMode === 'rgb' && colors) {
                for (let i = 0; i < rendC.length; i++) rendC[i] = colors[i] / 255.0;
            } else if (colMode === 'intensity' && intensities) {
                let maxInt = 0; for (let i = 0; i < intensities.length; i++) if (intensities[i] > maxInt) maxInt = intensities[i];
                const div = maxInt || 1;
                for (let i = 0; i < positions.length; i += 3) {
                    const j = jetC(intensities[i/3] / div);
                    rendC[i] = j.r; rendC[i+1] = j.g; rendC[i+2] = j.b;
                }
            } else {
                // Elevation gradient (default fallback)
                let minE = Infinity, maxE = -Infinity;
                for (let i = 1; i < cPos.length; i += 3) { if (cPos[i] < minE) minE = cPos[i]; if (cPos[i] > maxE) maxE = cPos[i]; }
                const range = maxE - minE || 1;
                for (let i = 0; i < positions.length; i += 3) {
                    const j = jetC((cPos[i+1] - minE) / range);
                    rendC[i] = j.r; rendC[i+1] = j.g; rendC[i+2] = j.b;
                }
            }

            // ---- THREE BufferGeometry ----
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
            geom.setAttribute('color',    new THREE.Float32BufferAttribute(rendC, 3));

            const mat = new THREE.PointsMaterial({
                size: parseFloat(document.getElementById('slider-ptsize').value) || 2,
                vertexColors: true,
                sizeAttenuation: true
            });

            if (compareCloud) { compareScene.remove(compareCloud); compareCloud.geometry.dispose(); compareCloud.material.dispose(); }
            compareCloud = new THREE.Points(geom, mat);
            compareScene.add(compareCloud);

            // Auto zoom-to-fit
            const box = new THREE.Box3().setFromObject(compareCloud);
            const centre = new THREE.Vector3(); box.getCenter(centre);
            const sz = new THREE.Vector3(); box.getSize(sz);
            const maxDim = Math.max(sz.x, sz.y, sz.z);
            const fov = compareCamera.fov * Math.PI / 180;
            const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.4;
            compareCamera.position.set(centre.x + dist * 0.6, centre.y + dist * 0.5, centre.z + dist * 0.8);
            compareControls.target.copy(centre);
            compareControls.update();

            statusEl.innerText = `✅ Compare Loaded: ${nPts.toLocaleString()} pts — "${fileName}"`;
            statusEl.style.color = '#76ff03';

        } catch(err) {
            console.error('[Compare] Load error:', err);
            statusEl.innerText = '❌ Compare Error: ' + err.message;
            statusEl.style.color = '#ff3d00';
            destroyCompare();
        }
    }

    // ---- btn-add-compare click ----
    const btnCompare = document.getElementById('btn-add-compare');
    if (btnCompare) {
        btnCompare.addEventListener('click', async () => {
            // If already active, just bring back to view
            if (compareActive) {
                document.getElementById('status').innerText = 'ℹ️ Compare viewport is already open. Close it first to load a new scan.';
                return;
            }

            // Ask for file
            let filePath = null;
            try {
                const { ipcRenderer } = window.require('electron');
                filePath = await ipcRenderer.invoke('open-file-dialog');
            } catch(err) {
                document.getElementById('status').innerText = '❌ Could not open file dialog: ' + err.message;
                return;
            }
            if (!filePath) return;

            // Show pane-2 and switch grid to 2-column
            const pane2 = document.getElementById('pane-2');
            const grid  = document.getElementById('viewport-grid');
            if (!pane2 || !grid) return;

            pane2.style.display = 'block';
            grid.classList.remove('panes-1');
            grid.classList.add('panes-2');
            compareActive = true;

            // Give DOM a tick to layout before reading dimensions
            await new Promise(r => requestAnimationFrame(r));
            resizeMainRenderer();
            buildCompareRenderer();

            await loadCompare(filePath);
        });
    }

    // ---- pane-2-close ----
    const btnClose2 = document.getElementById('pane-2-close');
    if (btnClose2) btnClose2.addEventListener('click', () => destroyCompare());

    // ---- Keep compare renderer in sync when window resizes ----
    window.addEventListener('resize', () => {
        if (!compareActive || !compareRenderer) return;
        const container = document.getElementById('viewport-2');
        if (container) {
            const w = container.offsetWidth, h = container.offsetHeight;
            if (w > 0 && h > 0) {
                compareRenderer.setSize(w, h);
                compareCamera.aspect = w / h;
                compareCamera.updateProjectionMatrix();
            }
        }
        resizeMainRenderer();
    });
})();
