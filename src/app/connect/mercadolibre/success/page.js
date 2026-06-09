export const metadata = { title: 'Cuenta conectada — Mercado Libre' };

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb', fontFamily: 'system-ui, -apple-system, sans-serif' },
  card: { background: '#fff', borderRadius: '16px', padding: '48px 40px', maxWidth: '420px', width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
  check: { fontSize: '48px', marginBottom: '8px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#111', margin: '0 0 8px' },
  subtitle: { fontSize: '14px', color: '#666', margin: '0 0 0', lineHeight: 1.5 },
  nickname: { fontWeight: 700, color: '#111' },
  error: { background: '#fff1f0', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', fontSize: '14px' },
};

export default function MercadoLibreSuccessPage({ searchParams }) {
  const nickname = searchParams?.nickname || '';
  const error = searchParams?.error || '';

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>❌</div>
          <h1 style={styles.title}>No se pudo conectar la cuenta</h1>
          <div style={styles.error}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.check}>✅</div>
        <h1 style={styles.title}>¡Cuenta conectada!</h1>
        <p style={styles.subtitle}>
          {nickname ? (
            <>La cuenta <span style={styles.nickname}>{nickname}</span> fue conectada exitosamente a GeoModi.</>
          ) : (
            'Tu cuenta de Mercado Libre fue conectada exitosamente a GeoModi.'
          )}
          {' '}Podés cerrar esta ventana.
        </p>
      </div>
    </div>
  );
}
