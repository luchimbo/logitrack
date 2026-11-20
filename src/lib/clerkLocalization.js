import { esES } from "@clerk/localizations";

// Clerk's es-ES mixes "usted" and "tú"; the rest of GeoModi speaks in "vos".
// Only the sign-in / sign-up screens people actually see are rewritten here.
const VOS = {
  formFieldInputPlaceholder__emailAddress: "tu@email.com",
  formFieldInputPlaceholder__emailAddress_username: "Email o usuario",
  formFieldInputPlaceholder__password: "Tu contraseña",
  formFieldInputPlaceholder__firstName: "Tu nombre",
  formFieldInputPlaceholder__lastName: "Tu apellido",
  formFieldInputPlaceholder__username: "Tu usuario",
  formFieldInputPlaceholder__phoneNumber: "Tu teléfono",
  formFieldInputPlaceholder__backupCode: "Tu código de respaldo",
  formFieldAction__forgotPassword: "¿Olvidaste tu contraseña?",
  signIn: {
    start: { title: "Entrar", subtitle: "para continuar a {{applicationName}}", actionText: "¿No tenés cuenta?", actionLink: "Registrate" },
    password: { title: "Ingresá tu contraseña", actionLink: "Usar otro método" },
    emailCode: { title: "Revisá tu email", resendButton: "Reenviar código" },
    forgotPasswordAlternativeMethods: { blockButton__resetPassword: "Restablecer tu contraseña", label__alternativeMethods: "O entrá con otro método" },
  },
  signUp: {
    start: { title: "Creá tu cuenta", titleCombined: "Creá tu cuenta", actionText: "¿Ya tenés cuenta?", actionLink: "Entrar" },
    emailCode: { title: "Verificá tu email", formSubtitle: "Ingresá el código que te enviamos por email", resendButton: "Reenviar código" },
    continue: { title: "Completá los datos que faltan", actionText: "¿Ya tenés cuenta?", actionLink: "Entrar" },
  },
};

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(base?.[key] || {}, value) : value;
  }
  return out;
}

export const geomodiLocalization = merge(esES, VOS);
