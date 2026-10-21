"""Build the Argentina provinces map from the pinned Natural Earth admin-1 source (geoBoundaries ADM1 lacks Entre Ríos)."""
import json, math, unicodedata, urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson'
ROOT = Path(__file__).resolve().parent.parent

def normalize(text):
    return '_'.join(''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn').replace('.', ' ').split())

def points(coords):
    if isinstance(coords[0], (int, float)): yield coords
    else:
        for item in coords: yield from points(item)

data = json.load(urllib.request.urlopen(SOURCE, timeout=300))
data['features'] = [f for f in data['features'] if f['properties'].get('adm0_a3') == 'ARG']
features = []
for feature in data['features']:
    geom = feature['geometry']
    polygons = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    # Keep the continental territory and nearby islands; drop the Antarctic sector and far South Atlantic islands.
    kept = []
    for poly in polygons:
        ring = poly[0]
        cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
        if cy > -56 and -75 < cx < -53: kept.append(poly)
    if kept: features.append((feature['properties']['name'], kept))

allpoints = [p for _, polys in features for poly in polys for p in points(poly)]
x0 = min(p[0] for p in allpoints); x1 = max(p[0] for p in allpoints)
y0 = min(p[1] for p in allpoints); y1 = max(p[1] for p in allpoints)
W, H = 420, 760
cos = math.cos(math.radians((y0 + y1) / 2)); scale = min((W - 40) / ((x1 - x0) * cos), (H - 40) / (y1 - y0))
def project(p): return [round(20 + (p[0] - x0) * cos * scale, 1), round(20 + (y1 - p[1]) * scale, 1)]

def simplify(ring, eps=1.0):
    if len(ring) <= 2: return ring
    a, b = ring[0], ring[-1]; dx = b[0] - a[0]; dy = b[1] - a[1]; den = dx * dx + dy * dy
    def distance(p):
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) if den else 0
        return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
    i = max(range(1, len(ring) - 1), key=lambda i: distance(ring[i]))
    return simplify(ring[:i + 1], eps)[:-1] + simplify(ring[i:], eps) if distance(ring[i]) > eps else [a, b]

shapes = []
for name, polys in features:
    rings = [simplify([project(p) for p in ring]) for poly in polys for ring in poly]
    path = ''.join('M' + 'L'.join(f'{x},{y}' for x, y in ring) + 'Z' for ring in rings if len(ring) > 2)
    pts = [project(p) for poly in polys for p in poly[0]]
    label = [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)]
    shapes.append({'name': name, 'key': normalize(name), 'path': path, 'label': label})
output = {'source': SOURCE, 'attribution': 'Natural Earth · dominio público', 'viewBox': [0, 0, W, H], 'shapes': shapes}
path = ROOT / 'src/lib/financeProvinceShapes.json'
path.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(shapes)} provinces, {path.stat().st_size} bytes')
for s in shapes: print(s['key'], s['name'])
