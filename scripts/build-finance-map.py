"""Build the local AMBA map from the pinned geoBoundaries ARG ADM2 source."""
import json, math, unicodedata, urllib.request
from pathlib import Path

SOURCE = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ARG/ADM2/geoBoundaries-ARG-ADM2_simplified.geojson'
ROOT = Path(__file__).resolve().parent.parent

def normalize(text):
    return '_'.join(''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn').replace('.', '').split())

zones = {
 'GBA 1':'San Isidro,Vicente López,San Fernando,General San Martín,Tres de Febrero,Hurlingham,Ituzaingó,Morón,Avellaneda,Lanús,Lomas de Zamora',
 'GBA 2':'Tigre,Malvinas Argentinas,José C. Paz,San Miguel,Moreno,Merlo,La Matanza,Ezeiza,Esteban Echeverría,Almirante Brown,Quilmes,Berazategui,Florencio Varela',
 'GBA 3':'Escobar,Pilar,Luján,General Rodríguez,Marcos Paz,Cañuelas,San Vicente,Presidente Perón,Ensenada,Campana,Zárate,La Plata,Berisso'
}
lookup = {normalize(name):zone for zone,names in zones.items() for name in names.split(',')}
data = json.load(urllib.request.urlopen(SOURCE, timeout=60))

def points(coords):
    if isinstance(coords[0], (int,float)): yield coords
    else:
        for item in coords: yield from points(item)

selected=[]
for feature in data['features']:
    name=feature['properties']['shapeName']
    coords=list(points(feature['geometry']['coordinates']))
    x=sum(p[0] for p in coords)/len(coords); y=sum(p[1] for p in coords)/len(coords)
    if not (-60<x<-57 and -35.8<y<-33.7): continue
    zone='CABA' if name.startswith('Comuna ') else lookup.get(normalize(name))
    if zone: selected.append((name,zone,feature['geometry']))
allpoints=[p for _,_,g in selected for p in points(g['coordinates'])]
x0=min(p[0] for p in allpoints);x1=max(p[0] for p in allpoints)
y0=min(p[1] for p in allpoints);y1=max(p[1] for p in allpoints)
cos=math.cos(math.radians(-34.6));scale=min(640/((x1-x0)*cos),520/(y1-y0))
def project(p):return [round(60+(p[0]-x0)*cos*scale,1),round(35+(y1-p[1])*scale,1)]

def simplify(ring,eps=.45):
    if len(ring)<=2:return ring
    a,b=ring[0],ring[-1];dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    def distance(p):
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
        return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
    i=max(range(1,len(ring)-1),key=lambda i:distance(ring[i]))
    return simplify(ring[:i+1],eps)[:-1]+simplify(ring[i:],eps) if distance(ring[i])>eps else [a,b]

shapes=[]
for name,zone,geom in selected:
    polygons=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
    rings=[simplify([project(p) for p in ring]) for poly in polygons for ring in poly]
    path=''.join('M'+'L'.join(f'{x},{y}' for x,y in ring)+'Z' for ring in rings if len(ring)>2)
    shapes.append({'name':name,'zone':zone,'path':path})
labels=[{'zone':zone,'point':project(p)} for zone,p in [('CABA',[-58.40,-34.60]),('GBA 1',[-58.60,-34.55]),('GBA 2',[-58.75,-34.70]),('GBA 3',[-59.12,-34.55])]]
output={'source':SOURCE,'attribution':'geoBoundaries / IGN, UNHCR y OCHA ROLAC · CC BY 3.0 IGO','viewBox':[0,0,760,600],'shapes':shapes,'labels':labels,'river':project([-58.1,-34.5])}
path=ROOT/'src/lib/financeMapShapes.json'
path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'{len(shapes)} areas, {path.stat().st_size} bytes')
