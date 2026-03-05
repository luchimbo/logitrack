#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { parseZplFile } from "../../src/lib/zplParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "config.example.json");
const PENDING_QUEUE_PATH = path.join(DATA_DIR, "pending_jobs.json");
const TRACKING_INDEX_PATH = path.join(DATA_DIR, "known_trackings.json");
const HISTORY_PATH = path.join(DATA_DIR, "print_history.jsonl");
const LAST_RUN_LOG_PATH = path.join(DATA_DIR, "last_run.log");

const DEFAULT_PRINTER_PATH = "\\\\127.0.0.1\\ZDesigner ZD420-203dpi ZPL";

function sanitizePrinterPath(value) {
  let s = String(value || "").trim();
  if (!s) return DEFAULT_PRINTER_PATH;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  while (s.endsWith("\\") || s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function logLine(message) {
  const line = String(message);
  process.stdout.write(`${line}\n`);
  try {
    fs.appendFileSync(LAST_RUN_LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore log write errors
  }
}

function sanitizeSyncUrl(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (s.includes("tu-dominio") || s.includes("<") || s.includes(">")) return "";
  return s;
}

function getSyncUrlCandidates(config) {
  const candidates = [
    sanitizeSyncUrl(config.syncUrl),
    "http://localhost:3000/api/v2/print-jobs/intake",
    "https://logitrack-tan.vercel.app/api/v2/print-jobs/intake",
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function loadConfig() {
  const fromFile = readJson(CONFIG_PATH, {});
  return {
    printerPath:
      sanitizePrinterPath(
        process.env.PRINT_V2_PRINTER_PATH ||
        fromFile.printerPath ||
        DEFAULT_PRINTER_PATH
      ),
    syncUrl: process.env.PRINT_V2_SYNC_URL || fromFile.syncUrl || "",
    syncToken: process.env.PRINT_V2_SYNC_TOKEN || fromFile.syncToken || "",
    retryBeforePrint: fromFile.retryBeforePrint !== false,
    dryRun: process.env.PRINT_V2_DRY_RUN === "1" || fromFile.dryRun === true,
  };
}

function loadPendingQueue() {
  return readJson(PENDING_QUEUE_PATH, []);
}

function savePendingQueue(queue) {
  writeJson(PENDING_QUEUE_PATH, queue);
}

function loadKnownTrackings() {
  const data = readJson(TRACKING_INDEX_PATH, { tracking: {}, fingerprints: {} });
  if (!data || typeof data !== "object") {
    return { tracking: {}, fingerprints: {} };
  }
  if (!data.tracking || typeof data.tracking !== "object") {
    data.tracking = {};
  }
  if (!data.fingerprints || typeof data.fingerprints !== "object") {
    data.fingerprints = {};
  }
  return data;
}

function saveKnownTrackings(index) {
  writeJson(TRACKING_INDEX_PATH, index);
}

function appendHistory(job) {
  fs.appendFileSync(HISTORY_PATH, `${JSON.stringify(job)}\n`);
}

function normalizeSku(value) {
  if (!value) return "SIN-SKU";
  return String(value).trim().toUpperCase() || "SIN-SKU";
}

function decodeLabelText(buffer) {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("\uFFFD")) {
    return buffer.toString("latin1");
  }
  return utf8;
}

function computeLabelFingerprint(rawBlock) {
  const normalized = String(rawBlock || "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function extractZplBlocks(content) {
  const blocks = [];
  const regex = /\^XA([\s\S]*?)\^XZ/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    if (block && block.trim().length >= 50) {
      blocks.push(block);
    }
  }
  return blocks;
}

function parseSingleLabel(block) {
  const rows = parseZplFile(`^XA${block}^XZ`);
  return rows[0] || null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (!s) continue;
    return s;
  }
  return null;
}

function extractSkuFromRawBlock(rawBlock) {
  const m = String(rawBlock || "").match(/SKU:\s*([^\^|]+)/i);
  return m ? m[1].trim() : null;
}

function extractTrackingFromRawBlock(rawBlock) {
  const text = String(rawBlock || "");
  const jsonId = text.match(/"id"\s*:\s*"(\d+)"/);
  if (jsonId) return jsonId[1];
  const barcodeId = text.match(/\^FD>:(\d+)\^FS/);
  if (barcodeId) return barcodeId[1];
  return null;
}

function detectShippingMethodFromRawBlock(rawBlock) {
  const text = String(rawBlock || "");
  if (text.includes("Domicilio:") || text.includes("Ciudad de destino:") || /\^BCN,/.test(text)) {
    return "colecta";
  }
  if (text.includes("sender_id") || text.includes("hash_code") || /Env.{1,3}o Flex/.test(text)) {
    return "flex";
  }
  return null;
}

function buildParsedLabel(rawBlock) {
  const parsed = parseSingleLabel(rawBlock);
  const fallback = {
    sku: extractSkuFromRawBlock(rawBlock),
    tracking_number: extractTrackingFromRawBlock(rawBlock),
    shipping_method: detectShippingMethodFromRawBlock(rawBlock),
  };

  return {
    parsed: { ...fallback, ...(parsed || {}) },
    parserMatched: Boolean(parsed),
  };
}

function sortLabelsBySkuFrequency(labels) {
  const bySku = new Map();

  for (const label of labels) {
    const list = bySku.get(label.skuNorm) || [];
    list.push(label);
    bySku.set(label.skuNorm, list);
  }

  const sortedGroups = Array.from(bySku.entries())
    .map(([sku, items]) => ({ sku, count: items.length, items }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
    });

  const ordered = [];
  for (const group of sortedGroups) {
    ordered.push(...group.items);
  }

  return { ordered, sortedGroups };
}

function buildPrintFileContent(orderedLabels) {
  return orderedLabels.map((l) => `^XA${l.rawBlock}^XZ`).join("\r\n");
}

function printFileToSharedPrinter(filePath, printerPath) {
  if (!printerPath.startsWith("\\\\")) {
    throw new Error(`Ruta de impresora invalida: ${printerPath}`);
  }

  const result = spawnSync("cmd.exe", ["/c", "copy", "/b", filePath, printerPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(
      `${stderr || stdout || "No se pudo enviar a impresora compartida"} | printerPath=${printerPath}`
    );
  }
}

function buildJobId() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".", "")
    .replace("T", "-")
    .slice(0, 17);
  const rand = Math.random().toString(36).slice(2, 8);
  return `job-${stamp}-${rand}`;
}

function buildJobPayload({
  jobId,
  fileArgs,
  sortedGroups,
  orderedLabels,
  printerPath,
  printFilePath,
  knownTrackingIndex,
  isDryRun,
}) {
  const seenInThisJob = new Set();

  const labels = orderedLabels.map((label, index) => {
    const tracking = label.parsed?.tracking_number || null;
    const fingerprint = label.fingerprint || null;
    const alreadyKnown = tracking ? Boolean(knownTrackingIndex.tracking[tracking]) : false;
    const alreadyKnownByFingerprint = fingerprint ? Boolean(knownTrackingIndex.fingerprints[fingerprint]) : false;
    const repeatedInJob = tracking ? seenInThisJob.has(tracking) : false;
    const repeatedFingerprintInJob = fingerprint ? seenInThisJob.has(`fp:${fingerprint}`) : false;
    const isReprint = Boolean(
      (tracking && (alreadyKnown || repeatedInJob)) ||
      (fingerprint && (alreadyKnownByFingerprint || repeatedFingerprintInJob))
    );
    if (tracking) seenInThisJob.add(tracking);
    if (fingerprint) seenInThisJob.add(`fp:${fingerprint}`);

    return {
      order: index + 1,
      sku: label.skuNorm,
      tracking_number: tracking,
      label_fingerprint: fingerprint,
      raw_block: label.rawBlock,
      sale_type: label.parsed?.sale_type || null,
      sale_id: label.parsed?.sale_id || null,
      product_name: label.parsed?.product_name || null,
      quantity: Number(label.parsed?.quantity) || 1,
      remitente_id: label.parsed?.remitente_id || null,
      color: label.parsed?.color || null,
      voltage: label.parsed?.voltage || null,
      recipient_name: label.parsed?.recipient_name || null,
      recipient_user: label.parsed?.recipient_user || null,
      address: label.parsed?.address || null,
      postal_code: firstNonEmpty(label.parsed?.postal_code),
      city: label.parsed?.city || null,
      partido: label.parsed?.partido || null,
      province: label.parsed?.province || null,
      reference: label.parsed?.reference || null,
      shipping_method: label.parsed?.shipping_method || null,
      carrier_code: label.parsed?.carrier_code || null,
      carrier_name: label.parsed?.carrier_name || null,
      assigned_carrier: label.parsed?.assigned_carrier || null,
      dispatch_date: label.parsed?.dispatch_date || null,
      delivery_date: label.parsed?.delivery_date || null,
      is_reprint: isReprint,
    };
  });

  const totals = {
    labels_total: labels.length,
    skus_total: sortedGroups.length,
    reprints_total: labels.filter((l) => l.is_reprint).length,
  };

  return {
    v: 1,
    job_id: jobId,
    is_dry_run: Boolean(isDryRun),
    created_at: new Date().toISOString(),
    source_files: fileArgs,
    printer_path: printerPath,
    print_file_path: printFilePath,
    sku_order: sortedGroups.map((g) => ({ sku: g.sku, count: g.count })),
    totals,
    labels,
  };
}

async function syncJob(job, config) {
  const urls = getSyncUrlCandidates(config);
  if (!urls.length) {
    return { ok: false, reason: "SYNC_URL no configurada" };
  }

  const headers = { "Content-Type": "application/json" };
  if (config.syncToken) {
    headers["x-print-agent-token"] = config.syncToken;
  }

  const errors = [];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(job),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        errors.push(`${url} -> HTTP ${response.status} ${body}`);
        continue;
      }

      return { ok: true, url };
    } catch (error) {
      errors.push(`${url} -> ${error.message || "Sync fallida"}`);
    }
  }

  return { ok: false, reason: errors.join(" | ") || "Sync fallida" };
}

async function retryPendingJobs(config) {
  const queue = loadPendingQueue();
  if (!queue.length) return;

  const stillPending = [];
  for (const pending of queue) {
    const result = await syncJob(pending.job, config);
    if (!result.ok) {
      stillPending.push({
        ...pending,
        retry_count: (pending.retry_count || 0) + 1,
        last_error: result.reason,
        last_attempt_at: new Date().toISOString(),
      });
    } else {
      logLine(`Reintento OK: ${pending.job.job_id}`);
    }
  }

  savePendingQueue(stillPending);
}

function queueJobForRetry(job, reason) {
  const queue = loadPendingQueue();
  queue.push({
    job,
    queued_at: new Date().toISOString(),
    retry_count: 0,
    last_error: reason,
  });
  savePendingQueue(queue);
}

function updateKnownTrackingsAfterPrint(job, knownTrackingIndex) {
  for (const label of job.labels) {
    if (label.tracking_number && !knownTrackingIndex.tracking[label.tracking_number]) {
      knownTrackingIndex.tracking[label.tracking_number] = {
        first_print_job: job.job_id,
        first_print_at: job.created_at,
      };
    }

    if (label.label_fingerprint && !knownTrackingIndex.fingerprints[label.label_fingerprint]) {
      knownTrackingIndex.fingerprints[label.label_fingerprint] = {
        first_print_job: job.job_id,
        first_print_at: job.created_at,
      };
    }
  }
}

function resolveInputFiles(argv) {
  const accepted = new Set([".txt", ".zpl"]);

  const files = argv
    .map((x) => path.resolve(process.cwd(), x))
    .filter((x) => fs.existsSync(x))
    .filter((x) => fs.statSync(x).isFile())
    .filter((x) => accepted.has(path.extname(x).toLowerCase()));

  return files;
}

async function main() {
  ensureDataDir();
  const config = loadConfig();
  const dryRunArg = process.argv.includes("--dry-run");
  const retryOnlyArg = process.argv.includes("--retry-only");
  if (dryRunArg) config.dryRun = true;

  if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    logLine("Tip: copiar config.example.json a config.json para configurar sync.");
  }

  if (config.retryBeforePrint) {
    await retryPendingJobs(config);
  }

  if (retryOnlyArg) {
    const pending = loadPendingQueue().length;
    logLine(`Reintento finalizado. Pendientes: ${pending}`);
    return;
  }

  const fileArgs = resolveInputFiles(process.argv.slice(2));
  if (!fileArgs.length) {
    logLine("No hay archivos .txt/.zpl para procesar.");
    return;
  }

  logLine(`Archivos recibidos: ${fileArgs.length}`);

  const extracted = [];
  let parserMisses = 0;
  for (const filePath of fileArgs) {
    const buffer = fs.readFileSync(filePath);
    const text = decodeLabelText(buffer);
    const blocks = extractZplBlocks(text);

    for (const rawBlock of blocks) {
      const { parsed, parserMatched } = buildParsedLabel(rawBlock);
      const hasIdentity = Boolean(parsed?.tracking_number || parsed?.sku);
      if (!parserMatched && !hasIdentity) {
        continue;
      }
      if (!parserMatched) parserMisses += 1;
      extracted.push({
        sourceFile: path.basename(filePath),
        rawBlock,
        fingerprint: computeLabelFingerprint(rawBlock),
        parsed,
        skuNorm: normalizeSku(parsed.sku),
      });
    }
  }

  if (!extracted.length) {
    throw new Error("No se detectaron bloques ZPL imprimibles en los archivos");
  }

  const { ordered, sortedGroups } = sortLabelsBySkuFrequency(extracted);
  const jobId = buildJobId();
  const printContent = buildPrintFileContent(ordered);
  const printFilePath = path.join(DATA_DIR, `${jobId}.txt`);
  let previewPath = null;

  fs.writeFileSync(printFilePath, printContent, "utf8");
  try {
    previewPath = path.join(path.dirname(fileArgs[0]), "ultimo_ordenado_v2.txt");
    fs.writeFileSync(previewPath, printContent, "utf8");
  } catch {
    previewPath = null;
  }

  logLine(`Etiquetas parseadas: ${ordered.length}`);
  if (parserMisses > 0) {
    logLine(`Advertencia: ${parserMisses} etiqueta(s) con parseo parcial (se imprimen igual).`);
  }
  if (sortedGroups.length) {
    const top = sortedGroups
      .slice(0, 5)
      .map((x) => `${x.sku}:${x.count}`)
      .join(", ");
    logLine(`Orden SKU (top): ${top}`);
  }

  if (!config.dryRun) {
    printFileToSharedPrinter(printFilePath, config.printerPath);
  }

  const knownTrackingIndex = loadKnownTrackings();
  const job = buildJobPayload({
    jobId,
    fileArgs: fileArgs.map((x) => path.basename(x)),
    sortedGroups,
    orderedLabels: ordered,
    printerPath: config.printerPath,
    printFilePath,
    knownTrackingIndex,
    isDryRun: config.dryRun,
  });

  if (!config.dryRun) {
    updateKnownTrackingsAfterPrint(job, knownTrackingIndex);
    saveKnownTrackings(knownTrackingIndex);
    appendHistory(job);
  }

  logLine(`${config.dryRun ? "Dry-run listo" : "Impresion enviada"}. Job: ${job.job_id}`);
  logLine(`Etiquetas: ${job.totals.labels_total} | Reprints: ${job.totals.reprints_total}`);
  logLine(`TXT ordenado: ${printFilePath}`);
  if (previewPath) {
    logLine(`Preview ordenado: ${previewPath}`);
  }

  if (config.dryRun) {
    logLine("Dry-run activo: sync e historial local omitidos.");
    return;
  }

  const syncResult = await syncJob(job, config);
  if (!syncResult.ok) {
    queueJobForRetry(job, syncResult.reason);
    logLine(`Sync pendiente: ${syncResult.reason}`);
  } else {
    logLine(`Sync OK (${syncResult.url})`);
  }
}

main().catch((error) => {
  console.error("V2 print agent error:", error.message || error);
  process.exit(1);
});
