import { lookupCrossSellingConnection } from '@/lib/crossselling/runtime';
import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { changeOffer, offerStatus } from '@/lib/crossselling/storefront-runtime';
import { createModuleHandler } from '@/lib/crossselling/module-endpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handle = createModuleHandler({ authorize: authorizePublication, lookupConnection: lookupCrossSellingConnection, offerStatus, changeOffer });
export const GET = handle;
export const PUT = handle;
