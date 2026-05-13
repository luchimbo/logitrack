import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const workflow = [
  {
    step: "01",
    title: "Cargá etiquetas o conectá tus canales",
    action: "Subís archivos ZPL/TXT o sincronizás envíos desde Mercado Libre, Tiendanube, Shopify, Zipnova y otros canales.",
    result: "GeoModi reúne las etiquetas y los envíos operativos en un solo workspace.",
  },
  {
    step: "02",
    title: "GeoModi ordena los envíos",
    action: "Cada envío queda visible con su etiqueta, producto, destino, método de entrega y estado operativo.",
    result: "Detectás duplicados, pendientes y etiquetas disponibles antes de mover el despacho.",
  },
  {
    step: "03",
    title: "Prepará picking",
    action: "La app agrupa productos, cantidades, SKU y método de envío.",
    result: "Tu equipo sabe qué buscar y cuántas unidades preparar sin saltar entre canales.",
  },
  {
    step: "04",
    title: "Separá Flex, Colecta y operadores",
    action: "Filtrás los envíos por método y revisás las etiquetas que corresponden a cada salida.",
    result: "La preparación queda dividida por la forma real en que vas a despachar.",
  },
  {
    step: "05",
    title: "Asigná transportistas",
    action: "Configurás zonas por partido y reasignás Flex según los transportistas de tu operación.",
    result: "Ves qué envíos ya tienen transportista y cuáles siguen sin asignar.",
  },
  {
    step: "06",
    title: "Controlá antes de despachar",
    action: "Revisás mapa, métricas, pendientes, etiquetas y distribución diaria.",
    result: "Llegás al despacho con una vista clara de qué falta y qué ya está listo.",
  },
];

const modules = [
  ["labels", "Centralizá etiquetas y envíos", "Etiquetas, pedidos operativos, duplicados y estados de despacho en un solo lugar."],
  ["picking", "Prepará picking", "Productos agrupados por cantidad, SKU y método de envío para preparar más rápido."],
  ["flex", "Controlá Flex", "Resumen operativo, envíos por zona y transportista asignado."],
  ["colecta", "Ordená Colecta", "Listado de envíos tradicionales con acceso rápido a etiquetas."],
  ["map", "Visualizá entregas", "Direcciones geocodificadas para revisar distribución antes de despachar."],
  ["dashboard", "Medí la operación", "Volumen por día, semana, mes, año o rango personalizado."],
];

const integrations = [
  ["Mercado Libre", "Carga de etiquetas ZPL/TXT, Flex, Colecta y operación diaria de despachos."],
  ["Tiendanube", "Pedidos por enviar o despachados, productos y datos de envío."],
  ["Zipnova", "Envíos, recolecciones, etiquetas disponibles y estados de preparación."],
  ["Correo Argentino", "Próximamente: creación de envíos, consulta de agencias, tracking y etiquetas."],
  ["Más integraciones", "Estamos sumando nuevos canales y operadores logísticos para centralizar más partes de tu operación."],
];

const integrationLogos = [
  ["Tiendanube", "/LogoTiendaNube.png"],
  ["Mercado Libre", "/LogoMercadoLibre.png"],
  ["Shopify", "/LogoShopify.png"],
  ["Zipnova", "/LogoZipnova.png"],
  ["Correo Argentino", "/LogoCorreoArgentino.jpg"],
];

function ModuleIcon({ type }) {
  const common = {
    width: "28",
    height: "28",
    viewBox: "0 0 28 28",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true",
  };

  switch (type) {
    case "labels":
      return (
        <svg {...common}>
          <path d="M7 4.5h10.5L22 9v14.5H7V4.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M17.5 4.5V9H22" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 14h9M10 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 8.5H4v14h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
        </svg>
      );
    case "picking":
      return (
        <svg {...common}>
          <rect x="6" y="5" width="16" height="19" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M10 11l2 2 4-4M10 17l2 2 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 4h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "flex":
      return (
        <svg {...common}>
          <path d="M15 3 6 16h7l-1 9 10-14h-7l0-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "colecta":
      return (
        <svg {...common}>
          <path d="M5 10.5 14 6l9 4.5v9L14 24l-9-4.5v-9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m5 10.5 9 4.5 9-4.5M14 15v9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m9.5 8.2 9 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M14 24s7-6.4 7-13a7 7 0 1 0-14 0c0 6.6 7 13 7 13Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="14" cy="11" r="2.6" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M10 18v-4M14 18V9M18 18v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function HeroMockup() {
  return (
    <div className={styles.mockup} aria-label="Vista previa operativa de GeoModi">
      <aside className={styles.previewSidebar}>
        <div className={styles.previewLogo}>GEOMODI</div>
        <small>OPERACIÓN</small>
        <span>📦 Subir Etiquetas</span>
        <span className={styles.previewNavActive}>📋 Lista de Picking</span>
        <span>🚀 Logística Flex</span>
        <span>📦 Colecta</span>
        <span>📍 Mapa</span>
        <span>📊 Dashboard</span>
        <small>INTEGRACIONES</small>
        <span>🛒 Tiendanube</span>
        <span>📮 Zipnova</span>
      </aside>

      <div className={styles.previewApp}>
        <div className={styles.mockupTopbar}>
          <div>
            <strong>Lista de Picking</strong>
          </div>
        </div>

        <section className={styles.previewContentHeader}>
          <div>
            <span className={styles.mockupEyebrow}>Operación diaria</span>
            <h3>Lista de Picking</h3>
            <p>Productos a preparar, priorizados por unidades pendientes.</p>
          </div>
          <button>Exportar PDF</button>
        </section>

        <div className={styles.previewStats}>
          <div><strong>86</strong><span>Etiquetas cargadas</span></div>
          <div><strong>42</strong><span>Uds Flex · 25 prod.</span></div>
          <div><strong>40</strong><span>Uds Colecta · 19 prod.</span></div>
          <div><strong>2</strong><span>Duplicados omitidos</span></div>
        </div>

        <section className={styles.previewPickingList}>
          <div className={styles.previewGroupHeader}>
            <div><strong>Colecta</strong><span>19 productos · 40 unidades</span></div>
            <b>19</b>
          </div>
          <div className={styles.previewPickingItemHighlight}><b>12<small>uds</small></b><span>Remera Oversize Algodón Negro</span></div>
          <div className={styles.previewPickingItem}><b>5<small>uds</small></b><span>Buzo Canguro Frisa Gris Melange</span></div>
          <div className={styles.previewPickingItem}><b>3<small>uds</small></b><span>Campera Nylon Urbana Azul</span></div>
          <div className={styles.previewPickingItem}><b>2<small>uds</small></b><span>Pantalón Cargo Gabardina Verde</span></div>
        </section>

      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="#inicio" className={styles.brand} aria-label="GeoModi inicio">
          <Image src="/logoGeoModi.png" alt="GeoModi" width={148} height={44} priority />
        </a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#flujo">Flujo</a>
          <a href="#modulos">Módulos</a>
          <a href="#integraciones">Integraciones</a>
        </nav>
        <Link className={styles.loginButton} href="/login">Entrar</Link>
      </header>

      <section id="inicio" className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Etiquetas y envíos bajo control</span>
          <h1>Ordená tus etiquetas y envíos antes de despachar</h1>
          <p>
            GeoModi reúne etiquetas, envíos y pedidos operativos para que puedas preparar picking, separar Flex y Colecta,
            asignar transportistas y controlar el despacho diario desde un solo lugar.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/login">Entrar a GeoModi</Link>
            <a className={styles.secondaryCta} href="#flujo">Ver cómo funciona</a>
          </div>
        </div>
        <HeroMockup />
      </section>

      <section className={styles.definitionSection}>
        <span className={styles.sectionLabel}>Qué es GeoModi</span>
        <h2>No reemplaza tu tienda ni tu operador logístico. Ordena tus etiquetas y envíos.</h2>
        <p>
          GeoModi concentra etiquetas, envíos, productos, transportistas, métodos de entrega y métricas en un mismo workspace para que tu equipo tenga visibilidad y control antes de despachar.
        </p>
      </section>

      <section className={styles.problem}>
        <div>
          <span className={styles.sectionLabel}>El problema</span>
          <h2>Cuando las etiquetas se acumulan, el despacho se vuelve difícil de controlar</h2>
        </div>
        <p>
          Etiquetas descargadas, envíos en diferentes canales, picking manual, Flex sin asignar y métricas separadas hacen que el despacho dependa de demasiados controles por fuera de la operación.
        </p>
      </section>

      <section id="flujo" className={styles.workflowSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Cómo funciona</span>
          <h2>De etiquetas y envíos dispersos a una operación lista para despachar</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map((item) => (
            <article className={styles.workflowCard} key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p><strong>Qué hacés:</strong> {item.action}</p>
              <p><strong>Qué obtenés:</strong> {item.result}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="modulos" className={styles.modulesSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Módulos</span>
          <h2>Cada módulo resuelve una parte concreta del despacho</h2>
        </div>
        <div className={styles.moduleGrid}>
          {modules.map(([type, title, text]) => (
            <article className={styles.moduleCard} key={title}>
              <div className={styles.moduleIcon}><ModuleIcon type={type} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="integraciones" className={styles.integrationsSection}>
        <div className={styles.integrationVisual}>
          {integrationLogos.map(([name, src], index) => {
            const LogoCard = index === 1 ? "strong" : "span";
            return (
              <LogoCard key={name} className={styles.integrationLogoCard}>
                <Image src={src} alt={name} width={170} height={58} />
              </LogoCard>
            );
          })}
          <span>Más integraciones próximamente</span>
        </div>
        <div className={styles.integrationCopy}>
          <span className={styles.sectionLabel}>Integraciones</span>
          <h2>Conectado con tus canales operativos</h2>
          <div className={styles.integrationList}>
            {integrations.map(([title, text]) => (
              <div key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <span className={styles.sectionLabel}>Prepará el próximo lote</span>
        <h2>Unificá etiquetas, envíos y preparación diaria</h2>
        <p>Concentrá la operación diaria en un solo lugar: etiquetas, envíos, picking, métodos de entrega, transportistas y métricas.</p>
        <Link className={styles.primaryCta} href="/login">Entrar a la plataforma</Link>
      </section>
    </main>
  );
}
