"""
ZPL (Zebra Programming Language) parser for MercadoLibre shipping labels.
Handles two distinct label formats:
  - COLECTA: Labels for collection-point drop-off (standard ML fulfillment)
  - FLEX: Labels for Mercado Envíos Flex (own delivery / carrier pickup)
"""

import re
from typing import Optional
import unicodedata

# Mapping common names to system IDs (from zoneConfig.js)
PARTIDO_MAP = {
    "caba": "capital_federal",
    "capital federal": "capital_federal",
    "san isidro": "san_isidro",
    "v. lopez": "vicente_lopez",
    "vicente lopez": "vicente_lopez",
    "san fernando": "san_fernando",
    "san martin": "san_martin",
    "3 de febrero": "3_de_febrero",
    "tres de febrero": "3_de_febrero",
    "hurlingham": "hurlingham",
    "ituzaingo": "ituzaingo",
    "moron": "moron",
    "avellaneda": "avellaneda",
    "lanus": "lanus",
    "tigre": "tigre",
    "malvinas argentinas": "malvinas_argentinas",
    "j.c. paz": "jose_c_paz",
    "jose c. paz": "jose_c_paz",
    "jose c paz": "jose_c_paz",
    "san miguel": "san_miguel",
    "moreno": "moreno",
    "merlo": "merlo",
    "la matanza": "la_matanza",
    "ezeiza": "ezeiza",
    "esteban echeverria": "esteban_echeverria",
    "almirante brown": "almirante_brown",
    "lomas de zamora": "lomas_de_zamora",
    "quilmes": "quilmes",
    "berazategui": "berazategui",
    "florencio varela": "florencio_varela",
    "escobar": "escobar",
    "pilar": "pilar",
    "gral. rodriguez": "general_rodriguez",
    "general rodriguez": "general_rodriguez",
    "marcos paz": "marcos_paz",
    "canuelas": "canuelas",
    "san vicente": "san_vicente",
    "pte. peron": "pte_peron",
    "presidente peron": "pte_peron",
    "ensenada": "ensenada",
    "la plata": "la_plata",
    "berisso": "berisso",
}

def normalize_partido(name: str) -> str:
    """Normalize a partido name to match system IDs."""
    if not name:
        return ""
    
    # 1. Clean basic stuff
    name = name.strip().lower()
    
    # 2. Check direct mapping
    if name in PARTIDO_MAP:
        return PARTIDO_MAP[name]
    
    # 3. Slugify-like normalization
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    
    # 4. Check again after slugify
    if s in PARTIDO_MAP.values():
        return s
    
    return s


# Localities within GBA partidos that have a different name than the partido itself.
# Keys are UPPERCASE city names from Flex labels.
LOCALITY_TO_PARTIDO = {
    # La Matanza
    "ISIDRO CASANOVA": "la_matanza",
    "VILLA LUZURIAGA": "la_matanza",
    "SAN JUSTO": "la_matanza",
    "RAMOS MEJIA": "la_matanza",
    "LOMAS DEL MIRADOR": "la_matanza",
    "GONZALEZ CATAN": "la_matanza",
    "LAFERRERE": "la_matanza",
    "RAFAEL CASTILLO": "la_matanza",
    "CIUDAD EVITA": "la_matanza",
    "TABLADA": "la_matanza",
    "TAPIALES": "la_matanza",
    "ALDO BONZI": "la_matanza",
    "VIRREY DEL PINO": "la_matanza",
    "GREGORIO DE LAFERRERE": "la_matanza",
    "20 DE JUNIO": "la_matanza",
    "LIBERTAD": "la_matanza",
    # Vicente López
    "FLORIDA": "vicente_lopez",
    "FLORIDA OESTE": "vicente_lopez",
    "OLIVOS": "vicente_lopez",
    "MUNRO": "vicente_lopez",
    "VILLA MARTELLI": "vicente_lopez",
    "CARAPACHAY": "vicente_lopez",
    "LA LUCILA": "vicente_lopez",
    "VILLA ADELINA": "vicente_lopez",
    # San Isidro
    "MARTINEZ": "san_isidro",
    "ACASSUSO": "san_isidro",
    "BECCAR": "san_isidro",
    "BOULOGNE": "san_isidro",
    # San Fernando
    "VICTORIA": "san_fernando",
    "VIRREYES": "san_fernando",
    # Tigre
    "DON TORCUATO": "tigre",
    "GENERAL PACHECO": "tigre",
    "EL TALAR": "tigre",
    "RICARDO ROJAS": "tigre",
    "RINCON DE MILBERG": "tigre",
    "NORDELTA": "tigre",
    "BENAVIDEZ": "tigre",
    # Malvinas Argentinas
    "LOS POLVORINES": "malvinas_argentinas",
    "GRAND BOURG": "malvinas_argentinas",
    "PABLO NOGUES": "malvinas_argentinas",
    "VILLA DE MAYO": "malvinas_argentinas",
    "TORTUGUITAS": "malvinas_argentinas",
    "INGENIERO ADOLFO SOURDEAUX": "malvinas_argentinas",
    "TIERRAS ALTAS": "malvinas_argentinas",
    "AREA DE PROMOCION EL TRIANGULO": "malvinas_argentinas",
    # San Martín
    "VILLA BALLESTER": "san_martin",
    "SAN ANDRES": "san_martin",
    "JOSE LEON SUAREZ": "san_martin",
    "VILLA LYNCH": "san_martin",
    "BILLINGHURST": "san_martin",
    "VILLA MAIPU": "san_martin",
    "CHILAVERT": "san_martin",
    # 3 de Febrero
    "CASEROS": "3_de_febrero",
    "SAENZ PENA": "3_de_febrero",
    "SANTOS LUGARES": "3_de_febrero",
    "CIUDADELA": "3_de_febrero",
    "CIUDAD JARDIN LOMAS DEL PALOMAR": "3_de_febrero",
    "EL PALOMAR": "3_de_febrero",
    "PABLO PODESTA": "3_de_febrero",
    "CHURRUCA": "3_de_febrero",
    "LOMA HERMOSA": "3_de_febrero",
    # Morón
    "HAEDO": "moron",
    "CASTELAR": "moron",
    "EL PALOMAR SUR": "moron",
    "VILLA SARMIENTO": "moron",
    "PALOMAR": "moron",
    # Hurlingham
    "WILLIAM C. MORRIS": "hurlingham",
    "VILLA TESEI": "hurlingham",
    # Ituzaingó
    "VILLA UDAONDO": "ituzaingo",
    # Lanús
    "VALENTIN ALSINA": "lanus",
    "MONTE CHINGOLO": "lanus",
    "LANUS ESTE": "lanus",
    "LANUS OESTE": "lanus",
    "REMEDIOS DE ESCALADA": "lanus",
    "GERLI": "lanus",
    # Avellaneda
    "SARANDI": "avellaneda",
    "WILDE": "avellaneda",
    "DOCK SUD": "avellaneda",
    "PIÑEYRO": "avellaneda",
    "CRUCECITA": "avellaneda",
    "DOMINICO": "avellaneda",
    # Lomas de Zamora
    "BANFIELD": "lomas_de_zamora",
    "TEMPERLEY": "lomas_de_zamora",
    "TURDERA": "lomas_de_zamora",
    "ADROGUE": "lomas_de_zamora",
    "LLAVALLOL": "lomas_de_zamora",
    "INGENIERO BUDGE": "lomas_de_zamora",
    "FIORITO": "lomas_de_zamora",
    "SANTA CATALINA": "lomas_de_zamora",
    # Almirante Brown
    "BURZACO": "almirante_brown",
    "ADROGUE BROWN": "almirante_brown",
    "RAFAEL CALZADA": "almirante_brown",
    "JOSE MARMOL": "almirante_brown",
    "CLAYPOLE": "almirante_brown",
    "LONGCHAMPS": "almirante_brown",
    "GLEW": "almirante_brown",
    "MINISTRO RIVADAVIA": "almirante_brown",
    "MALVINAS ARGENTINAS BROWN": "almirante_brown",
    # Esteban Echeverría
    "MONTE GRANDE": "esteban_echeverria",
    "EL JAGUEL": "esteban_echeverria",
    "LUIS GUILLON": "esteban_echeverria",
    "CANNING": "esteban_echeverria",
    "9 DE ABRIL": "esteban_echeverria",
    # Quilmes
    "BERNAL": "quilmes",
    "DON BOSCO": "quilmes",
    "EZPELETA": "quilmes",
    "SAN FRANCISCO SOLANO": "quilmes",
    # Berazategui
    "RANELAGH": "berazategui",
    "PLATANOS": "berazategui",
    "HUDSON": "berazategui",
    "SOURIGUES": "berazategui",
    "PEREYRA": "berazategui",
    # Florencio Varela
    "BOSQUES": "florencio_varela",
    "ZEBALLOS": "florencio_varela",
    "GOBERNADOR COSTA": "florencio_varela",
    # San Miguel
    "MUÑIZ": "san_miguel",
    "BELLA VISTA": "san_miguel",
    "CAMPO DE MAYO": "san_miguel",
    # José C. Paz
    "JOSE C. PAZ": "jose_c_paz",
    # Escobar
    "BELEN DE ESCOBAR": "escobar",
    "GARIN": "escobar",
    "INGENIERO MASCHWITZ": "escobar",
    "MAQUINISTA SAVIO": "escobar",
    # Pilar
    "DEL VISO": "pilar",
    "VILLA ROSA": "pilar",
    "PRESIDENTE DERQUI": "pilar",
    "FATIMA": "pilar",
    "MANZANARES": "pilar",
    "MANUEL ALBERTI": "pilar",
    # Moreno
    "PASO DEL REY": "moreno",
    "TRUJUI": "moreno",
    "LA REJA": "moreno",
    "FRANCISCO ALVAREZ": "moreno",
    # La Plata
    "CITY BELL": "la_plata",
    "GONNET": "la_plata",
    "MANUEL B GONNET": "la_plata",
    "VILLA ELISA": "la_plata",
    "LOS HORNOS": "la_plata",
    "TOLOSA": "la_plata",
    "ABASTO": "la_plata",
    "MELCHOR ROMERO": "la_plata",
    "SAN CARLOS": "la_plata",
    # Pte. Perón
    "GUERNICA": "pte_peron",
    # Ezeiza
    "TRISTAN SUAREZ": "ezeiza",
    # Merlo
    "PADUA": "merlo",
    "PONTEVEDRA": "merlo",
    "SAN ANTONIO DE PADUA": "merlo",
    "MARIANO ACOSTA": "merlo",
    "LIBERTAD MERLO": "merlo",
    # Gral Rodríguez
    "GENERAL RODRIGUEZ": "general_rodriguez",
    # CABA barrios
    "RECOLETA": "capital_federal",
    "PALERMO": "capital_federal",
    "BELGRANO": "capital_federal",
    "CABALLITO": "capital_federal",
    "VILLA DEVOTO": "capital_federal",
    "VILLA URQUIZA": "capital_federal",
    "ALMAGRO": "capital_federal",
    "CHACARITA": "capital_federal",
    "SAN TELMO": "capital_federal",
    "MATADEROS": "capital_federal",
    "SAAVEDRA": "capital_federal",
    "COGHLAN": "capital_federal",
    "NUNEZ": "capital_federal",
    "FLORES": "capital_federal",
    "LINIERS": "capital_federal",
    "FLORESTA": "capital_federal",
    "BOEDO": "capital_federal",
    "SAN CRISTOBAL": "capital_federal",
    "BARRACAS": "capital_federal",
    "CONSTITUCION": "capital_federal",
    "LA BOCA": "capital_federal",
    "ONCE": "capital_federal",
    "COLEGIALES": "capital_federal",
    "VILLA CRESPO": "capital_federal",
    "PARQUE PATRICIOS": "capital_federal",
    "POMPEYA": "capital_federal",
    "VILLA LUGANO": "capital_federal",
    "VILLA SOLDATI": "capital_federal",
    "VILLA LURO": "capital_federal",
    "VERSALLES": "capital_federal",
    "VILLA REAL": "capital_federal",
    "MONTE CASTRO": "capital_federal",
    "VILLA DEL PARQUE": "capital_federal",
    "AGRONOMIA": "capital_federal",
    "VILLA ORTUZAR": "capital_federal",
    "PARQUE CHAS": "capital_federal",
    "VILLA PUEYRREDON": "capital_federal",
    "VILLA SANTA RITA": "capital_federal",
    "VILLA GENERAL MITRE": "capital_federal",
    "BALVANERA": "capital_federal",
    "MONSERRAT": "capital_federal",
    "RETIRO": "capital_federal",
    "SAN NICOLAS": "capital_federal",
    "PUERTO MADERO": "capital_federal",
    "PARQUE AVELLANEDA": "capital_federal",
    "NUEVA POMPEYA": "capital_federal",
    "VELEZ SARSFIELD": "capital_federal",
    "VILLA RIACHUELO": "capital_federal",
    # Monterrey is likely not a GBA location — add as unknown
}


def decode_zpl_hex(text: str) -> str:
    """Decode ZPL hex-encoded UTF-8 characters like _C3_B3 -> ó, _2E -> ."""
    def replace_hex(match):
        hex_bytes = match.group(0)
        parts = hex_bytes.split("_")
        byte_values = []
        for p in parts:
            if p:
                try:
                    byte_values.append(int(p, 16))
                except ValueError:
                    return match.group(0)
        try:
            return bytes(byte_values).decode("utf-8")
        except (UnicodeDecodeError, ValueError):
            return match.group(0)

    return re.sub(r"(_[0-9A-Fa-f]{2})+", replace_hex, text)


def parse_zpl_file(content: str) -> list[dict]:
    """
    Parse a ZPL file containing multiple shipping labels.
    Each label is delimited by ^XA ... ^XZ.
    Returns a list of parsed shipment dictionaries.
    """
    # Split into individual labels
    labels = re.findall(r"\^XA(.*?)\^XZ", content, re.DOTALL)
    shipments = []

    for label_content in labels:
        # Skip empty labels (like ^XA^MCY^XZ)
        if len(label_content.strip()) < 50:
            continue

        # Detect label type and parse accordingly
        if is_flex_label(label_content):
            shipment = parse_flex_label(label_content)
        else:
            shipment = parse_colecta_label(label_content)

        if shipment and shipment.get("product_name"):
            shipments.append(shipment)

    return shipments


def is_flex_label(content: str) -> bool:
    """Detect if a label is Flex format vs Colecta format."""
    # Flex labels explicitly say "Envío Flex" or "Envio Flex"
    if re.search(r"Env.{1,3}o Flex", content):
        return True
    # Flex labels have "Destinatario:" field
    if "Destinatario:" in content:
        return True
    # Flex labels have "Direccion:" instead of "Domicilio:"
    if "Direccion:" in content and "Domicilio:" not in content:
        return True
    # Flex labels have QR with sender_id and hash_code
    if "sender_id" in content and "hash_code" in content:
        return True
    return False


# ═══════════════════════════════════════════════
#  COLECTA LABEL PARSER
# ═══════════════════════════════════════════════

def parse_colecta_label(content: str) -> Optional[dict]:
    """Parse a Colecta/standard ML label."""
    full_text = content

    shipment = _empty_shipment()
    shipment["shipping_method"] = "colecta"

    # --- Sale Type & ID ---
    venta_match = re.search(r"\^FD(Venta ID|Pack ID):\^FS", full_text)
    if venta_match:
        shipment["sale_type"] = "Venta" if "Venta" in venta_match.group(1) else "Pack"

    id_matches = re.findall(r"\^FO\d+,40\^A0N,30,30\^FD(\d{10,})\^FS", full_text)
    if id_matches:
        shipment["sale_id"] = id_matches[0]

    # --- Quantity ---
    qty_match = re.search(r"\^FB160,1,0,C\^FD(\d+)\^FS", full_text)
    if qty_match:
        shipment["quantity"] = int(qty_match.group(1))

    # --- Product Name ---
    prod_match = re.search(
        r"\^FO200,100\^A0N,27,27\^FB570,3,-1\^FH\^FD(.+?)\^FS", full_text
    )
    if prod_match:
        name = decode_zpl_hex(prod_match.group(1).strip())
        name = re.sub(r"\s*\|\s*\d+\s*u\.\s*$", "", name)
        shipment["product_name"] = name

    # --- SKU, Color, Voltage ---
    variant_match = re.search(
        r"\^FO200,181\^A0N,24,24\^FB570,3,-1\^FH\^FD(.+?)\^FS", full_text
    )
    if variant_match:
        variant_text = decode_zpl_hex(variant_match.group(1).strip())
        sku_m = re.search(r"SKU:\s*(\S+)", variant_text)
        if sku_m:
            shipment["sku"] = sku_m.group(1)
        color_m = re.search(r"Color:\s*([^|]+)", variant_text)
        if color_m:
            shipment["color"] = color_m.group(1).strip()
        volt_m = re.search(r"Voltaje:\s*([^|]+)", variant_text)
        if volt_m:
            shipment["voltage"] = volt_m.group(1).strip()

    # --- Remitente (ML Account) ---
    rem_match = re.search(r"Remitente #(\d+)", full_text)
    if not rem_match:
        rem_match = re.search(r"#(\d{6,})\^FS", full_text)
    if rem_match:
        shipment["remitente_id"] = rem_match.group(1)

    # --- Tracking Number (barcode) ---
    track_match = re.search(r"\^BCN.*?\^FD>:(\d+)\^FS", full_text)
    if track_match:
        shipment["tracking_number"] = track_match.group(1)

    # --- Dispatch date ---
    dispatch_match = re.search(r"\^FDDespachar:\s*(.+?)(?:\^FS|$)", full_text, re.DOTALL)
    if dispatch_match:
        dispatch_text = re.sub(r"\s+", " ", dispatch_match.group(1)).replace("^FS", "").strip()
        shipment["dispatch_date"] = dispatch_text

    # --- Delivery date ---
    delivery_match = re.search(
        r"\^FD([A-Z]{3}\s+\d{2}/\d{2}/\d{4}\s+CP:\s*\d+)\^FS", full_text
    )
    if delivery_match:
        shipment["delivery_date"] = delivery_match.group(1).strip()

    # --- Carrier detection (CAJAS V4 → specific carrier like OCASA/PICKIT) ---
    if "CAJAS V4" in full_text or "CIERRE CAJAS" in full_text:
        carrier_match = re.search(
            r"\^FX CIERRE CAJAS\s*\^FS\^FO\d+,\d+\^A0N,\d+,\d+\^FH\^FD(\w+)\^FS",
            full_text
        )
        if carrier_match:
            shipment["carrier_name"] = carrier_match.group(1)

    # --- Route code (the large text in CUSTOM_DATA section) ---
    if "CUSTOM_DATA" in full_text:
        route_match = re.search(
            r"\^FO0,580\^A0N,175,175\^FB630,1,0,R\^FD(\w+)\^FS", full_text
        )
        if route_match:
            shipment["carrier_code"] = route_match.group(1)

    # --- Recipient ---
    recipient_section = re.split(r"\^FO0,950\^GB850,2,2\^FS", full_text)
    if len(recipient_section) > 1:
        recip_text = recipient_section[1]
        _parse_colecta_recipient(recip_text, shipment)

    return shipment


def _parse_colecta_recipient(recip_text: str, shipment: dict):
    """Parse recipient info from colecta label."""
    # Name and username
    name_match = re.search(r"\^FD(.+?)\^FS", recip_text)
    if name_match:
        raw_name = decode_zpl_hex(name_match.group(1).strip())
        user_match = re.search(r"\(([^)]+)\)", raw_name)
        if user_match:
            shipment["recipient_user"] = user_match.group(1)
            shipment["recipient_name"] = raw_name[:raw_name.index("(")].strip()
        else:
            shipment["recipient_name"] = raw_name

    # Address
    addr_match = re.search(r"\^FDDomicilio:\s*(.+?)\^FS", recip_text)
    if addr_match:
        shipment["address"] = decode_zpl_hex(addr_match.group(1).strip())

    # Postal Code
    cp_match = re.search(r"\^FDCP:\s*(\d+)\^FS", recip_text)
    if cp_match:
        shipment["postal_code"] = cp_match.group(1)

    # City and Province
    city_match = re.search(r"\^FDCiudad de destino:\s*(.+?)\^FS", recip_text)
    if city_match:
        city_raw = decode_zpl_hex(city_match.group(1).strip())
        city_prov = re.match(r"(.+?)\s*\((.+?)\)", city_raw)
        if city_prov:
            shipment["city"] = city_prov.group(1).strip()
            province = city_prov.group(2).strip()
            shipment["province"] = province
            if province == "Buenos Aires":
                shipment["partido"] = normalize_partido(city_prov.group(1).strip())
            elif province == "Capital Federal":
                shipment["partido"] = "capital_federal"
        else:
            shipment["city"] = city_raw
            shipment["partido"] = normalize_partido(city_raw)

    # Reference
    ref_match = re.search(r"\^FDReferencia:\s*(.+?)\^FS", recip_text)
    if ref_match:
        ref_text = decode_zpl_hex(ref_match.group(1).strip())
        ref_text = re.sub(r"^Referencia:\s*", "", ref_text)
        shipment["reference"] = ref_text


# ═══════════════════════════════════════════════
#  FLEX LABEL PARSER
# ═══════════════════════════════════════════════

def parse_flex_label(content: str) -> Optional[dict]:
    """Parse a Flex delivery label (completely different layout)."""
    full_text = content

    shipment = _empty_shipment()
    shipment["shipping_method"] = "flex"

    # --- Sale Type & ID ---
    venta_match = re.search(r"\^FD(Venta ID|Pack ID):\^FS", full_text)
    if venta_match:
        shipment["sale_type"] = "Venta" if "Venta" in venta_match.group(1) else "Pack"

    id_matches = re.findall(r"\^FO\d+,40\^A0N,30,30\^FD(\d{10,})\^FS", full_text)
    if id_matches:
        shipment["sale_id"] = id_matches[0]

    # --- Quantity ---
    qty_match = re.search(r"\^FB160,1,0,C\^FD(\d+)\^FS", full_text)
    if qty_match:
        shipment["quantity"] = int(qty_match.group(1))

    # --- Product Name ---
    prod_match = re.search(
        r"\^FO200,100\^A0N,27,27\^FB570,3,-1\^FH\^FD(.+?)\^FS", full_text
    )
    if prod_match:
        name = decode_zpl_hex(prod_match.group(1).strip())
        name = re.sub(r"\s*\|\s*\d+\s*u\.\s*$", "", name)
        shipment["product_name"] = name

    # --- SKU, Color, Voltage ---
    variant_match = re.search(
        r"\^FO200,181\^A0N,24,24\^FB570,3,-1\^FH\^FD(.+?)\^FS", full_text
    )
    if variant_match:
        variant_text = decode_zpl_hex(variant_match.group(1).strip())
        sku_m = re.search(r"SKU:\s*(\S+)", variant_text)
        if sku_m:
            shipment["sku"] = sku_m.group(1)
        color_m = re.search(r"Color:\s*([^|]+)", variant_text)
        if color_m:
            shipment["color"] = color_m.group(1).strip()
        volt_m = re.search(r"Voltaje:\s*([^|]+)", variant_text)
        if volt_m:
            shipment["voltage"] = volt_m.group(1).strip()

    # --- Remitente (ML Account) from sender line ---
    rem_match = re.search(r"#(\d{6,})\^FS", full_text)
    if rem_match:
        shipment["remitente_id"] = rem_match.group(1)

    # --- Tracking from QR JSON ---
    qr_match = re.search(r'"id"\s*:\s*"(\d+)"', full_text)
    if qr_match:
        shipment["tracking_number"] = qr_match.group(1)

    # --- Envio number ---
    envio_match = re.search(r"\^FDEnvio:\s*(\d+)\^FS", full_text)
    if envio_match:
        shipment["carrier_code"] = envio_match.group(1)

    # --- Delivery date (Entrega) ---
    entrega_match = re.search(r"\^FD(\d{2}-[A-Za-z]{3})\^FS", full_text)
    if entrega_match:
        shipment["dispatch_date"] = entrega_match.group(1)

    # --- Postal Code ---
    cp_match = re.search(r"\^FDCP:\s*(\d+)\^FS", full_text)
    if cp_match:
        shipment["postal_code"] = cp_match.group(1)

    # --- City/Zone (large text shown on flex label) ---
    # CABA or province abbreviation
    zone_match = re.search(r"\^FO\d+,485\^A0N,48,48\^FB\d+,\d+,\d+,C\^FH\^FD(.+?)\^FS", full_text)
    if zone_match:
        zone = decode_zpl_hex(zone_match.group(1).strip())
        shipment["province"] = zone
        # Try to normalize the zone as a partido
        norm = normalize_partido(zone)
        if norm == "capital_federal" or zone == "CABA":
            shipment["province"] = "Capital Federal"
            shipment["partido"] = "capital_federal"
        elif norm in PARTIDO_MAP.values():
            # The zone field IS the partido name (e.g., "TIGRE")
            shipment["partido"] = norm
        # else: zone is a generic province like "BUENOS AIRES", partido will be derived from city

    # --- Neighborhood / locality ---
    barrio_match = re.search(r"\^FO\d+,580\^A0N,45,45\^FB\d+,\d+,\d+,C\^FH\^FD(.+?)\^FS", full_text)
    if barrio_match:
        shipment["city"] = decode_zpl_hex(barrio_match.group(1).strip())

    # --- Derive partido from city if not already set ---
    if not shipment["partido"] and shipment["city"]:
        city_norm = normalize_partido(shipment["city"])
        if city_norm in PARTIDO_MAP.values():
            shipment["partido"] = city_norm
        else:
            # Try locality-to-partido mapping for cities that are
            # within a partido but have a different name
            mapped = LOCALITY_TO_PARTIDO.get(shipment["city"].upper().strip())
            if mapped:
                shipment["partido"] = mapped

    # --- Address (Direccion:) ---
    dir_match = re.search(r"\^FDDireccion:\s*(.+?)\^FS", full_text)
    if dir_match:
        shipment["address"] = decode_zpl_hex(dir_match.group(1).strip())
    # Also check line with full address after "Direccion:" label
    dir_match2 = re.search(r"Direccion:.*?\^FH\^FD(?:Direccion:\s*)?(.+?)\^FS", full_text)

    # --- Reference ---
    ref_match = re.search(r"\^FDReferencia:\s*(.+?)\^FS", full_text)
    if ref_match:
        ref = decode_zpl_hex(ref_match.group(1).strip())
        shipment["reference"] = ref

    # --- Recipient (Destinatario:) ---
    dest_match = re.search(r"Destinatario:\s*(.+?)\^FS", full_text)
    if dest_match:
        raw_name = decode_zpl_hex(dest_match.group(1).strip())
        user_match = re.search(r"\(([^)]+)\)", raw_name)
        if user_match:
            shipment["recipient_user"] = user_match.group(1)
            shipment["recipient_name"] = raw_name[:raw_name.index("(")].strip()
        else:
            shipment["recipient_name"] = raw_name

    # --- Delivery type (RESIDENCIAL, etc.) ---
    tipo_match = re.search(r"\^FDRESIDENCIAL\^FS", full_text)
    if tipo_match:
        shipment["carrier_name"] = "RESIDENCIAL"

    # --- Barrio field ---
    barrio_field = re.search(r"\^FDBarrio:\s*(.+?)\^FS", full_text)
    if barrio_field:
        barrio = decode_zpl_hex(barrio_field.group(1).strip())
        if barrio and barrio != "":
            if not shipment["city"]:
                shipment["city"] = barrio

    return shipment



# ═══════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════

def _empty_shipment() -> dict:
    return {
        "sale_type": None,
        "sale_id": None,
        "tracking_number": None,
        "remitente_id": None,
        "product_name": None,
        "sku": None,
        "color": None,
        "voltage": None,
        "quantity": 1,
        "recipient_name": None,
        "recipient_user": None,
        "address": None,
        "postal_code": None,
        "city": None,
        "partido": None,
        "province": None,
        "reference": None,
        "shipping_method": None,
        "carrier_code": None,
        "carrier_name": None,
        "dispatch_date": None,
        "delivery_date": None,
    }
