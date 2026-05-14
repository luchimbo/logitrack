import { auth, currentUser } from "@clerk/nextjs/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { logAudit } from "@/lib/audit";

const DEFAULT_GLOBAL_ADMIN_EMAIL = "camilopcmidi@gmail.com";

// Verificar configuración de Clerk
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
console.log("[Clerk Config] Publishable key exists:", !!clerkPublishableKey, "Length:", clerkPublishableKey?.length);
console.log("[Clerk Config] Secret key exists:", !!clerkSecretKey, "Length:", clerkSecretKey?.length);

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function shouldRefreshLastSeen(value) {
  if (!value) return true;
  const prev = new Date(value).getTime();
  if (!Number.isFinite(prev)) return true;
  return Date.now() - prev > 5 * 60 * 1000;
}

function getGlobalAdminEmails() {
  const configured = String(process.env.CLERK_GLOBAL_ADMIN_EMAILS || DEFAULT_GLOBAL_ADMIN_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : [DEFAULT_GLOBAL_ADMIN_EMAIL]);
}

function isGlobalAdminEmail(email) {
  return getGlobalAdminEmails().has(String(email || "").trim().toLowerCase());
}

function displayWorkspaceName(name, slug) {
  if (slug === "legacy") return "GeoModi";
  return name;
}

async function getLegacyWorkspaceId() {
  const result = await db.execute({
    sql: "SELECT id FROM workspaces WHERE slug = ? LIMIT 1",
    args: ["legacy"],
  });
  return result.rows.length ? Number(result.rows[0].id) : null;
}

async function createWorkspaceForClerkUser(email) {
  const baseSlug = slugify(email?.split("@")[0] || "mi-espacio") || "mi-espacio";
  let slug = baseSlug;
  let attempt = 1;

  while (true) {
    try {
      const inserted = await db.execute({
        sql: "INSERT INTO workspaces (name, slug) VALUES (?, ?)",
        args: ["Mi espacio", slug],
      });
      const workspaceId = Number(inserted.lastInsertRowid);
      await db.execute({
        sql: "INSERT OR IGNORE INTO workspace_settings (workspace_id, printing_setup_completed) VALUES (?, 0)",
        args: [workspaceId],
      });
      return workspaceId;
    } catch (e) {
      const msg = String(e?.message || "").toLowerCase();
      if (!msg.includes("unique")) throw e;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }
  }
}

async function ensureLegacyWorkspaceOwner(appUserId) {
  const workspaceId = await getLegacyWorkspaceId();
  if (!workspaceId) return null;

  await db.execute({
    sql: `INSERT INTO workspace_members (workspace_id, app_user_id, role)
          VALUES (?, ?, 'owner')
          ON CONFLICT(workspace_id, app_user_id) DO UPDATE SET role = 'owner'`,
    args: [workspaceId, appUserId],
  });

  return workspaceId;
}

async function bootstrapClerkUser() {
  await ensureDb();

  const clerkAuth = await auth();
  console.log("[bootstrapClerkUser] clerkAuth:", clerkAuth);
  if (!clerkAuth?.userId) {
    console.log("[bootstrapClerkUser] No userId found in clerkAuth");
    return null;
  }

  const clerkUser = await currentUser();
  console.log("[bootstrapClerkUser] clerkUser:", clerkUser ? "found" : "null", "email:", clerkUser?.primaryEmailAddress?.emailAddress);
  const email = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || null;
  if (!email) {
    throw new Error("No se pudo resolver email de Clerk");
  }

  let appUserResult = await db.execute({
    sql: "SELECT id, email, last_seen_at, onboarding_completed, is_global_admin FROM app_users WHERE clerk_user_id = ? LIMIT 1",
    args: [clerkAuth.userId],
  });

  let appUserId;
  const shouldBeGlobalAdmin = isGlobalAdminEmail(email);
  let dbGlobalAdmin = shouldBeGlobalAdmin;
  let onboardingCompleted = false;
  let lastSeenTouched = false;
  if (appUserResult.rows.length) {
    appUserId = Number(appUserResult.rows[0].id);
    dbGlobalAdmin = shouldBeGlobalAdmin || Number(appUserResult.rows[0].is_global_admin || 0) === 1;
    onboardingCompleted = Boolean(appUserResult.rows[0].onboarding_completed);
    if (shouldRefreshLastSeen(appUserResult.rows[0].last_seen_at)) {
      await db.execute({
        sql: "UPDATE app_users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [appUserId],
      });
      lastSeenTouched = true;
    }
    if (appUserResult.rows[0].email !== email) {
      await db.execute({
        sql: "UPDATE app_users SET email = ? WHERE id = ?",
        args: [email, appUserId],
      });
    }
    if (shouldBeGlobalAdmin && Number(appUserResult.rows[0].is_global_admin || 0) !== 1) {
      await db.execute({
        sql: "UPDATE app_users SET is_global_admin = 1 WHERE id = ?",
        args: [appUserId],
      });
    }
  } else {
    // Buscar si ya existe un usuario con este email (puede tener otro clerk_user_id)
    const existingByEmail = await db.execute({
      sql: "SELECT id, email, last_seen_at, onboarding_completed, is_global_admin FROM app_users WHERE email = ? LIMIT 1",
      args: [email],
    });

    if (existingByEmail.rows.length) {
      // Actualizar el clerk_user_id del usuario existente
      appUserId = Number(existingByEmail.rows[0].id);
      dbGlobalAdmin = shouldBeGlobalAdmin || Number(existingByEmail.rows[0].is_global_admin || 0) === 1;
      onboardingCompleted = Boolean(existingByEmail.rows[0].onboarding_completed);
      await db.execute({
        sql: "UPDATE app_users SET clerk_user_id = ?, last_seen_at = CURRENT_TIMESTAMP, is_global_admin = CASE WHEN ? = 1 THEN 1 ELSE is_global_admin END WHERE id = ?",
        args: [clerkAuth.userId, shouldBeGlobalAdmin ? 1 : 0, appUserId],
      });
      lastSeenTouched = true;
      console.log("[bootstrapClerkUser] Updated existing user with new clerk_user_id:", appUserId);
    } else {
      const insertedUser = await db.execute({
        sql: "INSERT INTO app_users (clerk_user_id, email, last_seen_at, is_global_admin) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
        args: [clerkAuth.userId, email, shouldBeGlobalAdmin ? 1 : 0],
      });
      appUserId = Number(insertedUser.lastInsertRowid);
      lastSeenTouched = true;
    }
  }

  if (shouldBeGlobalAdmin) {
    await ensureLegacyWorkspaceOwner(appUserId);
  }

  let membershipResult = await db.execute({
    sql: `SELECT wm.workspace_id, wm.role, w.name AS workspace_name, w.slug AS workspace_slug
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.app_user_id = ?
          ORDER BY CASE WHEN ? = 1 AND w.slug = 'legacy' THEN 0 ELSE 1 END, wm.id ASC
          LIMIT 1`,
    args: [appUserId, shouldBeGlobalAdmin ? 1 : 0],
  });

  if (!membershipResult.rows.length) {
    const workspaceId = await createWorkspaceForClerkUser(email);
    await db.execute({
      sql: "INSERT INTO workspace_members (workspace_id, app_user_id, role) VALUES (?, ?, ?)",
      args: [workspaceId, appUserId, "owner"],
    });
    membershipResult = await db.execute({
      sql: `SELECT wm.workspace_id, wm.role, w.name AS workspace_name, w.slug AS workspace_slug
            FROM workspace_members wm
            JOIN workspaces w ON w.id = wm.workspace_id
            WHERE wm.app_user_id = ?
            ORDER BY wm.id ASC
            LIMIT 1`,
      args: [appUserId],
    });
  }

  const membership = membershipResult.rows[0];

  const settings = await db.execute({
    sql: "SELECT printing_setup_completed FROM workspace_settings WHERE workspace_id = ? LIMIT 1",
    args: [membership.workspace_id],
  });

  if (lastSeenTouched) {
    await logAudit({
      workspaceId: Number(membership.workspace_id),
      appUserId,
      actorType: "clerk",
      actorLabel: email,
      action: "clerk_login",
      entityType: "user",
      entityId: appUserId,
    });
  }

  return {
    authType: "clerk",
    isAuthenticated: true,
    isGlobalAdmin: dbGlobalAdmin,
    id: `clerk:${clerkAuth.userId}`,
    appUserId,
    clerkUserId: clerkAuth.userId,
    email,
    username: email,
    role: membership.role || "user",
    workspaceId: Number(membership.workspace_id),
    workspaceName: displayWorkspaceName(membership.workspace_name, membership.workspace_slug),
    workspaceSlug: membership.workspace_slug,
    printingSetupCompleted: Boolean(settings.rows[0]?.printing_setup_completed),
    onboardingCompleted,
  };
}

async function getLegacyAdminFromRequest(request) {
  if (process.env.ENABLE_LEGACY_ADMIN !== "true") return null;

  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    console.error("Legacy auth disabled: JWT_SECRET is not configured");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    const workspaceId = await getLegacyWorkspaceId();
    return {
      authType: "legacy-admin",
      isAuthenticated: true,
      isGlobalAdmin: payload.role === "admin",
      id: `legacy:${payload.id}`,
      appUserId: null,
      username: payload.username,
      email: null,
      role: payload.role || "user",
      workspaceId,
      workspaceName: workspaceId ? "GeoModi" : null,
      workspaceSlug: workspaceId ? "legacy" : null,
      printingSetupCompleted: true,
      onboardingCompleted: true,
    };
  } catch {
    return null;
  }
}

export async function getCurrentActor(request) {
  console.log("[getCurrentActor] Starting...");
  const legacy = await getLegacyAdminFromRequest(request);
  console.log("[getCurrentActor] Legacy auth:", legacy ? "found" : "not found");
  if (legacy) return legacy;

  try {
    console.log("[getCurrentActor] Trying bootstrapClerkUser...");
    const result = await bootstrapClerkUser();
    console.log("[getCurrentActor] bootstrapClerkUser result:", result ? "success" : "null");
    return result;
  } catch (e) {
    console.error("[getCurrentActor] Clerk auth bootstrap error:", e.message || e);
    return null;
  }
}

export async function requireActor(request) {
  const actor = await getCurrentActor(request);
  if (!actor) {
    return { error: { status: 401, body: { error: "No autorizado" } } };
  }
  return { actor };
}

export async function requireWorkspaceActor(request) {
  const authResult = await requireActor(request);
  if (authResult.error) return authResult;
  if (!authResult.actor.workspaceId && !authResult.actor.isGlobalAdmin) {
    return { error: { status: 403, body: { error: "Workspace no disponible" } } };
  }
  return authResult;
}

export async function requireWorkspaceAdmin(request) {
  const authResult = await requireWorkspaceActor(request);
  if (authResult.error) return authResult;

  const role = authResult.actor.role || "user";
  if (!authResult.actor.isGlobalAdmin && !["owner", "admin"].includes(role)) {
    return { error: { status: 403, body: { error: "Permisos insuficientes" } } };
  }

  return authResult;
}

export async function requireGlobalAdmin(request) {
  const authResult = await requireActor(request);
  if (authResult.error) return authResult;
  if (!authResult.actor.isGlobalAdmin) {
    return { error: { status: 403, body: { error: "Solo admin global" } } };
  }
  return authResult;
}
