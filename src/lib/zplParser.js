/**
 * ZPL (Zebra Programming Language) parser for MercadoLibre shipping labels.
 * Translated from Python to JavaScript.
 * Handles two distinct label formats:
 *   - COLECTA: Labels for collection-point drop-off (standard ML fulfillment)
 *   - FLEX: Labels for Mercado Envíos Flex (own delivery / carrier pickup)
 */

// Mapping common names to system IDs
const PARTIDO_MAP = {
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
    "la matanza sur": "la_matanza_sur",
    "la matanza norte": "la_matanza_norte",
    "matanza sur": "la_matanza_sur",
    "matanza norte": "la_matanza_norte",
    "ezeiza": "ezeiza",
    "esteban echeverria": "esteban_echeverria",
    "almirante brown": "almirante_brown",
    "lomas de zamora": "lomas_de_zamora",
    "quilmes": "quilmes",
    "berazategui": "berazategui",
    "florencio varela": "florencio_varela",
    "escobar": "escobar",
    "pilar": "pilar",
    "derqui": "pilar",
    "presidente derqui": "pilar",
    "pte derqui": "pilar",
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
};

// Localities within GBA partidos that have a different name than the partido itself.
const LOCALITY_TO_PARTIDO = {
    // La Matanza
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
    // Vicente López
    "FLORIDA": "vicente_lopez",
    "FLORIDA OESTE": "vicente_lopez",
    "OLIVOS": "vicente_lopez",
    "MUNRO": "vicente_lopez",
    "VILLA MARTELLI": "vicente_lopez",
    "CARAPACHAY": "vicente_lopez",
    "LA LUCILA": "vicente_lopez",
    "VILLA ADELINA": "vicente_lopez",
    // San Isidro
    "MARTINEZ": "san_isidro",
    "ACASSUSO": "san_isidro",
    "BECCAR": "san_isidro",
    "BOULOGNE": "san_isidro",
    // San Fernando
    "VICTORIA": "san_fernando",
    "VIRREYES": "san_fernando",
    // Tigre
    "DON TORCUATO": "tigre",
    "GENERAL PACHECO": "tigre",
    "EL TALAR": "tigre",
    "RICARDO ROJAS": "tigre",
    "RINCON DE MILBERG": "tigre",
    "NORDELTA": "tigre",
    "BENAVIDEZ": "tigre",
    // Malvinas Argentinas
    "LOS POLVORINES": "malvinas_argentinas",
    "GRAND BOURG": "malvinas_argentinas",
    "PABLO NOGUES": "malvinas_argentinas",
    "VILLA DE MAYO": "malvinas_argentinas",
    "TORTUGUITAS": "malvinas_argentinas",
    "INGENIERO ADOLFO SOURDEAUX": "malvinas_argentinas",
    "TIERRAS ALTAS": "malvinas_argentinas",
    "AREA DE PROMOCION EL TRIANGULO": "malvinas_argentinas",
    // San Martín
    "VILLA BALLESTER": "san_martin",
    "SAN ANDRES": "san_martin",
    "JOSE LEON SUAREZ": "san_martin",
    "VILLA LYNCH": "san_martin",
    "BILLINGHURST": "san_martin",
    "VILLA MAIPU": "san_martin",
    "CHILAVERT": "san_martin",
    // 3 de Febrero
    "CASEROS": "3_de_febrero",
    "SAENZ PENA": "3_de_febrero",
    "SANTOS LUGARES": "3_de_febrero",
    "CIUDADELA": "3_de_febrero",
    "CIUDAD JARDIN LOMAS DEL PALOMAR": "3_de_febrero",
    "EL PALOMAR": "3_de_febrero",
    "PABLO PODESTA": "3_de_febrero",
    "CHURRUCA": "3_de_febrero",
    "LOMA HERMOSA": "3_de_febrero",
    // Morón
    "HAEDO": "moron",
    "CASTELAR": "moron",
    "EL PALOMAR SUR": "moron",
    "VILLA SARMIENTO": "moron",
    "PALOMAR": "moron",
    // Hurlingham
    "WILLIAM C. MORRIS": "hurlingham",
    "VILLA TESEI": "hurlingham",
    // Ituzaingó
    "VILLA UDAONDO": "ituzaingo",
    // Lanús
    "VALENTIN ALSINA": "lanus",
    "MONTE CHINGOLO": "lanus",
    "LANUS ESTE": "lanus",
    "LANUS OESTE": "lanus",
    "REMEDIOS DE ESCALADA": "lanus",
    "GERLI": "lanus",
    // Avellaneda
    "SARANDI": "avellaneda",
    "WILDE": "avellaneda",
    "DOCK SUD": "avellaneda",
    "PIÑEYRO": "avellaneda",
    "CRUCECITA": "avellaneda",
    "DOMINICO": "avellaneda",
    // Lomas de Zamora
    "BANFIELD": "lomas_de_zamora",
    "TEMPERLEY": "lomas_de_zamora",
    "TURDERA": "lomas_de_zamora",
    "ADROGUE": "lomas_de_zamora",
    "LLAVALLOL": "lomas_de_zamora",
    "INGENIERO BUDGE": "lomas_de_zamora",
    "FIORITO": "lomas_de_zamora",
    "SANTA CATALINA": "lomas_de_zamora",
    // Almirante Brown
    "BURZACO": "almirante_brown",
    "ADROGUE BROWN": "almirante_brown",
    "RAFAEL CALZADA": "almirante_brown",
    "JOSE MARMOL": "almirante_brown",
    "CLAYPOLE": "almirante_brown",
    "LONGCHAMPS": "almirante_brown",
    "GLEW": "almirante_brown",
    "MINISTRO RIVADAVIA": "almirante_brown",
    "MALVINAS ARGENTINAS BROWN": "almirante_brown",
    // Esteban Echeverría
    "MONTE GRANDE": "esteban_echeverria",
    "EL JAGUEL": "esteban_echeverria",
    "LUIS GUILLON": "esteban_echeverria",
    "CANNING": "esteban_echeverria",
    "9 DE ABRIL": "esteban_echeverria",
    // Quilmes
    "BERNAL": "quilmes",
    "DON BOSCO": "quilmes",
    "EZPELETA": "quilmes",
    "SAN FRANCISCO SOLANO": "quilmes",
    // Berazategui
    "RANELAGH": "berazategui",
    "PLATANOS": "berazategui",
    "HUDSON": "berazategui",
    "SOURIGUES": "berazategui",
    "PEREYRA": "berazategui",
    // Florencio Varela
    "BOSQUES": "florencio_varela",
    "ZEBALLOS": "florencio_varela",
    "GOBERNADOR COSTA": "florencio_varela",
    // San Miguel
    "MUÑIZ": "san_miguel",
    "BELLA VISTA": "san_miguel",
    "CAMPO DE MAYO": "san_miguel",
    // José C. Paz
    "JOSE C. PAZ": "jose_c_paz",
    // Escobar
    "BELEN DE ESCOBAR": "escobar",
    "GARIN": "escobar",
    "INGENIERO MASCHWITZ": "escobar",
    "MAQUINISTA SAVIO": "escobar",
    // Pilar
    "DEL VISO": "pilar",
    "VILLA ROSA": "pilar",
    "PRESIDENTE DERQUI": "pilar",
    "FATIMA": "pilar",
    "MANZANARES": "pilar",
    "MANUEL ALBERTI": "pilar",
    // Moreno
    "PASO DEL REY": "moreno",
    "TRUJUI": "moreno",
    "LA REJA": "moreno",
    "FRANCISCO ALVAREZ": "moreno",
    // La Plata
    "CITY BELL": "la_plata",
    "GONNET": "la_plata",
    "MANUEL B GONNET": "la_plata",
    "VILLA ELISA": "la_plata",
    "LOS HORNOS": "la_plata",
    "TOLOSA": "la_plata",
    "ABASTO": "la_plata",
    "MELCHOR ROMERO": "la_plata",
    "SAN CARLOS": "la_plata",
    // Pte. Perón
    "GUERNICA": "pte_peron",
    // Ezeiza
    "TRISTAN SUAREZ": "ezeiza",
    // Merlo
    "PADUA": "merlo",
    "PONTEVEDRA": "merlo",
    "SAN ANTONIO DE PADUA": "merlo",
    "MARIANO ACOSTA": "merlo",
    "LIBERTAD MERLO": "merlo",
    // Gral Rodriguez
    "GENERAL RODRIGUEZ": "general_rodriguez",
    // CABA barrios
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
};

const LA_MATANZA_NORTE_LOCALITIES = new Set([
    "SAN JUSTO",
    "RAMOS MEJIA",
    "VILLA LUZURIAGA",
    "LOMAS DEL MIRADOR",
    "TABLADA",
    "TAPIALES",
    "ALDO BONZI",
    "CIUDAD EVITA",
]);

const LA_MATANZA_SUR_LOCALITIES = new Set([
    "GONZALEZ CATAN",
    "LAFERRERE",
    "GREGORIO DE LAFERRERE",
    "VIRREY DEL PINO",
    "RAFAEL CASTILLO",
    "20 DE JUNIO",
    "ISIDRO CASANOVA",
]);

function sanitizeUpper(value) {
    return decodeZplHex(String(value || ""))
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}

function resolvePartidoFromGeo(cityRaw, provinceRaw = "") {
    const cityUpper = sanitizeUpper(cityRaw);
    const provinceUpper = sanitizeUpper(provinceRaw);
    const combinedUpper = `${cityUpper} ${provinceUpper}`.trim();

    if (combinedUpper.includes("LA MATANZA SUR")) return "la_matanza_sur";
    if (combinedUpper.includes("LA MATANZA NORTE")) return "la_matanza_norte";

    const cityBase = cityUpper.split(",")[0]?.trim() || cityUpper;

    if (LA_MATANZA_SUR_LOCALITIES.has(cityBase)) return "la_matanza_sur";
    if (LA_MATANZA_NORTE_LOCALITIES.has(cityBase)) return "la_matanza_norte";

    if (LOCALITY_TO_PARTIDO[cityUpper]) return LOCALITY_TO_PARTIDO[cityUpper];
    if (LOCALITY_TO_PARTIDO[cityBase]) return LOCALITY_TO_PARTIDO[cityBase];

    const cityNorm = normalizePartido(cityBase || cityUpper);
    if (Object.values(PARTIDO_MAP).includes(cityNorm)) return cityNorm;

    if (provinceUpper === "CAPITAL FEDERAL" || provinceUpper === "CABA") {
        return "capital_federal";
    }

    return normalizePartido(cityUpper);
}

function normalizePartido(name) {
    if (!name) return "";

    // 1. Clean basic stuff
    name = name.trim().toLowerCase();

    // 2. Check direct mapping
    if (PARTIDO_MAP[name]) {
        return PARTIDO_MAP[name];
    }

    // 3. Slugify-like normalization
    let s = name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
    s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    // 4. Check again after slugify
    if (Object.values(PARTIDO_MAP).includes(s)) {
        return s;
    }

    return s;
}

function decodeZplHex(text) {
    if (!text) return "";
    return text.replace(/(_[0-9A-Fa-f]{2})+/g, (match) => {
        const parts = match.split('_').filter(Boolean);
        try {
            const buf = Buffer.from(parts.map(p => parseInt(p, 16)));
            return buf.toString('utf8');
        } catch (e) {
            return match;
        }
    });
}

function emptyShipment() {
    return {
        sale_type: null,
        sale_id: null,
        tracking_number: null,
        remitente_id: null,
        product_name: null,
        sku: null,
        color: null,
        voltage: null,
        quantity: 1,
        recipient_name: null,
        recipient_user: null,
        address: null,
        postal_code: null,
        city: null,
        partido: null,
        province: null,
        reference: null,
        shipping_method: null,
        carrier_code: null,
        carrier_name: null,
        dispatch_date: null,
        delivery_date: null,
    };
}

function isFlexLabel(content) {
    if (content.includes("Domicilio:")) return false;
    if (content.includes("Ciudad de destino:")) return false;
    if (/\^BCN,/.test(content)) return false;
    if (content.includes("CIERRE CAJAS")) return false;

    if (/Env.{1,3}o Flex/.test(content)) return true;
    if (content.includes("sender_id") && content.includes("hash_code")) return true;
    if (content.includes("Destinatario:") && content.includes("Direccion:")) return true;
    if (content.includes("Direccion:") && !content.includes("Domicilio:")) return true;
    return false;
}

function extractFdTexts(segment) {
    const texts = [];
    const regex = /\^FD([\s\S]*?)\^FS/g;
    let match;
    while ((match = regex.exec(segment)) !== null) {
        const decoded = decodeZplHex(match[1] || "").replace(/\s+/g, " ").trim();
        if (decoded) texts.push(decoded);
    }
    return texts;
}

function isColectaLabel(content) {
    if (content.includes("Domicilio:")) return true;
    if (content.includes("Ciudad de destino:")) return true;
    if (/\^BCN,/.test(content)) return true;
    if (content.includes("CIERRE CAJAS")) return true;
    return false;
}

function parseFlexLabel(content) {
    const shipment = emptyShipment();
    shipment.shipping_method = "flex";

    const ventaMatch = content.match(/\^FD(Venta ID|Pack ID):\^FS/);
    if (ventaMatch) shipment.sale_type = ventaMatch[1].includes("Venta") ? "Venta" : "Pack";

    const idMatch = content.match(/\^FO\d+,40\^A0N,30,30\^FD(\d{10,})\^FS/);
    if (idMatch) shipment.sale_id = idMatch[1];

    const qtyMatch = content.match(/\^FB160,1,0,C\^FD(\d+)\^FS/);
    if (qtyMatch) shipment.quantity = parseInt(qtyMatch[1], 10);

    const prodMatch = content.match(/\^FO200,100\^A0N,27,27\^FB570,3,-1\^FH\^FD(.+?)\^FS/);
    if (prodMatch) {
        let name = decodeZplHex(prodMatch[1].trim());
        name = name.replace(/\s*\|\s*\d+\s*u\.\s*$/, "");
        shipment.product_name = name;
    }

    const varMatch = content.match(/\^FO200,181\^A0N,24,24\^FB570,3,-1\^FH\^FD(.+?)\^FS/);
    if (varMatch) {
        const varText = decodeZplHex(varMatch[1].trim());
        const skuM = varText.match(/SKU:\s*(\S+)/);
        if (skuM) shipment.sku = skuM[1];
        const colorM = varText.match(/Color:\s*([^|]+)/);
        if (colorM) shipment.color = colorM[1].trim();
        const voltM = varText.match(/Voltaje:\s*([^|]+)/);
        if (voltM) shipment.voltage = voltM[1].trim();
    }

    const remMatch = content.match(/#(\d{6,})\^FS/);
    if (remMatch) shipment.remitente_id = remMatch[1];

    const qrMatch = content.match(/"id"\s*:\s*"(\d+)"/);
    if (qrMatch) shipment.tracking_number = qrMatch[1];

    const envioMatch = content.match(/\^FDEnvio:\s*(\d+)\^FS/);
    if (envioMatch) shipment.carrier_code = envioMatch[1];

    const entregaMatch = content.match(/\^FD(\d{2}-[A-Za-z]{3})\^FS/);
    if (entregaMatch) shipment.dispatch_date = entregaMatch[1];

    const cpMatch = content.match(/\^FDCP:\s*(\d+)\^FS/);
    if (cpMatch) shipment.postal_code = cpMatch[1];

    const zoneMatch = content.match(/\^FO\d+,485\^A0N,48,48\^FB\d+,\d+,\d+,C\^FH\^FD(.+?)\^FS/);
    if (zoneMatch) {
        const zone = decodeZplHex(zoneMatch[1].trim());
        shipment.province = zone;
        const norm = normalizePartido(zone);
        if (norm === "capital_federal" || zone === "CABA") {
            shipment.province = "Capital Federal";
            shipment.partido = "capital_federal";
        } else if (Object.values(PARTIDO_MAP).includes(norm)) {
            shipment.partido = norm;
        }
    }

    const barrioMatch = content.match(/\^FO\d+,580\^A0N,45,45\^FB\d+,\d+,\d+,C\^FH\^FD(.+?)\^FS/);
    if (barrioMatch) {
        shipment.city = decodeZplHex(barrioMatch[1].trim());
    }

    if (!shipment.partido && shipment.city) {
        shipment.partido = resolvePartidoFromGeo(shipment.city, shipment.province);
    }

    const dirMatch = content.match(/\^FDDireccion:\s*(.+?)\^FS/);
    if (dirMatch) shipment.address = decodeZplHex(dirMatch[1].trim());

    // Check fallback address format
    const dirMatch2 = content.match(/Direccion:.*?\^FH\^FD(?:Direccion:\s*)?(.+?)\^FS/);
    if (!dirMatch && dirMatch2) shipment.address = decodeZplHex(dirMatch2[1].trim());

    const refMatch = content.match(/\^FDReferencia:\s*(.+?)\^FS/);
    if (refMatch) shipment.reference = decodeZplHex(refMatch[1].trim());

    const destMatch = content.match(/Destinatario:\s*(.+?)\^FS/);
    if (destMatch) {
        const rawName = decodeZplHex(destMatch[1].trim());
        const userM = rawName.match(/\(([^)]+)\)/);
        if (userM) {
            shipment.recipient_user = userM[1];
            shipment.recipient_name = rawName.substring(0, rawName.indexOf("(")).trim();
        } else {
            shipment.recipient_name = rawName;
        }
    }

    const tipoMatch = content.match(/\^FDRESIDENCIAL\^FS/);
    if (tipoMatch) shipment.carrier_name = "RESIDENCIAL";

    const barrioField = content.match(/\^FDBarrio:\s*(.+?)\^FS/);
    if (barrioField) {
        const barrio = decodeZplHex(barrioField[1].trim());
        if (barrio && !shipment.city) shipment.city = barrio;
    }

    if (!shipment.city || !shipment.province || !shipment.partido) {
        const cpPos = content.indexOf("CP:");
        if (cpPos !== -1) {
            const candidates = [
                content.indexOf("^FO0,700", cpPos),
                content.indexOf("^FO0,715", cpPos),
                content.indexOf("^FX 3 Horizontal Line", cpPos)
            ].filter(x => x !== -1);

            const endPos = candidates.length ? Math.min(...candidates) : content.length;
            const geoSegment = content.slice(cpPos, endPos);
            const geoTexts = extractFdTexts(geoSegment)
                .filter(t => !/^CP:\s*\d+$/i.test(t))
                .filter(t => !/^Entrega:/i.test(t))
                .filter(t => !/^\d{2}-[A-Za-z]{3}$/i.test(t))
                .filter(t => !/sender_id|hash_code/i.test(t));

            const uniqueGeo = [...new Set(geoTexts)];
            if (!shipment.province && uniqueGeo.length >= 1) shipment.province = uniqueGeo[0];
            if (!shipment.city && uniqueGeo.length >= 2) shipment.city = uniqueGeo[uniqueGeo.length - 1];
        }
    }

    if (!shipment.city && shipment.address && shipment.address.includes(",")) {
        const chunks = shipment.address.split(",").map(x => x.trim()).filter(Boolean);
        if (chunks.length > 1) {
            shipment.city = chunks[chunks.length - 1];
        }
    }

    if (!shipment.partido && shipment.province) {
        const provinceUpper = sanitizeUpper(shipment.province);
        if (provinceUpper === "CABA" || provinceUpper === "CAPITAL FEDERAL") {
            shipment.province = "Capital Federal";
            shipment.partido = "capital_federal";
        } else if (shipment.city) {
            shipment.partido = resolvePartidoFromGeo(shipment.city, shipment.province);
        } else {
            const provNorm = normalizePartido(shipment.province);
            if (Object.values(PARTIDO_MAP).includes(provNorm)) {
                shipment.partido = provNorm;
            }
        }
    }

    if (!shipment.partido && shipment.city) {
        shipment.partido = resolvePartidoFromGeo(shipment.city, shipment.province);
    }

    return shipment;
}

function parseColectaRecipient(recipText, shipment) {
    const nameMatch = recipText.match(/\^FD(.+?)\^FS/);
    if (nameMatch) {
        const rawName = decodeZplHex(nameMatch[1].trim());
        const userM = rawName.match(/\(([^)]+)\)/);
        if (userM) {
            shipment.recipient_user = userM[1];
            shipment.recipient_name = rawName.substring(0, rawName.indexOf("(")).trim();
        } else {
            shipment.recipient_name = rawName;
        }
    }

    const addrMatch = recipText.match(/\^FDDomicilio:\s*(.+?)\^FS/);
    if (addrMatch) shipment.address = decodeZplHex(addrMatch[1].trim());

    const cpMatch = recipText.match(/\^FDCP:\s*(\d+)\^FS/);
    if (cpMatch) shipment.postal_code = cpMatch[1];

    const cityMatch = recipText.match(/\^FDCiudad de destino:\s*(.+?)\^FS/);
    if (cityMatch) {
        const cityRaw = decodeZplHex(cityMatch[1].trim());
        const cityProv = cityRaw.match(/(.+?)\s*\((.+?)\)/);
        if (cityProv) {
            shipment.city = cityProv[1].trim();
            shipment.province = cityProv[2].trim();
            if (shipment.province === "Buenos Aires") {
                shipment.partido = resolvePartidoFromGeo(cityProv[1].trim(), shipment.province);
            } else if (shipment.province === "Capital Federal") {
                shipment.partido = "capital_federal";
            } else {
                shipment.partido = resolvePartidoFromGeo(cityProv[1].trim(), shipment.province);
            }
        } else {
            shipment.city = cityRaw;
            shipment.partido = resolvePartidoFromGeo(cityRaw, shipment.province);
        }
    }

    const refMatch = recipText.match(/\^FDReferencia:\s*(.+?)\^FS/);
    if (refMatch) {
        let refText = decodeZplHex(refMatch[1].trim());
        refText = refText.replace(/^Referencia:\s*/, "");
        shipment.reference = refText;
    }
}

function parseColectaLabel(content) {
    const shipment = emptyShipment();
    shipment.shipping_method = "colecta";

    const ventaMatch = content.match(/\^FD(Venta ID|Pack ID):\^FS/);
    if (ventaMatch) shipment.sale_type = ventaMatch[1].includes("Venta") ? "Venta" : "Pack";

    const idMatch = content.match(/\^FO\d+,40\^A0N,30,30\^FD(\d{10,})\^FS/);
    if (idMatch) shipment.sale_id = idMatch[1];

    const qtyMatch = content.match(/\^FB160,1,0,C\^FD(\d+)\^FS/);
    if (qtyMatch) shipment.quantity = parseInt(qtyMatch[1], 10);

    const prodMatch = content.match(/\^FO200,100\^A0N,27,27\^FB570,3,-1\^FH\^FD(.+?)\^FS/);
    if (prodMatch) {
        let name = decodeZplHex(prodMatch[1].trim());
        name = name.replace(/\s*\|\s*\d+\s*u\.\s*$/, "");
        shipment.product_name = name;
    }

    const varMatch = content.match(/\^FO200,181\^A0N,24,24\^FB570,3,-1\^FH\^FD(.+?)\^FS/);
    if (varMatch) {
        const varText = decodeZplHex(varMatch[1].trim());
        const skuM = varText.match(/SKU:\s*(\S+)/);
        if (skuM) shipment.sku = skuM[1];
        const colorM = varText.match(/Color:\s*([^|]+)/);
        if (colorM) shipment.color = colorM[1].trim();
        const voltM = varText.match(/Voltaje:\s*([^|]+)/);
        if (voltM) shipment.voltage = voltM[1].trim();
    }

    let remMatch = content.match(/Remitente #(\d+)/);
    if (!remMatch) remMatch = content.match(/#(\d{6,})\^FS/);
    if (remMatch) shipment.remitente_id = remMatch[1];

    const trackMatch = content.match(/\^BCN.*?\^FD>:(\d+)\^FS/);
    if (trackMatch) shipment.tracking_number = trackMatch[1];

    const dispatchMatch = content.match(/\^FDDespachar:\s*([\s\S]+?)(?:\^FS|$)/);
    if (dispatchMatch) {
        const dispatchText = dispatchMatch[1].replace(/\s+/g, " ").replace("^FS", "").trim();
        shipment.dispatch_date = dispatchText;
    }

    const deliveryMatch = content.match(/\^FD([A-Z]{3}\s+\d{2}\/\d{2}\/\d{4}\s+CP:\s*\d+)\^FS/);
    if (deliveryMatch) shipment.delivery_date = deliveryMatch[1].trim();

    if (content.includes("CAJAS V4") || content.includes("CIERRE CAJAS")) {
        const carrierMatch = content.match(/\^FX CIERRE CAJAS\s*\^FS\^FO\d+,\d+\^A0N,\d+,\d+\^FH\^FD(\w+)\^FS/);
        if (carrierMatch) shipment.carrier_name = carrierMatch[1];
    }

    if (content.includes("CUSTOM_DATA")) {
        const routeMatch = content.match(/\^FO0,580\^A0N,175,175\^FB630,1,0,R\^FD(\w+)\^FS/);
        if (routeMatch) shipment.carrier_code = routeMatch[1];
    }

    const recipientSection = content.split(/\^FO0,950\^GB850,2,2\^FS/);
    if (recipientSection.length > 1) {
        parseColectaRecipient(recipientSection[1], shipment);
    }

    return shipment;
}

export function parseZplFile(content) {
    const labels = [];
    const regex = /\^XA([\s\S]*?)\^XZ/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const labelContent = match[1];
        if (labelContent.trim().length < 50) continue;

        let shipment = null;
        if (isColectaLabel(labelContent)) {
            shipment = parseColectaLabel(labelContent);
        } else if (isFlexLabel(labelContent)) {
            shipment = parseFlexLabel(labelContent);
        } else {
            shipment = parseColectaLabel(labelContent);
        }

        const hasIdentity = shipment && (shipment.product_name || shipment.tracking_number || shipment.sku);
        if (hasIdentity) {
            labels.push(shipment);
        }
    }

    return labels;
}
