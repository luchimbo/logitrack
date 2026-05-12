const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04';

const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  displayFinancialStatus
  displayFulfillmentStatus
  cancelReason
  cancelledAt
  email
  phone
  createdAt
  updatedAt
  currencyCode
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  customer { displayName email phone }
  shippingAddress { name address1 address2 city province provinceCode country zip phone }
  shippingLines(first: 5) { nodes { title carrierIdentifier code source } }
  lineItems(first: 50) { nodes { name quantity sku variantTitle } }
  fulfillments(first: 10) { createdAt status trackingInfo { number company url } }
`;

function normalizeOrderNode(node) {
  return node || null;
}

export function createShopifyClient({ shop, accessToken } = {}) {
  const resolvedShop = String(shop || '').trim();
  const resolvedAccessToken = String(accessToken || '').trim();

  async function graphql(query, variables = {}) {
    if (!resolvedShop || !resolvedAccessToken) {
      throw new Error('Shopify no está configurado');
    }
    const res = await fetch(`https://${resolvedShop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Shopify-Access-Token': resolvedAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errors) {
      const message = data.errors?.[0]?.message || data.error || `Shopify error ${res.status}`;
      throw new Error(message);
    }
    return data.data;
  }

  async function listOrders({ first = 50, after = null, q = '' } = {}) {
    const queryParts = ['status:any'];
    if (q) queryParts.push(String(q));
    const data = await graphql(`
      query Orders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, reverse: true, sortKey: CREATED_AT, query: $query) {
          pageInfo { hasNextPage endCursor }
          nodes { ${ORDER_FIELDS} }
        }
      }
    `, { first, after, query: queryParts.join(' ') });

    return {
      orders: (data.orders?.nodes || []).map(normalizeOrderNode).filter(Boolean),
      pageInfo: data.orders?.pageInfo || { hasNextPage: false, endCursor: null },
    };
  }

  async function getOrder(id) {
    const gid = String(id || '').startsWith('gid://') ? id : `gid://shopify/Order/${id}`;
    const data = await graphql(`
      query Order($id: ID!) {
        order(id: $id) { ${ORDER_FIELDS} }
      }
    `, { id: gid });
    return data.order;
  }

  async function createWebhook({ topic, callbackUrl }) {
    const data = await graphql(`
      mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
          userErrors { field message }
          webhookSubscription { id }
        }
      }
    `, { topic, callbackUrl });
    const errors = data.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) throw new Error(errors[0].message || 'No se pudo crear webhook Shopify');
    return data.webhookSubscriptionCreate?.webhookSubscription;
  }

  async function listWebhooks() {
    const data = await graphql(`
      query WebhookSubscriptions {
        webhookSubscriptions(first: 100) {
          nodes {
            id
            topic
            endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
          }
        }
      }
    `);
    return data.webhookSubscriptions?.nodes || [];
  }

  return { graphql, listOrders, getOrder, createWebhook, listWebhooks };
}
