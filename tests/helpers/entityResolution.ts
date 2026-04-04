import type { TrackerDataEntityResolution, TrackerResolvedEntity } from "../../src/types";

type BuildEntityResolutionInput = {
  resolvedEntities?: TrackerResolvedEntity[];
  unresolvedMentions?: string[];
  source?: "model" | "fallback";
  sceneOwners?: string[];
  messageOwners?: string[];
  sceneEntityIds?: string[];
  messageEntityIds?: string[];
};

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function uniqueStrings(values: unknown[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeResolvedEntities(raw: TrackerResolvedEntity[] | undefined): TrackerResolvedEntity[] {
  const out: TrackerResolvedEntity[] = [];
  const seen = new Set<string>();
  for (const entity of raw ?? []) {
    const entityId = normalizeToken(entity?.entityId);
    const name = normalizeToken(entity?.name);
    if (!entityId || !name || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push({
      ...entity,
      entityId,
      name,
      avatar: normalizeToken(entity.avatar) || null,
      aliases: (() => {
        const aliases = uniqueStrings(entity.aliases);
        return aliases.length ? aliases : undefined;
      })(),
      ...(Array.isArray(entity.sceneEvidence) && entity.sceneEvidence.length
        ? {
            sceneEvidence: Array.from(new Set(entity.sceneEvidence.map(item => normalizeToken(item)).filter(Boolean))) as TrackerResolvedEntity["sceneEvidence"],
          }
        : {}),
      ...(Array.isArray(entity.messageEvidence) && entity.messageEvidence.length
        ? {
            messageEvidence: Array.from(new Set(entity.messageEvidence.map(item => normalizeToken(item)).filter(Boolean))) as TrackerResolvedEntity["messageEvidence"],
          }
        : {}),
      ...(typeof entity.sceneConfidence === "number" ? { sceneConfidence: entity.sceneConfidence } : {}),
      ...(typeof entity.messageConfidence === "number" ? { messageConfidence: entity.messageConfidence } : {}),
      inScene: Boolean(entity.inScene),
      inMessage: Boolean(entity.inMessage),
      created: Boolean(entity.created),
    });
  }
  return out;
}

function buildLegacyResolvedEntities(input: BuildEntityResolutionInput): TrackerResolvedEntity[] {
  const sceneOwners = uniqueStrings(input.sceneOwners);
  const messageOwners = uniqueStrings(input.messageOwners);
  const sceneEntityIds = uniqueStrings(input.sceneEntityIds);
  const messageEntityIds = uniqueStrings(input.messageEntityIds);
  const entities = new Map<string, TrackerResolvedEntity>();

  const ensure = (entityId: string, fallbackName: string): TrackerResolvedEntity => {
    const existing = entities.get(entityId);
    if (existing) return existing;
    const entity: TrackerResolvedEntity = {
      entityId,
      kind: "st-character",
      name: fallbackName,
      avatar: null,
      aliases: undefined,
      inScene: false,
      inMessage: false,
      created: false,
    };
    entities.set(entityId, entity);
    return entity;
  };

  for (const [index, entityId] of sceneEntityIds.entries()) {
    const fallbackName = sceneOwners[index] || messageOwners[index] || entityId;
    const entity = ensure(entityId, fallbackName);
    entity.inScene = true;
  }
  for (const [index, entityId] of messageEntityIds.entries()) {
    const fallbackName = messageOwners[index] || sceneOwners[index] || entityId;
    const entity = ensure(entityId, fallbackName);
    entity.inMessage = true;
  }
  const shouldSynthesizeOwnerEntities = sceneEntityIds.length === 0 && messageEntityIds.length === 0;
  if (shouldSynthesizeOwnerEntities) {
    for (const ownerName of sceneOwners) {
      const entityId = `bst_test:${normalizeKey(ownerName)}`;
      const entity = ensure(entityId, ownerName);
      entity.inScene = true;
    }
    for (const ownerName of messageOwners) {
      const entityId = `bst_test:${normalizeKey(ownerName)}`;
      const entity = ensure(entityId, ownerName);
      entity.inMessage = true;
    }
  }

  return Array.from(entities.values());
}

export function buildEntityResolution(input: BuildEntityResolutionInput): TrackerDataEntityResolution {
  const normalizedResolvedEntities = normalizeResolvedEntities(input.resolvedEntities);
  const resolvedEntities = normalizedResolvedEntities.length
    ? normalizedResolvedEntities
    : buildLegacyResolvedEntities(input);
  const unresolvedMentions = uniqueStrings(input.unresolvedMentions);
  const entityResolution: TrackerDataEntityResolution = {
    resolvedEntities,
    source: input.source === "model" ? "model" : "fallback",
  };
  if (unresolvedMentions.length) {
    entityResolution.unresolvedMentions = unresolvedMentions;
  }
  return entityResolution;
}
