"use client";

import dynamic from "next/dynamic";

const loading = () => <div className="section-loading" role="status" aria-live="polite"><div className="spinner" /><span>Cargando sección…</span></div>;
const AdminOverviewSection = dynamic(() => import("@/components/AdminOverviewSection"), { loading });
const ColectaSection = dynamic(() => import("@/components/ColectaSection"), { loading });
const Dashboard = dynamic(() => import("@/components/Dashboard"), { loading });
const FinanceSection = dynamic(() => import("@/components/FinanceSection"), { loading });
const FlexSection = dynamic(() => import("@/components/FlexSection"), { loading });
const IntegrationsSection = dynamic(() => import("@/components/IntegrationsSection"), { loading });
const MapSection = dynamic(() => import("@/components/MapSection"), { loading });
const MercadoLibreSection = dynamic(() => import("@/components/MercadoLibreSection"), { loading });
const PickingList = dynamic(() => import("@/components/PickingList"), { loading });
const ShopifySection = dynamic(() => import("@/components/ShopifySection"), { loading });
const TiendanubeSection = dynamic(() => import("@/components/TiendanubeSection"), { loading });
const UploadSection = dynamic(() => import("@/components/UploadSection"), { loading });
const UserManagementSection = dynamic(() => import("@/components/UserManagementSection"), { loading });
const ZipnovaSection = dynamic(() => import("@/components/ZipnovaSection"), { loading });
const ZoneConfig = dynamic(() => import("@/components/ZoneConfig"), { loading });
const GoogleSheetsSection = dynamic(() => import("@/components/GoogleSheetsSection"), { loading });
const OperationToday = dynamic(() => import("@/components/OperationToday"), { loading });
const PackageHistorySection = dynamic(() => import("@/components/PackageHistorySection"), { loading });

export default function AppSectionRenderer({ activeTab, currentUser, canManageUsers, onBadgeUpdate, onNavigate }) {
  switch (activeTab) {
    case "operationToday": return <OperationToday onNavigate={onNavigate} />;
    case "upload": return <UploadSection />;
    case "pickingList": return <PickingList />;
    case "flex": return <FlexSection />;
    case "colecta": return <ColectaSection />;
    case "zoneConfig": return <ZoneConfig />;
    case "sheetSync": return currentUser ? <GoogleSheetsSection currentUser={currentUser} onBadgeUpdate={onBadgeUpdate} /> : <div>No autorizado</div>;
    case "dashboard": return <Dashboard />;
    case "finance": return <FinanceSection />;
    case "deliveryTracking": return <FinanceSection mode="tracking" />;
    case "carrierRates": return <FinanceSection mode="rates" canManage={Boolean(currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role))} />;
    case "printJobs": return <PackageHistorySection />;
    case "map": return <MapSection />;
    case "integrations": return currentUser ? <IntegrationsSection onNavigate={onNavigate} /> : <div>No autorizado</div>;
    case "adminOverview": return currentUser?.isGlobalAdmin ? <AdminOverviewSection /> : <div>No autorizado</div>;
    case "zipnova": return currentUser ? <ZipnovaSection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "tiendanube": return currentUser ? <TiendanubeSection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "shopify": return currentUser ? <ShopifySection currentUser={currentUser} /> : <div>No autorizado</div>;
    case "mercadolibre": return currentUser ? <MercadoLibreSection currentUser={currentUser} onBadgeUpdate={onBadgeUpdate} /> : <div>No autorizado</div>;
    case "userManagement": return canManageUsers ? <UserManagementSection /> : <div>No autorizado</div>;
    default: return <div>Página no encontrada</div>;
  }
}
