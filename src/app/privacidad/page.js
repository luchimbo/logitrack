import Image from "next/image";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata = { title: "Política de privacidad | GeoModi", description: "Política de privacidad de GeoModi para integraciones logísticas, Tiendanube, picking y despacho." };

export default function PrivacyPage() {
  return (
    <main className={styles.page}><div className={styles.shell}>
      <header className={styles.topbar}><Link className={styles.brand} href="/"><Image src="/logoGeoModi.png" alt="GeoModi" width={132} height={40} priority /></Link><Link className={styles.topLink} href="/">Volver al inicio</Link></header>
      <section className={styles.hero}><span className={styles.label}>Privacidad</span><h1>Política de privacidad</h1><p>GeoModi usa los datos únicamente para gestión logística, picking y despacho. Esta política explica qué información tratamos, con qué finalidad y cómo podés solicitar exportación o borrado.</p></section>
      <section className={styles.grid}>
        <article className={styles.card}><h2>Responsable y alcance</h2><p>GeoModi trata datos de operaciones B2B de e-commerce, pedidos, etiquetas, picking y despacho.</p><p>Los usuarios internos acceden bajo responsabilidad del workspace que los habilita.</p></article>
        <article className={styles.card}><h2>Datos que usamos</h2><p>Podemos procesar datos de empresa, usuarios, pedidos, productos, envío, estados operativos, transportistas, zonas, métricas, webhooks, logs técnicos y archivos necesarios para la operación.</p></article>
        <article className={styles.wideCard}><h2>Finalidad del tratamiento</h2><ul className={styles.list}><li>Prestar y mantener GeoModi.</li><li>Ordenar preparación logística, picking y despacho.</li><li>Mostrar pedidos, productos, etiquetas, métricas y estados operativos.</li><li>Brindar soporte, mejorar seguridad y prevenir usos indebidos.</li></ul></article>
        <article className={styles.card}><h2>Tiendanube y webhooks</h2><p>GeoModi usa webhooks de Tiendanube para recibir actualizaciones de pedidos. La sincronización manual existe solo como respaldo operativo.</p><p>GeoModi no modifica pedidos automáticamente sin acción del usuario.</p></article>
        <article className={styles.card}><h2>Seguridad</h2><p>Los tokens se guardan cifrados y los webhooks se validan con firma cuando corresponde.</p><p>Aplicamos medidas técnicas y organizativas razonables para proteger la información.</p></article>
        <article className={styles.card}><h2>Cesión y acceso</h2><p>No vendemos datos. La información puede compartirse solo con proveedores necesarios, autoridades por obligación legal o terceros autorizados mediante integraciones.</p></article>
        <article className={styles.card}><h2>Conservación</h2><p>Conservamos datos mientras dure la relación de uso y el tiempo necesario para cumplir obligaciones legales, resolver incidentes o permitir exportación y eliminación.</p></article>
        <article className={styles.highlightCard}><h2>Borrado y exportación</h2><p>GeoModi responde solicitudes de borrado y exportación de datos. Para solicitarlo, escribí a soporte@geomodi.com.</p><div className={styles.contactBox}><a className={styles.primaryButton} href="mailto:soporte@geomodi.com?subject=Solicitud%20de%20datos%20-%20GeoModi">Solicitar por email</a><Link className={styles.secondaryButton} href="/soporte">Ir a soporte</Link></div></article>
      </section>
    </div></main>
  );
}
