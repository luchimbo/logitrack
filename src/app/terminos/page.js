import Image from "next/image";
import Link from "next/link";
import styles from "../legal.module.css";

const permissions = [
  ["read_orders", "Leer pedidos para mostrarlos en GeoModi."],
  ["write_fulfillment_orders", "Actualizar estados de despacho cuando el usuario lo solicita."],
  ["Webhooks", "Recibir cambios de pedidos sin consultar la API constantemente."],
];

export const metadata = {
  title: "Términos y condiciones | GeoModi",
  description: "Términos de uso de GeoModi para picking, etiquetas, integraciones y despacho.",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/">
            <Image src="/logoGeoModi.png" alt="GeoModi" width={148} height={44} priority />
          </Link>
          <nav className={styles.nav} aria-label="Navegación principal">
            <Link href="/#funciones">Funciones</Link>
            <Link href="/#integraciones">Integraciones</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
            <Link href="/soporte">Soporte</Link>
          </nav>
          <Link className={styles.topLink} href="/login">Entrar</Link>
        </header>

        <section className={styles.hero}>
          <span className={styles.label}>Términos</span>
          <h1>Términos y condiciones</h1>
          <p>
            Estos términos regulan el uso de GeoModi como herramienta SaaS para ordenar pedidos, etiquetas, picking, integraciones y despacho.
          </p>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Titular y contacto</h2>
            <p>GeoModi es una plataforma orientada a operaciones de e-commerce, preparación logística, picking y despacho.</p>
            <p>Contacto legal y soporte: soporte@geomodi.com.</p>
          </article>

          <article className={styles.card}>
            <h2>Registro y aceptación</h2>
            <p>El usuario administrador declara tener facultades para conectar integraciones, aceptar estos términos y operar el workspace.</p>
            <p>El uso de GeoModi implica la aceptación de estos términos por parte de los usuarios habilitados.</p>
          </article>

          <article className={styles.wideCard}>
            <h2>Descripción del servicio</h2>
            <p>GeoModi centraliza información operativa de canales e integraciones para facilitar preparación logística, picking, etiquetas, control de despachos y métricas.</p>
            <p>GeoModi no es un WMS, no reemplaza un ERP, no gestiona stock y no presta servicios de transporte. Es una herramienta de apoyo operativo.</p>
          </article>

          <article className={styles.wideCard}>
            <h2>Permisos y uso de datos</h2>
            <p>Las integraciones, incluida Tiendanube, requieren autorización del usuario o administrador del workspace.</p>
            <div className={styles.permissionGrid}>
              {permissions.map(([scope, text]) => (
                <article className={styles.permissionCard} key={scope}>
                  <code>{scope}</code>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </article>

          <article className={styles.highlightCard}>
            <h2>Acciones sobre pedidos</h2>
            <p>GeoModi no modifica pedidos automáticamente sin acción del usuario. Las actualizaciones se realizan cuando el usuario las solicita desde la app.</p>
            <p>Podés desconectar la integración en cualquier momento.</p>
          </article>

          <article className={styles.card}>
            <h2>Integraciones con terceros</h2>
            <p>El funcionamiento depende de servicios externos como Tiendanube, Mercado Libre, operadores logísticos o APIs de terceros.</p>
            <p>GeoModi no garantiza disponibilidad continua de servicios externos.</p>
          </article>

          <article className={styles.card}>
            <h2>Métricas y trazabilidad</h2>
            <p>Las métricas y registros tienen fines operativos. GeoModi no toma decisiones automáticas sobre personas.</p>
          </article>

          <article className={styles.card}>
            <h2>Propiedad intelectual</h2>
            <p>El software, marca, diseño y documentación de GeoModi pertenecen a sus titulares. Está prohibida la copia, reventa, sublicencia o ingeniería inversa.</p>
          </article>

          <article className={styles.card}>
            <h2>Uso aceptable</h2>
            <p>Está prohibido vulnerar la seguridad, compartir credenciales indebidamente, manipular datos de forma fraudulenta o usar la plataforma para fines ilícitos.</p>
          </article>

          <article className={styles.wideCard}>
            <h2>Limitación y soporte</h2>
            <p>GeoModi se brinda según disponibilidad. No garantiza eliminación total de errores, continuidad ininterrumpida ni cumplimiento de plazos de operadores externos.</p>
            <p>Para consultas, escribí a soporte@geomodi.com. Respondemos dentro de las 24-48 horas hábiles.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
