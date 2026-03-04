import "./globals.css";
import { BatchProvider } from "@/components/BatchContext";

export const metadata = {
  title: "LogiTrack | Gestión",
  description: "Sistema Avanzado de Logística",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <BatchProvider>
          {children}
        </BatchProvider>
      </body>
    </html>
  );
}
