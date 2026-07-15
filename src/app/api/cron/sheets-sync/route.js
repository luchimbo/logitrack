import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// A helper to parse CSV with support for quoted columns and newlines
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentLine.push(currentCell.trim());
      lines.push(currentLine);
      currentCell = '';
      currentLine = [];
    } else {
      currentCell += char;
    }
  }
  
  if (currentCell || currentLine.length > 0) {
    currentLine.push(currentCell.trim());
    lines.push(currentLine);
  }
  
  return lines;
}

async function syncShipments(request) {
  try {
    await ensureDb();
    
    let workspaceId = null;
    
    // 1. Check if authorized via CRON secret
    const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') || '';
    const isCron = secret && authHeader === `Bearer ${secret}`;
    
    if (isCron) {
      // For cron job, default to workspace with slug 'legacy' (GeoModi)
      workspaceId = 1; // fallback - will work if legacy is ID 1
    } else {
      // 2. Otherwise check if user is logged in
      const authResult = await requireWorkspaceActor(request);
      if (authResult.error) {
        return NextResponse.json(authResult.error.body, { status: authResult.error.status });
      }
      workspaceId = authResult.actor.workspaceId;
      const workspaceSlug = authResult.actor.workspaceSlug;
      
      // Only allow for GeoModi workspace (slug = 'legacy')
      if (workspaceSlug !== 'legacy') {
        return NextResponse.json({ error: 'Funcionalidad reservada para GeoModi (camilopcmidi)' }, { status: 403 });
      }
    }
    
    const csvUrl = process.env.GOOGLE_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1NPh0LvQKXCNqCVlmuqEnrgKSFlhbKucaj8GI6okT694/export?format=csv&gid=1547683215';
    
    const res = await fetch(csvUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Error al descargar la planilla: ${res.statusText}`);
    }
    
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    
    if (rows.length < 2) {
      return NextResponse.json({ ok: true, message: 'La planilla está vacía', count: 0 });
    }
    
    // Skip header row
    const dataRows = rows.slice(1);
    let newCount = 0;
    let updatedCount = 0;
    const existingResult = await db.execute({
      sql: 'SELECT id, row_index, timestamp, packed, dispatched FROM google_sheets_shipments WHERE workspace_id = ?',
      args: [workspaceId]
    });
    const existingByRow = new Map(
      existingResult.rows.map((record) => [
        `${record.row_index}\u0000${record.timestamp || ''}`,
        record
      ])
    );
    const changes = [];
    
    for (let index = 0; index < dataRows.length; index++) {
      const row = dataRows[index];
      // Google Sheet rows are 1-indexed, and header is row 1. So row index in spreadsheet = index + 2.
      const rowIndex = index + 2;
      
      const timestamp = row[0] || '';
      const clientName = row[1] || '';
      const orderId = row[2] || '';
      const productName = row[3] || '';
      const address = row[4] || '';
      const floorDepto = row[5] || '';
      const city = row[6] || '';
      const province = row[7] || '';
      const postalCode = row[8] || '';
      const phone = row[9] || '';
      const dni = row[10] || '';
      const notes = row[11] || '';
      const responsible = row[12] || '';
      const packedStr = String(row[13] || '').trim().toLowerCase();
      const dispatchedStr = String(row[14] || '').trim().toLowerCase();
      const shippingMethod = row[15] || '';
      const trackingNumber = row[16] || '';
      
      const isPacked = ['true', 'verdadero', 'verdad', 'si', 'sí', '1'].includes(packedStr) ? 1 : 0;
      const isDispatched = ['true', 'verdadero', 'verdad', 'si', 'sí', '1'].includes(dispatchedStr) ? 1 : 0;
      
      if (!timestamp && !clientName && !orderId && !productName) {
        // Skip empty lines
        continue;
      }
      
      const record = existingByRow.get(`${rowIndex}\u0000${timestamp}`);
      if (record) {
        // If it exists, update it if things changed in the sheet
        if (record.packed !== isPacked || record.dispatched !== isDispatched) {
          changes.push({
            sql: 'UPDATE google_sheets_shipments SET packed = ?, dispatched = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?',
            args: [isPacked, isDispatched, record.id]
          });
          updatedCount++;
        }
      } else {
        // Insert new shipment
        // Set notified to 0 initially so the UI can detect new records
        changes.push({
          sql: `INSERT INTO google_sheets_shipments (
            workspace_id, row_index, timestamp, client_name, order_id, product_name,
            address, floor_depto, city, province, postal_code, phone, dni,
            notes, responsible, packed, dispatched, shipping_method, tracking_number, notified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          args: [
            workspaceId, rowIndex, timestamp, clientName, orderId, productName,
            address, floorDepto, city, province, postalCode, phone, dni,
            notes, responsible, isPacked, isDispatched, shippingMethod, trackingNumber
          ]
        });
        newCount++;
      }
    }

    // One network round trip per chunk instead of two queries for every row.
    // This makes manual sync fast even when the sheet has a long history.
    const batchSize = 100;
    for (let offset = 0; offset < changes.length; offset += batchSize) {
      await db.batch(changes.slice(offset, offset + batchSize));
    }
    
    return NextResponse.json({
      ok: true,
      workspaceId,
      processed: dataRows.length,
      newShipments: newCount,
      updatedShipments: updatedCount,
      syncedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error syncing Google Sheets:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}

// Google Apps Script calls this endpoint after a form submission or an edit.
// GET remains available for the authenticated in-app manual sync and cron jobs.
export async function GET(request) {
  return syncShipments(request);
}

export async function POST(request) {
  return syncShipments(request);
}
