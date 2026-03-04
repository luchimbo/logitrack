"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { api } from "@/lib/api";

const BatchContext = createContext();

export function BatchProvider({ children }) {
    const [batches, setBatches] = useState([]);
    const [currentBatchId, setCurrentBatchId] = useState(null);

    useEffect(() => {
        async function fetchBatches() {
            try {
                const data = await api("/batches");
                setBatches(data);

                // Auto-select today's batch if none selected
                if (data.length > 0) {
                    const today = new Date().toISOString().slice(0, 10);
                    const todayBatch = data.find((b) => b.date === today);
                    setCurrentBatchId(todayBatch ? todayBatch.id : data[0].id);
                }
            } catch (err) {
                console.error("Failed to load batches:", err);
            }
        }
        fetchBatches();
    }, []);

    return (
        <BatchContext.Provider value={{
            batches, currentBatchId, setCurrentBatchId, reloadBatches: async () => {
                const data = await api("/batches");
                setBatches(data);
            }
        }}>
            {children}
        </BatchContext.Provider>
    );
}

export function useBatch() {
    return useContext(BatchContext);
}
