import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAppNavigation,
  buildMobileNavigation,
  getDefaultAppTab,
  isMobileMoreActive,
  resolveAppTab,
} from "../src/lib/appNavigation.js";

function navigationFor(currentUser, connectedProviders = []) {
  return buildAppNavigation({
    currentUser,
    canManageUsers: currentUser?.role === "owner",
    connectedProviders,
  });
}

test("legacy workspaces expose the daily operation in mobile navigation", () => {
  const currentUser = { workspaceSlug: "legacy", role: "owner" };
  const navGroups = navigationFor(currentUser);
  const mobile = buildMobileNavigation({ currentUser, navGroups });

  assert.deepEqual(
    mobile.primaryItems.map(({ id, label }) => ({ id, label })),
    [
      { id: "operationToday", label: "Hoy" },
      { id: "pickingList", label: "Picking" },
      { id: "flex", label: "Flex" },
      { id: "colecta", label: "Colecta" },
    ],
  );
  assert.equal(getDefaultAppTab({ currentUser, navGroups }), "operationToday");
});

test("regular workspaces use upload as the first mobile destination", () => {
  const currentUser = { workspaceSlug: "mi-tienda", role: "owner" };
  const navGroups = navigationFor(currentUser, ["tiendanube"]);
  const mobile = buildMobileNavigation({ currentUser, navGroups });

  assert.deepEqual(
    mobile.primaryItems.map((item) => item.id),
    ["upload", "pickingList", "flex", "colecta"],
  );
  assert.equal(getDefaultAppTab({ currentUser, navGroups }), "upload");
  assert.equal(
    mobile.moreGroups.flatMap((group) => group.items).some((item) => item.id === "tiendanube"),
    true,
  );
});

test("invalid tabs fall back to the workspace default", () => {
  const currentUser = { workspaceSlug: "mi-tienda", role: "user" };
  const navGroups = navigationFor(currentUser);

  assert.equal(resolveAppTab({ requestedTab: "missing", currentUser, navGroups }), "upload");
  assert.equal(resolveAppTab({ requestedTab: "dashboard", currentUser, navGroups }), "dashboard");
});

test("More is active only for destinations outside the four primary tabs", () => {
  const currentUser = { workspaceSlug: "mi-tienda", role: "owner" };
  const navGroups = navigationFor(currentUser);
  const { primaryItems } = buildMobileNavigation({ currentUser, navGroups });

  assert.equal(isMobileMoreActive({ activeTab: "upload", primaryItems }), false);
  assert.equal(isMobileMoreActive({ activeTab: "dashboard", primaryItems }), true);
});

test("la primera conexión y OAuth abren el módulo sin una conexión previa", () => {
  const currentUser = { workspaceSlug: "mi-tienda", role: "owner" };
  const navGroups = navigationFor(currentUser);
  for (const provider of ["tiendanube", "shopify", "mercadolibre", "zipnova"]) {
    assert.equal(resolveAppTab({ requestedTab: provider, currentUser, navGroups }), provider);
  }
  assert.equal(resolveAppTab({ requestedTab: "adminOverview", currentUser, navGroups }), "upload");
  assert.equal(resolveAppTab({ requestedTab: "tiendanube", currentUser: null, navGroups }), "upload");
});
