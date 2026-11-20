"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const loading = () => <div className="section-loading" role="status" aria-live="polite"><div className="spinner" /><span>Cargando sección…</span></div>;
const AdminOverviewSection = dynamic(() => import("@/components/AdminOverviewSection"), { loading });
const ColectaSection = dynamic(() => import("@/components/ColectaSection"), { loading });
const Dashboard = dynamic(() => import("@/components/Dashboard"), { loading });
const FlexSection = dynamic(() => import("@/components/FlexSection"), { loading });
const IntegrationsSection = dynamic(() => import("@/components/IntegrationsSection"), { loading });
const MercadoLibreSection = dynamic(() => import("@/components/MercadoLibreSection"), { loading });
const PickingList = dynamic(() => import("@/components/PickingList"), { loading });
const ShopifySection = dynamic(() => import("@/components/ShopifySection"), { loading });
const TiendanubeSection = dynamic(() => import("@/components/TiendanubeSection"), { loading });
const UploadSection = dynamic(() => import("@/components/UploadSection"), { loading });
const UserManagementSection = dynamic(() => import("@/components/UserManagementSection"), { loading });
const ZipnovaSection = dynamic(() => import("@/components/ZipnovaSection"), { loading });
const WorkspaceSetupSection = dynamic(() => import("@/components/WorkspaceSetupSection"), { loading });
const ZoneConfig = dynamic(() => import("@/components/ZoneConfig"), { loading });
const OperationToday = dynamic(() => import("@/components/OperationToday"), { loading });
const PackageHistorySection = dynamic(() => import("@/components/PackageHistorySection"), { loading });
const LogisticsFinance = dynamic(() => import("@/components/LogisticsFinance"), { loading });

function ShippingSection({ method, currentUser, mercadoLibreConnected, onNavigate }) {
  const [selectedView, setSelectedView] = useState(null);
  const flex = method === "flex";
  const operationsLabel = flex ? "Transportistas" : "Envíos incorporados";
  const showMercadoLibre = currentUser && (selectedView ?? (mercadoLibreConnected ? "mercadolibre" : "operations")) === "mercadolibre";

  return (
    <>
      <nav aria-label={`Vistas de ${flex ? "Flex" : "Colecta"}`} style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
        {currentUser && (
          <button type="button" className={`btn btn-sm ${showMercadoLibre ? "btn-primary" : ""}`} aria-pressed={Boolean(showMercadoLibre)} onClick={() => setSelectedView("mercadolibre")}>
            Paquetes de Mercado Libre
          </button>
        )}
        <button type="button" className={`btn btn-sm ${showMercadoLibre ? "" : "btn-primary"}`} aria-pressed={!showMercadoLibre} onClick={() => setSelectedView("operations")}>
          {operationsLabel}
        </button>
      </nav>
      {showMercadoLibre ? (
        <MercadoLibreSection method={method} currentUser={currentUser} onNavigate={onNavigate} />
      ) : flex ? <FlexSection onNavigate={onNavigate} /> : <ColectaSection onNavigate={onNavigate} />}
    </>
  );
}

export default function AppSectionRenderer({ activeTab, currentUser, canManageUsers, mercadoLibreConnected, onNavigate, onReplayTour }) {
  switch (activeTab) {
    case "operationToday": return <OperationToday key={currentUser?.workspaceId} currentUser={currentUser} onNavigate={onNavigate} onReplayTour={onReplayTour} />;
    case "upload": return <UploadSection />;
    case "pickingList": return <PickingList />;
    case "flex":
    case "colecta":
      return <ShippingSection key={`${currentUser?.workspaceId}:${activeTab}`} method={activeTab} currentUser={currentUser} mercadoLibreConnected={mercadoLibreConnected} onNavigate={onNavigate} />;
    case "workspaceSetup": return canManageUsers ? <WorkspaceSetupSection /> : <div>No autorizado</div>;
    case "zoneConfig": return <ZoneConfig />;
    case "dashboard": return <Dashboard />;
    case "logisticsFinance": return <LogisticsFinance key="finance" currentUser={currentUser} />;
    case "deliveryControl": return <LogisticsFinance key="delivery" currentUser={currentUser} delivery />;
    case "printJobs": return <PackageHistorySection />;
    case "integrations": return currentUser ? <IntegrationsSection onNavigate={onNavigate} /> : <div>No autorizado</div>;
    case "adminOverview": return currentUser?.isGlobalAdmin ? <AdminOverviewSection /> : <div>No autorizado</div>;
    case "zipnova": return currentUser ? <ZipnovaSection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "tiendanube": return currentUser ? <TiendanubeSection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "shopify": return currentUser ? <ShopifySection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "mercadolibre": return currentUser ? <MercadoLibreSection currentUser={currentUser} onNavigate={onNavigate} /> : <div>No autorizado</div>;
    case "userManagement": return canManageUsers ? <UserManagementSection currentUser={currentUser} /> : <div>No autorizado</div>;
    default: return <div>Página no encontrada</div>;
  }
}
