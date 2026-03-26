import type {
  BetterSimTrackerSettings,
  Character,
  ChatMessage,
  ClearedCustomNonNumericStatistics,
  ClearedCustomStatistics,
  ClearedStatistics,
  CustomNonNumericStatistics,
  CustomStatistics,
  STContext,
  Statistics,
  TrackerData,
  TrackerResolvedEntity,
} from "./types";
import { USER_TRACKER_KEY } from "./constants";
import { resolveTrackerEntityIdsForOwners, resolveTrackerOwnersForEntityIds, resolveTrackerSceneOwners } from "./entityRegistry";

export type EntityTrackingMode = "standard" | "multi_character" | "dynamic_entities";

export type ResolvedCharacterIdentity = {
  sourceName: string;
  sourceAvatar: string | null;
  resolvedName: string;
  matchedBy: "source" | "alias";
};

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function isMultiCharacterEntityTrackingMode(mode: EntityTrackingMode): boolean {
  return mode === "multi_character" || mode === "dynamic_entities";
}

export function allowsNarrativeEntities(mode: EntityTrackingMode): boolean {
  return mode === "dynamic_entities";
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

function pushUniqueString(target: string[], seen: Set<string>, raw: unknown): void {
  const value = normalizeToken(raw);
  if (!value) return;
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(value);
}

function stripOuterPunctuation(value: string): string {
  return value
    .replace(/^[\s"'`([{<]+/g, "")
    .replace(/[\s"',.;:!?)}\]>]+$/g, "")
    .trim();
}

function isPlausibleAliasToken(value: string): boolean {
  const candidate = stripOuterPunctuation(value);
  if (!candidate) return false;
  if (candidate.length < 2 || candidate.length > 40) return false;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (!/[A-Za-z]/.test(candidate)) return false;
  if (/^[&/+|,-]+$/.test(candidate)) return false;
  return true;
}

export function extractMultiCharacterAliases(sourceName: string): string[] {
  const raw = normalizeToken(sourceName);
  if (!raw) return [];

  const pipeIndex = raw.indexOf("|");
  const colonIndex = raw.indexOf(":");
  let listSource = "";
  if (pipeIndex >= 0) {
    listSource = raw.slice(pipeIndex + 1);
  } else if (colonIndex >= 0) {
    listSource = raw.slice(colonIndex + 1);
  } else {
    return [];
  }

  const normalizedList = listSource
    .replace(/\s*&\s*/g, ", ")
    .replace(/\s+and\s+/gi, ", ")
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ");
  const parts = normalizedList
    .split(",")
    .map(part => stripOuterPunctuation(part))
    .filter(isPlausibleAliasToken);
  const aliases = uniqueStrings(parts);
  return aliases.length >= 2 ? aliases : [];
}

function getCharacterAliases(character: Character, mode: EntityTrackingMode): string[] {
  const sourceName = normalizeToken(character?.name);
  if (!sourceName) return [];
  if (!isMultiCharacterEntityTrackingMode(mode)) return [sourceName];
  const aliases = extractMultiCharacterAliases(sourceName);
  return uniqueStrings([sourceName, ...aliases]);
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

function hasDepartureCue(text: string, name: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const target = name.toLowerCase().trim();
  if (!normalized || !target || !normalized.includes(target)) return false;
  const departureVerbs = [
    "went",
    "goes",
    "left",
    "leaves",
    "walked",
    "walks",
    "ran",
    "returns",
    "returned",
    "headed",
    "moved",
    "retreated",
    "stayed in",
    "stays in",
    "is in",
  ];
  const departurePlaces = [
    "away",
    "out",
    "back",
    "home",
    "room",
    "bedroom",
    "upstairs",
    "downstairs",
    "outside",
    "bathroom",
    "hallway",
    "kitchen",
    "garden",
    "her room",
    "his room",
    "their room",
  ];
  const hasVerb = departureVerbs.some(verb => normalized.includes(verb));
  const hasPlace = departurePlaces.some(place => normalized.includes(place));
  return hasVerb && hasPlace;
}

function resolveMessageIndex(context: STContext | null, message: ChatMessage | null | undefined): number {
  if (!context || !Array.isArray(context.chat) || !message) return -1;
  const directIndex = context.chat.lastIndexOf(message);
  if (directIndex >= 0) return directIndex;
  const messageName = normalizeToken(message.name);
  const messageText = normalizeToken(message.mes);
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const candidate = context.chat[i];
    if (normalizeToken(candidate?.name) !== messageName) continue;
    if (normalizeToken(candidate?.mes) !== messageText) continue;
    if (Boolean(candidate?.is_user) !== Boolean(message.is_user)) continue;
    return i;
  }
  return context.chat.length - 1;
}

function filterSceneActiveCharactersByRecentDepartureCues(
  context: STContext | null,
  sceneActiveCharacters: string[],
  requestCharacters: string[],
  message: ChatMessage | null | undefined,
): string[] {
  if (!context || !Array.isArray(context.chat) || !sceneActiveCharacters.length) return sceneActiveCharacters;
  if (!message || message.is_user || message.is_system) return sceneActiveCharacters;

  const currentMessageIndex = resolveMessageIndex(context, message);
  if (currentMessageIndex <= 0) return sceneActiveCharacters;

  const preserved = new Set(requestCharacters.map(normalizeKey));
  const currentMessageText = normalizeToken(message.mes).toLowerCase();
  const maxDepartureScan = 8;
  const scanStart = Math.max(0, currentMessageIndex - maxDepartureScan);
  const excluded = new Set<string>();
  const normalizedRequestCharacters = uniqueStrings(requestCharacters.map(normalizeToken));

  const buildExclusivePresencePatterns = (name: string): RegExp[] => {
    const escaped = escapeRegex(name);
    return [
      new RegExp(`\\b${escaped}\\b[^.!?\\n]{0,80}\\balone\\b`, "i"),
      new RegExp(`\\bonly\\s+${escaped}\\b`, "i"),
      new RegExp(`\\bjust\\s+${escaped}\\b`, "i"),
      new RegExp(`\\bonly\\s+${escaped}\\s+(?:stays|stayed|remains|remained|is\\s+here)\\b`, "i"),
      new RegExp(`\\b${escaped}\\b[^.!?\\n]{0,80}\\b(?:stays?|stayed|remains?|remained)\\b[^.!?\\n]{0,40}\\b(?:alone|here\\s+alone)\\b`, "i"),
    ];
  };

  const hasExclusivePresenceCue = (text: string, name: string): boolean => {
    const normalized = normalizeToken(text);
    if (!normalized || !name) return false;
    return buildExclusivePresencePatterns(name).some(pattern => pattern.test(normalized));
  };

  const recentUserMessages = context.chat
    .slice(scanStart, currentMessageIndex)
    .filter(candidate => Boolean(candidate?.is_user) && !candidate?.is_system)
    .map(candidate => normalizeToken(candidate?.mes))
    .filter(Boolean);

  if (normalizedRequestCharacters.length === 1) {
    const exclusiveOwner = normalizedRequestCharacters[0];
    if (recentUserMessages.some(text => hasExclusivePresenceCue(text, exclusiveOwner))) {
      return [exclusiveOwner];
    }
  }

  for (const ownerName of sceneActiveCharacters) {
    const ownerKey = normalizeKey(ownerName);
    if (!ownerKey || preserved.has(ownerKey)) continue;
    let lastDepartureIndex = -1;
    for (let i = scanStart; i < currentMessageIndex; i += 1) {
      const candidate = context.chat[i];
      if (!candidate?.is_user || candidate.is_system) continue;
      const text = normalizeToken(candidate.mes);
      if (!text) continue;
      if (hasDepartureCue(text, ownerName)) {
        lastDepartureIndex = i;
      }
    }
    if (lastDepartureIndex < 0) continue;
    if (countAliasMentions(currentMessageText, ownerName.toLowerCase()) > 0) continue;
    excluded.add(ownerKey);
  }

  if (!excluded.size) return sceneActiveCharacters;
  const narrowed = sceneActiveCharacters.filter(ownerName => !excluded.has(normalizeKey(ownerName)));
  return narrowed.length ? narrowed : sceneActiveCharacters;
}

function buildSourceKey(sourceName: string, sourceAvatar: string | null): string {
  return `${normalizeKey(sourceName)}::${normalizeKey(sourceAvatar ?? "")}`;
}

function collectMentionedAliases(messageText: string, aliases: string[]): string[] {
  const text = normalizeToken(messageText);
  if (!text) return [];
  const normalizedText = text.toLowerCase();
  const mentioned: string[] = [];
  for (const alias of aliases) {
    const trimmed = normalizeToken(alias);
    if (!trimmed) continue;
    const escaped = escapeRegex(trimmed);
    const startsWithAlias = new RegExp(`^[\\s"'([{-]*${escaped}(?:\\b|['â€™]s\\b)`, "i").test(text);
    const mentions = countAliasMentions(normalizedText, trimmed.toLowerCase());
    if (startsWithAlias || mentions > 0) {
      mentioned.push(trimmed);
    }
  }
  return uniqueStrings(mentioned);
}

function inferMessageAliasSpeaker(messageText: string, aliases: string[]): string | null {
  const text = normalizeToken(messageText);
  if (!text) return null;
  const normalizedText = text.toLowerCase();
  let bestAlias: string | null = null;
  let bestScore = 0;
  let tied = false;

  for (const alias of aliases) {
    const trimmed = normalizeToken(alias);
    if (!trimmed) continue;
    const escaped = escapeRegex(trimmed);
    const startsWithAlias = new RegExp(`^[\\s"'([{-]*${escaped}(?:\\b|['’]s\\b)`, "i").test(text);
    const mentions = countAliasMentions(normalizedText, trimmed.toLowerCase());
    const score = (startsWithAlias ? 100 : 0) + mentions;
    if (score <= 0) continue;
    if (score > bestScore) {
      bestAlias = trimmed;
      bestScore = score;
      tied = false;
      continue;
    }
    if (score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : bestAlias;
}

export function resolveEntityTrackingMode(
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): EntityTrackingMode {
  return settings.entityTrackingMode === "dynamic_entities"
    ? "dynamic_entities"
    : settings.entityTrackingMode === "multi_character"
      ? "multi_character"
      : "standard";
}

export function resolveCharacterIdentity(
  context: STContext | null,
  ownerName: string,
  mode: EntityTrackingMode,
): ResolvedCharacterIdentity | null {
  const target = normalizeToken(ownerName);
  if (!target || !Array.isArray(context?.characters)) return null;
  const targetKey = normalizeKey(target);

  for (const character of context.characters) {
    const sourceName = normalizeToken(character?.name);
    if (!sourceName) continue;
    const sourceAvatar = normalizeToken(character?.avatar) || null;
    const aliases = getCharacterAliases(character, mode);
    if (!aliases.length) continue;
    if (normalizeKey(sourceName) === targetKey) {
      return { sourceName, sourceAvatar, resolvedName: sourceName, matchedBy: "source" };
    }
    const alias = aliases.find(candidate => normalizeKey(candidate) === targetKey && normalizeKey(candidate) !== normalizeKey(sourceName));
    if (alias) {
      return { sourceName, sourceAvatar, resolvedName: alias, matchedBy: "alias" };
    }
  }

  return null;
}

export function resolveStableEntityIdForOwner(
  context: STContext | null,
  ownerName: string,
  mode: EntityTrackingMode,
): string {
  const normalizedOwner = normalizeToken(ownerName);
  if (!normalizedOwner) return "";
  const fromRegistry = resolveTrackerEntityIdsForOwners(context, [normalizedOwner])[0];
  if (fromRegistry) return fromRegistry;

  if (isMultiCharacterEntityTrackingMode(mode)) {
    const identity = resolveCharacterIdentity(context, normalizedOwner, mode);
    if (identity) {
      const sourceKey = `${normalizeKey(identity.sourceAvatar ?? "")}|${normalizeKey(identity.sourceName)}`;
      if (sourceKey) {
        if (identity.matchedBy === "alias") {
          return `bst_mc_alias:${sourceKey}:${normalizeKey(identity.resolvedName)}`;
        }
        return `bst_owner:${sourceKey}`;
      }
    }
  }

  return `bst_owner:${normalizeKey(normalizedOwner)}`;
}

export function resolveCharacterFromContext(
  context: STContext | null,
  ownerName: string,
  mode: EntityTrackingMode,
): Character | null {
  const resolved = resolveCharacterIdentity(context, ownerName, mode);
  if (!resolved || !Array.isArray(context?.characters)) return null;
  return context.characters.find(character => {
    const sourceName = normalizeToken(character?.name);
    const sourceAvatar = normalizeToken(character?.avatar) || null;
    return normalizeKey(sourceName) === normalizeKey(resolved.sourceName)
      && sourceAvatar === resolved.sourceAvatar;
  }) ?? null;
}

export function isAliasResolvedOwner(
  context: STContext | null,
  ownerName: string,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): boolean {
  const mode = resolveEntityTrackingMode(settings);
  if (!isMultiCharacterEntityTrackingMode(mode)) return false;
  const resolved = resolveCharacterIdentity(context, ownerName, mode);
  return resolved?.matchedBy === "alias";
}

export function collectResolvedCharacterNames(
  context: STContext | null,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  if (!Array.isArray(context?.characters)) return [];
  const mode = settings.entityTrackingMode ?? "standard";
  const names: string[] = [];
  for (const character of context.characters) {
    names.push(...getCharacterAliases(character, mode));
  }
  return uniqueStrings(names);
}

export function resolveMessageScopedActiveCharacters(
  context: STContext | null,
  activeCharacters: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  if (!isMultiCharacterEntityTrackingMode(mode)) {
    return activeCharacters.map(ownerName => resolveMessageScopedOwnerName(context, ownerName, message, settings));
  }

  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const ownerName of activeCharacters) {
    const resolved = resolveCharacterIdentity(context, ownerName, mode);
    if (!resolved) {
      pushUniqueString(expanded, seen, ownerName);
      continue;
    }
    const source = resolveCharacterFromContext(context, ownerName, mode);
    if (!source) {
      pushUniqueString(expanded, seen, resolveMessageScopedOwnerName(context, ownerName, message, settings));
      continue;
    }
    const aliases = getCharacterAliases(source, mode)
      .filter(alias => normalizeKey(alias) !== normalizeKey(resolved.sourceName));
    if (resolved.matchedBy === "source" && aliases.length >= 2) {
      for (const alias of aliases) {
        pushUniqueString(expanded, seen, alias);
      }
      continue;
    }
    pushUniqueString(expanded, seen, resolved.matchedBy === "alias" ? resolved.resolvedName : ownerName);
  }
  return expanded;
}

export function resolveEntityResolverCandidateOwners(
  context: STContext | null,
  ownerNames: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  const normalizedOwners = uniqueStrings(ownerNames.map(normalizeToken));
  if (!isMultiCharacterEntityTrackingMode(mode)) return normalizedOwners;
  return resolveMessageScopedActiveCharacters(context, normalizedOwners, message, settings);
}

export function resolveMessageScopedParticipants(
  context: STContext | null,
  activeCharacters: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  if (!isMultiCharacterEntityTrackingMode(mode)) return [...activeCharacters];
  if (!message || message.is_user || message.is_system) return [...activeCharacters];

  const messageText = normalizeToken(message.mes);
  if (!messageText) return [...activeCharacters];

  const speakerIdentity = resolveCharacterIdentity(context, String(message.name ?? "").trim(), mode);
  const speakerSourceKey = speakerIdentity
    ? buildSourceKey(speakerIdentity.sourceName, speakerIdentity.sourceAvatar)
    : null;
  const appended: string[] = [];
  const appendedSeen = new Set<string>();
  const grouped = new Map<string, { owners: string[]; aliases: string[]; isMulti: boolean; isSpeakerGroup: boolean }>();

  for (const ownerName of activeCharacters) {
    const resolved = resolveCharacterIdentity(context, ownerName, mode);
    if (!resolved) {
      if (
        normalizeKey(String(message.name ?? "")) === normalizeKey(ownerName)
        || countAliasMentions(messageText.toLowerCase(), ownerName.toLowerCase()) > 0
      ) {
        pushUniqueString(appended, appendedSeen, ownerName);
      }
      continue;
    }
    const source = resolveCharacterFromContext(context, ownerName, mode);
    const aliases = source
      ? getCharacterAliases(source, mode).filter(alias => normalizeKey(alias) !== normalizeKey(resolved.sourceName))
      : [];
    const sourceKey = buildSourceKey(resolved.sourceName, resolved.sourceAvatar);
    const entry = grouped.get(sourceKey) ?? {
      owners: [],
      aliases,
      isMulti: aliases.length >= 2,
      isSpeakerGroup: speakerSourceKey === sourceKey,
    };
    entry.owners.push(ownerName);
    grouped.set(sourceKey, entry);
  }

  for (const [, group] of grouped) {
    if (!group.isMulti) {
      for (const ownerName of group.owners) {
        if (
          normalizeKey(String(message.name ?? "")) === normalizeKey(ownerName)
          || countAliasMentions(messageText.toLowerCase(), ownerName.toLowerCase()) > 0
        ) {
          pushUniqueString(appended, appendedSeen, ownerName);
        }
      }
      continue;
    }

    const mentionedAliases = collectMentionedAliases(messageText, group.aliases);
    if (mentionedAliases.length) {
      for (const alias of mentionedAliases) {
        pushUniqueString(appended, appendedSeen, alias);
      }
      continue;
    }

    if (group.isSpeakerGroup) {
      for (const ownerName of group.owners) {
        pushUniqueString(appended, appendedSeen, resolveMessageScopedOwnerName(context, ownerName, message, settings));
      }
    }
  }

  return appended.length ? appended : [...activeCharacters];
}

export function resolveExtractionOwnerScopes(
  context: STContext | null,
  activeCharacters: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
} {
  const sceneActiveCharacters = resolveMessageScopedActiveCharacters(
    context,
    activeCharacters,
    message,
    settings,
  );
  const requestCharacters = resolveMessageScopedParticipants(
    context,
    sceneActiveCharacters,
    message,
    settings,
  );
  const narrowedSceneActiveCharacters = filterSceneActiveCharactersByRecentDepartureCues(
    context,
    sceneActiveCharacters,
    requestCharacters,
    message,
  );
  return {
    sceneActiveCharacters: narrowedSceneActiveCharacters,
    requestCharacters,
  };
}

export function resolveUserExtractionOwnerScopes(input: {
  context: STContext | null;
  detectedActiveCharacters: string[];
  message: ChatMessage | null | undefined;
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
  resolvedSceneActiveCharacters?: string[] | null;
}): {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
  source: "model" | "fallback";
} {
  const resolvedSceneActiveCharacters = resolvePersistedActiveOwners(
    input.resolvedSceneActiveCharacters ?? [],
    { includeUserOwner: false },
  );
  if (resolvedSceneActiveCharacters.length) {
    return {
      sceneActiveCharacters: resolvedSceneActiveCharacters,
      requestCharacters: [USER_TRACKER_KEY],
      source: "model",
    };
  }

  const fallbackSceneActiveCharacters = resolvePersistedActiveOwners(
    resolveExtractionOwnerScopes(
      input.context,
      input.detectedActiveCharacters,
      input.message,
      input.settings,
    ).sceneActiveCharacters,
    { includeUserOwner: false },
  );

  return {
    sceneActiveCharacters: fallbackSceneActiveCharacters,
    requestCharacters: [USER_TRACKER_KEY],
    source: "fallback",
  };
}

export function constrainFallbackOwnerScopesToPreviousUserScene(input: {
  userExtraction: boolean;
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
  previousMessage: ChatMessage | null | undefined;
  previousTrackerData: TrackerData | null | undefined;
  fallbackSceneActiveCharacters: string[];
  fallbackRequestCharacters: string[];
}): {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
} | null {
  if (input.userExtraction) return null;
  if (!isMultiCharacterEntityTrackingMode(resolveEntityTrackingMode(input.settings))) return null;
  if (!input.previousMessage?.is_user) return null;
  if (input.previousTrackerData?.entityResolution && !resolveTrackerSceneOwners(null, input.previousTrackerData).length) {
    return {
      sceneActiveCharacters: [],
      requestCharacters: [],
    };
  }
  const previousSceneOwners = resolveTrackerSceneOwners(null, input.previousTrackerData);
  if (!previousSceneOwners.length) return null;
  const allowed = new Set(previousSceneOwners.map(owner => normalizeKey(owner)));
  const requestCharacters = input.fallbackRequestCharacters.filter(owner => allowed.has(normalizeKey(owner)));

  return {
    sceneActiveCharacters: [...previousSceneOwners],
    requestCharacters: requestCharacters.length
      ? requestCharacters
      : (previousSceneOwners.length === 1 ? [...previousSceneOwners] : []),
  };
}

export function constrainResolvedOwnerScopesToPreviousUserScene(input: {
  userExtraction: boolean;
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
  previousMessage: ChatMessage | null | undefined;
  previousTrackerData: TrackerData | null | undefined;
  resolvedSceneActiveCharacters: string[];
  resolvedRequestCharacters: string[];
}): {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
} | null {
  if (input.userExtraction) return null;
  if (!isMultiCharacterEntityTrackingMode(resolveEntityTrackingMode(input.settings))) return null;
  if (!input.previousMessage?.is_user) return null;
  if (input.resolvedRequestCharacters.length) return null;
  if (input.previousTrackerData?.entityResolution && !resolveTrackerSceneOwners(null, input.previousTrackerData).length) {
    return {
      sceneActiveCharacters: [],
      requestCharacters: [],
    };
  }
  const previousSceneOwners = resolveTrackerSceneOwners(null, input.previousTrackerData);
  if (!previousSceneOwners.length) return null;
  const allowed = new Set(previousSceneOwners.map(owner => normalizeKey(owner)));

  return {
    sceneActiveCharacters: input.resolvedSceneActiveCharacters.filter(owner => allowed.has(normalizeKey(owner))),
    requestCharacters: [],
  };
}

export function resolvePersistedActiveOwners(
  sceneActiveCharacters: string[],
  input: { includeUserOwner?: boolean } = {},
): string[] {
  const includeUserOwner = input.includeUserOwner === true;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawOwner of sceneActiveCharacters) {
    const ownerName = normalizeToken(rawOwner);
    if (!ownerName) continue;
    if (normalizeKey(ownerName) === normalizeKey(USER_TRACKER_KEY)) {
      if (!includeUserOwner) continue;
      pushUniqueString(out, seen, USER_TRACKER_KEY);
      continue;
    }
    pushUniqueString(out, seen, ownerName);
  }
  return out;
}

export function resolvePersistedSnapshotActiveOwners(input: {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
  userExtraction: boolean;
}): string[] {
  return resolvePersistedActiveOwners(
    input.requestCharacters,
    { includeUserOwner: input.userExtraction },
  );
}

export function resolvePersistedSnapshotEntityOwners(input: {
  sceneActiveCharacters: string[];
}): string[] {
  return resolvePersistedActiveOwners(
    input.sceneActiveCharacters,
    { includeUserOwner: false },
  );
}

export function resolvePersistedSnapshotResolvedEntities(input: {
  context: STContext | null;
  sceneActiveCharacters: string[];
  requestCharacters: string[];
  resolvedEntities: TrackerResolvedEntity[];
  userExtraction: boolean;
  entityTrackingMode?: EntityTrackingMode;
}): TrackerResolvedEntity[] {
  if (input.resolvedEntities.length) {
    return input.resolvedEntities.map(entity => ({
      ...entity,
      aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
      created: Boolean(entity.created),
      inMessage: input.userExtraction ? false : Boolean(entity.inMessage),
    }));
  }

  const sceneOwners = resolvePersistedActiveOwners(input.sceneActiveCharacters);
  const messageOwners = resolvePersistedActiveOwners(
    input.userExtraction ? [] : input.requestCharacters,
    { includeUserOwner: false },
  );
  const messageOwnerKeys = new Set(messageOwners.map(owner => normalizeKey(owner)));

  return sceneOwners.map(ownerName => ({
    entityId: resolveStableEntityIdForOwner(
      input.context,
      ownerName,
      input.entityTrackingMode ?? "standard",
    ),
    kind: "st-character",
    name: ownerName,
    avatar: null,
    aliases: undefined,
    inScene: true,
    inMessage: messageOwnerKeys.has(normalizeKey(ownerName)),
    created: false,
  }));
}

export function filterResolvedEntitiesToTrackedOwners(input: {
  context: STContext | null;
  trackedOwners: string[];
  resolvedEntities: TrackerResolvedEntity[];
}): TrackerResolvedEntity[] {
  const trackedOwnerKeys = new Set(
    (input.trackedOwners ?? [])
      .map(owner => normalizeKey(owner))
      .filter(Boolean),
  );
  if (!trackedOwnerKeys.size || !input.resolvedEntities.length) return [];

  return input.resolvedEntities
    .filter(entity => {
      const entityId = normalizeToken(entity.entityId);
      const entityName = normalizeToken(entity.name);
      const resolvedOwnerName = entityId
        ? (
            resolveTrackerOwnersForEntityIds(input.context, [entityId])[0]
            || (!isTechnicalResolvedEntityName(entityName, entityId) ? entityName : "")
            || resolveOwnerNameFallbackFromEntityId(entityId)
            || entityName
          )
        : entityName;
      return trackedOwnerKeys.has(normalizeKey(resolvedOwnerName));
    })
    .map(entity => ({
      ...entity,
      aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
      created: Boolean(entity.created),
    }));
}

function normalizeOwnerForTracking(
  context: STContext | null | undefined,
  ownerName: unknown,
): string {
  const normalizedOwner = normalizeToken(ownerName);
  if (!normalizedOwner) return "";
  if (normalizeKey(normalizedOwner) === normalizeKey(USER_TRACKER_KEY)) {
    return USER_TRACKER_KEY;
  }
  const userDisplayName = normalizeToken(context?.name1);
  if (userDisplayName && normalizeKey(normalizedOwner) === normalizeKey(userDisplayName)) {
    return USER_TRACKER_KEY;
  }
  return normalizedOwner;
}

function collectStoredBuiltInOwnerNames(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  includeUserOwner: boolean,
): string[] {
  if (!data?.statistics || typeof data.statistics !== "object") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const pushOwner = (rawOwner: unknown): void => {
    const ownerName = normalizeOwnerForTracking(context, rawOwner);
    if (!ownerName) return;
    if (!includeUserOwner && normalizeKey(ownerName) === normalizeKey(USER_TRACKER_KEY)) return;
    pushUniqueString(out, seen, ownerName);
  };
  for (const bucket of Object.values(data.statistics ?? {})) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const ownerName of Object.keys(bucket)) {
      pushOwner(ownerName);
    }
  }
  return out;
}

function collectStoredResolverSceneOwners(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  includeUserOwner: boolean,
): string[] {
  if (!data) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const pushOwner = (rawOwner: unknown): void => {
    const ownerName = normalizeOwnerForTracking(context, rawOwner);
    if (!ownerName) return;
    if (!includeUserOwner && normalizeKey(ownerName) === normalizeKey(USER_TRACKER_KEY)) return;
    pushUniqueString(out, seen, ownerName);
  };

  for (const ownerName of resolveTrackerSceneOwners(context ?? null, data)) {
    pushOwner(ownerName);
  }
  if (out.length) return out;
  return out;
}

export function resolveInitialExtractionOwners(input: {
  context?: STContext | null;
  userExtraction: boolean;
  forceRetrack: boolean;
  preferExistingOwnersOnRetrack?: boolean;
  detectedActiveCharacters: string[];
  existingTrackerData?: TrackerData | null;
  existingActiveCharacters?: string[] | null;
}): string[] {
  if (input.userExtraction) {
    return [USER_TRACKER_KEY];
  }
  const preferExistingOwnersOnRetrack = input.preferExistingOwnersOnRetrack !== false;
  if (input.forceRetrack && preferExistingOwnersOnRetrack && input.existingTrackerData) {
    const hasStoredResolvedEntities = Boolean(input.existingTrackerData.entityResolution?.resolvedEntities?.length);
    const storedResolverSceneOwners = hasStoredResolvedEntities
      ? resolvePersistedActiveOwners(
          resolveTrackerSceneOwners(input.context ?? null, input.existingTrackerData),
          { includeUserOwner: false },
        )
      : [];
    if (storedResolverSceneOwners.length) {
      return storedResolverSceneOwners;
    }
    const storedBuiltInOwners = collectStoredBuiltInOwnerNames(input.context, input.existingTrackerData, false);
    if (storedBuiltInOwners.length) {
      return storedBuiltInOwners;
    }
  }
  const existingActiveCharacters = Array.isArray(input.existingActiveCharacters)
    ? input.existingActiveCharacters
        .map(ownerName => normalizeOwnerForTracking(input.context, ownerName))
        .filter(Boolean)
    : [];
  if (input.forceRetrack && preferExistingOwnersOnRetrack && existingActiveCharacters.length) {
    return resolvePersistedActiveOwners(existingActiveCharacters, { includeUserOwner: false });
  }
  return input.detectedActiveCharacters;
}

export function resolveMessageScopedOwnerName(
  context: STContext | null,
  ownerName: string,
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string {
  const mode = resolveEntityTrackingMode(settings);
  if (!isMultiCharacterEntityTrackingMode(mode)) return ownerName;
  if (!message || message.is_user || message.is_system) return ownerName;

  const messageText = normalizeToken(message.mes);
  if (!messageText) return ownerName;

  const resolved = resolveCharacterIdentity(context, ownerName, mode);
  if (!resolved) return ownerName;
  if (resolved.matchedBy === "alias") return resolved.resolvedName;
  const source = resolveCharacterFromContext(context, ownerName, mode);
  if (!source) return ownerName;
  const aliases = getCharacterAliases(source, mode)
    .filter(alias => normalizeKey(alias) !== normalizeKey(resolved.sourceName));
  if (!aliases.length) return ownerName;
  return inferMessageAliasSpeaker(messageText, aliases) ?? ownerName;
}

function remapOwnerBucket<T>(
  bucket: Record<string, T> | undefined,
  ownerMap: Map<string, string>,
): Record<string, T> | undefined {
  if (!bucket) return undefined;
  let changed = false;
  const next: Record<string, T> = {};
  for (const [rawOwner, value] of Object.entries(bucket)) {
    const mappedOwner = ownerMap.get(rawOwner) ?? rawOwner;
    if (mappedOwner !== rawOwner) changed = true;
    if (!(mappedOwner in next)) {
      next[mappedOwner] = value;
    }
  }
  return changed ? next : bucket;
}

function remapStatistics(
  stats: Statistics,
  ownerMap: Map<string, string>,
): Statistics {
  return {
    affection: remapOwnerBucket(stats.affection, ownerMap) ?? stats.affection,
    trust: remapOwnerBucket(stats.trust, ownerMap) ?? stats.trust,
    desire: remapOwnerBucket(stats.desire, ownerMap) ?? stats.desire,
    connection: remapOwnerBucket(stats.connection, ownerMap) ?? stats.connection,
    mood: remapOwnerBucket(stats.mood, ownerMap) ?? stats.mood,
    lastThought: remapOwnerBucket(stats.lastThought, ownerMap) ?? stats.lastThought,
  };
}

function remapCustomStatistics(
  stats: CustomStatistics | undefined,
  ownerMap: Map<string, string>,
): CustomStatistics | undefined {
  if (!stats) return stats;
  let changed = false;
  const next: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(stats)) {
    const remapped = remapOwnerBucket(bucket, ownerMap) ?? bucket;
    next[statId] = remapped;
    if (remapped !== bucket) changed = true;
  }
  return changed ? next : stats;
}

function remapCustomNonNumericStatistics(
  stats: CustomNonNumericStatistics | undefined,
  ownerMap: Map<string, string>,
): CustomNonNumericStatistics | undefined {
  if (!stats) return stats;
  let changed = false;
  const next: CustomNonNumericStatistics = {};
  for (const [statId, bucket] of Object.entries(stats)) {
    const remapped = remapOwnerBucket(bucket, ownerMap) ?? bucket;
    next[statId] = remapped;
    if (remapped !== bucket) changed = true;
  }
  return changed ? next : stats;
}

function remapClearedStatistics(
  stats: ClearedStatistics | undefined,
  ownerMap: Map<string, string>,
): ClearedStatistics | undefined {
  if (!stats) return stats;
  let changed = false;
  const next: ClearedStatistics = {};
  for (const [statId, bucket] of Object.entries(stats)) {
    const remapped = remapOwnerBucket(bucket, ownerMap) ?? bucket;
    next[statId as keyof ClearedStatistics] = remapped;
    if (remapped !== bucket) changed = true;
  }
  return changed ? next : stats;
}

function remapClearedCustomBuckets<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(
  stats: T | undefined,
  ownerMap: Map<string, string>,
): T | undefined {
  if (!stats) return stats;
  let changed = false;
  const next: Record<string, Record<string, true>> = {};
  for (const [statId, bucket] of Object.entries(stats)) {
    const remapped = remapOwnerBucket(bucket, ownerMap) ?? bucket;
    next[statId] = remapped;
    if (remapped !== bucket) changed = true;
  }
  return (changed ? next : stats) as T | undefined;
}

function resolveProjectedEntitySnapshot(
  entityOwnerMap: TrackerData["entityOwnerMap"] | undefined,
  ownerName: string,
  sourceEntity?: Pick<TrackerResolvedEntity, "entityId" | "kind">,
): NonNullable<TrackerData["entityOwnerMap"]>[string] | null {
  if (!entityOwnerMap) return null;
  const sourceEntityId = normalizeToken(sourceEntity?.entityId);
  if (sourceEntityId) {
    for (const snapshot of Object.values(entityOwnerMap)) {
      if (!snapshot) continue;
      if (normalizeToken(snapshot.entityId) === sourceEntityId) return snapshot;
    }
  }
  if (sourceEntity?.kind === "narrative-entity" || /^bst_narrative:/i.test(sourceEntityId)) {
    return null;
  }
  const ownerKey = normalizeKey(ownerName);
  for (const snapshot of Object.values(entityOwnerMap)) {
    if (!snapshot) continue;
    const keys = new Set<string>([
      normalizeKey(snapshot.ownerName),
      normalizeKey(snapshot.canonicalName),
      ...((snapshot.aliases ?? []).map(alias => normalizeKey(alias))),
    ]);
    if (keys.has(ownerKey)) return snapshot;
  }
  return null;
}

function resolveProjectedOwnerName(
  context: STContext | null,
  data: TrackerData,
  ownerMap: Map<string, string>,
  entity: TrackerResolvedEntity,
): string {
  const entityId = normalizeToken(entity.entityId);
  const entityName = normalizeToken(entity.name);
  const mappedEntityName = ownerMap.get(entityName);
  if (mappedEntityName) return mappedEntityName;

  if (entityId) {
    const snapshotOwner = Object.values(data.entityOwnerMap ?? {}).find(snapshot =>
      normalizeToken(snapshot?.entityId) === entityId,
    )?.ownerName;
    const mappedSnapshotOwner = ownerMap.get(normalizeToken(snapshotOwner)) ?? normalizeToken(snapshotOwner);
    if (mappedSnapshotOwner) return mappedSnapshotOwner;

    const registryOwner = resolveTrackerOwnersForEntityIds(context, [entityId])[0];
    const mappedRegistryOwner = ownerMap.get(normalizeToken(registryOwner)) ?? normalizeToken(registryOwner);
    if (mappedRegistryOwner) return mappedRegistryOwner;
  }

  if (!isTechnicalResolvedEntityName(entityName, entityId)) return entityName;
  return resolveOwnerNameFallbackFromEntityId(entityId) || entityName;
}

function buildProjectedEntityId(
  context: STContext | null,
  sourceEntity: { entityId: string; name: string; kind?: TrackerResolvedEntity["kind"] },
  projectedOwnerName: string,
): string {
  const normalizedEntityId = normalizeToken(sourceEntity.entityId);
  if (sourceEntity.kind === "narrative-entity" || /^bst_narrative:/i.test(normalizedEntityId)) {
    return normalizedEntityId || sourceEntity.entityId;
  }
  const identity = resolveCharacterIdentity(context, projectedOwnerName, "multi_character");
  if (!identity) return sourceEntity.entityId;
  const sourceKey = `${normalizeKey(identity.sourceAvatar ?? "")}|${normalizeKey(identity.sourceName)}`;
  if (!sourceKey) return sourceEntity.entityId;
  if (identity.matchedBy === "alias") {
    return `bst_mc_alias:${sourceKey}:${normalizeKey(identity.resolvedName)}`;
  }
  return `bst_owner:${sourceKey}`;
}

export function projectTrackerDataToMessageScopedOwners(
  context: STContext | null,
  data: TrackerData,
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
  options?: {
    projectOwnerScopedCustomNonNumeric?: boolean;
  },
): TrackerData {
  const ownerMap = new Map<string, string>();
  let changed = false;
  const projectOwnerScopedCustomNonNumeric = options?.projectOwnerScopedCustomNonNumeric !== false;

  for (const ownerName of data.activeCharacters ?? []) {
    const mappedOwner = resolveMessageScopedOwnerName(context, ownerName, message, settings);
    ownerMap.set(ownerName, mappedOwner);
    if (mappedOwner !== ownerName) changed = true;
  }

  if (!changed) return data;

  const remapOwners = (owners: string[] | undefined): string[] => uniqueStrings(
    (owners ?? []).map(ownerName => ownerMap.get(ownerName) ?? ownerName),
  );
  return {
    ...data,
    activeCharacters: (data.activeCharacters ?? []).map(ownerName => ownerMap.get(ownerName) ?? ownerName),
    entityResolution: data.entityResolution
      ? {
          ...data.entityResolution,
          resolvedEntities: (data.entityResolution.resolvedEntities ?? []).map(entity => {
            const projectedOwnerName = resolveProjectedOwnerName(context, data, ownerMap, entity);
            return {
              ...entity,
              entityId: resolveProjectedEntitySnapshot(
                data.entityOwnerMap,
                projectedOwnerName,
                entity,
              )?.entityId ?? buildProjectedEntityId(context, entity, projectedOwnerName),
              name: projectedOwnerName,
              aliases: entity.aliases?.length
                ? uniqueStrings(entity.aliases.map(alias => ownerMap.get(alias) ?? alias))
                : undefined,
            };
          }),
          source: data.entityResolution.source,
        }
      : undefined,
    statistics: remapStatistics(data.statistics, ownerMap),
    customStatistics: remapCustomStatistics(data.customStatistics, ownerMap),
    customNonNumericStatistics: projectOwnerScopedCustomNonNumeric
      ? remapCustomNonNumericStatistics(data.customNonNumericStatistics, ownerMap)
      : data.customNonNumericStatistics,
    clearedStatistics: remapClearedStatistics(data.clearedStatistics, ownerMap),
    clearedCustomStatistics: remapClearedCustomBuckets(data.clearedCustomStatistics, ownerMap),
    clearedCustomNonNumericStatistics: projectOwnerScopedCustomNonNumeric
      ? remapClearedCustomBuckets(data.clearedCustomNonNumericStatistics, ownerMap)
      : data.clearedCustomNonNumericStatistics,
    entityOwnerMap: undefined,
  };
}
