from PIL import Image, ImageDraw, ImageFont
import os

# ---- CLOUDIFY LOGO (800x300) ----
W, H = 800, 300
img = Image.new('RGBA', (W, H), (10, 10, 15, 255))
draw = ImageDraw.Draw(img)

# Geometric cloud polygons
polys = [
    ([(60,220),(110,160),(160,200),(140,240)], (91,33,182,230)),
    ([(80,180),(130,120),(180,160),(160,200),(110,160)], (109,40,217,242)),
    ([(110,120),(160,70),(210,110),(180,160),(130,120)], (124,58,237,255)),
    ([(140,80),(190,40),(240,80),(210,110),(160,70)], (139,92,246,255)),
    ([(160,200),(210,150),(250,190),(220,240)], (76,29,149,216)),
    ([(180,160),(230,110),(270,150),(250,190),(210,150)], (91,33,182,230)),
    ([(210,110),(250,70),(290,100),(270,150),(230,110)], (109,40,217,242)),
    ([(240,80),(280,50),(310,80),(290,100),(250,70)], (124,58,237,255)),
    ([(130,120),(180,160),(160,70)], (147,51,234,178)),
    ([(180,160),(210,110),(250,190)], (109,40,217,153)),
    ([(60,220),(110,160),(80,180)], (76,29,149,204)),
]
for pts, col in polys:
    draw.polygon(pts, fill=col)

# Dissolving dots
dots = [
    (310,90,6,210),(330,110,5,200),(325,75,4,216),
    (350,100,5,178),(345,130,4,153),(370,90,4,165),
    (365,115,3,140),(390,80,3,127),(385,105,3,114),
    (405,95,3,102),(340,155,4,127),(360,145,3,114),
    (375,135,3,89),(395,125,2,76),(415,110,2,63),
    (310,145,4,153),(355,170,3,102),(320,170,3,89),
    (410,130,2,51),(425,95,2,51),
]
for x,y,r,a in dots:
    draw.ellipse([x-r,y-r,x+r,y+r], fill=(129,140,248,a))

# Fonts
fonts = [
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
]
font_bold = None
for f in fonts:
    if os.path.exists(f):
        try:
            font_bold = ImageFont.truetype(f, 90)
            font_tag  = ImageFont.truetype(f, 17)
            break
        except:
            pass
if font_bold is None:
    font_bold = ImageFont.load_default()
    font_tag  = ImageFont.load_default()

# 'Cloud' white, 'ify' purple
draw.text((435, 72), 'Cloud', font=font_bold, fill=(255,255,255,255))
bbox = draw.textbbox((435,72), 'Cloud', font=font_bold)
draw.text((bbox[2], 72), 'ify', font=font_bold, fill=(129,140,248,255))

# Tagline
draw.text((437, 178), 'COMPARE  \u2022  ANALYZE  \u2022  VISUALIZE', font=font_tag, fill=(96,165,250,220))

# Save full logo PNG
base = os.path.dirname(__file__)
logo_path = os.path.join(base, 'cloudify-logo.png')
img.save(logo_path, 'PNG')
print('Logo PNG saved:', logo_path)

# ICO - cloud-only square crop
cloud_crop = img.crop((30, 30, 320, 270))
ico_sq = Image.new('RGBA', (290,240), (10,10,15,0))
ico_sq.paste(cloud_crop, (0,0))
ico_256 = ico_sq.resize((256,256), Image.LANCZOS)
ico_path = os.path.join(base, 'app-icon.ico')
ico_256.save(ico_path, format='ICO', sizes=[(256,256),(128,128),(64,64),(32,32),(16,16)])
print('ICO saved:', ico_path)
print('DONE')
