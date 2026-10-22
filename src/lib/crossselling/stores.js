// Tiendas donde puede funcionar «Completá tu equipo», con los orígenes desde los que el
// navegador llama a las APIs. Agregar una tienda acá no la activa: falta el interruptor.
export const STOREFRONT_STORES = Object.freeze({
  7570182: { name: 'LogiTrack Prueba', origins: ['https://logitrackprueba.mitiendanube.com'] },
  78394: { name: 'PC MIDI', meliNickname: 'camilopcmidi', origins: ['https://www.pcmidi.com.ar', 'https://pcmidi.com.ar', 'https://tiendahsr.mitiendanube.com'] },
});

// Cuenta de Mercado Libre de la que se leen las opiniones de la tienda (si no hay, la vinculada a su espacio).
export const storeMeliNickname = (storeId) => (isStorefrontStore(storeId) ? STOREFRONT_STORES[String(storeId)].meliNickname || '' : '');
export const isStorefrontStore = (storeId) => Object.hasOwn(STOREFRONT_STORES, String(storeId));
export const storeOrigins = (storeId) => (isStorefrontStore(storeId) ? STOREFRONT_STORES[String(storeId)].origins : []);
