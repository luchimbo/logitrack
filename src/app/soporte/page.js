import Link from "next/link";

export const metadata = {
  title: "Soporte | GeoModi",
  description: "Contacto y soporte de GeoModi.",
};

export default function SupportPage() {
  return (
    <main style={{ width: "min(880px, calc(100% - 32px))", margin: "0 auto", padding: "56px 0", color: "#f1f5f9" }}>
      <Link href="/" style={{ color: "#93c5fd", fontWeight: 700 }}>Volver a GeoModi</Link>
      <h1 style={{ margin: "22px 0 12px", fontSize: "42px", lineHeight: 1 }}>Soporte y contacto</h1>
      <p style={{ color: "#94a3b8", fontSize: "17px", lineHeight: 1.7 }}>
        Si necesitás ayuda con GeoModi o la integración con Tiendanube, contactanos por email.
      </p>

      <section style={{ marginTop: "24px", padding: "28px", border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: "18px", background: "#111827" }}>
        <h2>Canal de soporte</h2>
        <p>Email: <a href="mailto:soporte@geomodi.com" style={{ color: "#93c5fd", fontWeight: 700 }}>soporte@geomodi.com</a></p>
        <p>Respondemos dentro de las 24-48 horas hábiles.</p>
      </section>

      <section style={{ marginTop: "24px", padding: "28px", border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: "18px", background: "#111827" }}>
        <h2>Solicitudes de datos</h2>
        <p>Podés solicitar exportación o borrado de datos escribiendo a soporte@geomodi.com.</p>
      </section>
    </main>
  );
}
