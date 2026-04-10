export type RefreshTargetInput = number | { messageIndex?: unknown } | null | undefined;

export function normalizeRefreshTargetMessageIndex(input?: RefreshTargetInput): number | undefined {
  const raw = typeof input === "number" ? input : input?.messageIndex;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return undefined;
  return raw;
}
