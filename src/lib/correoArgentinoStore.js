import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { extractCorreoLabel, extractCorreoShipmentId, extractCorreoTracking } from '@/lib/correoArgentinoClient';

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    externalReference: row.external_reference,
    correoShippingId: row.correo_shipping_id,
    trackingNumber: row.tracking_number,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    address: parseJson(row.address_json, null),
    package: parseJson(row.package_json, null),
    serviceCode: row.service_code,
    rate: parseJson(row.rate_json, null),
    label: row.label_base64 || row.label_url || null,
    status: row.status,
    rawResponse: parseJson(row.raw_response_json, null),
    trackingResponse: parseJson(row.tracking_response_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveCorreoArgentinoShipment({ workspaceId, payload, response }) {
  await ensureDb();
  const order = payload?.order || payload || {};
  const recipient = order?.shippingData || payload?.recipient || payload?.destinatario || payload?.receiver || {};
  const address = recipient?.address || payload?.address || payload?.domicilio || payload?.destination || payload?.destino || {};
  const pkg = Array.isArray(order?.parcels) ? order.parcels[0] : payload?.package || payload?.paquete || payload?.parcel || payload?.bulto || {};
  const rate = payload?.rate || payload?.tarifa || payload?.service || null;
  const label = extractCorreoLabel(response);
  const tracking = extractCorreoTracking(response);
  const shippingId = extractCorreoShipmentId(response);

  const result = await db.execute({
    sql: `INSERT INTO correo_argentino_shipments (
      workspace_id, external_reference, correo_shipping_id, tracking_number,
      recipient_name, recipient_email, recipient_phone, address_json, package_json,
      service_code, rate_json, label_base64, label_url, status, raw_response_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    args: [
      workspaceId || null,
      order?.shipmentClientId || payload?.externalReference || payload?.external_reference || payload?.referencia || null,
      shippingId ? String(shippingId) : null,
      tracking ? String(tracking) : null,
      recipient?.name || recipient?.nombre || payload?.recipientName || null,
      recipient?.email || payload?.recipientEmail || null,
      recipient?.phoneNumber || recipient?.cellphoneNumber || recipient?.phone || recipient?.telefono || payload?.recipientPhone || null,
      JSON.stringify(address || {}),
      JSON.stringify(pkg || {}),
      order?.serviceType || payload?.serviceCode || payload?.service_code || payload?.servicio || null,
      rate ? JSON.stringify(rate) : null,
      label && !String(label).startsWith('http') ? String(label) : null,
      label && String(label).startsWith('http') ? String(label) : null,
      response?.status || response?.estado || response?.state || null,
      JSON.stringify(response || {}),
    ],
  });

  return Number(result.lastInsertRowid || 0);
}

export async function listCorreoArgentinoShipments({ workspaceId, limit = 50 } = {}) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT *
          FROM correo_argentino_shipments
          WHERE (? IS NULL OR workspace_id = ?)
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [workspaceId || null, workspaceId || null, Math.min(Number(limit) || 50, 100)],
  });
  return (result.rows || []).map(mapRow);
}

export async function updateCorreoArgentinoTracking({ workspaceId, trackingNumber, response }) {
  await ensureDb();
  const status = response?.status || response?.estado || response?.state || response?.ultimoEstado || null;
  await db.execute({
    sql: `UPDATE correo_argentino_shipments
          SET status = COALESCE(?, status),
              tracking_response_json = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE tracking_number = ? AND (? IS NULL OR workspace_id = ?)`,
    args: [status, JSON.stringify(response || {}), trackingNumber, workspaceId || null, workspaceId || null],
  });
}
