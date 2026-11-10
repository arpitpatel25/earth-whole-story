"""Step 03b: ice-sheet rasters for the Quaternary.

Northern Hemisphere ice extents come from Batchelor et al. 2019 (Nature Communications 10, 3713;
shapefiles at https://osf.io/7jen3/, CC BY 4.0): best-estimate reconstructions for 18 time slices from
the late Gauss Chron (about 3 Ma) to the Last Glacial Maximum. Today's ice comes from Natural Earth.

Each slice becomes a signed-distance raster (128 = ice margin) so the shader can morph smoothly from one
extent to another. Three slices are packed into the R, G and B channels of each image.

Output: site/data/earth/ice/ice_<n>_{2k,1k}.png and index.json

Run: .venv/bin/python pipeline/03b-ice.py
"""
import glob
import json
import os

import numpy as np
import shapefile
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'data-raw', 'ice', 'batchelor2019')
NE = os.path.join(ROOT, 'data-raw', 'ne')
OUT = os.path.join(ROOT, 'site', 'data', 'earth', 'ice')
os.makedirs(OUT, exist_ok=True)

W, H = 2048, 1024
R_AUTHALIC = 6371007.2
LAEA_N = 4096
LAEA_EXTENT = 2 * R_AUTHALIC * np.sin(np.deg2rad(70) / 2)  # covers the pole down to 20 N
SDF_RANGE = 44.0  # pixels mapped onto 0..255 either side of the margin

# slice id, folder, file stem, the interval it stands for (ka), display name
SLICES = [
    ('lgm', 'LGM', 'LGM_best_estimate', (19, 26.5), 'Last Glacial Maximum'),
    ('30ka', '30_ka', '30ka_best_estimate', (28, 32), '30,000 years ago'),
    ('35ka', '35_ka', '35ka_best_estimate', (33, 37), '35,000 years ago'),
    ('40ka', '40_ka', '40ka_best_estimate', (38, 42), '40,000 years ago'),
    ('45ka', '45_ka', '45ka_best_estimate', (43, 57), '45,000 years ago'),
    ('mis4', 'MIS_4', 'MIS4_best_estimate', (58, 72), 'MIS 4'),
    ('mis5a', 'MIS_5a', 'MIS5a_best_estimate', (72, 86), 'MIS 5a'),
    ('mis5b', 'MIS_5b', 'MIS5b_best_estimate', (86, 92), 'MIS 5b'),
    ('mis5c', 'MIS_5c', 'MIS5c_best_estimate', (92, 108), 'MIS 5c'),
    ('mis5d', 'MIS_5d', 'MIS5d_best_estimate', (108, 117), 'MIS 5d'),
    ('mis6', 'MIS_6', 'MIS6_best_estimate', (132, 190), 'MIS 6'),
    ('mis8', 'MIS_8', 'MIS8_best_estimate', (243, 279), 'MIS 8'),
    ('mis10', 'MIS_10', 'MIS10_best_estimate', (337, 365), 'MIS 10'),
    ('mis12', 'MIS_12', 'MIS12_best_estimate', (429, 477), 'MIS 12'),
    ('mis16', 'MIS_16', 'MIS16_best_estimate', (622, 677), 'MIS 16'),
    ('mis20', 'MIS_20-24', 'MIS20-24_best_estimate', (790, 928), 'MIS 20 to 24'),
    ('matuyama', 'Early_Matuyama_Chron', 'EarlyMatuyama_best_estimate', (1780, 2600), 'early Matuyama Chron'),
    ('gauss', 'Late_Gauss_Chron', 'LateGauss_max', (2600, 3590), 'late Gauss Chron (maximum hypothesis)'),
]


def find_shp(folder, stem):
    hits = glob.glob(os.path.join(SRC, folder, '*', stem + '.shp'))
    if not hits:
        raise FileNotFoundError(f'{folder}/{stem}')
    return hits[0]


def is_laea(shp_path):
    """Projected coordinates are metres; a few files carry a geographic .prj by mistake, so test the numbers."""
    sf = shapefile.Reader(shp_path)
    return max(abs(v) for v in sf.bbox) > 1000


def lonlat_to_laea(lon, lat):
    lam = np.deg2rad(lon)
    c = np.deg2rad(90.0 - lat)
    rho = 2 * R_AUTHALIC * np.sin(c / 2)
    return rho * np.sin(lam), -rho * np.cos(lam)


def rasterize_laea(shp_path):
    """Even-odd fill of every ring into a north-polar equal-area raster."""
    sf = shapefile.Reader(shp_path)
    laea = is_laea(shp_path)
    mask = np.zeros((LAEA_N, LAEA_N), dtype=bool)
    scale = (LAEA_N / 2) / LAEA_EXTENT
    for shape in sf.shapes():
        pts = np.asarray(shape.points, dtype=np.float64)
        if len(pts) < 3:
            continue
        parts = list(shape.parts) + [len(pts)]
        one = np.zeros((LAEA_N, LAEA_N), dtype=bool)  # rings of one feature: even-odd, so holes stay holes
        for a, b in zip(parts[:-1], parts[1:]):
            ring = pts[a:b]
            if len(ring) < 3:
                continue
            if laea:
                x, y = ring[:, 0], ring[:, 1]
            else:
                x, y = lonlat_to_laea(ring[:, 0], ring[:, 1])
            px = LAEA_N / 2 + x * scale
            py = LAEA_N / 2 - y * scale
            img = Image.new('1', (LAEA_N, LAEA_N), 0)
            ImageDraw.Draw(img).polygon(list(zip(px.tolist(), py.tolist())), fill=1)
            one ^= np.asarray(img, dtype=bool)
        mask |= one  # separate features overlap rather than cancel
    return mask


def laea_to_equirect(mask):
    out = np.zeros((H, W), dtype=bool)
    lat = 90 - (np.arange(H) + 0.5) * 180.0 / H
    lon = -180 + (np.arange(W) + 0.5) * 360.0 / W
    rows = np.where(lat > 21)[0]
    lon2, lat2 = np.meshgrid(lon, lat[rows])
    x, y = lonlat_to_laea(lon2, lat2)
    scale = (LAEA_N / 2) / LAEA_EXTENT
    px = np.clip(np.round(LAEA_N / 2 + x * scale).astype(int), 0, LAEA_N - 1)
    py = np.clip(np.round(LAEA_N / 2 - y * scale).astype(int), 0, LAEA_N - 1)
    out[rows[0]:rows[-1] + 1] = mask[py, px]
    return out


def rasterize_lonlat(shp_path, target):
    """Fill lon/lat polygons straight into the equirectangular raster (present-day ice)."""
    sf = shapefile.Reader(shp_path)
    for shape in sf.shapes():
        pts = np.asarray(shape.points, dtype=np.float64)
        if len(pts) < 3:
            continue
        parts = list(shape.parts) + [len(pts)]
        for a, b in zip(parts[:-1], parts[1:]):
            ring = pts[a:b]
            if len(ring) < 3:
                continue
            px = (ring[:, 0] + 180.0) / 360.0 * W
            py = (90.0 - ring[:, 1]) / 180.0 * H
            img = Image.new('1', (W, H), 0)
            ImageDraw.Draw(img).polygon(list(zip(px.tolist(), py.tolist())), fill=1)
            target ^= np.asarray(img, dtype=bool)
    return target


def unzip_ne(name):
    import zipfile
    d = os.path.join(NE, name)
    if not os.path.isdir(d):
        with zipfile.ZipFile(os.path.join(NE, name + '.zip')) as z:
            z.extractall(d)
    return glob.glob(os.path.join(d, '*.shp'))[0]


def sdf(mask):
    """Signed distance in pixels (positive inside ice), wrapped in longitude, mapped to 0..255."""
    pad = 96
    m = np.concatenate([mask[:, -pad:], mask, mask[:, :pad]], axis=1)
    inside = ndimage.distance_transform_edt(m)
    outside = ndimage.distance_transform_edt(~m)
    d = (inside - outside)[:, pad:-pad]
    d = ndimage.gaussian_filter(d, 1.2, mode=('nearest', 'wrap'))
    return np.clip(np.round(128 + d / SDF_RANGE * 127), 0, 255).astype(np.uint8)


# ---- today's ice -------------------------------------------------------------------------------
present = np.zeros((H, W), dtype=bool)
rasterize_lonlat(unzip_ne('ne_10m_glaciated_areas'), present)
rasterize_lonlat(unzip_ne('ne_10m_antarctic_ice_shelves_polys'), present)
print(f'present ice: {present.mean():.2%} of the map')

layers = [('present', sdf(present), {'name': "today's ice", 'window': None})]
for sid, folder, stem, window, name in SLICES:
    shp = find_shp(folder, stem)
    nh = laea_to_equirect(rasterize_laea(shp))
    full = nh | present
    layers.append((sid, sdf(full), {'name': name, 'window': list(window)}))
    print(f'{sid}: {nh.mean():.2%} northern ice ({"LAEA" if is_laea(shp) else "lon/lat"})')

# ---- pack three slices per image -----------------------------------------------------------------
slices = []
images = []
for i in range(0, len(layers), 3):
    group = layers[i:i + 3]
    chans = [g[1] for g in group]
    while len(chans) < 3:
        chans.append(np.zeros((H, W), dtype=np.uint8))
    rgb = np.stack(chans, axis=-1)
    n = i // 3
    img = Image.fromarray(rgb, 'RGB')
    img.save(os.path.join(OUT, f'ice_{n}_2k.png'), optimize=True)
    img.resize((W // 2, H // 2), Image.BILINEAR).save(os.path.join(OUT, f'ice_{n}_1k.png'), optimize=True)
    images.append(f'ice_{n}')
    for c, g in enumerate(group):
        slices.append({'id': g[0], 'image': n, 'channel': c, **g[2]})

with open(os.path.join(OUT, 'index.json'), 'w') as fh:
    json.dump({
        'images': images,
        'slices': slices,
        'source': 'Batchelor et al. 2019, The configuration of Northern Hemisphere ice sheets through the Quaternary, '
                  'Nature Communications 10, 3713 (https://osf.io/7jen3/, CC BY 4.0); present-day ice from Natural Earth',
        'note': 'Northern Hemisphere only. Southern ice is held at its present extent.',
    }, fh)
sizes = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) // 1024
print(f'{len(slices)} slices in {len(images)} images, {sizes} KB')
