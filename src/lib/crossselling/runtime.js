import { db } from '@/lib/db';
import { findIntegrationByConfigValue, findIntegrationConnectionByStore } from '@/lib/integrationService';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { createCrossSellingRepository } from './repository.js';
import { createCrossSellingService } from './service.js';

export const crossSellingService = createCrossSellingService({
  repository: createCrossSellingRepository(db),
  lookupConnection: async (storeId) => await findIntegrationConnectionByStore({ provider: 'tiendanube', externalStoreId: storeId, includeConfig: true }) ||
    await findIntegrationByConfigValue({ provider: 'tiendanube', key: 'storeId', value: storeId }),
  clientFor: (c) => createTiendanubeClient({ accessToken: c.config.accessToken, storeId: c.config.storeId }),
});
