import { db } from '@/lib/db';
import { findIntegrationByConfigValue, findIntegrationConnectionByStore } from '@/lib/integrationService';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { createCrossSellingRepository } from './repository.js';
import { createCrossSellingService } from './service.js';

export const lookupCrossSellingConnection = async (storeId) => await findIntegrationConnectionByStore({ provider: 'tiendanube', externalStoreId: storeId, includeConfig: true }) ||
  await findIntegrationByConfigValue({ provider: 'tiendanube', key: 'storeId', value: storeId });

export const crossSellingService = createCrossSellingService({
  repository: createCrossSellingRepository(db),
  lookupConnection: lookupCrossSellingConnection,
  clientFor: (c) => createTiendanubeClient({ accessToken: c.config.accessToken, storeId: c.config.storeId }),
});
