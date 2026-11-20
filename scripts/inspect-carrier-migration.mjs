import { createClient } from '@libsql/client';
import { productionDatabaseConfig } from './database-env.mjs';
import { migrateCarrierReferences } from '../src/lib/carrierScopeMigration.js';

// This inventory deliberately uses the read-only credential and cannot apply changes.
const db = createClient(productionDatabaseConfig({ readOnly: true }));
try {
  const plan = await migrateCarrierReferences(db);
  console.log(JSON.stringify({ mappings: plan.length, workspaces: [...new Set(plan.map(x => x.workspaceId))].length, existing: plan.filter(x => x.newId).length, toCreate: plan.filter(x => !x.newId).length }));
} finally { db.close(); }
