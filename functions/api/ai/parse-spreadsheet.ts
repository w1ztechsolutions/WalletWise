import type { Env } from "../../../src/types/env";
import { error, getAuthUser, json } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";
import {
  isValidIsoDate,
  isValidIsoMonth,
  normalizeSheets,
  parseAmount,
  ACCOUNT_COLUMN_HEADERS,
  type ParsedSheetInput,
  type RawBudget,
  type RawTransaction,
  type SheetRow,
} from "../../../src/lib/importParser";

/**
 * POST /api/ai/parse-spreadsheet (Phase 6.6)
 *
 * Normalizes uploaded spreadsheet rows into transactions/budgets using
 * Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) with:
 *  - strict payload limits (chunk size fits even the smallest supported window),
 *  - row chunking + JSON-mode output + full server-side validation,
 *  - a deterministic per-chunk fallback (`normalizeSheets`) so an import
 *    never hard-fails when the model is unavailable or misbehaves.
 */

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_SHEETS = 10;
const MAX_TOTAL_ROWS = 2000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB
const CHUNK_SIZE = 25; // rows per model call (fits the smallest supported window)
const MAX_AI_CHUNKS = 24; // remaining chunks use the deterministic parser
const MAX_CELL_CHARS = 300;
const MAX_COLUMNS = 30;
const MAX_TOKENS = 2000;

interface ParsePayload {
  fileName: string;
  defaultDate: string;
  defaultMonth: string;
  sheets: ParsedSheetInput[];
}

const SYSTEM_PROMPT = `You are WalletWise's spreadsheet normalization engine. You convert raw spreadsheet rows into strict JSON.

Rules:
- Output ONLY a JSON object of exactly this shape — no markdown fences, no commentary:
{"transactions":[{"date":"YYYY-MM-DD","amount":0,"description":"","category":"","account":"","type":"expense","is_recurring":false}],"budgets":[{"month":"YYYY-MM","category":"","planned_amount":0}]}
- Transaction sheets produce entries in "transactions"; budget sheets produce entries in "budgets". I will tell you the sheet kind.
- amount / planned_amount must be positive numbers (strip currency symbols and thousands separators).
- dates must be strict YYYY-MM-DD and months strict YYYY-MM; use the provided defaults when a row lacks a usable value.
- type is "income" only when an explicit column or the sheet hint says income, otherwise "expense".
- category is the raw value of the category-like column, or "General" when absent.
- account is the raw account or wallet name when an explicit account-like column exists, otherwise an empty string. Never infer or invent account names.
- is_recurring is true only when a recurring/repeat column is explicitly true/yes/1.
- Skip rows that have no usable amount. Never invent rows and never copy cell values longer than needed.`;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function sanitizeRows(rows: SheetRow[]): SheetRow[] {
  const out: SheetRow[] = [];
  for (const row of rows) {
    const clean: SheetRow = {};
    let count = 0;
    for (const [rawKey, value] of Object.entries(row)) {
      if (count >= MAX_COLUMNS) break;
      if (value === null || value === undefined) continue;
      const key = rawKey.slice(0, 64);
      if (typeof value === "number" || typeof value === "boolean") {
        clean[key] = value;
      } else if (value instanceof Date) {
        clean[key] = value.toISOString();
      } else {
        clean[key] = String(value).slice(0, MAX_CELL_CHARS);
      }
      count++;
    }
    out.push(clean);
  }
  return out;
}

/**
 * Workers AI response shapes differ between model generations:
 *  - legacy:  string | { response: string }
 *  - newer:   { response: { content: [{ type: "text", text }] } }
 *  - OpenAI-compatible style: { choices: [{ message: { content } }] }
 * This normalizes all of them into a single text blob ("" when nothing usable).
 */
function readModelText(response: unknown): string {
  if (typeof response === "string") return response;
  if (typeof response !== "object" || response === null) return "";

  const collect = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null) {
          const text = (part as { text?: unknown }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("");
  };

  const record = response as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;
  if (record.response !== undefined) {
    const nested = collect(
      (record.response as { content?: unknown }).content ?? record.response
    );
    if (nested) return nested;
  }
  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as { message?: { content?: unknown } } | undefined;
    const messageText = collect(first?.message?.content);
    if (messageText) return messageText;
  }
  return collect(record.content);
}

function extractJson(text: string): unknown {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) trimmed = fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface SanitizeDefaults {
  defaultDate: string;
  defaultMonth: string;
}

function sanitizeTransaction(item: unknown, defaults: SanitizeDefaults): RawTransaction | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;

  const amount = typeof record.amount === "number" ? record.amount : parseAmount(record.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;

  const date = isValidIsoDate(record.date) ? record.date : defaults.defaultDate;
  const type = record.type === "income" ? "income" : "expense";

  return {
    date,
    amount,
    description: String(record.description ?? "").trim().slice(0, 200),
    category: String(record.category ?? "").trim().slice(0, 100) || "General",
    account: String(record.account ?? "").trim().slice(0, 100),
    type,
    is_recurring: record.is_recurring === true || record.is_recurring === "true",
  };
}

function sanitizeBudget(item: unknown, defaults: SanitizeDefaults): RawBudget | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;

  const raw = record.planned_amount ?? record.amount;
  const amount = typeof raw === "number" ? raw : parseAmount(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;

  const month = isValidIsoMonth(record.month) ? record.month : defaults.defaultMonth;
  return {
    month,
    category: String(record.category ?? "").trim().slice(0, 100) || "General",
    planned_amount: amount,
  };
}

/** Validates a model response object; drops every invalid record. */
function sanitizeAiOutput(
  payload: unknown,
  isBudgetSheet: boolean,
  defaults: SanitizeDefaults
): { transactions: RawTransaction[]; budgets: RawBudget[]; dropped: number } {
  const result = { transactions: [] as RawTransaction[], budgets: [] as RawBudget[], dropped: 0 };
  if (typeof payload !== "object" || payload === null) {
    result.dropped = 1;
    return result;
  }
  const record = payload as Record<string, unknown>;

  if (!isBudgetSheet && Array.isArray(record.transactions)) {
    for (const item of record.transactions) {
      const parsed = sanitizeTransaction(item, defaults);
      if (parsed) result.transactions.push(parsed);
      else result.dropped++;
    }
  }
  if (isBudgetSheet && Array.isArray(record.budgets)) {
    for (const item of record.budgets) {
      const parsed = sanitizeBudget(item, defaults);
      if (parsed) result.budgets.push(parsed);
      else result.dropped++;
    }
  }
  return result;
}

/** Reads + validates the request payload before any model work happens. */
async function readPayload(request: Request): Promise<{ ok: true; value: ParsePayload } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: error("Spreadsheet payload is too large.", 413) };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: error("Spreadsheet payload is too large.", 413) };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, response: error("Invalid JSON body") };
  }

  const { fileName, defaultDate, defaultMonth, sheets } = body;

  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { ok: false, response: error("At least one sheet is required.") };
  }
  if (sheets.length > MAX_SHEETS) {
    return { ok: false, response: error(`A maximum of ${MAX_SHEETS} sheets is supported.`) };
  }

  const parsedSheets: ParsedSheetInput[] = [];
  let totalRows = 0;
  for (const entry of sheets as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, response: error("Each sheet must be an object.") };
    }
    const sheet = entry as Record<string, unknown>;
    if (typeof sheet.name !== "string" || !Array.isArray(sheet.rows)) {
      return { ok: false, response: error("Each sheet needs a name and rows array.") };
    }
    totalRows += sheet.rows.length;
    if (totalRows > MAX_TOTAL_ROWS) {
      return { ok: false, response: error(`A maximum of ${MAX_TOTAL_ROWS} rows is supported.`) };
    }
    const rows = sanitizeRows(sheet.rows as SheetRow[]);
    parsedSheets.push({ name: sheet.name.slice(0, 64), rows });
  }

  return {
    ok: true,
    value: {
      fileName: typeof fileName === "string" ? fileName.slice(0, 255) : "spreadsheet",
      defaultDate: isValidIsoDate(defaultDate) ? defaultDate : new Date().toISOString().split("T")[0],
      defaultMonth: isValidIsoMonth(defaultMonth) ? defaultMonth : new Date().toISOString().slice(0, 7),
      sheets: parsedSheets,
    },
  };
}

/** Runs one chunk through Workers AI; returns null when unparseable. */
async function runAiChunk(
  env: Env,
  sheetName: string,
  isBudgetSheet: boolean,
  rows: SheetRow[],
  defaults: SanitizeDefaults
): Promise<unknown | null> {
  const userMessage = [
    `Sheet: ${sheetName}`,
    `Kind: ${isBudgetSheet ? "budget" : "transaction"}`,
    `Default date: ${defaults.defaultDate}`,
    `Default month: ${defaults.defaultMonth}`,
    "Rows (JSON):",
    JSON.stringify(rows),
  ].join("\n");

  const requestInput = {
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: userMessage },
    ],
    response_format: { type: "json_object" as const },
    temperature: 0,
    max_tokens: MAX_TOKENS,
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = readModelText(await env.AI.run(MODEL, requestInput));
      if (!text) {
        lastError = new Error("Model returned an empty response");
        continue;
      }
      const parsed = extractJson(text);
      if (parsed !== null) return parsed;
      lastError = new Error("Model returned non-JSON output");
    } catch (err) {
      lastError = err;
    }
  }
  console.error("Workers AI chunk failed, using deterministic fallback:", lastError);
  return null;
}

export const onRequestPost: PagesFunction<Env> = withErrorHandling(async (context) => {
  const injected = typeof context.data.userId === "string" ? context.data.userId : "";
  const userId = injected || (await getAuthUser(context.env, context.request))?.id;
  if (!userId) return error("Unauthorized", 401);

  const payload = await readPayload(context.request);
  if (!payload.ok) return payload.response;

  const { fileName, defaultDate, defaultMonth, sheets } = payload.value;
  const defaults: SanitizeDefaults = { defaultDate, defaultMonth };

  const transactions: RawTransaction[] = [];
  const budgets: RawBudget[] = [];
  const warnings: string[] = [];
  const stats = {
    sheets: sheets.length,
    rows: 0,
    chunks: 0,
    aiChunks: 0,
    fallbackChunks: 0,
    dropped: 0,
  };

  let aiBudgetLeft = MAX_AI_CHUNKS;
  let usedExplicitAccountColumn = false;

  for (const sheet of sheets) {
    stats.rows += sheet.rows.length;
    const isBudgetSheet = sheet.name.toLowerCase().includes("budget");

    for (const rowsChunk of chunk(sheet.rows, CHUNK_SIZE)) {
      stats.chunks++;
      const hasAccountColumn = rowsChunk.some((row) =>
        Object.keys(row).some((key) =>
          (ACCOUNT_COLUMN_HEADERS as readonly string[]).includes(key.toLowerCase().trim())
        )
      );
      usedExplicitAccountColumn ||= hasAccountColumn;

      let aiResult: unknown | null = null;
      if (context.env.AI && aiBudgetLeft > 0 && !hasAccountColumn) {
        aiBudgetLeft--;
        aiResult = await runAiChunk(context.env, sheet.name, isBudgetSheet, rowsChunk, defaults);
      }

      const sanitized = aiResult === null ? null : sanitizeAiOutput(aiResult, isBudgetSheet, defaults);
      if (
        sanitized &&
        (sanitized.transactions.length + sanitized.budgets.length > 0 || rowsChunk.length === 0)
      ) {
        stats.aiChunks++;
        stats.dropped += sanitized.dropped;
        transactions.push(...sanitized.transactions);
        budgets.push(...sanitized.budgets);
        if (sanitized.dropped > 0) {
          warnings.push(
            `${sanitized.dropped} invalid row(s) were dropped in sheet "${sheet.name}".`
          );
        }
      } else {
        stats.fallbackChunks++;
        if (aiResult !== null) {
          warnings.push(`AI returned no usable rows in sheet "${sheet.name}"; standard column matching was used.`);
        }
        const fallback = normalizeSheets([{ name: sheet.name, rows: rowsChunk }], defaults);
        transactions.push(...fallback.transactions);
        budgets.push(...fallback.budgets);
        warnings.push(...fallback.warnings);
      }
    }
  }

  if (stats.aiChunks === 0 && stats.chunks > 0) {
    warnings.push(
      usedExplicitAccountColumn
        ? "Standard column matching was used to preserve the provided account names."
        : "AI parsing was unavailable; standard column matching was used instead."
    );
  }

  const source = stats.aiChunks === 0 ? "fallback" : stats.fallbackChunks === 0 ? "ai" : "mixed";

  return json({ transactions, budgets, warnings, stats, source, fileName });
});



