// Solo un rechazo definitivo del refresh obliga a reconectar; un corte de red o un 5xx no.
export function isMercadoLibreReauthError(error) {
  if (error?.code === 'invalid_grant') return true;
  const status = Number(error?.status || 0);
  return (status === 400 || status === 401) && /invalid.?grant|expired|revoked/i.test(String(error?.message || ''));
}
