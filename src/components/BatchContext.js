"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { api } from "@/lib/api";

const BatchContext = createContext();

export function BatchProvider({ children }) {
    const [batches, setBatches] = useState([]);
    const [currentBatchId, setCurrentBatchId] = useState(null);

    // Period state: 'today' | 'date' | 'week' | 'month' | 'year' | 'all'
    const [period, setPeriod] = useState('today');
    const [specificDate, setSpecificDate] = useState(''); // for 'date' period

    useEffect(() => {
        async function fetchBatches() {
            try {
                const data = await api("/batches");
                setBatches(data);
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

    // Build query string based on active period
    const getQueryString = (extra = '') => {
        let qs = '';
        if (period === 'date' && specificDate) {
            qs = `period=date&date=${specificDate}`;
        } else {
            qs = `period=${period}`;
        }
        if (extra) qs += `&${extra}`;
        return qs;
    };

    return (
        <BatchContext.Provider value={{
            batches,
            currentBatchId,
            setCurrentBatchId,
            period,
            setPeriod,
            specificDate,
            setSpecificDate,
            getQueryString,
            reloadBatches: async () => {
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
