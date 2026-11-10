"""Step 02 (part 1): export the Merdith et al. 2021 plate model for the browser.

Reads the GPlates files with pyGPlates and writes:
  data-raw/plates/polygons.json    present-day polygons with plate id and valid time (meshed by 02b)
  site/data/plates/rotations.bin   int16 quaternions, [time step][plate], finite rotation to anchor
  site/data/plates/plategrid.bin   0.5 degree grid of plate index for present-day points (uint16)
  site/data/plates/meta.json       plate ids, sampling, attribution

Run:  .venv/bin/python pipeline/02-plates.py
"""
import json
import math
import os
import struct
import sys

import numpy as np
import pygplates

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'data-raw', 'plates', 'merdith2021', 'SM2_X')
OUT = os.path.join(ROOT, 'site', 'data', 'plates')
os.makedirs(OUT, exist_ok=True)

STEP_MYR = 2
MAX_MA = 1000
GRID_DEG = 0.5

rotation_model = pygplates.RotationModel(os.path.join(SRC, '1000_0_rotfile_Merdith_et_al.rot'))


def clamp_time(begin, end):
    b = MAX_MA + 100 if begin > MAX_MA + 100 else begin
    e = 0 if end < 0 else end
    return round(float(b), 2), round(float(e), 2)


def ring_points(points):
    out = []
    for p in points:
        lat, lon = p.to_lat_lon()
        out.append([round(lon, 4), round(lat, 4)])
    return out


def load_layer(filename, layer):
    feats = []
    for f in pygplates.FeatureCollection(os.path.join(SRC, filename)):
        pid = f.get_reconstruction_plate_id()
        begin, end = clamp_time(*f.get_valid_time())
        name = f.get_name() or ''
        for g in f.get_geometries():
            if not isinstance(g, pygplates.PolygonOnSphere):
                continue
            rings = [ring_points(g.get_exterior_ring_points())]
            for i in range(g.get_number_of_interior_rings()):
                rings.append(ring_points(g.get_interior_ring_points(i)))
            if len(rings[0]) < 3:
                continue
            feats.append({'layer': layer, 'pid': pid, 'begin': begin, 'end': end, 'name': name, 'rings': rings,
                          'area': round(g.get_area(), 6)})
    return feats


features = load_layer('shapes_continents_Merdith_et_al.gpml', 'continent') + \
    load_layer('shapes_coastlines_Merdith_et_al.gpml', 'coast')

# Static polygons partition the whole present-day surface; used for the point -> plate grid.
static_fc = pygplates.FeatureCollection(os.path.join(SRC, 'shapes_static_polygons_Merdith_et_al.gpml'))

pids = sorted({f['pid'] for f in features} | {f.get_reconstruction_plate_id() for f in static_fc})
pid_index = {pid: i for i, pid in enumerate(pids)}
for f in features:
    f['plate'] = pid_index[f['pid']]

with open(os.path.join(ROOT, 'data-raw', 'plates', 'polygons.json'), 'w') as fh:
    json.dump({'plates': pids, 'features': features}, fh)
print(f'{len(features)} polygons, {len(pids)} plates')


# ---- rotations -------------------------------------------------------------------------------
def to_quat(rot):
    """pyGPlates finite rotation -> quaternion in the site's axis convention.

    Geocentric (X toward lon 0, Y toward lon 90E, Z north) maps to site (x, y, z) = (X, Z, -Y).
    """
    if rot.represents_identity_rotation():
        return (0.0, 0.0, 0.0, 1.0)
    pole, angle = rot.get_euler_pole_and_angle()
    X, Y, Z = pole.to_xyz()
    s = math.sin(angle / 2)
    return (X * s, Z * s, -Y * s, math.cos(angle / 2))


times = list(range(0, MAX_MA + 1, STEP_MYR))
quats = np.zeros((len(times), len(pids), 4), dtype=np.float64)
for ti, t in enumerate(times):
    for pi, pid in enumerate(pids):
        q = to_quat(rotation_model.get_rotation(float(t), pid))
        if ti > 0 and sum(a * b for a, b in zip(q, quats[ti - 1, pi])) < 0:
            q = tuple(-c for c in q)  # keep neighbouring samples in the same hemisphere for nlerp
        quats[ti, pi] = q
q16 = np.round(quats * 32767).astype('<i2')
with open(os.path.join(OUT, 'rotations.bin'), 'wb') as fh:
    fh.write(q16.tobytes())
print(f'rotations: {len(times)} steps x {len(pids)} plates = {q16.nbytes / 1e6:.2f} MB')

# ---- present-day plate grid --------------------------------------------------------------------
nx, ny = int(360 / GRID_DEG), int(180 / GRID_DEG)
grid = np.full((ny, nx), 0xFFFF, dtype='<u2')
age = np.zeros((ny, nx), dtype='<u2')  # oldest time (Ma) the static polygon is valid, capped
points = []
for j in range(ny):
    lat = 90 - (j + 0.5) * GRID_DEG
    for i in range(nx):
        lon = -180 + (i + 0.5) * GRID_DEG
        points.append(pygplates.PointOnSphere(lat, lon))
partitioner = pygplates.PlatePartitioner(static_fc, rotation_model, reconstruction_time=0)
hits = 0
for k, pt in enumerate(points):
    part = partitioner.partition_point(pt)
    if part is None:
        continue
    feat = part.get_feature()
    pid = feat.get_reconstruction_plate_id()
    begin, _ = feat.get_valid_time()
    j, i = divmod(k, nx)
    grid[j, i] = pid_index[pid]
    age[j, i] = int(min(begin, MAX_MA + 100))
    hits += 1
with open(os.path.join(OUT, 'plategrid.bin'), 'wb') as fh:
    fh.write(grid.tobytes())
    fh.write(age.tobytes())
print(f'plate grid {nx}x{ny}, {hits / len(points):.1%} of cells assigned')

with open(os.path.join(OUT, 'meta.json'), 'w') as fh:
    json.dump({
        'model': 'Merdith et al. 2021',
        'citation': 'Merdith, A.S., et al. (2021). Extending full-plate tectonic models into deep time: '
                    'Linking the Neoproterozoic and the Phanerozoic. Earth-Science Reviews 214, 103477.',
        'source': 'https://zenodo.org/records/4485738',
        'license': 'CC BY 4.0',
        'frame': 'palaeomagnetic reference frame',
        'stepMyr': STEP_MYR,
        'maxMa': MAX_MA,
        'steps': len(times),
        'plateIds': pids,
        'grid': {'deg': GRID_DEG, 'nx': nx, 'ny': ny},
    }, fh)
print('ok')
