import { createHmac, timingSafeEqual } from 'node:crypto';

export function createDemoProbeSigner(key) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('Falta la clave del servidor');
  const signature = (encoded) => createHmac('sha256', key).update('crossselling-demo-probe-v2:7570182:' + encoded).digest('hex');
  function encode(state) {
    const encoded = [state.promotionId.replaceAll('-', ''), state.enabled ? state.cartId : '',
      state.triggerVariant || '', state.accessoryVariant || '', Math.floor(state.expiresAt / 1000)].join('.');
    return { encoded, token: signature(encoded) };
  }
  function verify(token, encoded) {
    if (typeof encoded !== 'string' || !encoded || encoded.length > 4096) return null;
    const expected = signature(encoded);
    if (typeof token !== 'string' || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
    const match = /^([a-f0-9]{32})\.(\d{0,30})\.(\d{0,20})\.(\d{0,20})\.(\d{10})$/.exec(encoded);
    if (!match) return null;
    const [, promotion, cartId, triggerVariant, accessoryVariant, expiry] = match;
    const promotionId = promotion.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    return { promotionId, enabled: Boolean(cartId), cartId, triggerVariant, accessoryVariant, expiresAt: Number(expiry) * 1000 };
  }
  return { encode, verify };
}
