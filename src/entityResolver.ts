import { USER_TRACKER_KEY } from "./constants";
import type { ChatMessage, TrackerResolvedEntity, TrackerResolvedEntityKind } from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveOwnerNameFallbackFromEntityId(entityId: string): string {
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return "";
  if (normalizedEntityId.startsWith("bst_mc_alias:")) {
    return normalizedEntityId.slice(normalizedEntityId.lastIndexOf(":") + 1);
  }
  if (normalizedEntityId.includes(USER_TRACKER_KEY)) {
    return USER_TRACKER_KEY;
  }
  return "";
}

function isTechnicalResolvedEntityName(name: string, entityId: string): boolean {
  const normalizedName = normalizeToken(name);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedName) return true;
  if (normalizedEntityId && normalizedName === normalizedEntityId) return true;
  return normalizedName.startsWith("bst_");
}

function resolveOwnerNameFromResolvedEntity(entity: TrackerResolvedEntity): string {
  const entityId = normalizeToken(entity.entityId);
  const entityName = normalizeToken(entity.name);
  if (!isTechnicalResolvedEntityName(entityName, entityId)) return entityName;
  return resolveOwnerNameFallbackFromEntityId(entityId) || entityName;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countAliasMentions(text: string, alias: string): number {
  const escaped = escapeRegex(alias.trim());
  if (!escaped) return 0;
  const pattern = new RegExp(`(^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, "gi");
  let count = 0;
  while (pattern.exec(text)) count += 1;
  return count;
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
  kind?: TrackerResolvedEntityKind;
  entityId?: string | null;
  avatar?: string | null;
  aliases?: string[];
};

export type NarrativeEntityCreationProposal = {
  name: string;
  aliases?: string[];
  inScene: boolean;
  inMessage: boolean;
};

export type MultiCharacterResolutionResult = {
  resolvedEntities: TrackerResolvedEntity[];
  createdEntities: NarrativeEntityCreationProposal[];
  unresolvedMentions: string[];
};

function scoreCandidateFocus(messageText: string, candidate: MultiCharacterResolverCandidate): number {
  const text = normalizeToken(messageText);
  if (!text) return 0;
  const normalizedText = text.toLowerCase();
  const names = Array.from(new Set(
    [candidate.ownerName, ...(candidate.aliases ?? [])]
      .map(value => normalizeToken(value))
      .filter(Boolean),
  ));
  let best = 0;
  for (const name of names) {
    const escaped = escapeRegex(name);
    const startsWithName = new RegExp(`^[\\s"'([{-]*${escaped}(?:\\b|['â€™]s\\b)`, "i").test(text);
    const mentions = countAliasMentions(normalizedText, name.toLowerCase());
    best = Math.max(best, (startsWithName ? 100 : 0) + mentions);
  }
  return best;
}

type ParsedResolvedRef = {
  entityRef: string;
  ownerName: string;
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

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeToken(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function buildMultiCharacterResolverPrompt(input: {
  candidateEntities: MultiCharacterResolverCandidate[];
  contextText: string;
  message: ChatMessage;
  allowNarrativeEntityCreation?: boolean;
}): string {
  const candidateEntities = input.candidateEntities
    .map(candidate => ({
      entityRef: normalizeToken(candidate.entityRef),
      ownerName: normalizeToken(candidate.ownerName),
      kind: candidate.kind === "narrative-entity" || candidate.kind === "persona" ? candidate.kind : "st-character",
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
  const allowNarrativeEntityCreation = input.allowNarrativeEntityCreation === true;

  return [
    "SYSTEM:",
    "You are the BetterSimTracker entity resolver.",
    "Resolve which already-known entities are present in the scene at the end of the latest message, and which entities this latest message is actively advancing.",
    allowNarrativeEntityCreation
      ? "Resolve known entities from the provided candidate list, and only use `created` for clearly new character-like scene actors that are not already known."
      : "Return only known entities from the provided candidate list. Do not invent IDs or names.",
    "Do not include the user as a resolved entity.",
    "Return strict JSON only.",
    "",
    "Definitions:",
    '- `inScene=true` means the entity is still present/relevant in the scene at the end of the latest message.',
    '- `inMessage=true` means the latest message actively advances that entity in a way that matters for tracking.',
    "- `inMessage` may be true while `inScene` is false if the message shows the entity leaving by the end.",
    "- Silent/background entities may remain `inScene=true`, but must stay `inMessage=false` unless the latest message itself directly advances them.",
    "- If the latest user instruction or AI message makes it clear that no known tracked entity remains in scene, return an empty `resolved` array.",
    ...(allowNarrativeEntityCreation
      ? [
          "- Use `created` only for clearly new non-user characters, beings, or scene actors that are distinct, scene-relevant, and not already covered by the known candidate list.",
          "- `created` entries must use human-readable `name` and optional `aliases` only. Never invent stable IDs.",
          "- Do not create props, objects, containers, furniture, locations, groups, body parts, narrator/user references, pronouns, or ambiguous mentions.",
        ]
      : []),
    "",
    "Examples:",
    '- If the user says `Blake, answer only for yourself. Ashley, Garret, and Raleigh stay silent.`, resolve the silent characters as `inScene=true, inMessage=false` if they remain present.',
    '- If the latest AI reply contains only Blake acting/speaking, return Blake with `inMessage=true` and keep Ashley/Garret/Raleigh as `inMessage=false` unless that same reply directly advances them too.',
    "",
    "Candidate entities:",
    JSON.stringify(
      candidateEntities.map(candidate => ({
        entityRef: candidate.entityRef,
        ownerName: candidate.ownerName,
        kind: candidate.kind ?? "st-character",
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
    allowNarrativeEntityCreation
      ? '  "created": [{ "name": "Forest Spirit", "aliases": ["Spirit"], "inScene": true, "inMessage": true }],'
      : '  "created": [],',
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
  const candidateByEntityId = new Map(
    candidateEntities
      .filter(candidate => normalizeToken(candidate.entityId))
      .map(candidate => [normalizeToken(candidate.entityId), candidate] as const),
  );
  const candidateByName = new Map<string, MultiCharacterResolverCandidate>();
  for (const candidate of candidateEntities) {
    const ownerName = normalizeToken(candidate.ownerName);
    if (ownerName && !candidateByName.has(ownerName.toLowerCase())) {
      candidateByName.set(ownerName.toLowerCase(), candidate);
    }
    for (const alias of candidate.aliases ?? []) {
      const normalizedAlias = normalizeToken(alias).toLowerCase();
      if (normalizedAlias && !candidateByName.has(normalizedAlias)) {
        candidateByName.set(normalizedAlias, candidate);
      }
    }
  }

  const resolveCandidate = (item: Record<string, unknown>): MultiCharacterResolverCandidate | null => {
    const entityRef = normalizeToken(item.entityRef);
    if (entityRef && candidateByRef.has(entityRef)) {
      return candidateByRef.get(entityRef) ?? null;
    }
    const entityId = normalizeToken(item.entityId);
    if (entityId && candidateByEntityId.has(entityId)) {
      return candidateByEntityId.get(entityId) ?? null;
    }
    const directName = [
      item.ownerName,
      item.name,
      item.owner,
      item.canonicalName,
      item.alias,
    ]
      .map(value => normalizeToken(value))
      .find(Boolean);
    if (directName) {
      return candidateByName.get(directName.toLowerCase()) ?? null;
    }
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const normalizedAlias = normalizeToken(alias).toLowerCase();
        if (!normalizedAlias) continue;
        const candidate = candidateByName.get(normalizedAlias);
        if (candidate) return candidate;
      }
    }
    return null;
  };

  const rawResolved = Array.isArray(record.resolved)
    ? record.resolved
    : (Array.isArray(record.resolvedEntities)
      ? record.resolvedEntities
      : (Array.isArray(record.entities) ? record.entities : []));

  const resolvedRefs: ParsedResolvedRef[] = Array.isArray(rawResolved)
    ? rawResolved
        .map(value => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          const item = value as Record<string, unknown>;
          const candidate = resolveCandidate(item);
          const ownerName = normalizeToken(candidate?.ownerName);
          if (!candidate || !ownerName) return null;
          return {
            entityRef: normalizeToken(candidate.entityRef),
            ownerName,
            inScene: normalizeBoolean(item.inScene),
            inMessage: normalizeBoolean(item.inMessage),
          };
        })
        .filter((value): value is ParsedResolvedRef => Boolean(value))
    : [];

  const seenEntityIds = new Set<string>();
  const resolvedEntities: TrackerResolvedEntity[] = [];
  for (const resolved of resolvedRefs) {
    const candidate = candidateByRef.get(resolved.entityRef) ?? candidateByName.get(resolved.ownerName.toLowerCase());
    const entityId = normalizeToken(candidate?.entityId);
    const name = normalizeToken(candidate?.ownerName);
    if (!candidate || !entityId || !name || seenEntityIds.has(entityId)) continue;
    seenEntityIds.add(entityId);
    resolvedEntities.push({
      entityId,
      kind: candidate.kind ?? "st-character",
      name,
      avatar: normalizeToken(candidate.avatar) || null,
      aliases: Array.isArray(candidate.aliases) && candidate.aliases.length
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : undefined,
      inScene: resolved.inScene,
      inMessage: resolved.inMessage,
    });
  }

  const rawCreated = Array.isArray(record.created)
    ? record.created
    : (Array.isArray(record.createdEntities) ? record.createdEntities : []);
  const createdEntities: NarrativeEntityCreationProposal[] = [];
  const seenCreated = new Set<string>();
  if (Array.isArray(rawCreated)) {
    for (const value of rawCreated) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const name = [
        item.name,
        item.ownerName,
        item.owner,
        item.canonicalName,
      ]
        .map(candidate => normalizeToken(candidate))
        .find(Boolean) ?? "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenCreated.has(key)) continue;
      seenCreated.add(key);
      const aliases = Array.isArray(item.aliases)
        ? Array.from(new Set(item.aliases.map(alias => normalizeToken(alias)).filter(Boolean)))
        : [];
      const hasInScene = Object.prototype.hasOwnProperty.call(item, "inScene");
      const hasInMessage = Object.prototype.hasOwnProperty.call(item, "inMessage");
      const inMessage = hasInMessage ? normalizeBoolean(item.inMessage) : true;
      createdEntities.push({
        name,
        aliases: aliases.length ? aliases : undefined,
        inScene: hasInScene ? normalizeBoolean(item.inScene) : inMessage,
        inMessage,
      });
    }
  }

  const rawUnresolvedMentions = Array.isArray(record.unresolvedMentions)
    ? record.unresolvedMentions
    : (Array.isArray(record.unresolved) ? record.unresolved : []);
  const unresolvedMentions = rawUnresolvedMentions.length
    ? Array.from(new Set(rawUnresolvedMentions.map(value => normalizeToken(value)).filter(Boolean)))
    : [];

  return {
    resolvedEntities,
    createdEntities,
    unresolvedMentions,
  };
}

export function constrainResolvedEntitiesToMessageFocus(
  resolvedEntities: TrackerResolvedEntity[],
  candidateEntities: MultiCharacterResolverCandidate[],
  message: ChatMessage | null | undefined,
): TrackerResolvedEntity[] {
  if (!resolvedEntities.length) return [];
  if (!message || message.is_user || message.is_system) {
    return resolvedEntities.map(entity => ({ ...entity, aliases: entity.aliases?.length ? [...entity.aliases] : undefined }));
  }
  const currentlyInMessage = resolvedEntities.filter(entity => entity.inMessage);
  if (currentlyInMessage.length <= 1) {
    return resolvedEntities.map(entity => ({ ...entity, aliases: entity.aliases?.length ? [...entity.aliases] : undefined }));
  }

  const scored = candidateEntities
    .map(candidate => ({ candidate, score: scoreCandidateFocus(String(message.mes ?? ""), candidate) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return resolvedEntities.map(entity => ({ ...entity, aliases: entity.aliases?.length ? [...entity.aliases] : undefined }));
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return resolvedEntities.map(entity => ({ ...entity, aliases: entity.aliases?.length ? [...entity.aliases] : undefined }));
  }
  if (scored.length > 1 && scored[1].score > 0) {
    return resolvedEntities.map(entity => ({ ...entity, aliases: entity.aliases?.length ? [...entity.aliases] : undefined }));
  }

  const focusedCandidate = scored[0].candidate;
  const focusedEntityId = normalizeToken(focusedCandidate.entityId);
  const focusedOwnerKey = normalizeToken(focusedCandidate.ownerName).toLowerCase();

  return resolvedEntities.map(entity => {
    const isFocused = (focusedEntityId && normalizeToken(entity.entityId) === focusedEntityId)
      || normalizeToken(entity.name).toLowerCase() === focusedOwnerKey;
    return {
      ...entity,
      aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
      inMessage: isFocused ? entity.inScene || entity.inMessage : false,
    };
  });
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
    const name = resolveOwnerNameFromResolvedEntity(entity);
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
    const name = resolveOwnerNameFromResolvedEntity(entity);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
