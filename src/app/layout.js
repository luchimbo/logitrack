import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";

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
        <ClerkProvider
          localization={esES}
          appearance={{
            variables: {
              colorPrimary: "#818cf8",
              colorBackground: "#1a1f2e",
              colorInputBackground: "#111827",
              colorInputText: "#f1f5f9",
              colorText: "#f1f5f9",
              colorTextSecondary: "#94a3b8",
              borderRadius: "12px",
            },
            elements: {
              cardBox: "clerk-card-box",
              card: "clerk-card",
              formButtonPrimary: "clerk-primary-button",
              formFieldInput: "clerk-input",
              socialButtonsBlockButton: "clerk-social-button",
              footerActionLink: "clerk-footer-link",
            },
          }}
        >
          <BatchProvider>
            {children}
          </BatchProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
