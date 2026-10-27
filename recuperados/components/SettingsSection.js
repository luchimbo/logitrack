"use client";

import { useCallback, useEffect, useState } from "react";
import { Input, Select, Button, ConfirmModal, Badge } from "@/components/ui";

export default function SettingsSection({ currentUser }) {
  const [activeSection, setActiveSection] = useState("general");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null, variant: "danger" });

  const [settings, setSettings] = useState({
    companyName: "",
    defaultCarrier: "",
    autoAssignZone: false,
    notifyOnIncident: true,
    printFormat: "zpl",
    timezone: "America/Argentina/Buenos_Aires",
    language: "es",
  });

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("No se pudieron guardar los cambios");
      showToast("Configuración guardada correctamente");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const sections = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "notifications", label: "Notificaciones", icon: "🔔" },
    { id: "printing", label: "Impresión", icon: "🖨️" },
    { id: "data", label: "Datos", icon: "🗄️" },
  ];

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Configuración</h2>
        <p className="section-subtitle">
          Administrá las preferencias de tu workspace. Los cambios se aplican a todos los usuarios.
        </p>
      </div>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="settings-nav-icon">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          {activeSection === "general" && (
            <div className="settings-group">
              <h3 className="settings-group-title">Configuración general</h3>
              <div className="settings-form">
                <Input
                  label="Nombre de la empresa"
                  id="companyName"
                  value={settings.companyName}
                  onChange={(e) => handleChange("companyName", e.target.value)}
                  placeholder="Mi empresa"
                  helperText="Este nombre aparecerá en etiquetas y reportes"
                />
                <Select
                  label="Zona horaria"
                  id="timezone"
                  value={settings.timezone}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                >
                  <option value="America/Argentina/Buenos_Aires">Buenos Aires (GMT-3)</option>
                  <option value="America/Argentina/Cordoba">Córdoba (GMT-3)</option>
                  <option value="America/Argentina/Tucuman">Tucumán (GMT-3)</option>
                </Select>
                <Select
                  label="Idioma"
                  id="language"
                  value={settings.language}
                  onChange={(e) => handleChange("language", e.target.value)}
                >
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                </Select>
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="settings-group">
              <h3 className="settings-group-title">Notificaciones</h3>
              <div className="settings-form">
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.notifyOnIncident}
                    onChange={(e) => handleChange("notifyOnIncident", e.target.checked)}
                  />
                  <span className="settings-toggle-slider" />
                  <div className="settings-toggle-text">
                    <span className="settings-toggle-label">Notificar incidencias</span>
                    <span className="settings-toggle-description">
                      Recibí alertas cuando un envío tenga problemas de asignación
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {activeSection === "printing" && (
            <div className="settings-group">
              <h3 className="settings-group-title">Impresión</h3>
              <div className="settings-form">
                <Select
                  label="Formato de impresión"
                  id="printFormat"
                  value={settings.printFormat}
                  onChange={(e) => handleChange("printFormat", e.target.value)}
                  helperText="ZPL es el formato estándar para impresoras térmicas"
                >
                  <option value="zpl">ZPL (Impresora térmica)</option>
                  <option value="pdf">PDF (Impresora estándar)</option>
                  <option value="png">PNG (Imagen)</option>
                </Select>
              </div>
            </div>
          )}

          {activeSection === "data" && (
            <div className="settings-group">
              <h3 className="settings-group-title">Gestión de datos</h3>
              <div className="settings-form">
                <p className="settings-description">
                  Estas acciones son irreversibles. Asegurate de tener un backup antes de continuar.
                </p>
                <div className="settings-danger-zone">
                  <h4 className="settings-danger-title">Zona de peligro</h4>
                  <div className="settings-danger-actions">
                    <Button
                      variant="danger"
                      onClick={() =>
                        setConfirmModal({
                          open: true,
                          title: "Eliminar todos los datos",
                          message: "¿Estás seguro? Esta acción eliminará todos los envíos, etiquetas y configuraciones. No se puede deshacer.",
                          variant: "danger",
                          onConfirm: async () => {
                            setConfirmModal((prev) => ({ ...prev, open: false }));
                          },
                        })
                      }
                    >
                      Eliminar todos los datos
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="settings-footer">
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmLabel="Confirmar"
        loading={saving}
      />
    </section>
  );
}
