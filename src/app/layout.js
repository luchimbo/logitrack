import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "GeoModi | Logística e-commerce en un solo lugar",
  description: "GeoModi unifica etiquetas y despachos de Mercado Libre y Tiendanube: lotes, picking, Flex, Colecta, transportistas y métricas operativas.",
  keywords: [
    "GeoModi",
    "Mercado Libre",
    "Tiendanube",
    "etiquetas Mercado Libre",
    "etiquetas ZPL",
    "picking ecommerce",
    "logistica ecommerce",
    "Flex",
    "Colecta",
    "Tiendanube",
    "Zipnova",
  ],
  openGraph: {
    title: "GeoModi | Logística e-commerce en un solo lugar",
    description: "Centralizá Mercado Libre y Tiendanube: etiquetas, pedidos, lotes, picking, Flex, Colecta, transportistas y métricas en un mismo workspace.",
    type: "website",
    locale: "es_AR",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <ClerkProvider>
          <BatchProvider>
            {children}
          </BatchProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
