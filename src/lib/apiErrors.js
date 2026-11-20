// Mensajes de error pensados para quien opera, no para quien programa.
export const NETWORK_ERROR_MESSAGE = 'No pudimos conectar. Revisá tu internet y reintentá.';
export const SESSION_ERROR_MESSAGE = 'Tu sesión venció. Volvé a ingresar.';
export const SERVER_ERROR_MESSAGE = 'Tuvimos un problema de nuestro lado. Reintentá en unos minutos.';

export function messageForStatus(status, serverMessage) {
  if (status === 401) return SESSION_ERROR_MESSAGE;
  // 500 conserva el mensaje del servidor (muchas rutas lo redactan para el usuario);
  // los cortes de pasarela o tiempo agotado no traen ninguno útil.
  if ([502, 503, 504].includes(status) || (status >= 500 && !serverMessage)) return SERVER_ERROR_MESSAGE;
  return serverMessage || `Error ${status}`;
}

// Convierte el rechazo crudo de fetch ("Failed to fetch", "Load failed") en un mensaje claro.
export function friendlyNetworkError(error) {
  const wrapped = new Error(NETWORK_ERROR_MESSAGE);
  wrapped.cause = error;
  wrapped.isNetworkError = true;
  return wrapped;
}
