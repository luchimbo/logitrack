import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiendanubeClient } from '../src/lib/tiendanubeClient.js';
test('orders: empty Tiendanube pagination is an empty list, other 404s remain errors', async () => {
 const original = globalThis.fetch;
 const client = createTiendanubeClient({storeId:'78394',accessToken:'test'});
 try {
  globalThis.fetch = async () => Response.json({message:'Not Found',description:'Last page is 0'},{status:404});
  assert.deepEqual(await client.listOrders({updatedAtMin:'2026-10-23T03:00:00Z'}),[]);
  globalThis.fetch = async () => Response.json({message:'Not Found'},{status:404});
  await assert.rejects(client.listOrders(),e=>e.status===404);
 } finally {globalThis.fetch=original;}
});
