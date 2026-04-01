function decodeZplHex(text) {
  if (!text) return "";
  return text.replace(/(_[0-9A-Fa-f]{2})+/g, (match) => {
    const parts = match.split("_").filter(Boolean);
    try {
      const buf = Buffer.from(parts.map((p) => parseInt(p, 16)));
      return buf.toString("utf8");
    } catch {
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

function isColectaLabel(content) {
  if (content.includes("Domicilio:")) return true;
  if (content.includes("Ciudad de destino:")) return true;
  if (/\^BCN,/.test(content)) return true;
  if (content.includes("CIERRE CAJAS")) return true;
  return false;
}

function parseCommonProductData(content, shipment) {
  const saleTypeMatch = content.match(/\^FD(Venta ID|Pack ID):\^FS/);
  if (saleTypeMatch) shipment.sale_type = saleTypeMatch[1].includes("Venta") ? "Venta" : "Pack";

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
}

function parseFlexLabel(content) {
  const shipment = emptyShipment();
  shipment.shipping_method = "flex";

  parseCommonProductData(content, shipment);

  const jsonTracking = content.match(/"id"\s*:\s*"(\d+)"/);
  if (jsonTracking) shipment.tracking_number = jsonTracking[1];

  const bcTracking = content.match(/\^BCN.*?\^FD>:(\d+)\^FS/);
  if (!shipment.tracking_number && bcTracking) shipment.tracking_number = bcTracking[1];

  const envioMatch = content.match(/\^FDEnvio:\s*(\d+)\^FS/);
  if (envioMatch) shipment.carrier_code = envioMatch[1];

  const dispatchMatch = content.match(/\^FDDespachar:\s*([\s\S]+?)(?:\^FS|$)/);
  if (dispatchMatch) {
    shipment.dispatch_date = dispatchMatch[1].replace(/\s+/g, " ").replace("^FS", "").trim();
  }

  const deliveryMatch = content.match(/\^FD([A-Z]{3}\s+\d{2}\/\d{2}\/\d{4}\s+CP:\s*\d+)\^FS/);
  if (deliveryMatch) shipment.delivery_date = deliveryMatch[1].trim();

  return shipment;
}

function parseColectaLabel(content) {
  const shipment = emptyShipment();
  shipment.shipping_method = "colecta";

  parseCommonProductData(content, shipment);

  const trackMatch = content.match(/\^BCN.*?\^FD>:(\d+)\^FS/);
  if (trackMatch) shipment.tracking_number = trackMatch[1];

  const jsonTracking = content.match(/"id"\s*:\s*"(\d+)"/);
  if (!shipment.tracking_number && jsonTracking) shipment.tracking_number = jsonTracking[1];

  const dispatchMatch = content.match(/\^FDDespachar:\s*([\s\S]+?)(?:\^FS|$)/);
  if (dispatchMatch) {
    shipment.dispatch_date = dispatchMatch[1].replace(/\s+/g, " ").replace("^FS", "").trim();
  }

  const deliveryMatch = content.match(/\^FD([A-Z]{3}\s+\d{2}\/\d{2}\/\d{4}\s+CP:\s*\d+)\^FS/);
  if (deliveryMatch) shipment.delivery_date = deliveryMatch[1].trim();

  return shipment;
}

export function parseZplFile(content) {
  const labels = [];
  const regex = /\^XA([\s\S]*?)\^XZ/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const labelContent = match[1];
    if (labelContent.trim().length < 50) continue;

    let shipment;
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
