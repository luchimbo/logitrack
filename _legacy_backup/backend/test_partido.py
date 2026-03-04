import sys
sys.path.insert(0, r"d:\Logística\backend")
from zpl_parser import parse_zpl_file
from database import SessionLocal
from models import ZoneMapping, Shipment

# Parser output for Flex
with open(r"d:\Logística\Etiqueta de envio-Flex.txt", encoding="utf-8") as f:
    data = parse_zpl_file(f.read())

with open(r"d:\Logística\backend\diag_output.txt", "w", encoding="utf-8") as out:
    out.write("=== PARSER OUTPUT (Flex) ===\n")
    for s in data:
        out.write(f"  partido='{s['partido']}' city='{s['city']}' province='{s['province']}'\n")

    # DB state
    db = SessionLocal()
    zones = db.query(ZoneMapping).all()
    out.write(f"\n=== ZONE MAPPINGS ({len(zones)}) ===\n")
    for z in zones:
        out.write(f"  '{z.partido}' -> '{z.carrier_name}'\n")

    flex_shipments = db.query(Shipment).filter(Shipment.shipping_method == "flex").all()
    out.write(f"\n=== FLEX SHIPMENTS IN DB ({len(flex_shipments)}) ===\n")
    for s in flex_shipments:
        out.write(f"  id={s.id} partido='{s.partido}' assigned='{s.assigned_carrier}' city='{s.city}'\n")

    db.close()

print("Done. Check diag_output.txt")
