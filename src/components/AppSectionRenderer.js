"use client";

import AdminOverviewSection from "@/components/AdminOverviewSection";
import ColectaSection from "@/components/ColectaSection";
import Dashboard from "@/components/Dashboard";
import FlexSection from "@/components/FlexSection";
import IntegrationsSection from "@/components/IntegrationsSection";
import MapSection from "@/components/MapSection";
import MercadoLibreSection from "@/components/MercadoLibreSection";
import PickingList from "@/components/PickingList";
import ShopifySection from "@/components/ShopifySection";
import TiendanubeSection from "@/components/TiendanubeSection";
import UploadSection from "@/components/UploadSection";
import UserManagementSection from "@/components/UserManagementSection";
import ZipnovaSection from "@/components/ZipnovaSection";
import ZoneConfig from "@/components/ZoneConfig";

export default function AppSectionRenderer({ activeTab, currentUser, canManageUsers, onBadgeUpdate, onNavigate }) {
  switch (activeTab) {
    case "upload": return <UploadSection />;
    case "pickingList": return <PickingList />;
    case "flex": return <FlexSection />;
    case "colecta": return <ColectaSection />;
    case "zoneConfig": return <ZoneConfig />;
    case "dashboard": return <Dashboard />;
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
