"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query) {
    const subscribe = (onStoreChange) => {
        const media = window.matchMedia(query);
        media.addEventListener("change", onStoreChange);
        return () => media.removeEventListener("change", onStoreChange);
    };

    const getSnapshot = () => window.matchMedia(query).matches;

    return useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => false,
    );
}

export function useIsMobile() {
    return useMediaQuery("(max-width: 768px)");
}
