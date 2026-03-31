import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
import {
  collectResolvedCharacterNames,
  isMultiCharacterEntityTrackingMode,
  resolveCharacterFromContext,
  resolveCharacterIdentity,
  resolveEntityTrackingMode,
} from "./entityResolution";
import { normalizeCustomNonNumericValue } from "./customStatRuntime";
import {
  getEntityRegistryEntryByOwnerName,
  resolveTrackerDataLookupValue,
  resolveTrackerSceneOwners,
} from "./entityRegistry";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";

const BST_INJECTION_MACRO = "bst_injection";
const BST_IMAGE_STATE_MACRO = "bst_image_state";
const BST_MACRO_STAT_SCOPE_USER = "user";
const BST_MACRO_STAT_SCOPE_SCENE = "scene";
const registeredBstMacros = new Set<string>();
let bstMacroSignature = "";
const CHARACTER_SLUG_FALLBACK = "character";
let lastBstMacroDebugSnapshot: Record<string, unknown> | null = null;

function toMacroIdSegment(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toCharacterSlug(value: string): string {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || CHARACTER_SLUG_FALLBACK;
}

function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toAvatarSlug(value: string): string {
  const token = String(value ?? "").trim();
  if (!token) return "";
  const parts = token.split(/[\\/]/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : token;
  const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
  return toCharacterSlug(withoutExt);
}

type CharacterMacroTarget = {
  ownerName: string;
  entityId: string | null;
  macroSlug: string;
  legacyNameSlug: string | null;
  displayName: string;
  avatar: string | null;
};

type MacroResolutionSample = {
  macro: string;
  resolved: string;
  legacyMacro?: string | null;
  legacyResolved?: string | null;
};

type ImageMacroStatDef = {
  id: string;
  label: string;
  includeForUser: boolean;
  includeForCharacter: boolean;
};

function canUseSceneRosterStatInImageState(
  stat: BetterSimTrackerSettings["customStats"][number] | null | undefined,
): boolean {
  if (!stat) return false;
  if (String(stat.id ?? "").trim().toLowerCase() !== "characters_in_scene") return false;
  if ((stat.kind ?? "numeric") === "numeric") return false;
  if (!stat.globalScope) return false;
  if (!stat.track) return false;
  if (!stat.showOnCard) return false;
  if (stat.privateToOwner) return false;
  return true;
}

function resolveMacroTargetIdentity(
  context: STContext,
  data: TrackerData | null,
  rawName: string,
): { ownerName: string; entityId: string | null; lookupNames: string[] } {
  const normalizedRawName = normalizeName(rawName);
  if (data?.entityOwnerMap && typeof data.entityOwnerMap === "object") {
    for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
      const snapshotNames = [
        snapshotOwner,
        snapshot?.ownerName,
        snapshot?.canonicalName,
        ...(snapshot?.aliases ?? []),
      ]
        .map(value => String(value ?? "").trim())
        .filter(Boolean);
      if (!snapshotNames.some(name => normalizeName(name) === normalizedRawName)) continue;
      return {
        ownerName: String(snapshot?.ownerName ?? rawName).trim() || rawName,
        entityId: String(snapshot?.entityId ?? "").trim() || null,
        lookupNames: Array.from(new Set(snapshotNames)),
      };
    }
  }

  const registryEntry = getEntityRegistryEntryByOwnerName(context, rawName);
  const entityId = String(registryEntry?.id ?? "").trim() || null;
  const ownerName = String(registryEntry?.ownerName ?? rawName).trim() || rawName;
  const lookupNames = [
    rawName,
    ownerName,
    String(registryEntry?.canonicalName ?? "").trim(),
    ...((registryEntry?.aliases ?? []).map(alias => String(alias ?? "").trim())),
  ].filter(Boolean);
  return {
    ownerName,
    entityId,
    lookupNames: Array.from(new Set(lookupNames)),
  };
}

function shouldSkipAggregateSourceMacroTarget(
  context: STContext,
  settings: BetterSimTrackerSettings,
  ownerName: string,
  entityId: string | null,
): boolean {
  if (entityId) return false;
  const mode = resolveEntityTrackingMode(settings);
  if (!isMultiCharacterEntityTrackingMode(mode)) return false;
  const resolved = resolveCharacterIdentity(context, ownerName, mode);
  if (!resolved || resolved.matchedBy !== "source") return false;
  const source = resolveCharacterFromContext(context, ownerName, mode);
  if (!source) return false;
  const aliases = collectResolvedCharacterNames(
    { ...context, characters: [source] },
    settings,
  ).filter(alias => normalizeName(alias) !== normalizeName(resolved.sourceName));
  return aliases.length >= 2;
}

function shouldSkipAggregateSourceMacroTargetFromSnapshot(
  data: TrackerData | null,
  ownerName: string,
  entityId: string | null,
): boolean {
  if (entityId || !data?.entityOwnerMap || typeof data.entityOwnerMap !== "object") return false;
  const normalizedOwner = normalizeName(ownerName);
  if (!normalizedOwner) return false;
  const aliasEntries = Object.values(data.entityOwnerMap)
    .filter(entry => entry?.kind === "multi_character_alias")
    .filter(entry => String(entry?.entityId ?? "").trim());
  if (aliasEntries.length < 2) return false;
  const grouped = new Map<string, typeof aliasEntries>();
  for (const entry of aliasEntries) {
    const sourceKey = String(entry?.sourceKey ?? "").trim().toLowerCase();
    if (!sourceKey) continue;
    const bucket = grouped.get(sourceKey) ?? [];
    bucket.push(entry);
    grouped.set(sourceKey, bucket);
  }
  for (const [sourceKey, entries] of grouped.entries()) {
    if (entries.length < 2) continue;
    const [, rawSourceName = ""] = sourceKey.split("|");
    if (normalizeName(rawSourceName) !== normalizedOwner) continue;
    if (entries.some(entry => normalizeName(entry?.ownerName) === normalizedOwner)) return false;
    return true;
  }
  return false;
}

function buildCharacterMacroTargets(
  context: STContext,
  settings: BetterSimTrackerSettings,
  data: TrackerData | null,
  allCharacterNames: string[],
): CharacterMacroTarget[] {
  const targetIdentities: Array<{ ownerName: string; entityId: string | null; lookupNames: string[] }> = [];
  const seenOwnerKeys = new Set<string>();
  const seenEntityIds = new Set<string>();
  for (const rawName of allCharacterNames ?? []) {
    const ownerName = String(rawName ?? "").trim();
    if (!ownerName || ownerName === USER_TRACKER_KEY || ownerName === GLOBAL_TRACKER_KEY) continue;
    const identity = resolveMacroTargetIdentity(context, data, ownerName);
    const entityId = String(identity.entityId ?? "").trim();
    if (entityId) {
      if (seenEntityIds.has(entityId)) continue;
      seenEntityIds.add(entityId);
    }
    const ownerKey = normalizeName(identity.ownerName || ownerName);
    if (!entityId && seenOwnerKeys.has(ownerKey)) continue;
    seenOwnerKeys.add(ownerKey);
    if (shouldSkipAggregateSourceMacroTargetFromSnapshot(data, identity.ownerName || ownerName, entityId || null)) {
      continue;
    }
    if (shouldSkipAggregateSourceMacroTarget(context, settings, identity.ownerName || ownerName, entityId || null)) {
      continue;
    }
    targetIdentities.push(identity);
  }

  const candidates: Array<{
    ownerName: string;
    entityId: string | null;
    displayName: string;
    avatar: string | null;
    baseSlug: string;
  }> = [];

  for (const identity of targetIdentities) {
    let matchedCharacter = false;
    const lookupNameKeys = new Set(identity.lookupNames.map(normalizeName).filter(Boolean));
    for (const character of context.characters ?? []) {
      const name = String(character?.name ?? "").trim();
      if (!name || !lookupNameKeys.has(normalizeName(name))) continue;
      const avatar = String(character?.avatar ?? "").trim() || null;
      const baseSlug = avatar ? toAvatarSlug(avatar) : toCharacterSlug(name);
      candidates.push({
        ownerName: identity.ownerName,
        entityId: identity.entityId,
        displayName: identity.ownerName,
        avatar,
        baseSlug,
      });
      matchedCharacter = true;
    }
    if (!matchedCharacter) {
      const ownerName = String(identity.ownerName ?? "").trim();
      const baseSlug = toCharacterSlug(ownerName);
      candidates.push({
        ownerName,
        entityId: identity.entityId,
        displayName: ownerName,
        avatar: null,
        baseSlug,
      });
    }
  }

  const slugCounts = new Map<string, number>();
  const nameSlugCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const nameSlug = toCharacterSlug(candidate.ownerName);
    nameSlugCounts.set(nameSlug, (nameSlugCounts.get(nameSlug) ?? 0) + 1);
  }

  const targets: CharacterMacroTarget[] = [];
  for (const candidate of candidates) {
    const base = candidate.baseSlug || CHARACTER_SLUG_FALLBACK;
    const next = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, next);
    const macroSlug = next === 1 ? base : `${base}_${next}`;
    const nameSlug = toCharacterSlug(candidate.ownerName);
    const legacyNameSlug = nameSlug && nameSlug !== macroSlug && (nameSlugCounts.get(nameSlug) ?? 0) === 1
      ? nameSlug
      : null;
    targets.push({
      ownerName: candidate.ownerName,
      entityId: candidate.entityId,
      macroSlug,
      legacyNameSlug,
      displayName: candidate.displayName,
      avatar: candidate.avatar,
    });
  }
  return targets;
}

export function buildMacroPreviewCandidates(input: {
  context: STContext;
  settings: BetterSimTrackerSettings;
  data: TrackerData | null;
  allCharacterNames: string[];
}): Array<{ name: string; avatar?: string | null }> {
  return buildCharacterMacroTargets(input.context, input.settings, input.data, input.allCharacterNames).map(target => ({
    name: target.displayName,
    avatar: target.avatar,
  }));
}

function resolveCurrentCharacterMacroTarget(
  context: STContext,
  targets: CharacterMacroTarget[],
): CharacterMacroTarget | null {
  if (!targets.length) return null;
  if (targets.length === 1) return targets[0];

  const selectedById = Number(context.characterId);
  if (Number.isInteger(selectedById) && selectedById >= 0 && selectedById < (context.characters?.length ?? 0)) {
    const selectedCharacter = context.characters?.[selectedById];
    const selectedAvatar = String(selectedCharacter?.avatar ?? "").trim();
    if (selectedAvatar) {
      const avatarMatch = targets.find(target => String(target.avatar ?? "").trim() === selectedAvatar);
      if (avatarMatch) return avatarMatch;
    }
    const selectedName = String(selectedCharacter?.name ?? "").trim().toLowerCase();
    if (selectedName) {
      const byName = targets.filter(target => target.ownerName.trim().toLowerCase() === selectedName);
      if (byName.length === 1) return byName[0];
    }
  }

  const fallbackName = String(context.name2 ?? "").trim().toLowerCase();
  if (fallbackName) {
    const byName = targets.filter(target => target.ownerName.trim().toLowerCase() === fallbackName);
    if (byName.length === 1) return byName[0];
  }

  return null;
}

function resolveMacroTargetOwner(scope: string, globalScope: boolean): string | null {
  if (globalScope) return GLOBAL_TRACKER_KEY;
  if (scope === BST_MACRO_STAT_SCOPE_SCENE) return GLOBAL_TRACKER_KEY;
  if (scope === BST_MACRO_STAT_SCOPE_USER) return USER_TRACKER_KEY;
  return null;
}

function resolveMacroLookupNames(
  context: STContext,
  data: TrackerData | null,
  ownerName: string,
): string[] {
  const trimmedOwnerName = String(ownerName ?? "").trim();
  if (!trimmedOwnerName) return [];
  if (trimmedOwnerName === USER_TRACKER_KEY || trimmedOwnerName === GLOBAL_TRACKER_KEY) {
    return [trimmedOwnerName];
  }
  return resolveMacroTargetIdentity(context, data, trimmedOwnerName).lookupNames;
}

function isMacroCustomStatExplicitlyCleared(
  data: TrackerData,
  statId: string,
  ownerName: string,
  globalScope: boolean,
  lookupNames: string[],
): boolean {
  if (globalScope) {
    return Boolean(data.clearedCustomStatistics?.[statId]?.[GLOBAL_TRACKER_KEY]
      || data.clearedCustomNonNumericStatistics?.[statId]?.[GLOBAL_TRACKER_KEY]);
  }
  return lookupNames.some(name =>
    Boolean(data.clearedCustomStatistics?.[statId]?.[name] || data.clearedCustomNonNumericStatistics?.[statId]?.[name]),
  );
}

function resolveDefaultCustomMacroValue(
  customDef: BetterSimTrackerSettings["customStats"][number],
): unknown {
  const kind = customDef.kind ?? "numeric";
  if (kind === "numeric") {
    const numeric = Number(customDef.defaultValue);
    return Number.isNaN(numeric) ? 50 : numeric;
  }
  return normalizeCustomNonNumericValue(kind, customDef.defaultValue, {
    enumOptions: customDef.enumOptions,
    textMaxLength: customDef.textMaxLength,
    dateTimeMode: customDef.dateTimeMode,
    preserveExplicitEmptyArray: true,
  });
}

function formatMacroValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value
      .map(item => String(item ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value ?? "").trim();
}

function buildLiteralMacroEcho(name: string): string {
  const normalized = String(name ?? "").trim();
  return `\\{\\{${normalized}\\}\\}`;
}

function buildImageMacroStatDefs(settings: BetterSimTrackerSettings): ImageMacroStatDef[] {
  return (settings.customStats ?? [])
    .map(def => ({ ...def, id: String(def.id ?? "").trim() }))
    .filter(def => def.id)
    .filter(def => (def.kind ?? "numeric") !== "numeric")
    .filter(def => !def.globalScope)
    .filter(def => !def.privateToOwner)
    .filter(def => def.showOnCard)
    .filter(def => def.track)
    .map(def => ({
      id: def.id,
      label: String(def.label ?? def.id).trim() || def.id,
      includeForUser: Boolean(def.trackUser ?? def.track),
      includeForCharacter: Boolean(def.trackCharacters ?? def.track),
    }));
}

function toImageFieldLabel(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatImageStateBlock(
  context: STContext,
  data: TrackerData | null,
  settings: BetterSimTrackerSettings,
  allCharacterNames: string[],
  characterTargets: CharacterMacroTarget[],
  currentCharacterTarget: CharacterMacroTarget | null,
): string {
  if (!data) return "";
  const imageStatDefs = buildImageMacroStatDefs(settings);
  const sceneRosterStat = (settings.customStats ?? []).find(def => String(def.id ?? "").trim().toLowerCase() === "characters_in_scene");
  const preferredSceneRoster = canUseSceneRosterStatInImageState(sceneRosterStat)
    ? resolveMacroStatValue(context, data, settings, "characters_in_scene", BST_MACRO_STAT_SCOPE_SCENE)
    : "";
  const activeOwners = resolveTrackerSceneOwners(context as STContext, data)
    .map(name => String(name ?? "").trim())
    .filter(name => name && name !== USER_TRACKER_KEY && name !== GLOBAL_TRACKER_KEY);
  const fallbackOwners = allCharacterNames
    .map(name => String(name ?? "").trim())
    .filter(name => name && name !== USER_TRACKER_KEY && name !== GLOBAL_TRACKER_KEY);

  const orderedOwners = (() => {
    if (activeOwners.length) return activeOwners;
    if (currentCharacterTarget?.ownerName) return [currentCharacterTarget.ownerName];
    if (characterTargets.length) {
      return characterTargets.map(target => target.ownerName).filter(Boolean);
    }
    return fallbackOwners;
  })();

  const seenOwners = new Set<string>();
  const uniqueOwners = orderedOwners.filter(owner => {
    const key = normalizeName(owner);
    if (!key || seenOwners.has(key)) return false;
    seenOwners.add(key);
    return true;
  });

  const lines: string[] = [];
  const sceneLine = preferredSceneRoster || uniqueOwners.join(", ");
  if (sceneLine) {
    lines.push(`Scene: ${sceneLine}`);
  }

  const userEntries = imageStatDefs
    .filter(def => def.includeForUser)
    .map(def => [toImageFieldLabel(def.label), resolveMacroStatValue(context, data, settings, def.id, BST_MACRO_STAT_SCOPE_USER)] as const)
    .filter(([, value]) => value);
  if (userEntries.length) {
    lines.push(`User: ${userEntries.map(([label, value]) => `${label}=${value}`).join("; ")}`);
  }

  for (const owner of uniqueOwners) {
    const ownerEntries = imageStatDefs
      .filter(def => def.includeForCharacter)
      .map(def => [toImageFieldLabel(def.label), resolveMacroStatValue(context, data, settings, def.id, "char_target", owner)] as const)
      .filter(([, value]) => value);
    if (!ownerEntries.length) continue;
    lines.push(`${owner}: ${ownerEntries.map(([label, value]) => `${label}=${value}`).join("; ")}`);
  }

  return lines.join("\n");
}

function resolveMacroStatValue(
  context: STContext,
  data: TrackerData | null,
  currentSettings: BetterSimTrackerSettings | null,
  statId: string,
  scope: string,
  explicitOwner?: string,
  explicitEntityIds?: string[] | null,
): string {
  if (!data || !currentSettings) return "";
  const normalized = String(statId ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const customById = new Map(
    (currentSettings.customStats ?? []).map(def => [String(def.id ?? "").trim().toLowerCase(), def] as const),
  );
  const customDef = customById.get(normalized);
  const owner = explicitOwner || resolveMacroTargetOwner(scope, Boolean(customDef?.globalScope));
  if (!owner) return "";
  const lookupNames = resolveMacroLookupNames(context, data, owner);

  if (normalized === "affection" || normalized === "trust" || normalized === "desire" || normalized === "connection") {
    if (owner === GLOBAL_TRACKER_KEY) return "";
    const bucket = data.statistics[normalized];
    const value = Number(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: bucket,
      byEntityId: data.statisticsByEntityId?.[normalized],
      ownerName: owner,
      explicitEntityIds,
    }));
    if (Number.isNaN(value)) return "";
    return String(Math.max(0, Math.min(100, Math.round(value))));
  }

  if (normalized === "mood") {
    if (owner === GLOBAL_TRACKER_KEY) return "";
    return String(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.mood,
      byEntityId: data.statisticsByEntityId?.mood,
      ownerName: owner,
      explicitEntityIds,
    }) ?? "").trim();
  }
  if (normalized === "lastthought" || normalized === "last_thought") {
    if (owner === GLOBAL_TRACKER_KEY) return "";
    return String(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.lastThought,
      byEntityId: data.statisticsByEntityId?.lastThought,
      ownerName: owner,
      explicitEntityIds,
    }) ?? "").trim();
  }
  if (!customDef) return "";

  if ((customDef.kind ?? "numeric") === "numeric") {
    const bucket = data.customStatistics?.[normalized];
    let raw: unknown = resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: bucket,
      byEntityId: data.customStatisticsByEntityId?.[normalized],
      ownerName: owner,
      explicitEntityIds,
    });
    if (raw === undefined && owner !== GLOBAL_TRACKER_KEY && customDef.globalScope) {
      raw = bucket?.[GLOBAL_TRACKER_KEY];
    }
    if (
      raw === undefined
      && !isMacroCustomStatExplicitlyCleared(data, normalized, owner, Boolean(customDef.globalScope), lookupNames)
    ) {
      raw = resolveDefaultCustomMacroValue(customDef);
    }
    const numeric = Number(raw);
    if (Number.isNaN(numeric)) return "";
    return String(Math.max(0, Math.min(100, Math.round(numeric))));
  }

  const bucket = data.customNonNumericStatistics?.[normalized];
  let raw: unknown = resolveTrackerDataLookupValue({
    context,
    data,
    byOwner: bucket,
    byEntityId: data.customNonNumericStatisticsByEntityId?.[normalized],
    ownerName: owner,
    explicitEntityIds,
  });
  if (raw === undefined && owner !== GLOBAL_TRACKER_KEY && customDef.globalScope) {
    raw = bucket?.[GLOBAL_TRACKER_KEY];
  }
  if (
    raw === undefined
    && !isMacroCustomStatExplicitlyCleared(data, normalized, owner, Boolean(customDef.globalScope), lookupNames)
  ) {
    raw = resolveDefaultCustomMacroValue(customDef);
  }
  return formatMacroValue(raw);
}

function unregisterBstMacro(context: STContext, name: string): void {
  const hasNewEngine = typeof context.macros?.register === "function";
  if (hasNewEngine) {
    try {
      context.macros?.registry?.unregisterMacro?.(name);
    } catch {
      // ignore
    }
    return;
  }
  try {
    if (typeof context.unregisterMacro === "function") {
      context.unregisterMacro(name);
    }
  } catch {
    // ignore
  }
}

function registerBstMacro(
  context: STContext,
  name: string,
  description: string,
  getter: () => string,
): void {
  const hasNewEngine = typeof context.macros?.register === "function";
  let registered = false;
  if (hasNewEngine) {
    try {
      context.macros?.register?.(name, {
        description,
        handler: () => getter(),
      });
      registered = true;
    } catch {
      // ignore
    }
  } else {
    try {
      if (typeof context.registerMacro === "function") {
        context.registerMacro(name, getter, description);
        registered = true;
      }
    } catch {
      // ignore
    }
  }
  if (registered) {
    registeredBstMacros.add(name);
  }
}

function safeSubstituteMacro(context: STContext, macroName: string): string {
  try {
    const substitute = (context as STContext & { substituteParams?: (value: string) => string }).substituteParams;
    if (typeof substitute !== "function") return "";
    return String(substitute(`{{${macroName}}}`) ?? "");
  } catch (error) {
    return `[error:${error instanceof Error ? error.message : String(error)}]`;
  }
}

function buildResolutionSamples(
  context: STContext,
  settings: BetterSimTrackerSettings,
  customDefs: Array<BetterSimTrackerSettings["customStats"][number] & { id: string }>,
  characterTargets: CharacterMacroTarget[],
): { user: MacroResolutionSample | null; scene: MacroResolutionSample | null; character: MacroResolutionSample | null } {
  const sampleCharacterTarget = characterTargets[0] ?? null;
  const sampleUserStat = customDefs.find(def => !def.globalScope && Boolean(def.trackUser ?? def.track))?.id
    ?? (settings.enableUserTracking && settings.userTrackMood ? "mood" : settings.enableUserTracking && settings.userTrackLastThought ? "lastThought" : null);
  const sampleSceneStat = customDefs.find(def =>
    def.globalScope && Boolean(def.track || def.showOnCard || def.includeInInjection || def.showInGraph)
  )?.id ?? null;
  const sampleCharacterStat = customDefs.find(def => !def.globalScope && Boolean(def.trackCharacters ?? def.track))?.id
    ?? (settings.trackMood ? "mood" : settings.trackLastThought ? "lastThought" : settings.trackAffection ? "affection" : null);

  return {
    user: sampleUserStat ? {
      macro: `bst_stat_user_${toMacroIdSegment(sampleUserStat)}`,
      resolved: safeSubstituteMacro(context, `bst_stat_user_${toMacroIdSegment(sampleUserStat)}`),
    } : null,
    scene: sampleSceneStat ? {
      macro: `bst_stat_scene_${toMacroIdSegment(sampleSceneStat)}`,
      resolved: safeSubstituteMacro(context, `bst_stat_scene_${toMacroIdSegment(sampleSceneStat)}`),
    } : null,
    character: sampleCharacterTarget && sampleCharacterStat ? {
      macro: `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}`,
      resolved: safeSubstituteMacro(context, `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}`),
      legacyMacro: sampleCharacterTarget.legacyNameSlug
        ? `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}_${sampleCharacterTarget.legacyNameSlug}`
        : `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}_${sampleCharacterTarget.macroSlug}`,
      legacyResolved: sampleCharacterTarget.legacyNameSlug
        ? safeSubstituteMacro(context, `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}_${sampleCharacterTarget.legacyNameSlug}`)
        : safeSubstituteMacro(context, `bst_stat_char_${toMacroIdSegment(sampleCharacterStat)}_${sampleCharacterTarget.macroSlug}`),
    } : null,
  };
}

export function syncBstMacros(input: {
  context: STContext;
  settings: BetterSimTrackerSettings;
  allCharacterNames: string[];
  getLatestPromptMacroData: () => TrackerData | null;
  getLastInjectedPrompt: () => string;
}): void {
  const { context, settings, allCharacterNames, getLatestPromptMacroData, getLastInjectedPrompt } = input;
  const latestPromptMacroData = getLatestPromptMacroData();
  const customDefs = (settings.customStats ?? [])
    .map(def => ({ ...def, id: String(def.id ?? "").trim().toLowerCase() }))
    .filter(def => def.id.length > 0);
  const customStatIds = customDefs.map(def => def.id);
  const characterTargets = buildCharacterMacroTargets(context, settings, latestPromptMacroData, allCharacterNames);
  const debugCharacterTargets = characterTargets.map(target => ({
    ownerName: target.ownerName,
    entityId: target.entityId,
    displayName: target.displayName,
    macroSlug: target.macroSlug,
    legacyNameSlug: target.legacyNameSlug,
    avatar: target.avatar,
  }));
  const currentCharacterTarget = resolveCurrentCharacterMacroTarget(context, characterTargets);
  const currentCharacterTargetSignature = currentCharacterTarget
    ? `${currentCharacterTarget.ownerName}:${currentCharacterTarget.entityId ?? ""}:${currentCharacterTarget.macroSlug}:${currentCharacterTarget.legacyNameSlug ?? ""}:${currentCharacterTarget.avatar ?? ""}`
    : "none";
  const characterSignature = characterTargets
    .map(target => `${target.ownerName}:${target.entityId ?? ""}:${target.macroSlug}:${target.legacyNameSlug ?? ""}:${target.avatar ?? ""}`)
    .join("|");
  const signature = [
    "v1",
    String(Boolean(settings.trackAffection)),
    String(Boolean(settings.trackTrust)),
    String(Boolean(settings.trackDesire)),
    String(Boolean(settings.trackConnection)),
    String(Boolean(settings.trackMood)),
    String(Boolean(settings.trackLastThought)),
    String(Boolean(settings.enableUserTracking)),
    String(Boolean(settings.userTrackMood)),
    String(Boolean(settings.userTrackLastThought)),
    customDefs
      .map(def => [
        def.id,
        def.track ? 1 : 0,
        def.trackCharacters ? 1 : 0,
        def.trackUser ? 1 : 0,
        def.globalScope ? 1 : 0,
      ].join(":"))
      .join("|"),
    customStatIds.join("|"),
    characterSignature,
    currentCharacterTargetSignature,
  ].join("::");
  if (signature === bstMacroSignature && registeredBstMacros.size > 0) {
    lastBstMacroDebugSnapshot = {
      signature,
      skippedBecauseSignatureUnchanged: true,
      allCharacterNames: [...allCharacterNames],
      characterTargets: debugCharacterTargets,
      currentCharacterTarget: currentCharacterTarget
        ? {
          ownerName: currentCharacterTarget.ownerName,
          entityId: currentCharacterTarget.entityId,
          displayName: currentCharacterTarget.displayName,
          macroSlug: currentCharacterTarget.macroSlug,
          legacyNameSlug: currentCharacterTarget.legacyNameSlug,
          avatar: currentCharacterTarget.avatar,
        }
        : null,
      registeredMacroNames: Array.from(registeredBstMacros).sort(),
      resolutionSamples: buildResolutionSamples(context, settings, customDefs, characterTargets),
    };
    return;
  }

  for (const name of registeredBstMacros) {
    unregisterBstMacro(context, name);
  }
  registeredBstMacros.clear();

  registerBstMacro(
    context,
    BST_INJECTION_MACRO,
    "BetterSimTracker hidden injection block (latest generated value).",
    () => getLastInjectedPrompt(),
  );
  registerBstMacro(
    context,
    BST_IMAGE_STATE_MACRO,
    "BetterSimTracker compact scene/user/character state block for image-generation prompts.",
    () => formatImageStateBlock(context, getLatestPromptMacroData(), settings, allCharacterNames, characterTargets, currentCharacterTarget),
  );

  const statIds = [
    "affection",
    "trust",
    "desire",
    "connection",
    "mood",
    "lastThought",
    ...customStatIds,
  ];
  for (const rawStatId of statIds) {
    const statId = String(rawStatId ?? "").trim().toLowerCase();
    if (!statId) continue;
    const segment = toMacroIdSegment(statId);
    if (!segment) continue;
    const customDef = customDefs.find(def => def.id === statId) ?? null;
    const isBuiltInNumeric = statId === "affection" || statId === "trust" || statId === "desire" || statId === "connection";
    const isMood = statId === "mood";
    const isLastThought = statId === "lastthought" || statId === "last_thought";
    const allowsScene = Boolean(customDef?.globalScope)
      && Boolean(customDef?.track || customDef?.showOnCard || customDef?.includeInInjection || customDef?.showInGraph);
    const allowsUser = (() => {
      if (isBuiltInNumeric) return false;
      if (isMood) return Boolean(settings.enableUserTracking && settings.userTrackMood);
      if (isLastThought) return Boolean(settings.enableUserTracking && settings.userTrackLastThought);
      if (!customDef || customDef.globalScope) return false;
      return Boolean(customDef.trackUser ?? customDef.track);
    })();
    const allowsCharacter = (() => {
      if (isBuiltInNumeric) {
        if (statId === "affection") return Boolean(settings.trackAffection);
        if (statId === "trust") return Boolean(settings.trackTrust);
        if (statId === "desire") return Boolean(settings.trackDesire);
        return Boolean(settings.trackConnection);
      }
      if (isMood) return Boolean(settings.trackMood);
      if (isLastThought) return Boolean(settings.trackLastThought);
      if (!customDef || customDef.globalScope) return false;
      return Boolean(customDef.trackCharacters ?? customDef.track);
    })();
    if (allowsUser) {
      const macroName = `bst_stat_${BST_MACRO_STAT_SCOPE_USER}_${segment}`;
      registerBstMacro(
        context,
        macroName,
        `BetterSimTracker stat macro for "${statId}" (${BST_MACRO_STAT_SCOPE_USER} scope).`,
        () => resolveMacroStatValue(context, getLatestPromptMacroData(), settings, statId, BST_MACRO_STAT_SCOPE_USER),
      );
    }
    if (allowsScene) {
      const macroName = `bst_stat_${BST_MACRO_STAT_SCOPE_SCENE}_${segment}`;
      registerBstMacro(
        context,
        macroName,
        `BetterSimTracker stat macro for "${statId}" (${BST_MACRO_STAT_SCOPE_SCENE} scope).`,
        () => resolveMacroStatValue(context, getLatestPromptMacroData(), settings, statId, BST_MACRO_STAT_SCOPE_SCENE),
      );
    }
    if (allowsCharacter) {
      const bareCharacterMacroName = `bst_stat_char_${segment}`;
      if (currentCharacterTarget) {
        registerBstMacro(
          context,
          bareCharacterMacroName,
          `BetterSimTracker stat macro for "${statId}" (current chat character).`,
          () => resolveMacroStatValue(
            context,
            getLatestPromptMacroData(),
            settings,
            statId,
            "char_target",
            currentCharacterTarget.ownerName,
            currentCharacterTarget.entityId ? [currentCharacterTarget.entityId] : undefined,
          ),
        );
      } else if (characterTargets.length > 1) {
        registerBstMacro(
          context,
          bareCharacterMacroName,
          `BetterSimTracker literal fallback for "${statId}" when multiple character targets require explicit macros.`,
          () => buildLiteralMacroEcho(bareCharacterMacroName),
        );
      }
      for (const target of characterTargets) {
        registerBstMacro(
          context,
          `bst_stat_char_${segment}_${target.macroSlug}`,
          `BetterSimTracker stat macro for "${statId}" (character "${target.displayName}").`,
          () => resolveMacroStatValue(
            context,
            getLatestPromptMacroData(),
            settings,
            statId,
            "char_target",
            target.ownerName,
            target.entityId ? [target.entityId] : undefined,
          ),
        );
        if (target.legacyNameSlug) {
          registerBstMacro(
            context,
            `bst_stat_char_${segment}_${target.legacyNameSlug}`,
            `BetterSimTracker legacy stat macro alias for "${statId}" (character "${target.displayName}").`,
            () => resolveMacroStatValue(
              context,
              getLatestPromptMacroData(),
              settings,
              statId,
              "char_target",
              target.ownerName,
              target.entityId ? [target.entityId] : undefined,
            ),
          );
        }
      }
    }
  }
  bstMacroSignature = signature;
  lastBstMacroDebugSnapshot = {
    signature,
    skippedBecauseSignatureUnchanged: false,
    allCharacterNames: [...allCharacterNames],
    characterTargets: debugCharacterTargets,
    currentCharacterTarget: currentCharacterTarget
      ? {
        ownerName: currentCharacterTarget.ownerName,
        entityId: currentCharacterTarget.entityId,
        displayName: currentCharacterTarget.displayName,
        macroSlug: currentCharacterTarget.macroSlug,
        legacyNameSlug: currentCharacterTarget.legacyNameSlug,
        avatar: currentCharacterTarget.avatar,
      }
      : null,
    registeredMacroNames: Array.from(registeredBstMacros).sort(),
    resolutionSamples: buildResolutionSamples(context, settings, customDefs, characterTargets),
  };
}

export function resetBstMacroStateForTests(): void {
  registeredBstMacros.clear();
  bstMacroSignature = "";
  lastBstMacroDebugSnapshot = null;
}

export function getBstMacroDebugSnapshot(): Record<string, unknown> | null {
  return lastBstMacroDebugSnapshot ? { ...lastBstMacroDebugSnapshot } : null;
}
