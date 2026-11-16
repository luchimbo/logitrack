import { db } from './db';
import { hasFlexPartidoConflict, sharedFlexCarrier, verifyFlexPartido } from './flexPartido';
import { assignCarrier } from './zoneMapper';

async function getMercadoLibreAddress(workspaceId, tracking) {
    if (!workspaceId || !tracking) return null;
    const { rows } = await db.execute({
        sql: `SELECT address_json FROM mercadolibre_orders
              WHERE workspace_id = ? AND shipment_id = ? AND json_valid(address_json)
              ORDER BY json_extract(address_json, '$.geolocation_type') = 'ROOFTOP' DESC, synced_at DESC, id DESC
              LIMIT 1`,
        args: [workspaceId, String(tracking)],
    });
    return rows.length ? JSON.parse(rows[0].address_json) : null;
}

export async function assignFlexCarrier(shipment, { workspaceId, mlAddress } = {}) {
    if (shipment.shipping_method?.toLowerCase() !== 'flex') return;
    const conflict = hasFlexPartidoConflict(shipment, mlAddress);
    const carrier = conflict ? null : await assignCarrier(shipment.partido);
    if (carrier) {
        shipment.assigned_carrier ||= carrier;
        return;
    }

    const address = mlAddress ?? await getMercadoLibreAddress(workspaceId, shipment.tracking_number);
    shipment.partido = await verifyFlexPartido(shipment, address);
    shipment.assigned_carrier = shipment.partido
        ? await assignCarrier(shipment.partido)
        : await sharedFlexCarrier(shipment, address, assignCarrier);
}
