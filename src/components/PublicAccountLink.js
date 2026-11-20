"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

// Public pages show "Entrar"; a signed-in visitor (e.g. coming from Soporte in the app) goes back instead.
export default function PublicAccountLink({ className }) {
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = isLoaded && isSignedIn;
  return <Link className={className} href={signedIn ? "/app" : "/login"}>{signedIn ? "Ir a la app" : "Entrar"}</Link>;
}
