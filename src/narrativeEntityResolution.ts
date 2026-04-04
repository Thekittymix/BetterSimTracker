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

function isCharacterLikeNarrativeEntityName(name: string, aliases: string[] | undefined): boolean {
  const candidates = uniqueStrings([name, ...(aliases ?? [])].map(stripLeadingNarrativeQualifier));
  if (!candidates.length) return false;

  const actorTokens = new Set([
    "actor",
    "angel",
    "assassin",
    "bartender",
    "boy",
    "captain",
    "cat",
    "child",
    "creature",
    "crow",
    "detective",
    "dog",
    "dragon",
    "figure",
    "friend",
    "ghost",
    "girl",
    "guard",
    "guest",
    "hunter",
    "king",
    "knight",
    "man",
    "merchant",
    "mother",
    "person",
    "priest",
    "queen",
    "raven",
    "sentinel",
    "soldier",
    "spirit",
    "stranger",
    "traveler",
    "villager",
    "waitress",
    "warrior",
    "watcher",
    "wife",
    "witch",
    "wolf",
    "woman",
  ]);
  const blockedObjectTokens = new Set([
    "amulet",
    "bag",
    "bed",
    "blanket",
    "boat",
    "bottle",
    "book",
    "box",
    "bracelet",
    "candle",
    "car",
    "carriage",
    "chair",
    "chest",
    "coin",
    "cup",
    "desk",
    "door",
    "drawer",
    "flower",
    "flowers",
    "glass",
    "jacket",
    "journal",
    "key",
    "knife",
    "lantern",
    "letter",
    "locket",
    "map",
    "necklace",
    "note",
    "paper",
    "parchment",
    "pendant",
    "pocketwatch",
    "ring",
    "rope",
    "scroll",
    "shelf",
    "shirt",
    "sofa",
    "stone",
    "sword",
    "table",
    "vial",
    "wallet",
    "window",
  ]);

  const isTitleCaseLike = (value: string): boolean => {
    const words = value.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 4) return false;
    return words.every(word => /^[A-Z][A-Za-z'’-]*$/.test(word));
  };

  for (const candidate of candidates) {
    const normalized = normalizeToken(candidate);
    if (!normalized) continue;
    const lowered = normalized.toLowerCase();
    const tokens = lowered.split(/[^a-z0-9]+/i).filter(Boolean);
    if (!tokens.length) continue;
    if (tokens.some(token => actorTokens.has(token))) return true;
    if (tokens.some(token => blockedObjectTokens.has(token))) continue;
    if (/\b(piece|pair|set|pile|bundle|stack)\s+of\b/i.test(lowered)) continue;
    if (isTitleCaseLike(normalized)) return true;
  }

  return false;
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
      ...(entity.sceneEvidence?.length ? { sceneEvidence: [...entity.sceneEvidence] } : {}),
      ...(entity.messageEvidence?.length ? { messageEvidence: [...entity.messageEvidence] } : {}),
      ...(typeof entity.sceneConfidence === "number" ? { sceneConfidence: entity.sceneConfidence } : {}),
      ...(typeof entity.messageConfidence === "number" ? { messageConfidence: entity.messageConfidence } : {}),
      ...(normalizeToken(entity.sourceKey) ? { sourceKey: normalizeToken(entity.sourceKey) } : {}),
      created: Boolean(entity.created),
    });
    return;
  }
  existing.inScene = existing.inScene || entity.inScene;
  existing.inMessage = existing.inMessage || entity.inMessage;
  existing.created = Boolean(existing.created || entity.created);
  const mergedAliases = uniqueStrings([...(existing.aliases ?? []), ...(entity.aliases ?? [])]);
  existing.aliases = mergedAliases.length ? mergedAliases : undefined;
  const mergedSceneEvidence = uniqueStrings([...(existing.sceneEvidence ?? []), ...(entity.sceneEvidence ?? [])]);
  if (mergedSceneEvidence.length) {
    existing.sceneEvidence = mergedSceneEvidence as TrackerResolvedEntity["sceneEvidence"];
  } else {
    delete existing.sceneEvidence;
  }
  const mergedMessageEvidence = uniqueStrings([...(existing.messageEvidence ?? []), ...(entity.messageEvidence ?? [])]);
  if (mergedMessageEvidence.length) {
    existing.messageEvidence = mergedMessageEvidence as TrackerResolvedEntity["messageEvidence"];
  } else {
    delete existing.messageEvidence;
  }
  if (typeof entity.sceneConfidence === "number") {
    existing.sceneConfidence = Math.max(existing.sceneConfidence ?? 0, entity.sceneConfidence);
  }
  if (typeof entity.messageConfidence === "number") {
    existing.messageConfidence = Math.max(existing.messageConfidence ?? 0, entity.messageConfidence);
  }
  if (!existing.sourceKey && normalizeToken(entity.sourceKey)) {
    existing.sourceKey = normalizeToken(entity.sourceKey);
  }
  if (!existing.name && entity.name) existing.name = entity.name;
  if (!existing.avatar && entity.avatar) existing.avatar = entity.avatar;
}

function resolveSingleSourceOwnerCandidateKey(
  candidateEntities: MultiCharacterResolverCandidate[],
): string | null {
  const sourceOwnerKeys = new Set<string>();
  for (const candidate of candidateEntities) {
    const entityId = normalizeToken(candidate.entityId);
    if (!entityId.startsWith("bst_owner:")) continue;
    const familyKey = resolveCandidateFamilyKey(candidate);
    if (!familyKey.startsWith("source:")) continue;
    sourceOwnerKeys.add(familyKey.slice("source:".length));
  }
  if (sourceOwnerKeys.size !== 1) return null;
  return Array.from(sourceOwnerKeys)[0] ?? null;
}

function reconcileExpandedSourceOwnerEntities(
  resolvedEntities: TrackerResolvedEntity[],
  candidateEntities: MultiCharacterResolverCandidate[],
): TrackerResolvedEntity[] {
  const sourceOwnerKey = resolveSingleSourceOwnerCandidateKey(candidateEntities);
  if (!sourceOwnerKey) return resolvedEntities;
  if (candidateEntities.length !== 1) return resolvedEntities;

  const sourceOwnerEntityId = `bst_owner:${sourceOwnerKey}`;
  const childNarratives = resolvedEntities.filter(entity =>
    entity.kind === "narrative-entity"
    && normalizeToken(entity.sourceKey) === sourceOwnerKey
    && (entity.inScene || entity.inMessage),
  );
  if (childNarratives.length < 2) return resolvedEntities;

  return resolvedEntities.filter(entity => normalizeToken(entity.entityId) !== sourceOwnerEntityId);
}

function buildCandidateNameMaps(candidateEntities: MultiCharacterResolverCandidate[]): {
  exact: Map<string, MultiCharacterResolverCandidate[]>;
  loose: Map<string, MultiCharacterResolverCandidate[]>;
  all: MultiCharacterResolverCandidate[];
} {
  const exact = new Map<string, MultiCharacterResolverCandidate[]>();
  const loose = new Map<string, MultiCharacterResolverCandidate[]>();
  const all: MultiCharacterResolverCandidate[] = [];
  const seenCandidates = new Set<string>();

  const pushCandidate = (target: Map<string, MultiCharacterResolverCandidate[]>, key: string, candidate: MultiCharacterResolverCandidate): void => {
    if (!key) return;
    const existing = target.get(key) ?? [];
    if (!existing.some(item => resolveCandidateCandidateKey(item) === resolveCandidateCandidateKey(candidate))) {
      existing.push(candidate);
      target.set(key, existing);
    }
  };

  for (const candidate of candidateEntities) {
    const candidateKey = resolveCandidateCandidateKey(candidate);
    if (!seenCandidates.has(candidateKey)) {
      seenCandidates.add(candidateKey);
      all.push(candidate);
    }
    for (const name of buildAliasPool(candidate.ownerName, candidate.aliases)) {
      const exactKey = normalizeKey(name);
      pushCandidate(exact, exactKey, candidate);
      const looseKey = normalizeLooseKey(name);
      pushCandidate(loose, looseKey, candidate);
    }
  }
  return { exact, loose, all };
}

function resolveCandidateFamilyKey(candidate: MultiCharacterResolverCandidate): string {
  const entityId = normalizeToken(candidate.entityId);
  if (entityId.startsWith("bst_mc_alias:")) {
    const remainder = entityId.slice("bst_mc_alias:".length);
    const aliasSeparator = remainder.lastIndexOf(":");
    const sourcePart = aliasSeparator >= 0 ? remainder.slice(0, aliasSeparator) : remainder;
    return `source:${sourcePart}`;
  }
  if (entityId.startsWith("bst_owner:")) {
    return `source:${entityId.slice("bst_owner:".length)}`;
  }
  if (entityId) return `entity:${entityId}`;
  const ownerKey = normalizeKey(candidate.ownerName);
  if (ownerKey) return `owner:${ownerKey}`;
  return `ref:${normalizeToken(candidate.entityRef)}`;
}

function resolveCandidateCandidateKey(candidate: MultiCharacterResolverCandidate): string {
  const entityId = normalizeToken(candidate.entityId);
  if (entityId) return `entity:${entityId}`;
  const entityRef = normalizeToken(candidate.entityRef);
  if (entityRef) return `ref:${entityRef}`;
  return `owner:${normalizeKey(candidate.ownerName)}`;
}

function boundedEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  const lengthDelta = Math.abs(left.length - right.length);
  if (lengthDelta > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) {
      i += 1;
    } else if (right.length > left.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits <= 1;
}

function choosePreferredCandidate(
  candidates: MultiCharacterResolverCandidate[],
  names: string[],
): MultiCharacterResolverCandidate | null {
  if (!candidates.length) return null;
  const exactNameKeys = new Set(names.map(name => normalizeKey(name)).filter(Boolean));
  const exactOwnerMatch = candidates.find(candidate => exactNameKeys.has(normalizeKey(candidate.ownerName)));
  if (exactOwnerMatch) return exactOwnerMatch;

  const looseNameKeys = new Set(names.map(name => normalizeLooseKey(name)).filter(Boolean));
  const looseOwnerMatch = candidates.find(candidate => looseNameKeys.has(normalizeLooseKey(candidate.ownerName)));
  if (looseOwnerMatch) return looseOwnerMatch;

  return [...candidates].sort((left, right) => {
    const leftEntityId = normalizeToken(left.entityId);
    const rightEntityId = normalizeToken(right.entityId);
    const leftAliasBias = leftEntityId.startsWith("bst_mc_alias:") ? 0 : 1;
    const rightAliasBias = rightEntityId.startsWith("bst_mc_alias:") ? 0 : 1;
    if (leftAliasBias !== rightAliasBias) return leftAliasBias - rightAliasBias;
    return normalizeToken(left.ownerName).length - normalizeToken(right.ownerName).length;
  })[0] ?? null;
}

function resolveUniqueFamilyMatch(
  candidates: MultiCharacterResolverCandidate[],
  names: string[],
): MultiCharacterResolverCandidate | null {
  if (!candidates.length) return null;
  const familyMatches = new Map<string, MultiCharacterResolverCandidate[]>();
  for (const candidate of candidates) {
    const familyKey = resolveCandidateFamilyKey(candidate);
    const family = familyMatches.get(familyKey) ?? [];
    family.push(candidate);
    familyMatches.set(familyKey, family);
  }
  if (familyMatches.size !== 1) return null;
  return choosePreferredCandidate(Array.from(familyMatches.values())[0] ?? [], names);
}

function findCandidateMatch(
  names: string[],
  maps: ReturnType<typeof buildCandidateNameMaps>,
): MultiCharacterResolverCandidate | null {
  const exactCandidates: MultiCharacterResolverCandidate[] = [];
  const exactSeen = new Set<string>();
  for (const name of names) {
    for (const candidate of maps.exact.get(normalizeKey(name)) ?? []) {
      const candidateKey = resolveCandidateCandidateKey(candidate);
      if (exactSeen.has(candidateKey)) continue;
      exactSeen.add(candidateKey);
      exactCandidates.push(candidate);
    }
  }
  const exactMatch = resolveUniqueFamilyMatch(exactCandidates, names);
  if (exactMatch) return exactMatch;

  const looseCandidates: MultiCharacterResolverCandidate[] = [];
  const looseSeen = new Set<string>();
  for (const name of names) {
    for (const candidate of maps.loose.get(normalizeLooseKey(name)) ?? []) {
      const candidateKey = resolveCandidateCandidateKey(candidate);
      if (looseSeen.has(candidateKey)) continue;
      looseSeen.add(candidateKey);
      looseCandidates.push(candidate);
    }
  }
  const looseMatch = resolveUniqueFamilyMatch(looseCandidates, names);
  if (looseMatch) return looseMatch;

  const fuzzyCandidates: MultiCharacterResolverCandidate[] = [];
  const fuzzySeen = new Set<string>();
  const fuzzyNameKeys = names.map(name => normalizeLooseKey(name)).filter(Boolean);
  for (const candidate of maps.all) {
    const candidateNames = buildAliasPool(candidate.ownerName, candidate.aliases)
      .map(alias => normalizeLooseKey(alias))
      .filter(Boolean);
    const matches = fuzzyNameKeys.some(nameKey =>
      candidateNames.some(candidateKey =>
        candidateKey[0] === nameKey[0] && boundedEditDistanceAtMostOne(candidateKey, nameKey),
      ),
    );
    if (!matches) continue;
    const candidateKey = resolveCandidateCandidateKey(candidate);
    if (fuzzySeen.has(candidateKey)) continue;
    fuzzySeen.add(candidateKey);
    fuzzyCandidates.push(candidate);
  }
  return resolveUniqueFamilyMatch(fuzzyCandidates, names);
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
  const singleSourceOwnerKey = resolveSingleSourceOwnerCandidateKey(input.candidateEntities);

  for (const proposal of input.createdEntities) {
    const name = normalizeToken(proposal.name);
    const aliases = uniqueStrings((proposal.aliases ?? []).map(alias => normalizeToken(alias)).filter(Boolean));
    const aliasPool = buildAliasPool(name, aliases);
    const matchPool = buildNarrativeMatchPool(name, aliases);
    if (!isPlausibleNarrativeEntityName(input.context, name) || !aliasPool.length) continue;
    if (!isCharacterLikeNarrativeEntityName(name, aliases)) continue;

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
        ...(singleSourceOwnerKey ? { sourceKey: singleSourceOwnerKey } : {}),
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
      ...(singleSourceOwnerKey ? { sourceKey: singleSourceOwnerKey } : {}),
      inScene: Boolean(proposal.inScene),
      inMessage: Boolean(proposal.inMessage),
      created: true,
    });
    unresolvedMentions = removeResolvedMentions(unresolvedMentions, aliasPool);
  }

  return {
    resolvedEntities: reconcileExpandedSourceOwnerEntities(Array.from(resolvedMap.values()), input.candidateEntities),
    unresolvedMentions,
  };
}
