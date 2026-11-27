// Un solo lugar para el admin global. CLERK_GLOBAL_ADMIN_EMAILS (separados por coma)
// reemplaza al valor por defecto; el primero es el dueño del espacio "legacy".
export const DEFAULT_GLOBAL_ADMIN_EMAIL = "camilopcmidi@gmail.com";

export function globalAdminEmails(env = process.env) {
  const configured = String(env.CLERK_GLOBAL_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : [DEFAULT_GLOBAL_ADMIN_EMAIL];
}

export function primaryGlobalAdminEmail(env = process.env) {
  return globalAdminEmails(env)[0];
}
