export const ZONE_GROUPS = {
  capital_federal: "CABA",
  san_isidro: "GBA 1",
  vicente_lopez: "GBA 1",
  san_fernando: "GBA 1",
  san_martin: "GBA 1",
  "3_de_febrero": "GBA 1",
  hurlingham: "GBA 1",
  ituzaingo: "GBA 1",
  moron: "GBA 1",
  avellaneda: "GBA 1",
  lanus: "GBA 1",
  tigre: "GBA 2",
  malvinas_argentinas: "GBA 2",
  jose_c_paz: "GBA 2",
  san_miguel: "GBA 2",
  moreno: "GBA 2",
  merlo: "GBA 2",
  la_matanza: "GBA 2",
  la_matanza_sur: "GBA 2",
  la_matanza_norte: "GBA 1",
  ezeiza: "GBA 2",
  esteban_echeverria: "GBA 2",
  almirante_brown: "GBA 2",
  lomas_de_zamora: "GBA 1",
  quilmes: "GBA 2",
  berazategui: "GBA 2",
  florencio_varela: "GBA 2",
  escobar: "GBA 3",
  ingeniero_maschwitz: "GBA 3",
  pilar: "GBA 3",
  villa_rosa: "GBA 3",
  matheu: "GBA 3",
  dique_lujan: "GBA 3",
  lujan: "GBA 3",
  general_rodriguez: "GBA 3",
  marcos_paz: "GBA 3",
  canuelas: "GBA 3",
  san_vicente: "GBA 3",
  pte_peron: "GBA 3",
  ensenada: "GBA 3",
  campana: "GBA 3",
  zarate: "GBA 3",
  la_plata: "GBA 3",
  berisso: "GBA 3",
};

export const ZONE_ORDER = ["CABA", "GBA 1", "GBA 2", "GBA 3"];

export function normalizeName(name) {
  if (!name) return "";
  let s = String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (s.includes("campana")) return "campana";
  if (s.includes("zarate")) return "zarate";
  if (s.includes("lisandro_olmos")) return "la_plata";
  if (s.includes("la_plata")) return "la_plata";
  return s;
}

export function zoneForPartido(partido) {
  if (!partido) return null;
  return ZONE_GROUPS[normalizeName(partido)] || null;
}
