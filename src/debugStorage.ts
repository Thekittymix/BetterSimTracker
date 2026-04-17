import type { DeltaDebugRecord } from "./types";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & { length: number };

const DEBUG_STORAGE_PREFIX = "bst-debug:";
const TRACE_SUFFIX = ":trace";
const MAX_DEBUG_SCOPE_COUNT = 2;
const MAX_DEBUG_STORAGE_CHARS = 90_000;
const MAX_TRACE_LINES = 80;
const MAX_TRACE_LINE_CHARS = 220;
const MAX_DEBUG_TEXT_CHARS = 3_000;

function truncateText(value: string | undefined, maxChars = MAX_DEBUG_TEXT_CHARS): string | undefined {
  if (typeof value !== "string") return value;
  if (value.length <= maxChars) return value;
  const headChars = Math.max(0, Math.floor((maxChars - 32) / 2));
  const tailChars = Math.max(0, maxChars - headChars - 32);
  const omitted = value.length - headChars - tailChars;
  return `${value.slice(0, headChars)}\n...[truncated ${omitted} chars]...\n${value.slice(value.length - tailChars)}`;
}

export function trimTraceLinesForStorage(lines: string[]): string[] {
  return lines
    .slice(-MAX_TRACE_LINES)
    .map(line => truncateText(String(line ?? ""), MAX_TRACE_LINE_CHARS) ?? "")
    .filter(Boolean);
}

export function trimDebugRecordForStorage(record: DeltaDebugRecord): DeltaDebugRecord {
  return {
    ...record,
    rawModelOutput: truncateText(record.rawModelOutput, MAX_DEBUG_TEXT_CHARS) ?? "",
    promptText: truncateText(record.promptText, MAX_DEBUG_TEXT_CHARS),
    contextText: truncateText(record.contextText, MAX_DEBUG_TEXT_CHARS),
    meta: record.meta
      ? {
          ...record.meta,
          jsonShadow: record.meta.jsonShadow
            ? {
                ...record.meta.jsonShadow,
                requestText: truncateText(record.meta.jsonShadow.requestText, MAX_DEBUG_TEXT_CHARS),
                responseText: truncateText(record.meta.jsonShadow.responseText, MAX_DEBUG_TEXT_CHARS),
              }
            : record.meta.jsonShadow,
        }
      : record.meta,
    trace: trimTraceLinesForStorage(record.trace ?? []),
  };
}

function readSavedAt(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown };
    return typeof parsed?.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
  } catch {
    return 0;
  }
}

function resolveScopeKey(key: string): string {
  return key.endsWith(TRACE_SUFFIX) ? key.slice(0, -TRACE_SUFFIX.length) : key;
}

function listDebugScopes(storage: StorageLike): Array<{ scopeKey: string; savedAt: number; totalChars: number; keys: string[] }> {
  const byScope = new Map<string, { scopeKey: string; savedAt: number; totalChars: number; keys: string[] }>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(DEBUG_STORAGE_PREFIX)) continue;
    const raw = storage.getItem(key) ?? "";
    const scopeKey = resolveScopeKey(key);
    const current = byScope.get(scopeKey) ?? { scopeKey, savedAt: 0, totalChars: 0, keys: [] };
    current.savedAt = Math.max(current.savedAt, readSavedAt(raw));
    current.totalChars += raw.length;
    current.keys.push(key);
    byScope.set(scopeKey, current);
  }
  return [...byScope.values()].sort((left, right) => right.savedAt - left.savedAt);
}

function dropScope(storage: StorageLike, scopeKey: string): void {
  storage.removeItem(scopeKey);
  storage.removeItem(`${scopeKey}${TRACE_SUFFIX}`);
}

export function enforceDebugStorageBudget(storage: StorageLike, currentScopeKey: string): void {
  let scopes = listDebugScopes(storage);
  let totalChars = scopes.reduce((sum, scope) => sum + scope.totalChars, 0);

  const canDrop = (scopeKey: string): boolean => scopeKey !== currentScopeKey;

  while (scopes.length > MAX_DEBUG_SCOPE_COUNT || totalChars > MAX_DEBUG_STORAGE_CHARS) {
    const victim = [...scopes].reverse().find(scope => canDrop(scope.scopeKey));
    if (!victim) return;
    dropScope(storage, victim.scopeKey);
    scopes = listDebugScopes(storage);
    totalChars = scopes.reduce((sum, scope) => sum + scope.totalChars, 0);
  }
}

export function persistDebugStorageValue(storage: StorageLike, key: string, value: string): void {
  const scopeKey = resolveScopeKey(key);
  enforceDebugStorageBudget(storage, scopeKey);
  try {
    storage.setItem(key, value);
  } catch {
    // If storage is still full, purge everything except the current scope and retry once.
    for (const scope of listDebugScopes(storage)) {
      if (scope.scopeKey === scopeKey) continue;
      dropScope(storage, scope.scopeKey);
    }
    storage.setItem(key, value);
  }
  enforceDebugStorageBudget(storage, scopeKey);
}
