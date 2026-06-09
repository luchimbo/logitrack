import { validateMercadoLibreInvite } from '@/lib/mercadolibreInvite';

export const metadata = { title: 'Conectar cuenta de Mercado Libre' };

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb', fontFamily: 'system-ui, -apple-system, sans-serif' },
  card: { background: '#fff', borderRadius: '16px', padding: '48px 40px', maxWidth: '420px', width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
  logo: { fontSize: '32px', marginBottom: '8px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 8px' },
  subtitle: { fontSize: '14px', color: '#666', margin: '0 0 32px', lineHeight: 1.5 },
  button: { display: 'inline-block', background: '#FFE600', color: '#333', fontWeight: 700, fontSize: '16px', padding: '14px 28px', borderRadius: '8px', textDecoration: 'none', width: '100%', boxSizing: 'border-box' },
  expiry: { fontSize: '12px', color: '#999', marginTop: '20px' },
  error: { background: '#fff1f0', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', fontSize: '14px', marginBottom: '24px' },
};

export default async function MercadoLibreConnectPage({ params, searchParams }) {
  const token = params?.token || '';
  const errorParam = searchParams?.error || '';

  let valid = false;
  let expired = false;
  let expiresAt = '';

  if (!errorParam) {
    try {
      const invite = await validateMercadoLibreInvite(token);
      valid = true;
      expiresAt = invite.expires_at || '';
    } catch {
      expired = true;
    }
  }

  const authorizeUrl = `/api/connect/mercadolibre/${token}`;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🛒</div>
        <h1 style={styles.title}>Conectar cuenta de Mercado Libre</h1>
        <p style={styles.subtitle}>
          Al conectar tu cuenta, GeoModi podrá sincronizar tus ventas y gestionar el despacho de tus envíos automáticamente.
        </p>

        {errorParam && (
          <div style={styles.error}>{errorParam}</div>
        )}

        {expired && !errorParam && (
          <div style={styles.error}>Este link de invitación es inválido o ya expiró. Pedile uno nuevo al operador de GeoModi.</div>
        )}

        {(valid || errorParam) && (
          <a href={authorizeUrl} style={styles.button}>
            Conectar con Mercado Libre
          </a>
        )}

        {valid && expiresAt && (
          <p style={styles.expiry}>
            Link válido hasta {new Date(expiresAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
      </div>
    </div>
  );
}
