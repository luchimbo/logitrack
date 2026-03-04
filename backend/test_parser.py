"""Quick test script for the updated ZPL parser with both Colecta and Flex files."""
import sys
sys.path.insert(0, ".")
from zpl_parser import parse_zpl_file

# Test Colecta file
print("=" * 80)
print("TESTING COLECTA FILE")
print("=" * 80)
with open(r"d:\Logística\Etiqueta de envio-Colecta.txt", encoding="utf-8") as f:
    content = f.read()

results = parse_zpl_file(content)
print(f"Total labels parsed: {len(results)}")
methods = {}
for r in results:
    m = r['shipping_method']
    methods[m] = methods.get(m, 0) + 1
print(f"Methods breakdown: {methods}")
print()
for i, r in enumerate(results[:3]):
    print(f"  {i+1}. [{r['shipping_method'].upper()}] {r['product_name']} (x{r['quantity']})")
    print(f"     To: {r['recipient_name']} - {r['city']}, {r['province']}")
    print()

# Test Flex file
print("=" * 80)
print("TESTING FLEX FILE")
print("=" * 80)
with open(r"d:\Logística\Etiqueta de envio-Flex.txt", encoding="utf-8") as f:
    content = f.read()

results = parse_zpl_file(content)
print(f"Total labels parsed: {len(results)}")
methods = {}
for r in results:
    m = r['shipping_method']
    methods[m] = methods.get(m, 0) + 1
print(f"Methods breakdown: {methods}")
print()
for i, r in enumerate(results):
    print(f"  {i+1}. [{r['shipping_method'].upper()}] {r['product_name']} (x{r['quantity']})")
    print(f"     To: {r['recipient_name']} - {r['city']}, {r['province']} CP:{r['postal_code']}")
    print(f"     Partido: {r['partido']}")
    print(f"     Address: {r['address']}")
    print(f"     Tracking: {r['tracking_number']}")
    print()
