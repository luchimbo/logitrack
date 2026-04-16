"use client";

import { useMemo, useState } from "react";

const SAMPLE_ZPL = `^XA
^PW812
^LL2450
^FO30,30^GB760,2,2^FS
^FO40,70^A0N,42,42^FDVenta ID:20000 16000634360^FS
^FO40,140^A0N,36,36^FDPlaca Interfaz De Audio Arturia Minifuse 2^FS
^FO40,190^A0N,36,36^FDColor Blanco | Voltaje 5V | SKU ZT0160^FS
^FO30,260^GB760,2,2^FS
^FO40,300^A0N,36,36^FDRemitente #229557596^FS
^FO40,350^A0N,36,36^FDAv. Ramon Carrillo S/N^FS
^FO40,400^A0N,36,36^FDLa Matanza, Buenos Aires - 1772^FS
^FO40,450^A0N,36,36^FDVenta: 20000 16000634360^FS
^FO40,520^A0N,60,60^FDFBA02^FS
^FO250,520^GB540,75,3^FS
^FO300,540^A0N,48,48^FDDespachar: jueves 16/abr^FS
^FO200,640^BY3,3,180^BCN,180,Y,N,N^FD46863675638^FS
^FO180,900^GB620,120,3^FS
^FO190,930^A0N,80,80^FDFBA02 BA01_4 22:30^FS
^FO120,1080^A0N,220,220^FDSN01 A^FS
^FO30,1380^GB760,2,2^FS
^FO250,1450^BQN,2,8^FDLA,https://example.com/track/46863675638^FS
^FO30,2150^GB760,2,2^FS
^FO40,2200^A0N,46,46^FDTracking: 46863675638^FS
^FO40,2260^A0N,40,40^FDPrueba local de vista previa larga^FS
^XZ`;

export default function DevLabelPreviewPage() {
  const [zpl, setZpl] = useState(SAMPLE_ZPL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const stats = useMemo(() => ({
    chars: zpl.length,
    lines: zpl.split(/\r?\n/).length,
  }), [zpl]);

  const renderPreview = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dev/labels/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_zpl: zpl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message || "No se pudo renderizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Dev Label Preview</h1>
      <p style={{ margin: 0, color: "#94a3b8" }}>
        Proba etiquetas sin datos locales. Pega tu ZPL y renderizalo con Labelary desde desarrollo.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={renderPreview} disabled={loading}>
          {loading ? "Renderizando..." : "Renderizar"}
        </button>
        <span style={{ color: "#94a3b8", alignSelf: "center" }}>
          {stats.lines} lineas | {stats.chars} caracteres
        </span>
      </div>

      <textarea
        value={zpl}
        onChange={(e) => setZpl(e.target.value)}
        style={{
          width: "100%",
          minHeight: 260,
          background: "#0b1220",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
        }}
      />

      {error ? <p style={{ margin: 0, color: "#f87171" }}>{error}</p> : null}

      <section style={{ border: "1px solid #334155", borderRadius: 12, padding: 12, background: "#0f172a" }}>
        <div style={{
          width: "100%",
          height: "72vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Preview etiqueta"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff" }}
            />
          ) : (
            <p style={{ color: "#94a3b8" }}>Sin preview todavia</p>
          )}
        </div>
      </section>
    </main>
  );
}
