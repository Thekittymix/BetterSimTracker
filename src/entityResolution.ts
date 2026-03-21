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
} from "./types";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";

export type EntityTrackingMode = "standard" | "multi_character";

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
  if (mode !== "multi_character") return [sourceName];
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
  return settings.entityTrackingMode === "multi_character" ? "multi_character" : "standard";
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
  if (mode !== "multi_character") return false;
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
  if (mode !== "multi_character") {
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

export function resolveMessageScopedParticipants(
  context: STContext | null,
  activeCharacters: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  if (mode !== "multi_character") return [...activeCharacters];
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

export function refineSceneActiveCharactersFromExtractedSceneRoster(
  context: STContext | null,
  sceneActiveCharacters: string[],
  extractedCustomNonNumericStatistics: TrackerData["customNonNumericStatistics"] | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  if (mode !== "multi_character") return [...sceneActiveCharacters];
  const rawRoster = extractedCustomNonNumericStatistics?.characters_in_scene?.[GLOBAL_TRACKER_KEY];
  if (!Array.isArray(rawRoster) || !rawRoster.length) return [...sceneActiveCharacters];

  const refined: string[] = [];
  const seen = new Set<string>();
  const pushOwner = (raw: unknown): void => {
    const value = normalizeToken(raw);
    if (!value) return;
    if (normalizeKey(value) === normalizeKey(USER_TRACKER_KEY)) {
      pushUniqueString(refined, seen, USER_TRACKER_KEY);
      return;
    }
    const resolved = resolveCharacterIdentity(context, value, mode);
    const nextOwner = resolved?.matchedBy === "alias" ? resolved.resolvedName : value;
    pushUniqueString(refined, seen, nextOwner);
  };

  for (const ownerName of rawRoster) pushOwner(ownerName);
  return refined.length ? refined : [...sceneActiveCharacters];
}

export function resolveMessageScopedOwnerName(
  context: STContext | null,
  ownerName: string,
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string {
  const mode = resolveEntityTrackingMode(settings);
  if (mode !== "multi_character") return ownerName;
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

  return {
    ...data,
    activeCharacters: (data.activeCharacters ?? []).map(ownerName => ownerMap.get(ownerName) ?? ownerName),
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
  };
}
