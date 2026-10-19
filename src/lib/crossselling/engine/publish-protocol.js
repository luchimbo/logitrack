// Sólo servidor: firma de las publicaciones Mostrador → Logitrack.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const digest = (body) => createHash("sha256").update(body).digest("hex");
export function publicationSignature({ key, method, path, timestamp, body = "" }) {
  if (typeof key !== "string" || key.length < 32) throw new Error("La clave de publicación debe tener al menos 32 caracteres");
  return createHmac("sha256", key).update([method, path, timestamp, digest(body)].join("\n")).digest("hex");
}
export function verifyPublication({ signature, now = Date.now(), ...input }) {
  if (!/^\d{13}$/.test(String(input.timestamp)) || Math.abs(now - Number(input.timestamp)) > 5 * 60_000 || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(publicationSignature(input), "hex"));
  } catch { return false; }
}

export function snapshotRevision(snapshot) {
  const { generatedAt: _date, ...content } = snapshot;
  return digest(JSON.stringify(content));
}
