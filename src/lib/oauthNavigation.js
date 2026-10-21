// Destinos de OAuth limitados a la aplicación y a parámetros conocidos.
// Nunca usar un returnTo externo enviado por el navegador como redirección.
export function tiendanubeReturnPath({ storeId, error } = {}) {
  const params = new URLSearchParams({ tab: 'tiendanube' });
  if (/^\d{1,20}$/.test(String(storeId || ''))) params.set('tiendanube_store_id', String(storeId));
  if (typeof error === 'string' && error) params.set('tiendanube_error', error.slice(0, 500));
  return `/app?${params}`;
}

export function legacyTiendanubeReturn(params) {
  const storeId = params.get('tiendanube_store_id'), error = params.get('tiendanube_error');
  if (!/^\d{1,20}$/.test(storeId || '') && !error) return null;
  return tiendanubeReturnPath({ storeId, error });
}

export function safeAppReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/app') || value.length > 3000) return '/app';
  try {
    const url = new URL(value, 'https://internal.invalid');
    if (url.origin !== 'https://internal.invalid' || url.pathname !== '/app') return '/app';
    const oauth = legacyTiendanubeReturn(url.searchParams);
    if (oauth) return oauth;
    return '/app';
  } catch { return '/app'; }
}

export function loginPath(value) {
  const returnTo = safeAppReturn(value);
  return returnTo === '/app' ? '/login' : `/login?${new URLSearchParams({ returnTo })}`;
}

export function signupPath(value) {
  const returnTo = safeAppReturn(value);
  return returnTo === '/app' ? '/sign-up' : `/sign-up?${new URLSearchParams({ returnTo })}`;
}
