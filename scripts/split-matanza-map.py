"""Splits La Matanza in financeMapShapes.json into Norte (GBA 1) and Sur (GBA 2).
Run after build-finance-map.py, with --write. The cut joins the two points where the border
with GBA 1 neighbours meets the border with GBA 2/3 neighbours."""
import json, math, re, sys
from pathlib import Path

P = Path(__file__).resolve().parent.parent / 'src/lib/financeMapShapes.json'
data = json.loads(P.read_text(encoding='utf-8'))
shapes = data['shapes']

def rings(path):
    out = []
    for seg in path.split('Z'):
        seg = seg.strip()
        if not seg: continue
        pts = [tuple(map(float, p.split(','))) for p in seg[1:].split('L')]
        out.append(pts)
    return out

def to_path(rs):
    return ''.join('M' + 'L'.join(f'{round(x,1)},{round(y,1)}' for x, y in r) + 'Z' for r in rs if len(r) > 2)

def dist_seg(p, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    den = dx*dx + dy*dy
    t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / den)) if den else 0
    return math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)

def dist_shape(p, shape):
    best = 1e9
    for r in rings(shape['path']):
        for i in range(len(r)):
            best = min(best, dist_seg(p, r[i], r[(i+1) % len(r)]))
    return best

mat = next(s for s in shapes if s['name'] == 'La Matanza')
others = [s for s in shapes if s['name'] != 'La Matanza' and not s['name'].startswith('Comuna')]
mat_rings = rings(mat['path'])
print('matanza rings', [len(r) for r in mat_rings])
main = max(mat_rings, key=len)
EPS = 4.0
g1 = [s for s in others if s['zone'] == 'GBA 1']
g2 = [s for s in others if s['zone'] in ('GBA 2', 'GBA 3')]

def label(p):
    d1 = min(dist_shape(p, s) for s in g1)
    d2 = min(dist_shape(p, s) for s in g2)
    if d1 < EPS and d2 < EPS: return 'both'
    if d1 < EPS: return '1'
    if d2 < EPS: return '2'
    return '-'

labels = [label(p) for p in main]
print(''.join(labels))
# Transition points: where the neighbour changes between GBA 1 and GBA 2 along the ring.
trans = []
last = None
for i, l in enumerate(labels):
    if l in ('1', '2', 'both'):
        key = '1' if l == '1' else '2' if l == '2' else None
        if l == 'both':
            trans.append(i)
            continue
        if last is not None and key != last:
            trans.append(i)
        last = key
print('transitions at', trans, [main[i] for i in trans])

def avg(idx): return (sum(main[i][0] for i in idx)/len(idx), sum(main[i][1] for i in idx)/len(idx))
J1 = avg([6,7,8]); J2 = avg([57,58,59,60])
print('J1', J1, 'J2', J2)
def side(p): return (J2[0]-J1[0])*(p[1]-J1[1]) - (J2[1]-J1[1])*(p[0]-J1[0])
north_ref = avg([61,62,0,1,2,3,4,5])
sgn = 1 if side(north_ref) > 0 else -1
def clip(poly, keep_sign):
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i+1) % n]
        sa, sb = side(a)*keep_sign, side(b)*keep_sign
        if sa >= 0: out.append(a)
        if (sa >= 0) != (sb >= 0):
            t = sa / (sa - sb)
            out.append((a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])))
    return out
def area(r): return abs(sum(r[i][0]*r[(i+1)%len(r)][1]-r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r))))/2
north = clip(main, sgn); south = clip(main, -sgn)
print('areas', round(area(north)), round(area(south)), 'bbox', min(p[0] for p in main), max(p[0] for p in main), min(p[1] for p in main), max(p[1] for p in main))
if '--write' in sys.argv:
    new = []
    for s in shapes:
        if s['name'] == 'La Matanza':
            new.append({'name': 'La Matanza Norte', 'zone': 'GBA 1', 'path': to_path([north])})
            new.append({'name': 'La Matanza Sur', 'zone': 'GBA 2', 'path': to_path([south])})
        else: new.append(s)
    data['shapes'] = new
    P.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('written', len(new))
