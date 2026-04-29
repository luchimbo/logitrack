import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDefaultZipnovaClient, normalizeZipnovaShipment } from '@/lib/zipnovaClient';

export const ZIPNOVA_VISIBLE_STATUSES = ['new', 'documentation_ready', 'ready_to_ship', 'shipped', 'in_transit_to_crossdock'];
export const ZIPNOVA_COLLECTION_STATUSES = ['ready_to_ship'];
const ZIPNOVA_POSSIBLE_COLLECTION_STATUSES = ['new', 'documentation_ready'];
const ZIPNOVA_CONFIRMED_COLLECTION_STATUSES = ['ready_to_ship', 'shipped', 'in_transit_to_crossdock'];

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

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
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

function filterVisibleShipments(shipments, { externalId = '', from = '', to = '' } = {}) {
  return shipments.filter((shipment) => {
    const createdDate = getArgentinaDateOnly(shipment.created_at);
    if (from && createdDate && createdDate < from) return false;
    if (to && createdDate && createdDate > to) return false;
    if (!createdDate && (from || to)) {
      const collectionDate = shipment.collection_window?.date || '';
      if (from && collectionDate && collectionDate < from) return false;
      if (to && collectionDate && collectionDate > to) return false;
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

function sanitizeCollectionPart(value, fallback = 'na') {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function buildCollectionKey({ workspaceId, shipment, collectionWindow }) {
  const date = collectionWindow?.date || getArgentinaDateOnly(shipment.created_at) || getArgentinaDateOnly(new Date());
  return [
    workspaceId || 'global',
    shipment.origin_id || 'origin-na',
    date,
    collectionWindow?.open || 'open-na',
    collectionWindow?.close || 'close-na',
    'zipnova',
  ].map((part) => sanitizeCollectionPart(part)).join('__');
}

function getShipmentCollectionStatus(shipment) {
  const status = String(shipment.status || '').toLowerCase();
  if (ZIPNOVA_CONFIRMED_COLLECTION_STATUSES.includes(status)) return 'confirmed';
  if (ZIPNOVA_POSSIBLE_COLLECTION_STATUSES.includes(status)) return 'possible';
  return 'other';
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
    collection_key: row.collection_key || null,
    downloaded_at: row.label_downloaded_at || null,
    downloaded_by: row.label_downloaded_by || null,
    label_pdf_downloaded_at: row.label_pdf_downloaded_at || null,
    label_zpl_downloaded_at: row.label_zpl_downloaded_at || null,
  };
}

async function upsertZipnovaShipment(shipment, { workspaceId, collectionWindow = null, collectionKey = null } = {}) {
  const createdDate = getArgentinaDateOnly(shipment.created_at);
  await db.execute({
    sql: `INSERT INTO zipnova_shipments (
      workspace_id, zipnova_id, account_id, external_id, delivery_id, created_at_external, created_date,
      delivery_time_json, status, status_name, logistic_type, service_type, tracking, tracking_external,
      origin_id, origin_name, origin_address, origin_city, origin_province,
      recipient_name, recipient_email, recipient_phone, address, city, province,
      postal_code, total_packages, total_weight, total_volume, declared_value, price,
      carrier_name, carrier_logo, products_json, packages_json, collection_window_json, collection_key, synced_at
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
      collection_key = excluded.collection_key,
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
      collectionKey || null,
    ],
  });
}

function aggregateCollections(shipments, { workspaceId }) {
  const groups = new Map();

  for (const shipment of shipments) {
    const collectionKey = shipment.collection_key || buildCollectionKey({ workspaceId, shipment, collectionWindow: shipment.collection_window });
    const current = groups.get(collectionKey) || {
      collectionKey,
      originId: shipment.origin_id || null,
      originName: shipment.collection_window?.originName || shipment.origin_name || 'Origen sin nombre',
      originAddress: shipment.origin_address || '',
      originCity: shipment.origin_city || '',
      originProvince: shipment.origin_province || '',
      scheduledDate: shipment.collection_window?.date || getArgentinaDateOnly(shipment.created_at),
      windowOpen: shipment.collection_window?.open || null,
      windowClose: shipment.collection_window?.close || null,
      cutoffLabel: shipment.delivery_time?.dropoff_deadline_at ? new Date(shipment.delivery_time.dropoff_deadline_at).toLocaleString('es-AR') : null,
      collectorName: 'zipnova',
      shipments: [],
      shipmentsCount: 0,
      packagesCount: 0,
      totalWeight: 0,
      totalVolume: 0,
      statusRank: 'possible',
    };

    const shipmentStatus = getShipmentCollectionStatus(shipment);
    if (shipmentStatus === 'confirmed') current.statusRank = 'confirmed';
    current.shipments.push(shipment);
    current.shipmentsCount += 1;
    current.packagesCount += Number(shipment.total_packages || 0) || 1;
    current.totalWeight += Number(shipment.total_weight || 0);
    current.totalVolume += Number(shipment.total_volume || 0);
    groups.set(collectionKey, current);
  }

  return [...groups.values()].map((collection) => ({
    ...collection,
    status: collection.statusRank === 'confirmed' ? 'confirmed' : 'possible',
  })).sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')) || a.originName.localeCompare(b.originName));
}

async function upsertZipnovaCollections(collections, workspaceId) {
  for (const collection of collections) {
    await db.execute({
      sql: `INSERT INTO zipnova_collections (
        workspace_id, collection_key, origin_id, origin_name, origin_address, origin_city, origin_province,
        scheduled_date, window_open, window_close, cutoff_label, status, collector_name,
        shipments_count, packages_count, total_weight, total_volume, shipment_ids_json, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, collection_key) DO UPDATE SET
        origin_id = excluded.origin_id,
        origin_name = excluded.origin_name,
        origin_address = excluded.origin_address,
        origin_city = excluded.origin_city,
        origin_province = excluded.origin_province,
        scheduled_date = excluded.scheduled_date,
        window_open = excluded.window_open,
        window_close = excluded.window_close,
        cutoff_label = excluded.cutoff_label,
        status = excluded.status,
        collector_name = excluded.collector_name,
        shipments_count = excluded.shipments_count,
        packages_count = excluded.packages_count,
        total_weight = excluded.total_weight,
        total_volume = excluded.total_volume,
        shipment_ids_json = excluded.shipment_ids_json,
        synced_at = CURRENT_TIMESTAMP`,
      args: [
        workspaceId || null,
        collection.collectionKey,
        collection.originId,
        collection.originName,
        collection.originAddress,
        collection.originCity,
        collection.originProvince,
        collection.scheduledDate,
        collection.windowOpen,
        collection.windowClose,
        collection.cutoffLabel,
        collection.status,
        collection.collectorName,
        collection.shipmentsCount,
        collection.packagesCount,
        collection.totalWeight,
        collection.totalVolume,
        JSON.stringify(collection.shipments.map((shipment) => shipment.id)),
      ],
    });
  }
}

export async function syncZipnovaVisibleShipments({ externalId = '', client = null, workspaceId = null, daysAhead = 7 } = {}) {
  await ensureDb();

  const zipnovaClient = client || getDefaultZipnovaClient();
  const from = getArgentinaDateOnly(addDays(new Date(), -7));
  const to = getArgentinaDateOnly(addDays(new Date(), daysAhead));
  const results = await zipnovaClient.listShipmentsByStatuses(ZIPNOVA_VISIBLE_STATUSES, { page: 1, externalId, from, to });
  const shipmentsBase = results.flatMap((entry) => entry.response?.data || []);
  const enrichedShipments = await enrichShipments(shipmentsBase, zipnovaClient);
  let addresses = [];
  try {
    const addressResponse = await zipnovaClient.listAddresses({ page: 1 });
    addresses = Array.isArray(addressResponse?.data) ? addressResponse.data : [];
  } catch {
    addresses = [];
  }

  const shipments = filterVisibleShipments(enrichedShipments.map((shipment) => {
    const collectionWindow = buildCollectionWindow(shipment, addresses);
    const collectionKey = buildCollectionKey({ workspaceId, shipment, collectionWindow });
    return { ...shipment, collection_window: collectionWindow, collection_key: collectionKey };
  }), { externalId, from, to });

  await Promise.all(shipments.map((shipment) => upsertZipnovaShipment(shipment, {
    workspaceId,
    collectionWindow: shipment.collection_window,
    collectionKey: shipment.collection_key,
  })));

  const collections = aggregateCollections(shipments, { workspaceId });
  await upsertZipnovaCollections(collections, workspaceId);
  return shipments.length;
}

export async function listStoredZipnovaToday({ externalId = '', workspaceId = null, daysAhead = 7 } = {}) {
  await ensureDb();

  const from = getArgentinaDateOnly(addDays(new Date(), -7));
  const to = getArgentinaDateOnly(addDays(new Date(), daysAhead));
  const [result, syncInfo] = await Promise.all([
    db.execute({
    sql: `SELECT *
          FROM zipnova_shipments
          WHERE created_date >= ? AND created_date <= ?
            AND (? IS NULL OR workspace_id = ?)
            AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))
          ORDER BY CASE WHEN label_downloaded_at IS NULL THEN 0 ELSE 1 END ASC,
                   external_id ASC,
                   zipnova_id ASC`,
    args: [from, to, workspaceId, workspaceId, externalId, externalId],
    }),
    db.execute({
      sql: `SELECT MAX(synced_at) AS last_synced_at
            FROM zipnova_shipments
            WHERE created_date >= ? AND created_date <= ?
              AND (? IS NULL OR workspace_id = ?)
              AND (? = '' OR LOWER(COALESCE(external_id, '')) = LOWER(?))`,
      args: [from, to, workspaceId, workspaceId, externalId, externalId],
    }),
  ]);

  const shipments = (result.rows || []).map(mapLocalRow);
  const collectionShipments = shipments.filter((shipment) => ZIPNOVA_COLLECTION_STATUSES.includes(String(shipment.status || '').toLowerCase()));
  const collections = aggregateCollections(shipments, { workspaceId });
  return {
    totalShipments: shipments.length,
    lastSyncedAt: syncInfo.rows[0]?.last_synced_at || null,
    pendingShipments: shipments.filter((shipment) => !shipment.downloaded_at),
    readyShipments: shipments.filter((shipment) => shipment.downloaded_at),
    collectionShipments,
    confirmedCollections: collections.filter((collection) => collection.status === 'confirmed'),
    possibleCollections: collections.filter((collection) => collection.status !== 'confirmed'),
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
