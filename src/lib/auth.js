import { auth, currentUser } from "@clerk/nextjs/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "logitrack-super-secret-key-2026-local");

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
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

async function bootstrapClerkUser() {
  await ensureDb();

  const clerkAuth = await auth();
  if (!clerkAuth?.userId) return null;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || null;
  if (!email) {
    throw new Error("No se pudo resolver email de Clerk");
  }

  let appUserResult = await db.execute({
    sql: "SELECT id, email FROM app_users WHERE clerk_user_id = ? LIMIT 1",
    args: [clerkAuth.userId],
  });

  let appUserId;
  if (appUserResult.rows.length) {
    appUserId = Number(appUserResult.rows[0].id);
    if (appUserResult.rows[0].email !== email) {
      await db.execute({
        sql: "UPDATE app_users SET email = ? WHERE id = ?",
        args: [email, appUserId],
      });
    }
  } else {
    const insertedUser = await db.execute({
      sql: "INSERT INTO app_users (clerk_user_id, email) VALUES (?, ?)",
      args: [clerkAuth.userId, email],
    });
    appUserId = Number(insertedUser.lastInsertRowid);
  }

  let membershipResult = await db.execute({
    sql: `SELECT wm.workspace_id, wm.role, w.name AS workspace_name, w.slug AS workspace_slug
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.app_user_id = ?
          ORDER BY wm.id ASC
          LIMIT 1`,
    args: [appUserId],
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

  return {
    authType: "clerk",
    isAuthenticated: true,
    isGlobalAdmin: false,
    id: `clerk:${clerkAuth.userId}`,
    clerkUserId: clerkAuth.userId,
    email,
    username: email,
    role: membership.role || "user",
    workspaceId: Number(membership.workspace_id),
    workspaceName: membership.workspace_name,
    workspaceSlug: membership.workspace_slug,
    printingSetupCompleted: Boolean(settings.rows[0]?.printing_setup_completed),
  };
}

async function getLegacyAdminFromRequest(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const workspaceId = await getLegacyWorkspaceId();
    return {
      authType: "legacy-admin",
      isAuthenticated: true,
      isGlobalAdmin: payload.role === "admin",
      id: `legacy:${payload.id}`,
      username: payload.username,
      email: null,
      role: payload.role || "user",
      workspaceId,
      workspaceName: workspaceId ? "LogiTrack Legacy" : null,
      workspaceSlug: workspaceId ? "legacy" : null,
      printingSetupCompleted: true,
    };
  } catch {
    return null;
  }
}

export async function getCurrentActor(request) {
  const legacy = await getLegacyAdminFromRequest(request);
  if (legacy) return legacy;

  try {
    return await bootstrapClerkUser();
  } catch (e) {
    console.error("Clerk auth bootstrap error:", e.message || e);
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
