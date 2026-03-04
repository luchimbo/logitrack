"use client";

import { useState, useRef } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function UploadSection() {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    const fileInputRef = useRef(null);
    const { reloadBatches, setCurrentBatchId } = useBatch();

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    };

    const processFiles = async (files) => {
        setIsUploading(true);
        setUploadResult(null);

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        try {
            const result = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!result.ok) throw new Error("Error al procesar archivos");

            const data = await result.json();
            setUploadResult(data);

            // Update global context
            await reloadBatches();
            setCurrentBatchId(data.batch_id);

            toast(`✅ ${data.total_parsed} nuevos envíos agregados (${data.total_in_batch} total)`, "success");
        } catch (error) {
            console.error(error);
            toast("Error procesando las etiquetas", "error");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div id="section-upload" className="section active">
            <div className="section-header">
                <h1 className="section-title">📦 Subir Etiquetas</h1>
                <p className="section-subtitle">Arrastrá o seleccioná los archivos ZPL/TXT de etiquetas de MercadoLibre</p>
            </div>

            <div
                className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    className="upload-input"
                    ref={fileInputRef}
                    multiple
                    accept=".txt,.zpl,.TXT,.ZPL"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
                <div className="upload-icon">📄</div>
                <p className="upload-title">Arrastrá archivos aquí</p>
                <p className="upload-subtitle">o hacé click para seleccionar — Archivos .txt o .zpl</p>
            </div>

            {isUploading && (
                <div className="mt-md" style={{ display: 'block' }}>
                    <div className="card">
                        <div className="flex-between mb-md">
                            <span>Procesando archivos...</span>
                            <div className="spinner" style={{ width: '24px', height: '24px', margin: 0 }}></div>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: '100%', transition: 'width 2s' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {uploadResult && !isUploading && (
                <div className="mt-lg">
                    <div className="card" style={{ borderColor: 'var(--success)', borderLeft: '4px solid var(--success)' }}>
                        <h3 style={{ marginBottom: '16px' }}>✅ Resumen de Carga</h3>

                        <div className="stats-grid">
                            <div className="stat-card card accent">
                                <div className="stat-value">{uploadResult.total_in_batch}</div>
                                <div className="stat-label">Total en el lote</div>
                            </div>
                            <div className="stat-card card success">
                                <div className="stat-value">{uploadResult.total_parsed}</div>
                                <div className="stat-label">Nuevos agregados</div>
                            </div>
                        </div>

                        {uploadResult.total_skipped > 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
                                ⚠️ {uploadResult.total_skipped} envíos duplicados omitidos (ya estaban cargados)
                            </p>
                        )}

                        <div className="flex-between gap-sm" style={{ flexWrap: 'wrap', marginTop: '16px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                Archivos subidos: {uploadResult.filenames?.join(', ')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
