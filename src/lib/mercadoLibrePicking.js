import { classifyDispatch, deriveLabelBuffering } from './mercadolibreLogistics.js';

const PICKING_STATUSES = ['handling', 'ready_to_ship'];

export async function listMercadoLibrePickingPackages(client, sellerId, signal) {
    const ordersByShipment = new Map();
    const limit = 50;
    for (const shippingStatus of PICKING_STATUSES) {
        let offset = 0;
        while (true) {
            const page = await client.searchOrders({ sellerId, shippingStatus, offset, limit, signal });
            if (!Array.isArray(page?.results)) throw new Error('Respuesta de órdenes inválida');
            for (const order of page.results) {
                const shipmentId = String(order.shipping?.id || '');
                if (!shipmentId || !order.id) continue;
                if (!ordersByShipment.has(shipmentId)) ordersByShipment.set(shipmentId, new Map());
                ordersByShipment.get(shipmentId).set(String(order.id), order);
            }
            offset += page.results.length;
            const total = page.paging?.total;
            if (typeof total === 'number' ? offset >= total : page.results.length < limit) break;
            if (!page.results.length) throw new Error('Paginación de órdenes incompleta');
        }
    }

    const candidates = [...ordersByShipment];
    const packages = [];
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
        while (index < candidates.length) {
            const [shipmentId, orders] = candidates[index++];
            const shipment = await client.getShipment(shipmentId, { signal });
            const shipmentStatus = shipment.status;
            const shipmentSubstatus = shipment.substatus;
            const logisticType = shipment.logistic?.type;
            if (!PICKING_STATUSES.includes(shipmentStatus) || logisticType === 'fulfillment') continue;
            if (classifyDispatch({ shipmentStatus, shipmentSubstatus }) === 'dispatched') continue;
            if (deriveLabelBuffering({ shipmentStatus, shipmentSubstatus, leadTime: shipment.lead_time })) continue;
            if ([...orders.values()].some((order) => order.tags?.includes('fraud_risk_detected'))) continue;

            const shippingMethod = logisticType === 'self_service' ? 'flex' : 'colecta';
            const soldItems = new Map();
            for (const order of orders.values()) {
                for (const { item } of order.order_items || []) {
                    if (item?.id) soldItems.set(itemKey(item.id, item.variation_id), item);
                }
            }
            const contents = await client.getShipmentItems(shipmentId, { signal });
            if (!Array.isArray(contents)) throw new Error(`Contenido del envío ${shipmentId} inválido`);
            const products = contents
                .filter((item) => !item.sender_id || String(item.sender_id) === String(sellerId))
                .map((item) => {
                    const key = itemKey(item.item_id, item.variation_id);
                    const sold = soldItems.get(key);
                    const attributes = sold?.variation_attributes || [];
                    const color = attributes.find((attr) => attr.id === 'COLOR')?.value_name || '';
                    const variants = attributes.filter((attr) => attr.id !== 'COLOR').map((attr) => attr.value_name).filter(Boolean);
                    const sku = sold?.seller_sku || sold?.seller_custom_field || '';
                    const description = sold?.title || item.description || item.item_id;
                    if (!sku && item.variation_id && !attributes.length) variants.push(`Variante ${item.variation_id}`);
                    const quantity = Number(item.quantity);
                    if (!item.item_id || !Number.isInteger(quantity) || quantity < 1) {
                        throw new Error(`Producto del envío ${shipmentId} inválido`);
                    }
                    return { key, itemId: String(item.item_id), name: [description, ...variants].join(' · '), sku, color, quantity };
                });
            if (!products.length) throw new Error(`Sin productos en el envío ${shipmentId}`);
            packages.push({ key: JSON.stringify([String(sellerId), shipmentId]), shippingMethod, products });
        }
    }));
    return packages;
}

function itemKey(id, variationId) {
    return JSON.stringify([String(id), String(variationId || '')]);
}

export function groupPickingProducts(packages) {
    const products = new Map();
    for (const shipment of packages) {
        for (const { key, itemId, name, sku, color, quantity } of shipment.products) {
            const groupKey = JSON.stringify([name, sku, color, sku ? '' : key, shipment.shippingMethod]);
            if (!products.has(groupKey)) {
                products.set(groupKey, {
                    key: groupKey,
                    product_name: name,
                    sku,
                    color,
                    shipping_method: shipment.shippingMethod,
                    total_quantity: 0,
                    shipments: new Set(),
                    itemIds: new Set(),
                });
            }
            const product = products.get(groupKey);
            product.total_quantity += quantity;
            product.shipments.add(shipment.key);
            if (itemId) product.itemIds.add(itemId);
        }
    }
    return [...products.values()]
        .map(({ shipments, itemIds, ...product }) => ({ ...product, item_ids: [...itemIds], shipment_count: shipments.size }))
        .sort((a, b) => b.total_quantity - a.total_quantity || a.product_name.localeCompare(b.product_name, 'es') || a.key.localeCompare(b.key));
}
