/**
 * Notifica a GeoModi para sincronizar la planilla apenas cambia.
 *
 * Configuración (una sola vez):
 * 1. En Apps Script > Project Settings > Script properties, crear:
 *    - GEOMODI_SYNC_URL: https://TU-DOMINIO/api/cron/sheets-sync
 *    - GOOGLE_SHEET_WEBHOOK_SECRET: el mismo valor configurado en GeoModi
 * 2. En Triggers, crear triggers instalables para onFormSubmit y onSheetEdit.
 */
function notifyGeoModiSync_() {
  const properties = PropertiesService.getScriptProperties();
  const syncUrl = properties.getProperty('GEOMODI_SYNC_URL');
  const secret = properties.getProperty('GOOGLE_SHEET_WEBHOOK_SECRET');

  if (!syncUrl || !secret) {
    throw new Error('Faltan GEOMODI_SYNC_URL o GOOGLE_SHEET_WEBHOOK_SECRET en Script properties.');
  }

  const response = UrlFetchApp.fetch(syncUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${secret}` },
    payload: JSON.stringify({ source: 'google-sheets' }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(`GeoModi respondió ${response.getResponseCode()}: ${response.getContentText()}`);
  }
}

function onFormSubmit(e) {
  notifyGeoModiSync_();
}

function onSheetEdit(e) {
  notifyGeoModiSync_();
}
