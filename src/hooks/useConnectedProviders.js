"use client";

import { useEffect, useState } from "react";

export function useConnectedProviders(currentUser) {
  const [connectedProviders, setConnectedProviders] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    const loadIntegrations = async () => {
      try {
        const res = await fetch('/api/admin/integrations');
        const data = await res.json();
        if (res.ok) {
          setConnectedProviders(Array.isArray(data.connectedProviders) ? data.connectedProviders : []);
        }
      } catch (err) {
        console.error('Integrations nav load error', err);
      }
    };

    loadIntegrations();
    window.addEventListener('integrations-changed', loadIntegrations);
    return () => window.removeEventListener('integrations-changed', loadIntegrations);
  }, [currentUser]);

  return connectedProviders;
}
