"""Fix existing shipments in DB: update partido based on city using the new normalization."""
import sys
sys.path.insert(0, r"d:\Logística\backend")
from database import SessionLocal
from models import Shipment, ZoneMapping
from zpl_parser import normalize_partido, LOCALITY_TO_PARTIDO, PARTIDO_MAP

db = SessionLocal()

# Fix all flex shipments that have a city but no/wrong partido
flex_shipments = db.query(Shipment).filter(Shipment.shipping_method == "flex").all()
fixed = 0
results = []
for s in flex_shipments:
    new_partido = None
    
    # Try from city
    if s.city:
        city_upper = s.city.upper().strip()
        if city_upper in LOCALITY_TO_PARTIDO:
            new_partido = LOCALITY_TO_PARTIDO[city_upper]
        else:
            norm = normalize_partido(s.city)
            if norm in PARTIDO_MAP.values():
                new_partido = norm
    
    if new_partido and s.partido != new_partido:
        old = s.partido
        s.partido = new_partido
        
        mapping = db.query(ZoneMapping).filter(ZoneMapping.partido == new_partido).first()
        if mapping:
            s.assigned_carrier = mapping.carrier_name
        
        results.append(f"FIXED id={s.id}: city='{s.city}' | '{old}' -> '{new_partido}' | carrier='{s.assigned_carrier}'")
        fixed += 1
    else:
        results.append(f"OK    id={s.id}: city='{s.city}' | partido='{s.partido}' | carrier='{s.assigned_carrier}'")

db.commit()
results.append(f"\nDone. Fixed {fixed}/{len(flex_shipments)} flex shipments.")

with open(r"d:\Logística\backend\fix_results.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(results))

print(f"Done. Fixed {fixed}/{len(flex_shipments)}. See fix_results.txt")
db.close()
