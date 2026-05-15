"use client";

import { useEffect, useState } from "react";

export function useCurrentUser({ isLoaded, isSignedIn, router }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          setCurrentUser(null);
          setAuthChecked(true);
          setAuthError(errorData.errorDetail || errorData.error || `Error ${res.status}`);
          if (!isSignedIn) {
            router.replace("/login");
          }
          return;
        }

        const data = await res.json();
        const user = data.user || null;
        setCurrentUser(user);
        setShowOnboarding(Boolean(user && user.authType === 'clerk' && !user.isGlobalAdmin && !user.onboardingCompleted));
        setAuthChecked(true);
        setAuthError(null);
      } catch (err) {
        setCurrentUser(null);
        setAuthChecked(true);
        setAuthError(err.message || "Error de autenticación");
        if (!isSignedIn) {
          router.replace("/login");
        }
      }
    };

    if (isLoaded) {
      loadUser();
    }
  }, [router, isSignedIn, isLoaded]);

  const markOnboardingClosed = async (completed) => {
    try {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      setCurrentUser((prev) => prev ? { ...prev, onboardingCompleted: true } : prev);
    } catch (err) {
      console.error('Onboarding update error', err);
    } finally {
      setShowOnboarding(false);
    }
  };

  return {
    currentUser,
    setCurrentUser,
    authChecked,
    authError,
    showOnboarding,
    setShowOnboarding,
    markOnboardingClosed,
  };
}
