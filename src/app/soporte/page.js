import Image from "next/image";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = { title: "Soporte | GeoModi", description: "Contacto y soporte de GeoModi." };

export default function SupportPage() {
  return (
    <main className={styles.page}><div className={styles.shell}>
      <header className={styles.topbar}><Link className={styles.brand} href="/"><Image src="/logoGeoModi.png" alt="GeoModi" width={148} height={44} priority /></Link><nav className={styles.nav} aria-label="Navegación principal"><Link href="/#funciones">Funciones</Link><Link href="/#integraciones">Integraciones</Link><Link href="/#faq">FAQ</Link><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link><Link href="/soporte">Soporte</Link></nav><Link className={styles.topLink} href="/login">Entrar</Link></header>
      <section className={styles.hero}><span className={styles.label}>Soporte</span><h1>Soporte y contacto</h1><p>Si necesitás ayuda con GeoModi, instalación de Tiendanube, integraciones, etiquetas, picking o solicitudes de datos, escribinos por email.</p></section>
      <section className={styles.grid}>
        <article className={styles.highlightCard}><h2>Canal principal</h2><p>Email: soporte@geomodi.com</p><p>Respondemos dentro de las 24-48 horas hábiles.</p><div className={styles.contactBox}><a className={styles.primaryButton} href="mailto:soporte@geomodi.com?subject=Soporte%20GeoModi">Escribir a soporte</a><Link className={styles.secondaryButton} href="/terminos">Ver términos</Link></div></article>
        <article className={styles.card}><h2>Instalación e integraciones</h2><p>Te ayudamos con instalación de Tiendanube, reconexión de credenciales, webhooks y dudas sobre canales conectados.</p></article>
        <article className={styles.card}><h2>Operación diaria</h2><p>Podés escribirnos por consultas sobre etiquetas, picking, despachos, mapas, transportistas o métricas operativas.</p></article>
        <article className={styles.card}><h2>Solicitudes de datos</h2><p>Podés pedir exportación o borrado de datos escribiendo a soporte@geomodi.com con el nombre de tu workspace y el motivo de la solicitud.</p></article>
        <article className={styles.card}><h2>Qué incluir en el mensaje</h2><ul className={styles.list}><li>Email de tu cuenta.</li><li>Nombre del workspace o tienda.</li><li>Canal afectado, si aplica.</li><li>Captura o descripción del problema.</li></ul></article>
      </section>
    </div></main>
  );
}
