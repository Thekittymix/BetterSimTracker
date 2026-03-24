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
  sceneEntityIds: string[];
  messageEntityIds: string[];
};

export type MultiCharacterResolverCandidate = {
  entityRef: string;
  ownerName: string;
  entityId?: string | null;
};

export function buildMultiCharacterResolverPrompt(input: {
  candidateEntities: MultiCharacterResolverCandidate[];
  contextText: string;
  message: ChatMessage;
}): string {
  const candidateEntities = input.candidateEntities
    .map(candidate => ({
      entityRef: normalizeToken(candidate.entityRef),
      ownerName: normalizeToken(candidate.ownerName),
      entityId: normalizeToken(candidate.entityId),
    }))
    .filter(candidate => candidate.entityRef && candidate.ownerName);
  const candidateOwners = candidateEntities.map(candidate => candidate.ownerName);
  const contextText = normalizeToken(input.contextText);
  const messageName = normalizeToken(input.message?.name);
  const messageText = normalizeToken(input.message?.mes);
  const messageRole = input.message?.is_user ? "user" : "ai";

  return [
    "SYSTEM:",
    "You are a character entity resolver for BetterSimTracker.",
    "Determine which known character owners are still present in the current scene, and which owners this latest message is actively advancing.",
    "Use the latest message as the primary source of truth, with recent chat context only for continuity.",
    "Do not invent names. Use only the provided candidate owners exactly as written.",
    "Do not include the user. Return JSON only.",
    "",
    "Definitions:",
    '- "sceneOwners": known character owners still present in the scene at the end of the latest message.',
    '- "messageOwners": known character owners this latest message is actively advancing enough to matter right now.',
    "- A character merely mentioned inside another character's dialogue is not automatically a messageOwner.",
    "- For a focused single-character reply, messageOwners may contain only one owner even if sceneOwners contains more than one.",
    "- Prefer using entity refs when possible so runtime can map the result back to stable tracked entities.",
    "",
    "Candidate entities:",
    JSON.stringify(
      candidateEntities.map(candidate => ({
        entityRef: candidate.entityRef,
        ownerName: candidate.ownerName,
      })),
      null,
      2,
    ),
    "",
    "Recent context:",
    contextText || "(none)",
    "",
    "Latest message metadata:",
    `role: ${messageRole}`,
    `speaker: ${messageName || "(unknown)"}`,
    "Latest message:",
    messageText || "(empty)",
    "",
    "Return STRICT JSON only:",
    "{",
    '  "sceneOwners": ["Owner A"],',
    '  "messageOwners": ["Owner A"],',
    '  "sceneEntityRefs": ["ent1"],',
    '  "messageEntityRefs": ["ent1"]',
    "}",
  ].join("\n");
}

export function parseMultiCharacterResolverResponse(
  raw: string,
  candidateEntities: MultiCharacterResolverCandidate[],
): MultiCharacterResolutionResult | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const candidateOwners = candidateEntities.map(candidate => candidate.ownerName);
  const sceneOwners = uniqueKnownOwners(
    Array.isArray(record.sceneOwners) ? record.sceneOwners : [],
    candidateOwners,
  );
  const messageOwners = uniqueKnownOwners(
    Array.isArray(record.messageOwners) ? record.messageOwners : [],
    candidateOwners,
  );
  const candidateByRef = new Map(
    candidateEntities
      .filter(candidate => candidate.entityRef)
      .map(candidate => [candidate.entityRef, candidate] as const),
  );
  const mapRefsToEntityIds = (values: unknown[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const rawValue of values) {
      const ref = normalizeToken(rawValue);
      if (!ref) continue;
      const candidate = candidateByRef.get(ref);
      const entityId = normalizeToken(candidate?.entityId);
      if (!entityId || seen.has(entityId)) continue;
      seen.add(entityId);
      out.push(entityId);
    }
    return out;
  };
  const sceneEntityIds = mapRefsToEntityIds(
    Array.isArray(record.sceneEntityRefs) ? record.sceneEntityRefs : [],
  );
  const messageEntityIds = mapRefsToEntityIds(
    Array.isArray(record.messageEntityRefs) ? record.messageEntityRefs : [],
  );
  if (!sceneOwners.length && !messageOwners.length && !sceneEntityIds.length && !messageEntityIds.length) return null;
  const fallbackSceneOwners = sceneOwners.length
    ? sceneOwners
    : candidateEntities
        .filter(candidate => sceneEntityIds.includes(normalizeToken(candidate.entityId)))
        .map(candidate => candidate.ownerName);
  const fallbackMessageOwners = messageOwners.length
    ? messageOwners
    : candidateEntities
        .filter(candidate => messageEntityIds.includes(normalizeToken(candidate.entityId)))
        .map(candidate => candidate.ownerName);
  return {
    sceneOwners: fallbackSceneOwners,
    messageOwners: fallbackMessageOwners,
    sceneEntityIds,
    messageEntityIds,
  };
}
