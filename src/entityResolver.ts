import type { ChatMessage, TrackerResolvedEntity } from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
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

export type MultiCharacterResolverCandidate = {
  entityRef: string;
  ownerName: string;
  entityId?: string | null;
  avatar?: string | null;
  aliases?: string[];
};

export type MultiCharacterResolutionResult = {
  resolvedEntities: TrackerResolvedEntity[];
  unresolvedMentions: string[];
};

type ParsedResolvedRef = {
  entityRef: string;
  inScene: boolean;
  inMessage: boolean;
};

function hasExplicitResolverShape(record: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, "resolved")
    || Object.prototype.hasOwnProperty.call(record, "created")
    || Object.prototype.hasOwnProperty.call(record, "unresolvedMentions")
  );
}

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
      avatar: normalizeToken(candidate.avatar),
      aliases: Array.isArray(candidate.aliases)
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : [],
    }))
    .filter(candidate => candidate.entityRef && candidate.ownerName);
  const contextText = normalizeToken(input.contextText);
  const messageName = normalizeToken(input.message?.name);
  const messageText = normalizeToken(input.message?.mes);
  const messageRole = input.message?.is_user ? "user" : "ai";

  return [
    "SYSTEM:",
    "You are the BetterSimTracker entity resolver.",
    "Resolve which already-known entities are present in the scene at the end of the latest message, and which entities this latest message is actively advancing.",
    "Return only known entities from the provided candidate list. Do not invent IDs or names.",
    "Do not include the user as a resolved entity.",
    "Return strict JSON only.",
    "",
    "Definitions:",
    '- `inScene=true` means the entity is still present/relevant in the scene at the end of the latest message.',
    '- `inMessage=true` means the latest message actively advances that entity in a way that matters for tracking.',
    "- `inMessage` may be true while `inScene` is false if the message shows the entity leaving by the end.",
    "- If the latest user instruction or AI message makes it clear that no known tracked entity remains in scene, return an empty `resolved` array.",
    "",
    "Candidate entities:",
    JSON.stringify(
      candidateEntities.map(candidate => ({
        entityRef: candidate.entityRef,
        ownerName: candidate.ownerName,
        aliases: candidate.aliases,
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
    '  "resolved": [',
    '    { "entityRef": "ent1", "inScene": true, "inMessage": true }',
    "  ],",
    '  "created": [],',
    '  "unresolvedMentions": []',
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
  if (!hasExplicitResolverShape(record)) return null;

  const candidateByRef = new Map(
    candidateEntities
      .filter(candidate => normalizeToken(candidate.entityRef))
      .map(candidate => [normalizeToken(candidate.entityRef), candidate] as const),
  );

  const resolvedRefs: ParsedResolvedRef[] = Array.isArray(record.resolved)
    ? record.resolved
        .map(value => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          const item = value as Record<string, unknown>;
          const entityRef = normalizeToken(item.entityRef);
          if (!entityRef || !candidateByRef.has(entityRef)) return null;
          return {
            entityRef,
            inScene: Boolean(item.inScene),
            inMessage: Boolean(item.inMessage),
          };
        })
        .filter((value): value is ParsedResolvedRef => Boolean(value))
    : [];

  const seenEntityIds = new Set<string>();
  const resolvedEntities: TrackerResolvedEntity[] = [];
  for (const resolved of resolvedRefs) {
    const candidate = candidateByRef.get(resolved.entityRef);
    const entityId = normalizeToken(candidate?.entityId);
    const name = normalizeToken(candidate?.ownerName);
    if (!candidate || !entityId || !name || seenEntityIds.has(entityId)) continue;
    seenEntityIds.add(entityId);
    resolvedEntities.push({
      entityId,
      kind: "st-character",
      name,
      avatar: normalizeToken(candidate.avatar) || null,
      aliases: Array.isArray(candidate.aliases) && candidate.aliases.length
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : undefined,
      inScene: resolved.inScene,
      inMessage: resolved.inMessage,
    });
  }

  const unresolvedMentions = Array.isArray(record.unresolvedMentions)
    ? Array.from(new Set(record.unresolvedMentions.map(value => normalizeToken(value)).filter(Boolean)))
    : [];

  return {
    resolvedEntities,
    unresolvedMentions,
  };
}

export function resolveSceneEntityIdsFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inScene) continue;
    const entityId = normalizeToken(entity.entityId);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveMessageEntityIdsFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inMessage) continue;
    const entityId = normalizeToken(entity.entityId);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveSceneOwnersFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inScene) continue;
    const name = normalizeToken(entity.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function resolveMessageOwnersFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inMessage) continue;
    const name = normalizeToken(entity.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
