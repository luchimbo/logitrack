import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getZipnovaShipment, isZipnovaToday, listZipnovaShipmentsByStatuses, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export const ZIPNOVA_VISIBLE_STATUSES = ['new', 'documentation_ready', 'ready_to_ship'];

function getArgentinaDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function enrichShipments(shipments) {
  return Promise.all(
    shipments.map(async (shipment) => {
      try {
        const detailed = await getZipnovaShipment(shipment.id);
        return normalizeZipnovaShipment(detailed);
      } catch {
        return normalizeZipnovaShipment(shipment);
      }
    })
  );
}

function filterVisibleShipments(shipments, externalId) {
  return shipments.filter((shipment) => {
    if (!isZipnovaToday(shipment.created_at)) {
      return false;
    }
    if (externalId && String(shipment.external_id || '').toLowerCase() !== String(externalId).toLowerCase()) {
      return false;
    }
    return true;
  });
}

function parseProducts(value) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function mapLocalRow(row) {
  return {
    id: row.zipnova_id,
    external_id: row.external_id,
    delivery_id: row.delivery_id,
    created_at: row.created_at_external,
    status: row.status,
    status_name: row.status_name,
    logistic_type: row.logistic_type,
    service_type: row.service_type,
    tracking: row.tracking,
    tracking_external: row.tracking_external,
    recipient_name: row.recipient_name,
    recipient_email: row.recipient_email,
    recipient_phone: row.recipient_phone,
    address: row.address,
    city: row.city,
    province: row.province,
    postal_code: row.postal_code,
    total_packages: Number(row.total_packages || 0),
    total_weight: Number(row.total_weight || 0),
    declared_value: Number(row.declared_value || 0),
    price: Number(row.price || 0),
    carrier_name: row.carrier_name,
    carrier_logo: row.carrier_logo,
    products: parseProducts(row.products_json),
    downloaded_at: row.label_downloaded_at || null,
    downloaded_by: row.label_downloaded_by || null,
  };
}

async function upsertZipnovaShipment(shipment) {
  const createdDate = getArgentinaDateOnly(shipment.created_at);
  await db.execute({
    sql: `INSERT INTO zipnova_shipments (
      zipnova_id, external_id, delivery_id, created_at_external, created_date,
      status, status_name, logistic_type, service_type, tracking, tracking_external,
      recipient_name, recipient_email, recipient_phone, address, city, province,
      postal_code, total_packages, total_weight, declared_value, price,
      carrier_name, carrier_logo, products_json, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(zipnova_id) DO UPDATE SET
      external_id = excluded.external_id,
      delivery_id = excluded.delivery_id,
      created_at_external = excluded.created_at_external,
      created_date = excluded.created_date,
      status = excluded.status,
      status_name = excluded.status_name,
      logistic_type = excluded.logistic_type,
      service_type = excluded.service_type,
      tracking = excluded.tracking,
      tracking_external = excluded.tracking_external,
      recipient_name = excluded.recipient_name,
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      postal_code = excluded.postal_code,
      total_packages = excluded.total_packages,
      total_weight = excluded.total_weight,
      declared_value = excluded.declared_value,
      price = excluded.price,
      carrier_name = excluded.carrier_name,
      carrier_logo = excluded.carrier_logo,
      products_json = excluded.products_json,
      synced_at = CURRENT_TIMESTAMP`,
    args: [
      String(shipment.id),
      shipment.external_id || null,
      shipment.delivery_id || null,
      shipment.created_at || null,
      createdDate,
      shipment.status || null,
      shipment.status_name || null,
      shipment.logistic_type || null,
      shipment.service_type || null,
      shipment.tracking || null,
      shipment.tracking_external || null,
      shipment.recipient_name || null,
      shipment.recipient_email || null,
      shipment.recipient_phone || null,
      shipment.address || null,
      shipment.city || null,
      shipment.province || null,
      shipment.postal_code || null,
      Number(shipment.total_packages || 0),
      Number(shipment.total_weight || 0),
      Number(shipment.declared_value || 0),
      Number(shipment.price || 0),
      shipment.carrier_name || null,
      shipment.carrier_logo || null,
      JSON.stringify(Array.isArray(shipment.products) ? shipment.products : []),
    ],
  });
}

export async function syncZipnovaVisibleShipments({ externalId = '' } = {}) {
  await ensureDb();

  const results = await listZipnovaShipmentsByStatuses(ZIPNOVA_VISIBLE_STATUSES, { page: 1, externalId });
  const shipmentsBase = results.flatMap((entry) => entry.response?.data || []);
  const shipments = filterVisibleShipments(await enrichShipments(shipmentsBase), externalId);

  await Promise.all(shipments.map((shipment) => upsertZipnovaShipment(shipment)));
  return shipments.length;
}

export async function listStoredZipnovaToday({ externalId = '' } = {}) {
  await ensureDb();

  const today = getArgentinaDateOnly(new Date());
  const [result, syncInfo] = await Promise.all([
    db.execute({
    sql: `SELECT *
          FROM zipnova_shipments
          WHERE created_date = ?
            AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))
          ORDER BY CASE WHEN label_downloaded_at IS NULL THEN 0 ELSE 1 END ASC,
                   external_id ASC,
                   zipnova_id ASC`,
    args: [today, externalId, externalId],
    }),
    db.execute({
      sql: `SELECT MAX(synced_at) AS last_synced_at
            FROM zipnova_shipments
            WHERE created_date = ?
              AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))`,
      args: [today, externalId, externalId],
    }),
  ]);

  const shipments = (result.rows || []).map(mapLocalRow);
  return {
    totalShipments: shipments.length,
    lastSyncedAt: syncInfo.rows[0]?.last_synced_at || null,
    pendingShipments: shipments.filter((shipment) => !shipment.downloaded_at),
    readyShipments: shipments.filter((shipment) => shipment.downloaded_at),
  };
}

export async function markZipnovaShipmentsDownloaded(shipmentIds, actorLabel = null) {
  await ensureDb();

  const normalized = [...new Set((shipmentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalized.length) return 0;

  const placeholders = normalized.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `UPDATE zipnova_shipments
          SET label_downloaded_at = CURRENT_TIMESTAMP,
              label_downloaded_by = COALESCE(?, label_downloaded_by)
          WHERE zipnova_id IN (${placeholders})`,
    args: [actorLabel, ...normalized],
  });

  return Number(result.rowsAffected || 0);
}

export async function fetchStoredZipnovaDashboardRows(range) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT
            zipnova_id AS id,
            1 AS quantity,
            'zipnova' AS status,
            'zipnova' AS shipping_method,
            NULL AS assigned_carrier,
            COALESCE(province, 'Desconocida') AS province,
            created_date AS batch_date
          FROM zipnova_shipments
          WHERE created_date >= ? AND created_date <= ?`,
    args: [range.from, range.to],
  });

  return result.rows || [];
}
