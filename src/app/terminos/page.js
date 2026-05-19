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

const permissions = [
  ["read_orders", "Leer pedidos para mostrarlos en GeoModi."],
  ["write_fulfillment_orders", "Actualizar estados de despacho cuando el usuario lo solicita."],
  ["Webhooks", "Recibir cambios de pedidos sin consultar la API constantemente."],
];

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
        <h2>Índice</h2>
        <p>1. Términos y condiciones del servicio</p>
        <p>2. Integraciones, permisos y uso de datos</p>
        <p>3. Política de uso aceptable</p>
      </section>

      <section style={cardStyle}>
        <h2>Titular del servicio</h2>
        <p>GeoModi es una plataforma SaaS orientada a operaciones de e-commerce, preparación logística, picking y despacho.</p>
        <p>Para contacto legal o soporte, escribí a soporte@geomodi.com.</p>
      </section>

      <section style={cardStyle}>
        <h2>Registro y aceptación</h2>
        <p>El usuario administrador declara tener facultades para conectar integraciones, aceptar estos términos y operar el workspace en nombre propio o de la empresa que representa.</p>
        <p>El uso de GeoModi implica la aceptación de estos términos por parte del usuario y de los colaboradores habilitados en la plataforma.</p>
      </section>

      <section style={cardStyle}>
        <h2>Uso del servicio</h2>
        <p>GeoModi centraliza información operativa de canales e integraciones para facilitar la preparación logística.</p>
        <p>El usuario es responsable de revisar la información antes de ejecutar acciones de despacho o actualización de estados.</p>
        <p>GeoModi no es un WMS, no reemplaza un ERP, no gestiona stock y no presta servicios de transporte. Es una herramienta de apoyo operativo para ordenar pedidos, etiquetas, picking y despacho.</p>
      </section>

      <section style={cardStyle}>
        <h2>Integraciones</h2>
        <p>Las integraciones, incluida Tiendanube, requieren autorización del usuario o administrador del workspace.</p>
        <p>Podés desconectar la integración en cualquier momento.</p>
      </section>

      <section style={{ ...cardStyle, background: "#f8fafc", color: "#111827" }}>
        <span style={{ display: "inline-flex", marginBottom: "14px", padding: "7px 11px", border: "1px solid rgba(37, 99, 235, 0.18)", borderRadius: "999px", background: "rgba(37, 99, 235, 0.07)", color: "#1d4ed8", fontSize: "11px", fontWeight: 900, letterSpacing: "0.11em", textTransform: "uppercase" }}>
          Permisos y uso de datos
        </span>
        <h2 style={{ margin: "0 0 22px", fontSize: "34px", lineHeight: 1.05 }}>Permisos claros para operar pedidos y despachos</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px" }}>
          {permissions.map(([scope, text]) => (
            <article key={scope} style={{ padding: "22px", border: "1px solid rgba(15, 23, 42, 0.08)", borderRadius: "18px", background: "#ffffff" }}>
              <code style={{ display: "inline-flex", marginBottom: "16px", padding: "7px 10px", borderRadius: "999px", background: "rgba(37, 99, 235, 0.09)", color: "#1d4ed8", fontSize: "12px", fontWeight: 900 }}>{scope}</code>
              <p style={{ margin: 0, color: "#64748b", lineHeight: 1.65 }}>{text}</p>
            </article>
          ))}
        </div>
        <p style={{ margin: "22px 0 0", padding: "16px 18px", border: "1px solid rgba(22, 163, 74, 0.18)", borderRadius: "18px", background: "rgba(22, 163, 74, 0.08)", color: "#166534", fontWeight: 850 }}>
          GeoModi no modifica pedidos automáticamente sin acción del usuario.
        </p>
      </section>

      <section style={cardStyle}>
        <h2>Acciones sobre pedidos</h2>
        <p>GeoModi no modifica pedidos automáticamente sin acción del usuario. Las actualizaciones se realizan cuando el usuario las solicita desde la app.</p>
        <p>La plataforma puede actuar como middleware entre GeoModi y servicios externos para leer información operativa y actualizar determinados estados cuando corresponde.</p>
      </section>

      <section style={cardStyle}>
        <h2>Integraciones con terceros</h2>
        <p>El funcionamiento de integraciones depende de servicios externos como Tiendanube, Mercado Libre, operadores logísticos o APIs de terceros.</p>
        <p>GeoModi no controla ni garantiza la disponibilidad continua de esos servicios externos.</p>
      </section>

      <section style={cardStyle}>
        <h2>Métricas y trazabilidad</h2>
        <p>Las métricas y registros generados por GeoModi tienen fines operativos. GeoModi no toma decisiones automáticas sobre personas.</p>
        <p>El cliente es responsable de informar a sus empleados y colaboradores cómo utiliza internamente la información operativa.</p>
      </section>

      <section style={cardStyle}>
        <h2>Propiedad intelectual</h2>
        <p>El software, marca, diseño y documentación de GeoModi pertenecen a sus titulares. El usuario recibe una licencia limitada de uso mientras mantenga acceso a la plataforma.</p>
        <p>Está prohibida la copia, reventa, sublicencia, ingeniería inversa o uso no autorizado del servicio.</p>
      </section>

      <section style={cardStyle}>
        <h2>Uso aceptable</h2>
        <p>GeoModi debe utilizarse de manera responsable y conforme a la ley. Está prohibido vulnerar la seguridad, compartir credenciales indebidamente, manipular datos de forma fraudulenta o usar la plataforma para fines ilícitos.</p>
      </section>

      <section style={cardStyle}>
        <h2>Limitación de responsabilidad</h2>
        <p>GeoModi se brinda según disponibilidad. No garantiza eliminación total de errores, continuidad ininterrumpida, resultados económicos ni cumplimiento de plazos de operadores externos.</p>
      </section>

      <section style={cardStyle}>
        <h2>Soporte</h2>
        <p>Para consultas, escribí a soporte@geomodi.com. Respondemos dentro de las 24-48 horas hábiles.</p>
      </section>
    </main>
  );
}
