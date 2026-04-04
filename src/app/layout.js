import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "LogiTrack | Gestión",
  description: "Sistema Avanzado de Logística",
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
        <Analytics />
      </body>
    </html>
  );
}
