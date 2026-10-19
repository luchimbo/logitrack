// Tiendas donde puede funcionar «Completá tu equipo», con los orígenes desde los que el
// navegador llama a las APIs. Agregar una tienda acá no la activa: falta el interruptor.
export const STOREFRONT_STORES = Object.freeze({
  7570182: { name: 'LogiTrack Prueba', origins: ['https://logitrackprueba.mitiendanube.com'] },
  78394: { name: 'PC MIDI', origins: ['https://www.pcmidi.com.ar', 'https://pcmidi.com.ar', 'https://tiendahsr.mitiendanube.com'] },
});

export const isStorefrontStore = (storeId) => Object.hasOwn(STOREFRONT_STORES, String(storeId));
export const storeOrigins = (storeId) => (isStorefrontStore(storeId) ? STOREFRONT_STORES[String(storeId)].origins : []);
