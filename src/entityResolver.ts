import type { ChatMessage } from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const block = raw.match(/\{[\s\S]*\}/);
    if (!block) return null;
    try {
      return JSON.parse(block[0]);
    } catch {
      return null;
    }
  }
}

function uniqueKnownOwners(values: unknown[], knownOwners: string[]): string[] {
  const allowed = new Map(knownOwners.map(owner => [owner.toLowerCase(), owner]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value) continue;
    const canonical = allowed.get(value.toLowerCase());
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

export type MultiCharacterResolutionResult = {
  sceneOwners: string[];
  messageOwners: string[];
};

export function buildMultiCharacterResolverPrompt(input: {
  candidateOwners: string[];
  contextText: string;
  message: ChatMessage;
}): string {
  const candidateOwners = input.candidateOwners.map(normalizeToken).filter(Boolean);
  const contextText = normalizeToken(input.contextText);
  const messageName = normalizeToken(input.message?.name);
  const messageText = normalizeToken(input.message?.mes);

  return [
    "SYSTEM:",
    "You are a character entity resolver for BetterSimTracker.",
    "Determine which known character owners are still present in the current scene, and which owners this latest AI message should update.",
    "Use the latest AI message as the primary source of truth, with recent chat context only for continuity.",
    "Do not invent names. Use only the provided candidate owners exactly as written.",
    "Do not include the user. Return JSON only.",
    "",
    "Definitions:",
    '- "sceneOwners": known character owners still present in the scene at the end of the latest AI message.',
    '- "messageOwners": known character owners this latest AI message is actively advancing enough to warrant tracker extraction now.',
    "- A character merely mentioned inside another character's dialogue is not automatically a messageOwner.",
    "- For a focused single-character reply, messageOwners may contain only one owner even if sceneOwners contains more than one.",
    "",
    `Candidate owners: [${candidateOwners.map(escapeJsonString).join(", ")}]`,
    "",
    "Recent context:",
    contextText || "(none)",
    "",
    "Latest AI message metadata:",
    `speaker: ${messageName || "(unknown)"}`,
    "Latest AI message:",
    messageText || "(empty)",
    "",
    "Return STRICT JSON only:",
    "{",
    '  "sceneOwners": ["Owner A"],',
    '  "messageOwners": ["Owner A"]',
    "}",
  ].join("\n");
}

export function parseMultiCharacterResolverResponse(
  raw: string,
  candidateOwners: string[],
): MultiCharacterResolutionResult | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const sceneOwners = uniqueKnownOwners(
    Array.isArray(record.sceneOwners) ? record.sceneOwners : [],
    candidateOwners,
  );
  const messageOwners = uniqueKnownOwners(
    Array.isArray(record.messageOwners) ? record.messageOwners : [],
    candidateOwners,
  );
  if (!sceneOwners.length && !messageOwners.length) return null;
  return {
    sceneOwners,
    messageOwners: messageOwners.length ? messageOwners : sceneOwners,
  };
}
