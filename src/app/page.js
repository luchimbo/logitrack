import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const workflow = [
  {
    step: "01",
    title: "Conectá tus canales o cargá etiquetas",
    action: "Instalás Tiendanube, conectás Mercado Libre o subís archivos ZPL/TXT.",
    result: "Los pedidos y etiquetas entran a un mismo flujo operativo.",
  },
  {
    step: "02",
    title: "Ordená la preparación",
    action: "GeoModi agrupa productos, cantidades, SKU, método de entrega y estado.",
    result: "Tu equipo sabe qué preparar sin saltar entre tiendas, planillas y descargas.",
  },
  {
    step: "03",
    title: "Separá Flex, Colecta y operadores",
    action: "Filtrás por método de envío, zona o transportista asignado.",
    result: "Cada salida queda preparada según la forma real en que vas a despachar.",
  },
  {
    step: "04",
    title: "Controlá y despachá",
    action: "Revisás métricas, mapa, etiquetas disponibles, pendientes y distribución diaria.",
    result: "Llegás al despacho con visibilidad de qué está listo y qué falta.",
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
  ["Tiendanube", "Pedidos por enviar o despachados, productos y datos de envío.", true],
  ["Mercado Libre", "Carga de etiquetas ZPL/TXT, Flex, Colecta y operación diaria de despachos."],
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

const tiendanubeAppId = process.env.NEXT_PUBLIC_TIENDANUBE_APP_ID || process.env.TIENDANUBE_APP_ID || "{APP_ID}";
const tiendanubeInstallUrl = `https://www.tiendanube.com/apps/${tiendanubeAppId}/authorize`;

const faqs = [
  [
    "¿GeoModi modifica mis pedidos automáticamente?",
    "No. GeoModi no modifica pedidos automáticamente sin acción del usuario. Las actualizaciones de despacho se ejecutan cuando el usuario lo solicita desde la app.",
  ],
  [
    "¿Qué datos guarda GeoModi?",
    "Guardamos los datos necesarios para gestión logística, picking y despacho: pedidos, productos, estados operativos, datos de envío y credenciales cifradas de integración.",
  ],
  [
    "¿Puedo desconectar la app?",
    "Sí. Podés desconectar la integración en cualquier momento desde GeoModi o desde tu cuenta de Tiendanube.",
  ],
  [
    "¿Cómo se sincronizan los pedidos?",
    "GeoModi usa webhooks de Tiendanube para recibir actualizaciones de pedidos. La sincronización manual existe solo como respaldo operativo.",
  ],
  [
    "¿Qué pasa si desinstalo la app?",
    "Dejamos de recibir actualizaciones de Tiendanube y podés solicitar exportación o borrado de datos escribiendo a soporte.",
  ],
];

const demoScreenshots = [
  ["Dashboard operativo", "/demo-tiendanube-dashboard.svg"],
  ["Lista de picking", "/demo-tiendanube-picking.svg"],
  ["Gestión de despachos", "/demo-tiendanube-despachos.svg"],
];

const heroBadges = ["Self-service", "Tiendanube", "Mercado Libre", "Picking", "Despacho", "Sin papel"];

const painPoints = [
  "Las etiquetas se descargan en distintos lugares y nadie sabe cuál falta.",
  "El picking depende de planillas, chats o controles manuales.",
  "Flex, Colecta y operadores se mezclan antes de despachar.",
  "Los errores aparecen cuando el paquete ya está en movimiento.",
  "No hay una vista clara de qué se preparó, qué falta y qué está listo.",
];

const solutionPoints = [
  "Los pedidos y etiquetas entran a un solo workspace operativo.",
  "El equipo prepara por producto, cantidad, SKU y método de envío.",
  "Las salidas se separan por Flex, Colecta, zona o transportista.",
  "Cada lote queda trazado con métricas, mapa y estados claros.",
  "La operación diaria se trabaja desde un mismo flujo, sin saltar entre canales.",
];

const audience = [
  ["E-commerce en crecimiento", "Tiendas que preparan pedidos todos los días y necesitan ordenar etiquetas, picking y despacho."],
  ["Operaciones multicanal", "Equipos que venden en Tiendanube, Mercado Libre u otros canales y quieren unificar la preparación."],
  ["Depósitos y equipos operativos", "Personas que necesitan saber qué buscar, qué separar y qué despachar sin depender de controles manuales."],
  ["Operadores logísticos", "Operaciones que preparan envíos de distintos clientes, zonas o métodos y necesitan separar el trabajo."],
];

const included = [
  "Integración con Tiendanube mediante OAuth y webhooks.",
  "Carga de etiquetas ZPL/TXT para operaciones existentes.",
  "Lista de picking por producto, SKU, cantidad y método de envío.",
  "Separación de Flex, Colecta y operadores logísticos.",
  "Mapa de entregas y distribución territorial.",
  "Dashboard diario, semanal, mensual y por rango.",
  "Gestión de transportistas y zonas operativas.",
  "Páginas legales, soporte y desconexión de integraciones.",
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
          <a href="#funciones">Funciones</a>
          <a href="#integraciones">Integraciones</a>
          <a href="#faq">FAQ</a>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/soporte">Soporte</Link>
        </nav>
        <Link className={styles.loginButton} href="/login">Entrar</Link>
      </header>

      <section id="inicio" className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Self-service · Multicanal · Logística diaria</span>
          <h1>Ordená etiquetas, picking y despachos sin caos</h1>
          <p>
            GeoModi centraliza pedidos, etiquetas y preparación logística para que tu equipo pueda armar,
            separar y despachar sin depender de planillas, chats ni descargas sueltas.
          </p>
          <p className={styles.heroClarifier}>No es un WMS. No reemplaza tu tienda ni tu operador logístico. Ordena el trabajo diario antes del despacho.</p>
          <div className={styles.badgeRow}>{heroBadges.map((badge) => <span key={badge}>{badge}</span>)}</div>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/login">Entrar a GeoModi</Link>
            <a className={styles.secondaryCta} href="#integraciones">Ver integraciones</a>
          </div>
        </div>
        <HeroMockup />
      </section>

      <section className={styles.definitionSection}>
        <span className={styles.sectionLabel}>Qué es GeoModi</span>
        <h2>Una capa operativa para que vender más no desordene tu despacho.</h2>
        <p>
          GeoModi concentra etiquetas, envíos, productos, transportistas, métodos de entrega y métricas en un mismo workspace para que tu equipo tenga visibilidad y control antes de despachar.
        </p>
      </section>

      <section className={styles.problem}>
        <div>
          <span className={styles.sectionLabel}>Problemas / solución</span>
          <h2>Cuando el volumen crece, la preparación empieza a mostrar límites.</h2>
        </div>
        <div className={styles.problemColumns}>
          <div>
            <h3>Lo que pasa todos los días</h3>
            {painPoints.map((item) => <p key={item}>{item}</p>)}
          </div>
          <div>
            <h3>Cómo lo ordena GeoModi</h3>
            {solutionPoints.map((item) => <p key={item}>{item}</p>)}
          </div>
        </div>
      </section>

      <section id="flujo" className={styles.workflowSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Cómo funciona</span>
          <h2>De pedidos dispersos a una operación lista para despachar</h2>
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

      <section className={styles.operationalSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Para quién es</span>
          <h2>Para operaciones que ya necesitan más control antes de despachar</h2>
        </div>
        <div className={styles.audienceGrid}>
          {audience.map(([title, text]) => (
            <article className={styles.audienceCard} key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.includedSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Desde el día uno</span>
          <h2>Qué incluye GeoModi para trabajar pedidos de forma operativa</h2>
        </div>
        <ul className={styles.includedList}>{included.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section id="funciones" className={styles.modulesSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Funciones</span>
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
          {integrationLogos.map(([name, src]) => (
            <span key={name} className={styles.integrationLogoCard}>
              <Image src={src} alt={name} width={170} height={58} />
            </span>
          ))}
          <span>Más integraciones próximamente</span>
        </div>
        <div className={styles.integrationCopy}>
          <span className={styles.sectionLabel}>Integraciones</span>
          <h2>Conectado con tus canales operativos</h2>
          <div className={styles.integrationList}>
            {integrations.map(([title, text, hasCta]) => (
              <div key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
                {hasCta && (
                  <a className={styles.integrationCta} href={tiendanubeInstallUrl}>
                    Instalar en Tiendanube
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.demoSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>Producto</span>
          <h2>Una vista clara para preparar y despachar</h2>
          <p>Capturas demostrativas con datos genéricos para mostrar dashboard, picking y despacho sin exponer información real.</p>
        </div>
        <div className={styles.demoGrid}>
          {demoScreenshots.map(([title, src], index) => (
            <figure key={title}>
              <Image src={src} alt={title} width={1280} height={760} />
              <figcaption><span>{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="faq" className={styles.faqSection}>
        <div className={styles.sectionHeading}>
          <span className={styles.sectionLabel}>FAQ</span>
          <h2>Preguntas frecuentes para merchants de Tiendanube</h2>
        </div>
        <div className={styles.faqGrid}>
          {faqs.map(([question, answer]) => (
            <article className={styles.faqCard} key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <span className={styles.sectionLabel}>Operación sin fricción</span>
        <h2>Vender más no debería complicar tu operación.</h2>
        <p>GeoModi pone orden en el flujo previo al despacho para que puedas crecer sin perder control.</p>
        <div className={styles.heroActionsCentered}>
          <Link className={styles.primaryCta} href="/login">Entrar a GeoModi</Link>
          <a className={styles.secondaryCta} href="#integraciones">Ver integraciones</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>GeoModi</strong>
          <p>Soporte: <a href="mailto:soporte@geomodi.com">soporte@geomodi.com</a></p>
          <p>Respondemos dentro de las 24-48 horas hábiles.</p>
        </div>
        <nav aria-label="Links legales">
          <Link href="/privacidad">Política de privacidad</Link>
          <Link href="/terminos">Términos y condiciones</Link>
          <Link href="/soporte">Soporte/contacto</Link>
        </nav>
      </footer>
    </main>
  );
}
