"""Step 01c: elevation texture from NOAA ETOPO1 (ice surface), public domain.

Writes site/tex/elev_4k.jpg and elev_2k.jpg, RGB:
  R  whole range, non-linear:  0.5 + 0.5 * sign(e) * sqrt(|e| / 9000 m)
  G  fine band around sea level: (e + 160 m) / 255, clamped  -> 1 m steps from -160 m to +95 m
  B  hillshade (light from the north-west), for relief on land and ice

The fine band is what lets sea level move smoothly: land bridges appear exactly where the real seabed
is shallow.

Run: .venv/bin/python pipeline/01c-elevation.py
"""
import os
import zipfile

import numpy as np
import tifffile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RAW = os.path.join(ROOT, 'data-raw', 'elevation')
OUT = os.path.join(ROOT, 'site', 'tex')
os.makedirs(OUT, exist_ok=True)

tif = os.path.join(RAW, 'ETOPO1_Ice_g_geotiff.tif')
if not os.path.exists(tif):
    with zipfile.ZipFile(os.path.join(RAW, 'ETOPO1_Ice_g_geotiff.zip')) as z:
        name = [n for n in z.namelist() if n.lower().endswith('.tif')][0]
        z.extract(name, RAW)
        os.rename(os.path.join(RAW, name), tif)

dem = tifffile.imread(tif)  # (10801, 21601) int16, grid registered, lon -180..180, lat 90..-90
print('ETOPO1', dem.shape, dem.dtype, int(dem.min()), int(dem.max()))
dem = dem[:10800, :21600].astype(np.float32)

# 2x2 block mean -> 5400 x 10800 (2 arc-minutes)
half = dem.reshape(5400, 2, 10800, 2).mean(axis=(1, 3))
del dem

# Hillshade on the half-resolution grid. Cell size shrinks with latitude in the east-west direction.
lat = np.deg2rad(90 - (np.arange(5400) + 0.5) / 30.0)
cell_ns = 6371000.0 * np.deg2rad(1 / 30.0)
cell_ew = np.maximum(cell_ns * np.cos(lat), cell_ns * 0.05)[:, None]
z = np.where(half < 0, half * 0.25, half)  # soften the sea floor so land relief dominates
dzdx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * cell_ew)
dzdy = np.zeros_like(z)
dzdy[1:-1] = (z[:-2] - z[2:]) / (2 * cell_ns)
exag = 9.0
az = np.deg2rad(315.0)
alt = np.deg2rad(42.0)
slope = np.arctan(exag * np.hypot(dzdx, dzdy))
aspect = np.arctan2(dzdy, -dzdx)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - np.pi / 2 - aspect)
shade = np.clip((shade - np.sin(alt)) * 1.9 + 0.5, 0, 1)
del dzdx, dzdy, slope, aspect, z

coarse = 0.5 + 0.5 * np.sign(half) * np.sqrt(np.minimum(np.abs(half), 9000.0) / 9000.0)
fine = np.clip((half + 160.0) / 255.0, 0, 1)
rgb = np.stack([coarse, fine, shade], axis=-1)
img = Image.fromarray(np.round(rgb * 255).astype(np.uint8), 'RGB')
for size, name in ((4096, 'elev_4k'), (2048, 'elev_2k')):
    out = img.resize((size, size // 2), Image.LANCZOS)
    # 4:4:4 JPEG keeps the three channels independent
    out.save(os.path.join(OUT, name + '.jpg'), 'JPEG', quality=92, subsampling=0, optimize=True)
    print(name, os.path.getsize(os.path.join(OUT, name + '.jpg')) // 1024, 'KB')

# A compact numeric grid (0.25 degree) for the app's "is this land at that sea level" questions.
q = Image.fromarray(half).resize((1440, 720), Image.BILINEAR)
arr = np.clip(np.round(np.asarray(q)), -32768, 32767).astype('<i2')
os.makedirs(os.path.join(ROOT, 'site', 'data', 'earth'), exist_ok=True)
with open(os.path.join(ROOT, 'site', 'data', 'earth', 'elev_quarter.bin'), 'wb') as fh:
    fh.write(arr.tobytes())
print('elev_quarter.bin', arr.nbytes // 1024, 'KB')
