import Link from "next/link";

const sectionStyle = {
  width: "min(880px, calc(100% - 32px))",
  margin: "0 auto",
  padding: "56px 0",
  color: "#f1f5f9",
};

const cardStyle = {
  marginTop: "24px",
  padding: "28px",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: "18px",
  background: "#111827",
};

export const metadata = {
  title: "Política de privacidad | GeoModi",
  description: "Política de privacidad de GeoModi para integraciones logísticas y Tiendanube.",
};

export default function PrivacyPage() {
  return (
    <main style={sectionStyle}>
      <Link href="/" style={{ color: "#93c5fd", fontWeight: 700 }}>Volver a GeoModi</Link>
      <h1 style={{ margin: "22px 0 12px", fontSize: "42px", lineHeight: 1 }}>Política de privacidad</h1>
      <p style={{ color: "#94a3b8", fontSize: "17px", lineHeight: 1.7 }}>
        GeoModi usa los datos únicamente para gestión logística, picking y despacho. Esta política describe
        cómo tratamos la información recibida desde Tiendanube y otros canales operativos.
      </p>

      <section style={cardStyle}>
        <h2>Datos que usamos</h2>
        <p>Podemos procesar pedidos, productos, datos de envío, estados operativos, transportistas y eventos de webhook necesarios para operar la preparación y el despacho.</p>
        <p>No vendemos datos de merchants ni los usamos para fines publicitarios.</p>
      </section>

      <section style={cardStyle}>
        <h2>Tiendanube</h2>
        <p>GeoModi usa webhooks de Tiendanube para recibir actualizaciones de pedidos. La sincronización manual existe solo como respaldo operativo.</p>
        <p>GeoModi no modifica pedidos automáticamente sin acción del usuario.</p>
      </section>

      <section style={cardStyle}>
        <h2>Seguridad</h2>
        <p>Los tokens se guardan cifrados y los webhooks se validan con firma cuando corresponde.</p>
        <p>El usuario puede desconectar la integración cuando quiera.</p>
      </section>

      <section style={cardStyle}>
        <h2>Borrado y exportación</h2>
        <p>GeoModi responde solicitudes de borrado y exportación de datos. Para solicitarlo, escribí a soporte@geomodi.com.</p>
      </section>
    </main>
  );
}
