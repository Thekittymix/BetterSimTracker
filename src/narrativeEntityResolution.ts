import { getEntityRegistryEntryByOwnerName, readEntityRegistry } from "./entityRegistry";
import { allowsNarrativeEntities, type EntityTrackingMode } from "./entityResolution";
import type { BetterSimTrackerSettings, STContext, TrackerEntityRegistryEntry, TrackerResolvedEntity } from "./types";
import type { MultiCharacterResolverCandidate, NarrativeEntityCreationProposal } from "./entityResolver";
import { USER_TRACKER_KEY } from "./constants";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
}

function stripLeadingNarrativeQualifier(value: string): string {
  return normalizeToken(value).replace(/^(?:the|a|an|this|that|these|those)\s+/i, "").trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value) continue;
    const key = normalizeKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function isPlausibleNarrativeEntityName(context: STContext | null, name: string): boolean {
  const normalized = normalizeToken(name);
  const key = normalizeKey(normalized);
  if (!normalized || normalized.length < 2) return false;
  if (!/[a-z0-9]/i.test(normalized)) return false;
  if (normalized.includes("|")) return false;
  if (key.startsWith("bst_")) return false;
  if (key === normalizeKey(USER_TRACKER_KEY)) return false;
  if (normalizeKey(context?.name1) === key) return false;
  const blocked = new Set([
    "user",
    "you",
    "yourself",
    "assistant",
    "system",
    "narrator",
    "someone",
    "somebody",
    "something",
    "he",
    "she",
    "they",
    "them",
    "him",
    "her",
    "it",
    "its",
  ]);
  return !blocked.has(key);
}

function buildAliasPool(name: string, aliases: string[] | undefined): string[] {
  return uniqueStrings([name, ...(aliases ?? [])]);
}

function buildNarrativeMatchPool(name: string, aliases: string[] | undefined): string[] {
  const base = buildAliasPool(name, aliases);
  const stripped = base
    .map(value => stripLeadingNarrativeQualifier(value))
    .filter(Boolean);
  return uniqueStrings([...base, ...stripped]);
}

function mergeResolvedEntity(
  target: Map<string, TrackerResolvedEntity>,
  entity: TrackerResolvedEntity,
): void {
  const existing = target.get(entity.entityId);
  if (!existing) {
    target.set(entity.entityId, {
      ...entity,
      aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
      created: Boolean(entity.created),
    });
    return;
  }
  existing.inScene = existing.inScene || entity.inScene;
  existing.inMessage = existing.inMessage || entity.inMessage;
  existing.created = Boolean(existing.created || entity.created);
  const mergedAliases = uniqueStrings([...(existing.aliases ?? []), ...(entity.aliases ?? [])]);
  existing.aliases = mergedAliases.length ? mergedAliases : undefined;
  if (!existing.name && entity.name) existing.name = entity.name;
  if (!existing.avatar && entity.avatar) existing.avatar = entity.avatar;
}

function buildCandidateNameMaps(candidateEntities: MultiCharacterResolverCandidate[]): {
  exact: Map<string, MultiCharacterResolverCandidate | null>;
  loose: Map<string, MultiCharacterResolverCandidate | null>;
} {
  const exact = new Map<string, MultiCharacterResolverCandidate | null>();
  const loose = new Map<string, MultiCharacterResolverCandidate | null>();
  for (const candidate of candidateEntities) {
    for (const name of buildAliasPool(candidate.ownerName, candidate.aliases)) {
      const exactKey = normalizeKey(name);
      if (exactKey) {
        const existingExact = exact.get(exactKey);
        exact.set(exactKey, existingExact && existingExact.entityId !== candidate.entityId ? null : (existingExact ?? candidate));
      }
      const looseKey = normalizeLooseKey(name);
      if (!looseKey) continue;
      const existing = loose.get(looseKey);
      loose.set(looseKey, existing && existing.entityId !== candidate.entityId ? null : (existing ?? candidate));
    }
  }
  return { exact, loose };
}

function findCandidateMatch(
  names: string[],
  maps: ReturnType<typeof buildCandidateNameMaps>,
): MultiCharacterResolverCandidate | null {
  const exactMatches = new Map<string, MultiCharacterResolverCandidate>();
  for (const name of names) {
    const exact = maps.exact.get(normalizeKey(name));
    if (exact?.entityId) {
      exactMatches.set(exact.entityId, exact);
    }
  }
  if (exactMatches.size === 1) return Array.from(exactMatches.values())[0];
  if (exactMatches.size > 1) return null;
  const looseMatches = new Map<string, MultiCharacterResolverCandidate>();
  for (const name of names) {
    const loose = maps.loose.get(normalizeLooseKey(name));
    if (loose?.entityId) {
      looseMatches.set(loose.entityId, loose);
    }
  }
  return looseMatches.size === 1 ? Array.from(looseMatches.values())[0] : null;
}

function findNarrativeRegistryMatch(
  context: STContext | null,
  names: string[],
): TrackerEntityRegistryEntry | null {
  for (const name of names) {
    const exact = getEntityRegistryEntryByOwnerName(context, name);
    if (exact?.kind === "narrative-entity") return exact;
  }

  const registry = readEntityRegistry(context);
  const looseMatches = new Map<string, TrackerEntityRegistryEntry>();
  for (const entry of Object.values(registry.entities)) {
    if (entry.kind !== "narrative-entity") continue;
    const entryKeys = new Set(buildAliasPool(entry.ownerName, entry.aliases).map(alias => normalizeLooseKey(alias)).filter(Boolean));
    for (const name of names) {
      const key = normalizeLooseKey(name);
      if (!key || !entryKeys.has(key)) continue;
      looseMatches.set(entry.id, entry);
    }
  }
  return looseMatches.size === 1 ? Array.from(looseMatches.values())[0] : null;
}

function slugifyNarrativeEntityName(name: string): string {
  const ascii = normalizeToken(name)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "");
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function allocateNarrativeEntityId(
  context: STContext | null,
  name: string,
  usedEntityIds: Set<string>,
): string {
  const registry = readEntityRegistry(context);
  const existingIds = new Set<string>([
    ...Object.keys(registry.entities),
    ...usedEntityIds,
  ]);
  const baseSlug = slugifyNarrativeEntityName(name) || "entity";
  let suffix = 1;
  let nextId = `bst_narrative:${baseSlug}`;
  while (existingIds.has(nextId)) {
    suffix += 1;
    nextId = `bst_narrative:${baseSlug}:${suffix}`;
  }
  usedEntityIds.add(nextId);
  return nextId;
}

function removeResolvedMentions(unresolvedMentions: string[], names: string[]): string[] {
  if (!unresolvedMentions.length || !names.length) return unresolvedMentions;
  const exact = new Set(names.map(name => normalizeKey(name)));
  const loose = new Set(names.map(name => normalizeLooseKey(name)).filter(Boolean));
  return unresolvedMentions.filter(mention => {
    const exactKey = normalizeKey(mention);
    const looseKey = normalizeLooseKey(mention);
    return !exact.has(exactKey) && (!looseKey || !loose.has(looseKey));
  });
}

export function materializeNarrativeEntityCreations(input: {
  context: STContext | null;
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
  candidateEntities: MultiCharacterResolverCandidate[];
  resolvedEntities: TrackerResolvedEntity[];
  createdEntities: NarrativeEntityCreationProposal[];
  unresolvedMentions?: string[] | undefined;
}): {
  resolvedEntities: TrackerResolvedEntity[];
  unresolvedMentions: string[];
} {
  const mode = (input.settings.entityTrackingMode ?? "standard") as EntityTrackingMode;
  const resolvedMap = new Map<string, TrackerResolvedEntity>();
  for (const entity of input.resolvedEntities ?? []) {
    if (!normalizeToken(entity?.entityId) || !normalizeToken(entity?.name)) continue;
    mergeResolvedEntity(resolvedMap, entity);
  }
  let unresolvedMentions = [...(input.unresolvedMentions ?? [])];
  if (!allowsNarrativeEntities(mode) || !input.createdEntities.length) {
    return {
      resolvedEntities: Array.from(resolvedMap.values()),
      unresolvedMentions,
    };
  }

  const candidateMaps = buildCandidateNameMaps(input.candidateEntities);
  const usedEntityIds = new Set<string>(resolvedMap.keys());

  for (const proposal of input.createdEntities) {
    const name = normalizeToken(proposal.name);
    const aliases = uniqueStrings((proposal.aliases ?? []).map(alias => normalizeToken(alias)).filter(Boolean));
    const aliasPool = buildAliasPool(name, aliases);
    const matchPool = buildNarrativeMatchPool(name, aliases);
    if (!isPlausibleNarrativeEntityName(input.context, name) || !aliasPool.length) continue;

    const candidateMatch = findCandidateMatch(matchPool, candidateMaps);
    if (candidateMatch?.entityId) {
      mergeResolvedEntity(resolvedMap, {
        entityId: candidateMatch.entityId,
        kind: candidateMatch.kind ?? "st-character",
        name: candidateMatch.ownerName,
        avatar: normalizeToken(candidateMatch.avatar) || null,
        aliases: candidateMatch.aliases?.length ? [...candidateMatch.aliases] : undefined,
        inScene: Boolean(proposal.inScene),
        inMessage: Boolean(proposal.inMessage),
        created: false,
      });
      unresolvedMentions = removeResolvedMentions(unresolvedMentions, matchPool);
      continue;
    }

    const registryMatch = findNarrativeRegistryMatch(input.context, matchPool);
    if (registryMatch) {
      mergeResolvedEntity(resolvedMap, {
        entityId: registryMatch.id,
        kind: "narrative-entity",
        name: registryMatch.ownerName,
        avatar: null,
        aliases: registryMatch.aliases?.length ? [...registryMatch.aliases] : undefined,
        inScene: Boolean(proposal.inScene),
        inMessage: Boolean(proposal.inMessage),
        created: false,
      });
      unresolvedMentions = removeResolvedMentions(unresolvedMentions, matchPool);
      usedEntityIds.add(registryMatch.id);
      continue;
    }

    const entityId = allocateNarrativeEntityId(input.context, name, usedEntityIds);
    mergeResolvedEntity(resolvedMap, {
      entityId,
      kind: "narrative-entity",
      name,
      avatar: null,
      aliases: aliases.length ? aliases : undefined,
      inScene: Boolean(proposal.inScene),
      inMessage: Boolean(proposal.inMessage),
      created: true,
    });
    unresolvedMentions = removeResolvedMentions(unresolvedMentions, aliasPool);
  }

  return {
    resolvedEntities: Array.from(resolvedMap.values()),
    unresolvedMentions,
  };
}
