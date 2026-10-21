"use client";

import { useEffect, useState } from "react";
import { loginPath } from "@/lib/oauthNavigation";

export function useCurrentUser({ isLoaded, isSignedIn, router }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authErrorCode, setAuthErrorCode] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          setCurrentUser(null);
          setAuthChecked(true);
          setAuthError(errorData.errorDetail || errorData.error || `Error ${res.status}`);
          setAuthErrorCode(errorData.errorCode || (res.status >= 500 ? "SERVER_ERROR" : "AUTH_FAILED"));
          if (!isSignedIn) {
            router.replace(loginPath(window.location.pathname + window.location.search));
          }
          return;
        }

        const data = await res.json();
        const user = data.user || null;
        setCurrentUser(user);
        setShowOnboarding(Boolean(user && user.authType === 'clerk' && !user.isGlobalAdmin && !user.onboardingCompleted));
        setAuthChecked(true);
        setAuthError(null);
        setAuthErrorCode(null);
      } catch (err) {
        setCurrentUser(null);
        setAuthChecked(true);
        setAuthError(err.message || "Error de autenticación");
        setAuthErrorCode("SERVER_ERROR");
        if (!isSignedIn) {
          router.replace(loginPath(window.location.pathname + window.location.search));
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
    authErrorCode,
    showOnboarding,
    setShowOnboarding,
    markOnboardingClosed,
  };
}
