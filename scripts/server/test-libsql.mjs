import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";

const url = process.argv[2] || "http://127.0.0.1:18088";
const remote = "services/geomodi-libsql/keys";
const token = (name) => execFileSync("ssh", ["-o", "BatchMode=yes", "pcmidi", `cat ${remote}/${name}`], { encoding: "utf8" }).trim();
const rw = createClient({ url, authToken: token("app-rw.jwt") });
const ro = createClient({ url, authToken: token("portal-ro.jwt") });
const anonymous = createClient({ url });

let tableCreated = false;
try {
  await rw.execute("CREATE TABLE __geomodi_connectivity_probe (id INTEGER PRIMARY KEY, value TEXT)");
  tableCreated = true;
  const inserted = await rw.execute({ sql: "INSERT INTO __geomodi_connectivity_probe (value) VALUES (?)", args: ["ok"] });
  if (Number(inserted.lastInsertRowid) !== 1) throw new Error("lastInsertRowid incorrecto");
  const result = await ro.execute("SELECT value FROM __geomodi_connectivity_probe WHERE id = 1");
  if (result.rows[0]?.value !== "ok") throw new Error("La lectura con token RO falló");

  let readOnlyDenied = false;
  try {
    await ro.execute("INSERT INTO __geomodi_connectivity_probe (value) VALUES ('unexpected')");
  } catch {
    readOnlyDenied = true;
  }
  if (!readOnlyDenied) throw new Error("El token RO permitió escritura");

  let anonymousDenied = false;
  try {
    await anonymous.execute("SELECT 1");
  } catch {
    anonymousDenied = true;
  }
  if (!anonymousDenied) throw new Error("El servidor permitió acceso sin token");

  console.log("libSQL: escritura, lectura RO, permisos y lastInsertRowid verificados.");
} finally {
  if (tableCreated) await rw.execute("DROP TABLE __geomodi_connectivity_probe");
  rw.close();
  ro.close();
  anonymous.close();
}
