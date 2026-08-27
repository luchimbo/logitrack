import crypto from "crypto";

const SECRET_MIN_LENGTH = 32;

function signingSecret() {
  const secret = String(process.env.CARRIER_PORTAL_SIGNING_SECRET || "").trim();
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new Error("CARRIER_PORTAL_SIGNING_SECRET no está configurado o es demasiado corto");
  }
  return secret;
}

export function createCarrierPortalPublicId() {
  return crypto.randomBytes(18).toString("base64url");
}

export function createCarrierPortalSecret({ publicId, workspaceId, carrierId }) {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`${publicId}:${workspaceId}:${carrierId}`)
    .digest("base64url");
}

export function isValidCarrierPortalSecret(link, suppliedSecret) {
  if (!suppliedSecret || !link?.public_id) return false;
  try {
    const expected = Buffer.from(createCarrierPortalSecret({
      publicId: link.public_id,
      workspaceId: link.workspace_id,
      carrierId: link.carrier_id,
    }));
    const received = Buffer.from(String(suppliedSecret));
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function buildCarrierPortalUrl({ origin, publicId, workspaceId, carrierId }) {
  const secret = createCarrierPortalSecret({ publicId, workspaceId, carrierId });
  return `${origin.replace(/\/$/, "")}/transportista/${publicId}#k=${secret}`;
}
