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
  title: "Términos y condiciones | GeoModi",
  description: "Términos de uso de GeoModi.",
};

export default function TermsPage() {
  return (
    <main style={sectionStyle}>
      <Link href="/" style={{ color: "#93c5fd", fontWeight: 700 }}>Volver a GeoModi</Link>
      <h1 style={{ margin: "22px 0 12px", fontSize: "42px", lineHeight: 1 }}>Términos y condiciones</h1>
      <p style={{ color: "#94a3b8", fontSize: "17px", lineHeight: 1.7 }}>
        Al usar GeoModi aceptás estos términos para gestionar pedidos, picking, etiquetas y despachos desde la plataforma.
      </p>

      <section style={cardStyle}>
        <h2>Uso del servicio</h2>
        <p>GeoModi centraliza información operativa de canales e integraciones para facilitar la preparación logística.</p>
        <p>El usuario es responsable de revisar la información antes de ejecutar acciones de despacho o actualización de estados.</p>
      </section>

      <section style={cardStyle}>
        <h2>Integraciones</h2>
        <p>Las integraciones, incluida Tiendanube, requieren autorización del usuario o administrador del workspace.</p>
        <p>Podés desconectar la integración en cualquier momento.</p>
      </section>

      <section style={cardStyle}>
        <h2>Acciones sobre pedidos</h2>
        <p>GeoModi no modifica pedidos automáticamente sin acción del usuario. Las actualizaciones se realizan cuando el usuario las solicita desde la app.</p>
      </section>

      <section style={cardStyle}>
        <h2>Soporte</h2>
        <p>Para consultas, escribí a soporte@geomodi.com. Respondemos dentro de las 24-48 horas hábiles.</p>
      </section>
    </main>
  );
}
