import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";
import { ClerkProvider } from "@clerk/nextjs";

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
      </body>
    </html>
  );
}
