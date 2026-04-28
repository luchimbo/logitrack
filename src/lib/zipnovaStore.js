import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDefaultZipnovaClient, isZipnovaToday, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export const ZIPNOVA_VISIBLE_STATUSES = ['new', 'documentation_ready', 'ready_to_ship'];
export const ZIPNOVA_COLLECTION_STATUSES = ['ready_to_ship'];

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

async function enrichShipments(shipments, client = null) {
  const zipnovaClient = client || getDefaultZipnovaClient();
  return Promise.all(
    shipments.map(async (shipment) => {
      try {
        const detailed = await zipnovaClient.getShipment(shipment.id);
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

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeDayNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findAddressForShipment(shipment, addresses) {
  const originId = shipment.origin_id ? String(shipment.origin_id) : '';
  const accountId = shipment.account_id ? String(shipment.account_id) : '';

  return (addresses || []).find((address) => {
    if (originId && String(address?.id || '') !== originId) return false;
    if (!accountId) return true;
    const accounts = Array.isArray(address?.accounts) ? address.accounts : [];
    return !accounts.length || accounts.some((account) => String(account?.id || '') === accountId);
  }) || null;
}

function getNextPickupDate(pickupDays, baseDate = new Date()) {
  const days = (pickupDays || []).map(normalizeDayNumber).filter((day) => day !== null);
  if (!days.length) return getArgentinaDateOnly(baseDate);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(baseDate);
    candidate.setDate(candidate.getDate() + offset);
    if (days.includes(candidate.getDay())) {
      return getArgentinaDateOnly(candidate);
    }
  }

  return getArgentinaDateOnly(baseDate);
}

function buildCollectionWindow(shipment, addresses) {
  const address = findAddressForShipment(shipment, addresses);
  const accountOptions = (Array.isArray(address?.accounts) ? address.accounts : [])
    .find((account) => String(account?.id || '') === String(shipment.account_id || ''))?.options || {};
  const pickupDays = accountOptions.pickup_days || [];
  const open = address?.hours?.open || null;
  const close = address?.hours?.close || null;
  const date = getNextPickupDate(pickupDays);

  if (!address && !open && !close && !pickupDays.length) return null;

  return {
    date,
    open,
    close,
    automaticPickup: Boolean(accountOptions.automatic_pickup),
    pickupDays,
    originName: address?.name || shipment.origin_name || null,
  };
}

function mapLocalRow(row) {
  const collectionWindow = parseJson(row.collection_window_json, null);
  return {
    id: row.zipnova_id,
    account_id: row.account_id || null,
    external_id: row.external_id,
    delivery_id: row.delivery_id,
    created_at: row.created_at_external,
    delivery_time: parseJson(row.delivery_time_json, null),
    status: row.status,
    status_name: row.status_name,
    logistic_type: row.logistic_type,
    service_type: row.service_type,
    tracking: row.tracking,
    tracking_external: row.tracking_external,
    origin_id: row.origin_id || null,
    origin_name: row.origin_name,
    origin_address: row.origin_address,
    origin_city: row.origin_city,
    origin_province: row.origin_province,
    recipient_name: row.recipient_name,
    recipient_email: row.recipient_email,
    recipient_phone: row.recipient_phone,
    address: row.address,
    city: row.city,
    province: row.province,
    postal_code: row.postal_code,
    total_packages: Number(row.total_packages || 0),
    total_weight: Number(row.total_weight || 0),
    total_volume: Number(row.total_volume || 0),
    declared_value: Number(row.declared_value || 0),
    price: Number(row.price || 0),
    carrier_name: row.carrier_name,
    carrier_logo: row.carrier_logo,
    products: parseProducts(row.products_json),
    packages: parseJson(row.packages_json, []),
    collection_window: collectionWindow,
    downloaded_at: row.label_downloaded_at || null,
    downloaded_by: row.label_downloaded_by || null,
    label_pdf_downloaded_at: row.label_pdf_downloaded_at || null,
    label_zpl_downloaded_at: row.label_zpl_downloaded_at || null,
  };
}

async function upsertZipnovaShipment(shipment, { workspaceId, collectionWindow = null } = {}) {
  const createdDate = getArgentinaDateOnly(shipment.created_at);
  await db.execute({
    sql: `INSERT INTO zipnova_shipments (
      workspace_id, zipnova_id, account_id, external_id, delivery_id, created_at_external, created_date,
      delivery_time_json, status, status_name, logistic_type, service_type, tracking, tracking_external,
      origin_id, origin_name, origin_address, origin_city, origin_province,
      recipient_name, recipient_email, recipient_phone, address, city, province,
      postal_code, total_packages, total_weight, total_volume, declared_value, price,
      carrier_name, carrier_logo, products_json, packages_json, collection_window_json, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(zipnova_id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      account_id = excluded.account_id,
      external_id = excluded.external_id,
      delivery_id = excluded.delivery_id,
      created_at_external = excluded.created_at_external,
      created_date = excluded.created_date,
      delivery_time_json = excluded.delivery_time_json,
      status = excluded.status,
      status_name = excluded.status_name,
      logistic_type = excluded.logistic_type,
      service_type = excluded.service_type,
      tracking = excluded.tracking,
      tracking_external = excluded.tracking_external,
      origin_id = excluded.origin_id,
      origin_name = excluded.origin_name,
      origin_address = excluded.origin_address,
      origin_city = excluded.origin_city,
      origin_province = excluded.origin_province,
      recipient_name = excluded.recipient_name,
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      postal_code = excluded.postal_code,
      total_packages = excluded.total_packages,
      total_weight = excluded.total_weight,
      total_volume = excluded.total_volume,
      declared_value = excluded.declared_value,
      price = excluded.price,
      carrier_name = excluded.carrier_name,
      carrier_logo = excluded.carrier_logo,
      products_json = excluded.products_json,
      packages_json = excluded.packages_json,
      collection_window_json = excluded.collection_window_json,
      synced_at = CURRENT_TIMESTAMP`,
    args: [
      workspaceId || null,
      String(shipment.id),
      shipment.account_id || null,
      shipment.external_id || null,
      shipment.delivery_id || null,
      shipment.created_at || null,
      createdDate,
      shipment.delivery_time ? JSON.stringify(shipment.delivery_time) : null,
      shipment.status || null,
      shipment.status_name || null,
      shipment.logistic_type || null,
      shipment.service_type || null,
      shipment.tracking || null,
      shipment.tracking_external || null,
      shipment.origin_id || null,
      shipment.origin_name || null,
      shipment.origin_address || null,
      shipment.origin_city || null,
      shipment.origin_province || null,
      shipment.recipient_name || null,
      shipment.recipient_email || null,
      shipment.recipient_phone || null,
      shipment.address || null,
      shipment.city || null,
      shipment.province || null,
      shipment.postal_code || null,
      Number(shipment.total_packages || 0),
      Number(shipment.total_weight || 0),
      Number(shipment.total_volume || 0),
      Number(shipment.declared_value || 0),
      Number(shipment.price || 0),
      shipment.carrier_name || null,
      shipment.carrier_logo || null,
      JSON.stringify(Array.isArray(shipment.products) ? shipment.products : []),
      JSON.stringify(Array.isArray(shipment.packages) ? shipment.packages : []),
      collectionWindow ? JSON.stringify(collectionWindow) : null,
    ],
  });
}

export async function syncZipnovaVisibleShipments({ externalId = '', client = null, workspaceId = null } = {}) {
  await ensureDb();

  const zipnovaClient = client || getDefaultZipnovaClient();
  const results = await zipnovaClient.listShipmentsByStatuses(ZIPNOVA_VISIBLE_STATUSES, { page: 1, externalId });
  const shipmentsBase = results.flatMap((entry) => entry.response?.data || []);
  const shipments = filterVisibleShipments(await enrichShipments(shipmentsBase, zipnovaClient), externalId);
  let addresses = [];
  try {
    const addressResponse = await zipnovaClient.listAddresses({ page: 1 });
    addresses = Array.isArray(addressResponse?.data) ? addressResponse.data : [];
  } catch {
    addresses = [];
  }

  await Promise.all(shipments.map((shipment) => upsertZipnovaShipment(shipment, {
    workspaceId,
    collectionWindow: buildCollectionWindow(shipment, addresses),
  })));
  return shipments.length;
}

export async function listStoredZipnovaToday({ externalId = '', workspaceId = null } = {}) {
  await ensureDb();

  const today = getArgentinaDateOnly(new Date());
  const [result, syncInfo] = await Promise.all([
    db.execute({
    sql: `SELECT *
          FROM zipnova_shipments
          WHERE created_date = ?
            AND (? IS NULL OR workspace_id = ?)
            AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))
          ORDER BY CASE WHEN label_downloaded_at IS NULL THEN 0 ELSE 1 END ASC,
                   external_id ASC,
                   zipnova_id ASC`,
    args: [today, workspaceId, workspaceId, externalId, externalId],
    }),
    db.execute({
      sql: `SELECT MAX(synced_at) AS last_synced_at
            FROM zipnova_shipments
            WHERE created_date = ?
              AND (? IS NULL OR workspace_id = ?)
              AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))`,
      args: [today, workspaceId, workspaceId, externalId, externalId],
    }),
  ]);

  const shipments = (result.rows || []).map(mapLocalRow);
  const collectionShipments = shipments.filter((shipment) => ZIPNOVA_COLLECTION_STATUSES.includes(String(shipment.status || '').toLowerCase()));
  return {
    totalShipments: shipments.length,
    lastSyncedAt: syncInfo.rows[0]?.last_synced_at || null,
    pendingShipments: shipments.filter((shipment) => !shipment.downloaded_at),
    readyShipments: shipments.filter((shipment) => shipment.downloaded_at),
    collectionShipments,
  };
}

export async function markZipnovaShipmentsDownloaded(shipmentIds, actorLabel = null, format = 'pdf') {
  await ensureDb();

  const normalized = [...new Set((shipmentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalized.length) return 0;

  const placeholders = normalized.map(() => '?').join(', ');
  const formatColumn = format === 'zpl' ? 'label_zpl_downloaded_at' : 'label_pdf_downloaded_at';
  const result = await db.execute({
    sql: `UPDATE zipnova_shipments
          SET label_downloaded_at = CURRENT_TIMESTAMP,
              ${formatColumn} = CURRENT_TIMESTAMP,
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
