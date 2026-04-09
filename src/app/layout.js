import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "GeoModi | Gestión",
  description: "Plataforma de gestión logística GeoModi",
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
