// Disparador por nombre: valor y excluir son listas separadas por coma. Cada elemento coincide si todas sus
// palabras aparecen completas en el nombre, en cualquier orden ("guitarra midiplus", "minifuse", "studio m").
const palabras = (s) => ` ${String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const frases = (lista) => String(lista || "").split(",").map((x) => palabras(x).trim()).filter(Boolean);
const contieneFrase = (nombre, frase) => frase.split(" ").every((w) => nombre.includes(` ${w} `));

export function coincideNombre(disparador, p) {
  const nombre = palabras(p.nombre);
  return frases(disparador.valor).some((f) => contieneFrase(nombre, f)) && !frases(disparador.excluir).some((f) => contieneFrase(nombre, f));
}
