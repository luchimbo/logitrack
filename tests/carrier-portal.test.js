import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarrierPortalPublicId, createCarrierPortalSecret, isValidCarrierPortalSecret } from '../src/lib/carrierPortal.js';

test('carrier portal secrets are deterministic per link and reject a different link', () => {
  const originalSecret = process.env.CARRIER_PORTAL_SIGNING_SECRET;
  process.env.CARRIER_PORTAL_SIGNING_SECRET = 'a'.repeat(48);
  try {
    const link = { public_id: createCarrierPortalPublicId(), workspace_id: 7, carrier_id: 12 };
    const secret = createCarrierPortalSecret({ publicId: link.public_id, workspaceId: link.workspace_id, carrierId: link.carrier_id });
    assert.equal(isValidCarrierPortalSecret(link, secret), true);
    assert.equal(isValidCarrierPortalSecret({ ...link, carrier_id: 13 }, secret), false);
    assert.equal(isValidCarrierPortalSecret(link, 'invalid'), false);
  } finally {
    if (originalSecret === undefined) delete process.env.CARRIER_PORTAL_SIGNING_SECRET;
    else process.env.CARRIER_PORTAL_SIGNING_SECRET = originalSecret;
  }
});
