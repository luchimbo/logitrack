"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const BatchContext = createContext();

export function BatchProvider({ children }) {
    const [batches, setBatches] = useState([]);
    const [currentBatchId, setCurrentBatchId] = useState(null);

    // Period state: 'today' | 'date' | 'range' | 'week' | 'month' | 'year' | 'all'
    const [period, setPeriod] = useState('today');
    const [specificDate, setSpecificDate] = useState(''); // for 'date' period
    const [rangeFrom, setRangeFrom] = useState('');
    const [rangeTo, setRangeTo] = useState('');

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
    const getQueryString = useCallback((extra = '') => {
        let qs = '';
        if (period === 'date' && specificDate) {
            qs = `period=date&date=${specificDate}`;
        } else if (period === 'range') {
            qs = `period=range`;
            if (rangeFrom) qs += `&from=${rangeFrom}`;
            if (rangeTo) qs += `&to=${rangeTo}`;
        } else {
            qs = `period=${period}`;
        }
        if (extra) qs += `&${extra}`;
        return qs;
    }, [period, rangeFrom, rangeTo, specificDate]);

    const getTodayQueryString = useCallback((extra = '') => {
        let qs = 'period=today';
        if (extra) qs += `&${extra}`;
        return qs;
    }, []);

    const reloadBatches = useCallback(async () => {
        const data = await api("/batches");
        setBatches(data);
    }, []);

    return (
        <BatchContext.Provider value={{
            batches,
            currentBatchId,
            setCurrentBatchId,
            period,
            setPeriod,
            specificDate,
            setSpecificDate,
            rangeFrom,
            setRangeFrom,
            rangeTo,
            setRangeTo,
            getQueryString,
            getTodayQueryString,
            reloadBatches,
        }}>
            {children}
        </BatchContext.Provider>
    );
}

export function useBatch() {
    return useContext(BatchContext);
}
