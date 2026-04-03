import { CUSTOM_STAT_ID_REGEX, GLOBAL_TRACKER_KEY, MAX_CUSTOM_STATS, RESERVED_CUSTOM_STAT_IDS, STYLE_ID, USER_TRACKER_KEY } from "./constants";
import { resolveCharacterDefaultsEntry } from "./characterDefaults";
import { shouldUseConfiguredOwnerDefaults } from "./entitySeedPolicy";
import { generateJson } from "./generator";
import { logDebug } from "./settings";
import type {
  BetterSimTrackerSettings,
  BuiltInNumericStatUiSettings,
  ConnectionProfileOption,
  CustomNonNumericValue,
  CustomStatKind,
  CustomStatDefinition,
  DateTimeMode,
  DeltaDebugRecord,
  MoodLabel,
  MoodSource,
  MoodSymbolMap,
  SceneCardStatDisplayOptions,
  STContext,
  StExpressionImageOptions,
  StatValue,
  TrackerData,
  TrackerEntityRegistryEntry,
  TrackerGraphTarget,
  TrackerRegistrySyncTarget,
} from "./types";
import {
  DEFAULT_INJECTION_PROMPT_TEMPLATE,
  DEFAULT_PROTOCOL_SEQUENTIAL_AFFECTION,
  DEFAULT_PROTOCOL_SEQUENTIAL_CONNECTION,
  DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NON_NUMERIC,
  DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NUMERIC,
  DEFAULT_PROTOCOL_SEQUENTIAL_DESIRE,
  DEFAULT_PROTOCOL_SEQUENTIAL_LAST_THOUGHT,
  DEFAULT_PROTOCOL_SEQUENTIAL_MOOD,
  DEFAULT_PROTOCOL_SEQUENTIAL_TRUST,
  DEFAULT_PROTOCOL_UNIFIED,
  DEFAULT_SEQUENTIAL_CUSTOM_NON_NUMERIC_PROMPT_INSTRUCTION,
  DEFAULT_SEQUENTIAL_CUSTOM_NUMERIC_PROMPT_INSTRUCTION,
  DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS,
  DEFAULT_UNIFIED_PROMPT_INSTRUCTION,
  buildBuiltInSequentialPromptGenerationPrompt,
  buildCustomStatBehaviorGuidanceGenerationPrompt,
  buildCustomStatDescriptionGenerationPrompt,
  buildSequentialCustomOverrideGenerationPrompt,
  moodOptions,
} from "./prompts";
import {
  closeStExpressionFrameEditor,
  formatStExpressionFrameSummary,
  openStExpressionFrameEditor,
  sanitizeStExpressionFrame,
} from "./stExpressionFrameEditor";
import { fetchFirstExpressionSprite } from "./stExpressionSprites";
import { closeMoodImageModal, openMoodImageModal } from "./moodImageModal";
import { closeEditStatsModal, openEditStatsModal, type EditStatsPayload } from "./editStatsModal";
import { closeGraphModal, openGraphModal } from "./graphModal";
import { getAllNumericStatDefinitions } from "./statRegistry";
import { getDateTimeStructuredParts, normalizeDateTimeValue, toDateTimeInputValue } from "./dateTime";
import { hasThoughtOverflow, renderThoughtMarkup, resolveThoughtToggleState } from "./uiThought";
import { formatDateTimeTimestampDisplay, renderDateTimeStructuredChips } from "./uiDateTimeDisplay";
import { formatNonNumericForDisplay, truncateDisplayText } from "./uiNonNumericDisplay";
import { renderTextShortMarkup, resolveTextShortToggleState } from "./uiTextShort";
import { cloneTrackerDataForEdit } from "./trackerUiState";
import { type CardLifecycleRegistryState, type CardLifecycleSnapshot, type CardLifecycleState, resolveCardLifecycleState } from "./cardLifecycle";
import {
  buildLifecycleHistorySnapshotsFromTrackerEntries,
  resolveTrackerDataEntityOwnerSnapshot,
  resolveTrackerActiveEntityIds,
  resolveTrackerActiveOwners,
  resolveTrackerDataLookupValue,
  resolveTrackerMessageOwners,
  resolveTrackerSceneEntityIds,
  resolveTrackerSceneOwners,
} from "./entityRegistry";
import {
  buildLastPointCircle,
  buildPointCircles,
  buildPolyline,
  downsampleTimeline,
  graphSeriesDomId,
  smoothSeries,
} from "./graphSeries";
import {
  MAX_CUSTOM_ARRAY_ITEMS,
  normalizeCustomEnumOptions,
  normalizeCustomNumericDefaultValue,
  normalizeCustomStatDefaultValue,
  normalizeCustomStatKind,
  normalizeCustomTextMaxLength,
  normalizeNonNumericArrayItems,
  resolveEnumOption,
  hasScriptLikeContent,
} from "./customStatRuntime";

type UiNumericStatDefinition = {
  key: string;
  label: string;
  short: string;
  color: string;
  defaultValue: number;
  trackCharacters: boolean;
  trackUser: boolean;
  globalScope: boolean;
  showOnCard: boolean;
  showInGraph: boolean;
};

export type UiNonNumericStatDefinition = {
  id: string;
  label: string;
  kind: Exclude<CustomStatKind, "numeric">;
  defaultValue: string | boolean | string[];
  enumOptions: string[];
  booleanTrueLabel: string;
  booleanFalseLabel: string;
  textMaxLength: number;
  dateTimeMode: DateTimeMode;
  trackCharacters: boolean;
  trackUser: boolean;
  globalScope: boolean;
  showOnCard: boolean;
  includeInInjection: boolean;
  color: string;
};

type UiRegistryLookupEntry = Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> & {
  id?: string;
};

export const BUILT_IN_NUMERIC_STAT_KEYS = new Set(["affection", "trust", "desire", "connection"]);

export const MOOD_LABELS = moodOptions;
const MOOD_LABEL_LOOKUP = new Map(MOOD_LABELS.map(label => [label.toLowerCase(), label]));
const MOOD_LABELS_BY_LENGTH = [...MOOD_LABELS].sort((a, b) => b.length - a.length);
export const DEFAULT_MOOD_EXPRESSION_MAP: Record<MoodLabel, string> = {
  "Happy": "joy",
  "Sad": "sadness",
  "Angry": "anger",
  "Excited": "excitement",
  "Confused": "confusion",
  "In Love": "love",
  "Shy": "nervousness",
  "Playful": "amusement",
  "Serious": "neutral",
  "Lonely": "grief",
  "Hopeful": "optimism",
  "Anxious": "nervousness",
  "Content": "relief",
  "Frustrated": "annoyance",
  "Neutral": "neutral",
};

export const DEFAULT_MOOD_SYMBOL_MAP: Record<MoodLabel, string> = {
  "Happy": "😄",
  "Sad": "😔",
  "Angry": "😠",
  "Excited": "😄",
  "Confused": "😕",
  "In Love": "😍",
  "Shy": "😊",
  "Playful": "😏",
  "Serious": "😐",
  "Lonely": "😔",
  "Hopeful": "🤞",
  "Anxious": "😟",
  "Content": "🙂",
  "Frustrated": "😤",
  "Neutral": "😶",
};

type SpriteEntry = { label?: string; path?: string };
type CachedExpressionSprites = {
  fetchedAt: number;
  byLabel: Record<string, string[]>;
};

const ST_EXPRESSION_CACHE_TTL_MS = 60_000;
const stExpressionCache = new Map<string, CachedExpressionSprites>();
const stExpressionFetchInFlight = new Set<string>();
export const CUSTOM_STAT_DESCRIPTION_MAX_LENGTH = 300;
export const DEFAULT_ST_EXPRESSION_IMAGE_OPTIONS: StExpressionImageOptions = {
  zoom: 1.2,
  positionX: 50,
  positionY: 20,
};

function shortLabelFrom(label: string): string {
  const cleaned = label.trim().toUpperCase();
  if (!cleaned) return "?";
  if (cleaned.length <= 2) return cleaned;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`;
  }
  return cleaned.slice(0, 2);
}

export function toMacroCharacterSlug(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "character";
}

export function normalizeNonNumericTextValue(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, Math.max(20, Math.min(200, maxLength)));
}

export function getNonNumericStatDefinitions(settings: BetterSimTrackerSettings): UiNonNumericStatDefinition[] {
  const defs = Array.isArray(settings.customStats) ? settings.customStats : [];
  return defs
    .filter(def => {
      if (normalizeCustomStatKind(def.kind) === "numeric") return false;
      const track = Boolean(def.track);
      const trackCharacters = Boolean(def.trackCharacters ?? def.track);
      const trackUser = Boolean(def.trackUser ?? def.track);
      return track && (trackCharacters || trackUser);
    })
    .map(def => {
      const kind = normalizeCustomStatKind(def.kind) as Exclude<CustomStatKind, "numeric">;
      const trackCharacters = Boolean(def.trackCharacters ?? def.track);
      const trackUser = Boolean(def.trackUser ?? def.track);
      const enumOptions = normalizeCustomEnumOptions(def.enumOptions);
      const textMaxLength = normalizeCustomTextMaxLength(def.textMaxLength);
      const booleanTrueLabel = String(def.booleanTrueLabel ?? "enabled").trim().slice(0, 40) || "enabled";
      const booleanFalseLabel = String(def.booleanFalseLabel ?? "disabled").trim().slice(0, 40) || "disabled";
      const defaultValue = normalizeCustomStatDefaultValue({
        kind,
        defaultValue: def.defaultValue,
        enumOptions,
        textMaxLength,
        dateTimeMode: def.dateTimeMode,
      }) as string | boolean | string[];
      const dateTimeMode: DateTimeMode = kind === "date_time" && def.dateTimeMode === "structured" ? "structured" : "timestamp";
      return {
        id: String(def.id ?? "").trim().toLowerCase(),
        label: String(def.label ?? "").trim() || String(def.id ?? "").trim(),
        kind,
        defaultValue,
        enumOptions,
        booleanTrueLabel,
        booleanFalseLabel,
        textMaxLength,
        dateTimeMode,
        trackCharacters,
        trackUser,
        globalScope: Boolean(def.globalScope),
        showOnCard: Boolean(def.showOnCard),
        includeInInjection: Boolean(def.includeInInjection),
        color: String(def.color ?? "").trim(),
      };
    })
    .filter(def => Boolean(def.id));
}

export function getNumericStatDefinitions(settings: BetterSimTrackerSettings): UiNumericStatDefinition[] {
  const customScopeById = new Map(
    (settings.customStats ?? []).map(def => {
      const track = Boolean(def.track);
      const trackCharacters = Boolean(def.trackCharacters ?? def.track);
      const trackUser = Boolean(def.trackUser ?? def.track);
      const globalScope = Boolean(def.globalScope);
      return [String(def.id ?? "").trim().toLowerCase(), { track, trackCharacters, trackUser, globalScope }] as const;
    }),
  );
  return getAllNumericStatDefinitions(settings).map(def => ({
    key: def.id,
    label: def.label,
    short: shortLabelFrom(def.label),
    color: def.color || "#9cff8f",
    defaultValue: normalizeCustomNumericDefaultValue(def.defaultValue),
    trackCharacters: def.builtIn
      ? Boolean(def.track)
      : (Boolean(customScopeById.get(def.id)?.track ?? def.track)
        && Boolean(customScopeById.get(def.id)?.trackCharacters ?? def.track)),
    trackUser: def.builtIn
      ? false
      : (Boolean(customScopeById.get(def.id)?.track ?? def.track)
        && Boolean(customScopeById.get(def.id)?.trackUser ?? def.track)),
    globalScope: def.builtIn
      ? false
      : Boolean(customScopeById.get(def.id)?.globalScope ?? false),
    showOnCard: def.showOnCard,
    showInGraph: def.showInGraph,
  }));
}

export function getNumericRawValue(entry: TrackerData, key: string, name: string, globalScope = false): number | undefined {
  if (isNumericExplicitlyCleared(entry, key, name, globalScope)) return undefined;
  if (BUILT_IN_NUMERIC_STAT_KEYS.has(key)) {
    const raw = entry.statistics[key as "affection" | "trust" | "desire" | "connection"]?.[name];
    if (raw === undefined) return undefined;
    return Number(raw);
  }
  const byOwner = entry.customStatistics?.[key];
  if (!byOwner) return undefined;
  const legacyFallback = (): number | undefined => {
    for (const [owner, value] of Object.entries(byOwner)) {
      if (owner === GLOBAL_TRACKER_KEY) continue;
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  };
  const customRaw = globalScope
    ? (byOwner[GLOBAL_TRACKER_KEY] ?? byOwner[name] ?? legacyFallback())
    : byOwner[name];
  if (customRaw === undefined) return undefined;
  return Number(customRaw);
}

export function resolveCurrentNumericRawValue(
  entry: TrackerData,
  key: string,
  ownerName: string,
  input?: {
    globalScope?: boolean;
    registryEntry?: UiRegistryLookupEntry | null;
  },
): number | undefined {
  const globalScope = Boolean(input?.globalScope);
  if (globalScope) {
    const value = getNumericRawValue(entry, key, GLOBAL_TRACKER_KEY, true);
    return value !== undefined && !Number.isNaN(value) ? value : undefined;
  }
  const byOwner = BUILT_IN_NUMERIC_STAT_KEYS.has(key)
    ? entry.statistics[key as "affection" | "trust" | "desire" | "connection"]
    : entry.customStatistics?.[key];
  const byEntityId = BUILT_IN_NUMERIC_STAT_KEYS.has(key)
    ? entry.statisticsByEntityId?.[key as "affection" | "trust" | "desire" | "connection"]
    : entry.customStatisticsByEntityId?.[key];
  const byEntityValue = resolveTrackerDataLookupValue({
    context: null,
    data: input?.registryEntry?.id ? {
      ...entry,
      entityOwnerMap: {
        ...(entry.entityOwnerMap ?? {}),
        [ownerName]: {
          entityId: input.registryEntry.id,
          ownerName: input.registryEntry.ownerName,
          canonicalName: input.registryEntry.canonicalName,
          aliases: [...(input.registryEntry.aliases ?? [])],
          sourceKey: "",
          kind: input.registryEntry.kind,
        },
      },
    } : entry,
    ownerName,
    byOwner,
    byEntityId,
  });
  if (byEntityValue !== undefined) {
    const parsed = Number(byEntityValue);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  const lookupNames = resolveRegistryLookupNamesForOwner(ownerName, input?.registryEntry ?? null);
  for (const lookupName of lookupNames) {
    const value = getNumericRawValue(entry, key, lookupName, false);
    if (value !== undefined && !Number.isNaN(value)) return value;
    if (isNumericExplicitlyCleared(entry, key, lookupName, false)) return undefined;
  }
  return undefined;
}

function isNumericExplicitlyCleared(entry: TrackerData, key: string, name: string, globalScope = false): boolean {
  if (BUILT_IN_NUMERIC_STAT_KEYS.has(key)) {
    const ownerKey = name;
    return Boolean(entry.clearedStatistics?.[key as keyof typeof entry.clearedStatistics]?.[ownerKey]);
  }
  const ownerKey = globalScope ? GLOBAL_TRACKER_KEY : name;
  return Boolean(entry.clearedCustomStatistics?.[key]?.[ownerKey]);
}

function getNonNumericRawValue(
  entry: TrackerData,
  statId: string,
  name: string,
  globalScope = false,
): CustomNonNumericValue | undefined {
  if (isNonNumericExplicitlyCleared(entry, statId, name, globalScope)) return undefined;
  const byOwner = entry.customNonNumericStatistics?.[statId];
  if (!byOwner) return undefined;
  const legacyFallback = (): CustomNonNumericValue | undefined => {
    for (const [owner, value] of Object.entries(byOwner)) {
      if (owner === GLOBAL_TRACKER_KEY) continue;
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return globalScope
    ? (byOwner[GLOBAL_TRACKER_KEY] ?? byOwner[name] ?? legacyFallback())
    : byOwner[name];
}

export function resolveCurrentNonNumericRawValue(
  entry: TrackerData,
  statId: string,
  ownerName: string,
  input?: {
    globalScope?: boolean;
    registryEntry?: UiRegistryLookupEntry | null;
  },
): CustomNonNumericValue | undefined {
  const globalScope = Boolean(input?.globalScope);
  if (globalScope) {
    return getNonNumericRawValue(entry, statId, GLOBAL_TRACKER_KEY, true);
  }
  const byEntityValue = resolveTrackerDataLookupValue({
    context: null,
    data: input?.registryEntry?.id ? {
      ...entry,
      entityOwnerMap: {
        ...(entry.entityOwnerMap ?? {}),
        [ownerName]: {
          entityId: input.registryEntry.id,
          ownerName: input.registryEntry.ownerName,
          canonicalName: input.registryEntry.canonicalName,
          aliases: [...(input.registryEntry.aliases ?? [])],
          sourceKey: "",
          kind: input.registryEntry.kind,
        },
      },
    } : entry,
    ownerName,
    byOwner: entry.customNonNumericStatistics?.[statId],
    byEntityId: entry.customNonNumericStatisticsByEntityId?.[statId],
  });
  if (byEntityValue !== undefined) return byEntityValue;
  const lookupNames = resolveRegistryLookupNamesForOwner(ownerName, input?.registryEntry ?? null);
  for (const lookupName of lookupNames) {
    const value = getNonNumericRawValue(entry, statId, lookupName, false);
    if (value !== undefined) return value;
    if (isNonNumericExplicitlyCleared(entry, statId, lookupName, false)) return undefined;
  }
  return undefined;
}

function isNonNumericExplicitlyCleared(
  entry: TrackerData,
  statId: string,
  name: string,
  globalScope = false,
): boolean {
  const ownerKey = globalScope ? GLOBAL_TRACKER_KEY : name;
  return Boolean(entry.clearedCustomNonNumericStatistics?.[statId]?.[ownerKey]);
}

function isTextStatExplicitlyCleared(entry: TrackerData, stat: "mood" | "lastThought", name: string): boolean {
  return Boolean(entry.clearedStatistics?.[stat]?.[name]);
}

export function resolveCurrentBuiltInTextValue(
  entry: TrackerData,
  stat: "mood" | "lastThought",
  ownerName: string,
  registryEntry?: UiRegistryLookupEntry | null,
): string | undefined {
  const value = resolveTrackerDataLookupValue({
    context: null,
    data: registryEntry?.id ? {
      ...entry,
      entityOwnerMap: {
        ...(entry.entityOwnerMap ?? {}),
        [ownerName]: {
          entityId: registryEntry.id,
          ownerName: registryEntry.ownerName,
          canonicalName: registryEntry.canonicalName,
          aliases: [...(registryEntry.aliases ?? [])],
          sourceKey: "",
          kind: registryEntry.kind,
        },
      },
    } : entry,
    ownerName,
    byOwner: stat === "mood" ? entry.statistics.mood : entry.statistics.lastThought,
    byEntityId: entry.statisticsByEntityId?.[stat],
  });
  if (value !== undefined) return String(value ?? "");
  const lookupNames = resolveRegistryLookupNamesForOwner(ownerName, registryEntry ?? null);
  const source = stat === "mood" ? entry.statistics.mood : entry.statistics.lastThought;
  for (const lookupName of lookupNames) {
    if (source?.[lookupName] !== undefined) return String(source[lookupName] ?? "");
    if (isTextStatExplicitlyCleared(entry, stat, lookupName)) return undefined;
  }
  return undefined;
}

export function shouldSuppressAliasNonNumericDefaultFallback(
  registryEntry?: Pick<TrackerEntityRegistryEntry, "kind"> | null,
  globalScope = false,
): boolean {
  return Boolean(registryEntry?.kind === "multi_character_alias" && !globalScope);
}

function hasNumericValue(entry: TrackerData, key: string, name: string, globalScope = false): boolean {
  const raw = getNumericRawValue(entry, key, name, globalScope);
  return raw !== undefined && !Number.isNaN(raw);
}

export function hasCurrentNonNumericValue(
  entry: TrackerData,
  def: UiNonNumericStatDefinition,
  ownerName: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
): boolean {
  return resolveCurrentNonNumericRawValue(entry, def.id, ownerName, {
    globalScope: def.globalScope,
    registryEntry,
  }) !== undefined;
}

function getNumericStatsForCharacter(
  entry: TrackerData,
  name: string,
  settings: BetterSimTrackerSettings,
): UiNumericStatDefinition[] {
  const isUserCard = name === USER_TRACKER_KEY;
  return getNumericStatDefinitions(settings).filter(def =>
    def.showOnCard && (isUserCard ? def.trackUser : def.trackCharacters),
  );
}

export function getNumericStatsForHistory(
  history: TrackerData[],
  name: string,
  settings: BetterSimTrackerSettings,
): UiNumericStatDefinition[] {
  const isUserCard = name === USER_TRACKER_KEY;
  return getNumericStatDefinitions(settings).filter(def =>
    def.showInGraph && (isUserCard ? def.trackUser : def.trackCharacters),
  );
}

type OrderedStatLike = { key?: string; id?: string };

export function orderOwnerCardStats<T extends OrderedStatLike>(
  defs: T[],
  configuredOrder: string[],
  readId: (def: T) => string,
): T[] {
  const statOrderMap = new Map(configuredOrder.map((id, index) => [String(id ?? "").trim().toLowerCase(), index]));
  const fallbackOrder = new Map(defs.map((def, index) => [readId(def), index]));
  return [...defs].sort((a, b) => {
    const aId = readId(a);
    const bId = readId(b);
    const aOrder = statOrderMap.get(aId);
    const bOrder = statOrderMap.get(bId);
    if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
    if (aOrder != null && bOrder == null) return -1;
    if (aOrder == null && bOrder != null) return 1;
    return (fallbackOrder.get(aId) ?? 0) - (fallbackOrder.get(bId) ?? 0);
  });
}

export function resolveNonNumericValue(
  entry: TrackerData,
  def: UiNonNumericStatDefinition,
  characterName: string,
): string | boolean | string[] | null {
  const raw = getNonNumericRawValue(entry, def.id, characterName, def.globalScope);
  if (def.kind === "boolean") {
    if (typeof raw === "boolean") return raw;
    return typeof def.defaultValue === "boolean" ? def.defaultValue : false;
  }

  if (def.kind === "enum_single") {
    const matched = resolveEnumOption(def.enumOptions, raw ?? def.defaultValue);
    if (matched != null) return matched;
    return def.enumOptions[0] ?? null;
  }
  if (def.kind === "array") {
    const items = normalizeNonNumericArrayItems(raw ?? def.defaultValue, def.textMaxLength);
    return items;
  }
  if (def.kind === "date_time") {
    return normalizeDateTimeValue(raw ?? def.defaultValue) || null;
  }
  const maxLength = def.textMaxLength;
  const text = normalizeNonNumericTextValue(raw ?? def.defaultValue, maxLength);
  if (!text) return null;
  return text;
}

function hasNonNumericValue(
  entry: TrackerData,
  def: UiNonNumericStatDefinition,
  characterName: string,
): boolean {
  const raw = getNonNumericRawValue(entry, def.id, characterName, def.globalScope);
  if (raw === undefined) return false;
  if (def.kind === "boolean") return typeof raw === "boolean";
  if (def.kind === "enum_single") return resolveEnumOption(def.enumOptions, raw) != null;
  if (def.kind === "array") {
    if (Array.isArray(raw)) return true;
    if (typeof raw === "string") return normalizeNonNumericArrayItems(raw, def.textMaxLength).length > 0;
    return false;
  }
  if (def.kind === "date_time") {
    return Boolean(normalizeDateTimeValue(raw));
  }
  if (typeof raw !== "string") return false;
  const text = normalizeNonNumericTextValue(raw, def.textMaxLength);
  if (!text) return false;
  return true;
}


export type TrackerUiState = {
  phase: "idle" | "generating" | "extracting";
  done: number;
  total: number;
  messageIndex: number | null;
  stepLabel?: string | null;
};

export type OwnerRenderIdentity = {
  sourceKey: string;
  isAlias: boolean;
  isSource: boolean;
};

function resolveTargetSourceIdentity(
  target: UiRenderTarget,
  resolveOwnerRenderIdentity?: (ownerName: string) => OwnerRenderIdentity | null,
): OwnerRenderIdentity | null {
  const explicitSourceKey = String(target.registryEntry?.sourceKey ?? "").trim();
  const explicitKind = target.registryEntry?.kind ?? null;
  if (explicitSourceKey) {
    return {
      sourceKey: explicitSourceKey,
      isAlias: explicitKind === "multi_character_alias" || explicitKind === "narrative-entity",
      isSource: explicitKind === "owner",
    };
  }
  return resolveOwnerRenderIdentity?.(target.ownerName) ?? null;
}

export type UiRenderTarget = {
  ownerName: string;
  uiKey: string;
  registryEntry: TrackerEntityRegistryEntry | null;
};

export function resolveExtractionLoadingCopy(done: number, stepLabel?: string | null): { title: string; subtitle: string } {
  const normalizedLabel = String(stepLabel ?? "").trim();
  if (/^Resolving /i.test(normalizedLabel)) {
    return {
      title: normalizedLabel,
      subtitle: /multi-character aliases/i.test(normalizedLabel)
        ? "Matching source cards, aliases, and active owners before extraction."
        : "Determining who is active for this message before extraction.",
    };
  }
  if (/^Building extraction baseline$/i.test(normalizedLabel) || /^Preparing context$/i.test(normalizedLabel)) {
    return {
      title: normalizedLabel || "Building extraction baseline",
      subtitle: "Collecting recent messages, tracker history, and owner context for extraction.",
    };
  }
  if (done === 1) {
    return {
      title: normalizedLabel || "Requesting relationship analysis",
      subtitle: normalizedLabel && normalizedLabel !== "Requesting relationship analysis"
        ? normalizedLabel
        : "Sending extraction prompt to backend/profile.",
    };
  }
  if (done >= 2) {
    return {
      title: normalizedLabel || "Parsing and applying tracker update",
      subtitle: normalizedLabel && normalizedLabel !== "Parsing and applying tracker update"
        ? normalizedLabel
        : "Validating AI delta output and updating relationship state.",
    };
  }
  return {
    title: normalizedLabel || "Building extraction baseline",
    subtitle: "Collecting recent messages, tracker history, and owner context for extraction.",
  };
}

export function resolveExtractionProgressDisplayWithLabel(
  done: number,
  total: number,
  label?: string | null,
): {
  stageText: string;
  percent: number;
  ratio: number;
} {
  const normalizedTotal = Math.max(0, Math.floor(Number(total) || 0));
  const normalizedDone = Math.max(0, Math.floor(Number(done) || 0));
  const normalizedLabel = String(label ?? "").trim();
  const isZeroProgress = normalizedDone === 0;
  const isResolverPreflight = normalizedDone === 0 && /^Resolving\b/i.test(normalizedLabel);
  const isBaselinePreflight = normalizedDone === 0
    && normalizedTotal <= 1
    && (/^Building extraction baseline$/i.test(normalizedLabel) || /^Preparing context$/i.test(normalizedLabel));
  if (normalizedTotal <= 0) {
    return {
      stageText: "preparing",
      percent: 0,
      ratio: 0,
    };
  }
  if (isZeroProgress && (normalizedTotal <= 1 || isResolverPreflight || isBaselinePreflight)) {
    return {
      stageText: "preparing",
      percent: 0,
      ratio: 0,
    };
  }
  const clampedDone = Math.max(0, Math.min(normalizedTotal, normalizedDone));
  const ratio = Math.max(0, Math.min(1, clampedDone / normalizedTotal));
  return {
    stageText: `stage ${Math.min(clampedDone + 1, normalizedTotal)}/${normalizedTotal}`,
    percent: Math.round(ratio * 100),
    ratio,
  };
}

export function resolveExtractionProgressDisplay(done: number, total: number): {
  stageText: string;
  percent: number;
  ratio: number;
} {
  return resolveExtractionProgressDisplayWithLabel(done, total, null);
}

export function filterTechnicalSourceOwnersFromTargets(
  targets: string[],
  resolveOwnerRenderIdentity?: (ownerName: string) => OwnerRenderIdentity | null,
): string[] {
  if (!resolveOwnerRenderIdentity) return [...targets];
  const aliasSourceKeys = new Set<string>();
  for (const ownerName of targets) {
    const identity = resolveOwnerRenderIdentity(ownerName);
    if (identity?.isAlias) {
      aliasSourceKeys.add(identity.sourceKey);
    }
  }
  if (!aliasSourceKeys.size) return [...targets];
  return targets.filter(ownerName => {
    const identity = resolveOwnerRenderIdentity(ownerName);
    if (!identity?.isSource) return true;
    return !aliasSourceKeys.has(identity.sourceKey);
  });
}

export function filterArchivedOwnersFromTargets(
  targets: string[],
  getLifecycleState?: (ownerName: string) => CardLifecycleState,
): string[] {
  if (!getLifecycleState) return [...targets];
  return targets.filter(ownerName => getLifecycleState(ownerName) !== "archived");
}

export function mergeRegistryOwnersIntoTargets(
  targets: string[],
  registryOwners: string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const ownerName of [...targets, ...registryOwners]) {
    const normalized = normalizeName(ownerName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(ownerName);
  }
  return merged;
}

export function mergeRegistryEntitiesIntoTargets(input: {
  targets: string[];
  registryEntries: TrackerEntityRegistryEntry[];
  resolveRegistryEntry?: (ownerName: string) => TrackerEntityRegistryEntry | null;
}): string[] {
  const merged: string[] = [];
  const seenNames = new Set<string>();
  const seenEntityIds = new Set<string>();
  const pushOwner = (ownerName: string, registryEntry?: TrackerEntityRegistryEntry | null): void => {
    const normalized = normalizeName(ownerName);
    const entityId = String(registryEntry?.id ?? "").trim();
    if (!normalized) return;
    if (entityId) {
      if (seenEntityIds.has(entityId)) return;
      seenEntityIds.add(entityId);
    } else if (seenNames.has(normalized)) {
      return;
    }
    seenNames.add(normalized);
    merged.push(ownerName);
  };
  for (const ownerName of input.targets) {
    pushOwner(ownerName, input.resolveRegistryEntry?.(ownerName) ?? null);
  }
  for (const entry of input.registryEntries) {
    const ownerName = String(entry?.ownerName ?? "").trim();
    if (!ownerName) continue;
    pushOwner(ownerName, entry);
  }
  return merged;
}

function buildUiRenderTarget(
  ownerName: string,
  registryEntry?: TrackerEntityRegistryEntry | null,
): UiRenderTarget | null {
  const normalizedOwnerName = String(ownerName ?? "").trim();
  if (!normalizedOwnerName) return null;
  const entry = registryEntry ?? null;
  return {
    ownerName: normalizedOwnerName,
    uiKey: resolveOwnerUiKey(normalizedOwnerName, entry),
    registryEntry: entry,
  };
}

export function mergeRegistryRenderTargets(input: {
  targets: string[];
  registryEntries: TrackerEntityRegistryEntry[];
  resolveRegistryEntry?: (ownerName: string) => TrackerEntityRegistryEntry | null;
}): UiRenderTarget[] {
  const merged: UiRenderTarget[] = [];
  const seen = new Set<string>();
  const pushTarget = (ownerName: string, registryEntry?: TrackerEntityRegistryEntry | null): void => {
    const target = buildUiRenderTarget(ownerName, registryEntry);
    if (!target || seen.has(target.uiKey)) return;
    seen.add(target.uiKey);
    merged.push(target);
  };
  for (const ownerName of input.targets) {
    pushTarget(ownerName, input.resolveRegistryEntry?.(ownerName) ?? null);
  }
  for (const entry of input.registryEntries) {
    pushTarget(String(entry?.ownerName ?? ""), entry);
  }
  return merged;
}

export function filterShadowedAliasRenderTargets(
  targets: UiRenderTarget[],
): UiRenderTarget[] {
  const aliasedOwners = new Set(
    targets
      .filter(target => target.registryEntry?.kind === "multi_character_alias")
      .map(target => normalizeName(target.ownerName))
      .filter(Boolean),
  );
  if (!aliasedOwners.size) return [...targets];
  return targets.filter(target => {
    const normalizedOwner = normalizeName(target.ownerName);
    if (!normalizedOwner) return false;
    return !(target.registryEntry?.kind === "owner" && aliasedOwners.has(normalizedOwner));
  });
}

export function resolveRegistryOwnersFromEntries(
  entries: TrackerEntityRegistryEntry[],
): string[] {
  const owners: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const ownerName = String(entry?.ownerName ?? "").trim();
    const normalized = normalizeName(ownerName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    owners.push(ownerName);
  }
  return owners;
}

export function filterTechnicalSourceRenderTargets(
  targets: UiRenderTarget[],
  resolveOwnerRenderIdentity?: (ownerName: string) => OwnerRenderIdentity | null,
): UiRenderTarget[] {
  if (!resolveOwnerRenderIdentity) return [...targets];
  const aliasSourceKeys = new Set<string>();
  for (const target of targets) {
    const identity = resolveTargetSourceIdentity(target, resolveOwnerRenderIdentity);
    if (identity?.isAlias) {
      aliasSourceKeys.add(identity.sourceKey);
    }
  }
  if (!aliasSourceKeys.size) return [...targets];
  return targets.filter(target => {
    const identity = resolveTargetSourceIdentity(target, resolveOwnerRenderIdentity);
    if (!identity?.isSource) return true;
    return !aliasSourceKeys.has(identity.sourceKey);
  });
}

function filterArchivedRenderTargets(
  targets: UiRenderTarget[],
  getLifecycleState?: (target: UiRenderTarget) => CardLifecycleState,
): UiRenderTarget[] {
  if (!getLifecycleState) return [...targets];
  return targets.filter(target => getLifecycleState(target) !== "archived");
}

export function resolveRegistryLookupNamesForOwner(
  ownerName: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const pushName = (raw: unknown): void => {
    const value = String(raw ?? "").trim();
    const normalized = normalizeName(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    names.push(value);
  };
  pushName(ownerName);
  if (!registryEntry) return names;
  pushName(registryEntry.ownerName);
  pushName(registryEntry.canonicalName);
  for (const alias of registryEntry.aliases ?? []) {
    pushName(alias);
  }
  return names;
}

export function resolveRegistryEntryForOwnerInMessageData(input: {
  ownerName: string;
  messageIndex: number;
  data?: TrackerData | null;
  resolveRegistryEntryForMessage?: (ownerName: string, messageIndex: number) => TrackerEntityRegistryEntry | null;
  resolveRegistryEntryByEntityIdForMessage?: (entityId: string, messageIndex: number) => TrackerEntityRegistryEntry | null;
}): TrackerEntityRegistryEntry | null {
  const ownerName = String(input.ownerName ?? "").trim();
  if (!ownerName) return null;
  const targetEntityId = String(resolveTrackerDataEntityOwnerSnapshot(input.data, ownerName)?.entityId ?? "").trim();
  if (targetEntityId) {
    const byEntityId = input.resolveRegistryEntryByEntityIdForMessage?.(targetEntityId, input.messageIndex) ?? null;
    if (byEntityId) return byEntityId;
  }
  return input.resolveRegistryEntryForMessage?.(ownerName, input.messageIndex) ?? null;
}

export function resolveLifecycleRegistryStateForOwnerInMessageData(input: {
  ownerName: string;
  messageIndex: number;
  data?: TrackerData | null;
  resolveLifecycleRegistryState?: (ownerName: string, messageIndex: number) => CardLifecycleRegistryState | null;
  resolveLifecycleRegistryStateByEntityId?: (entityId: string, messageIndex: number) => CardLifecycleRegistryState | null;
}): CardLifecycleRegistryState | null {
  const ownerName = String(input.ownerName ?? "").trim();
  if (!ownerName) return null;
  const targetEntityId = String(resolveTrackerDataEntityOwnerSnapshot(input.data, ownerName)?.entityId ?? "").trim();
  if (targetEntityId) {
    const byEntityId = input.resolveLifecycleRegistryStateByEntityId?.(targetEntityId, input.messageIndex) ?? null;
    if (byEntityId) return byEntityId;
  }
  return input.resolveLifecycleRegistryState?.(ownerName, input.messageIndex) ?? null;
}

export function buildDisplayPoolWithRegistry(input: {
  entityTrackingMode: BetterSimTrackerSettings["entityTrackingMode"];
  includeAllTargets: boolean;
  activeCharacters: string[];
  dataCharacterNames: string[];
  mergedWithRegistryOwners: string[];
}): string[] {
  const preferRegistryOwners = input.entityTrackingMode === "dynamic_characters"
    && input.mergedWithRegistryOwners.length > 0;
  if (input.includeAllTargets) {
    return preferRegistryOwners
      ? input.mergedWithRegistryOwners
      : input.dataCharacterNames.length > 0
        ? input.dataCharacterNames
        : input.activeCharacters;
  }
  return preferRegistryOwners
    ? input.mergedWithRegistryOwners
    : input.activeCharacters.length > 0
      ? input.activeCharacters
      : input.dataCharacterNames;
}

export function selectDisplayPoolTargetsWithRegistry(input: {
  entityTrackingMode: BetterSimTrackerSettings["entityTrackingMode"];
  includeAllTargets: boolean;
  activeCharacters: string[];
  dataCharacterNames: string[];
  mergedWithRegistryTargets: UiRenderTarget[];
  resolveTarget: (ownerName: string) => UiRenderTarget | null;
  shouldKeepTarget: (target: UiRenderTarget) => boolean;
}): UiRenderTarget[] {
  const mergedWithRegistryOwners = input.mergedWithRegistryTargets.map(target => target.ownerName);
  const displayPool = buildDisplayPoolWithRegistry({
    entityTrackingMode: input.entityTrackingMode,
    includeAllTargets: input.includeAllTargets,
    activeCharacters: input.activeCharacters,
    dataCharacterNames: input.dataCharacterNames,
    mergedWithRegistryOwners,
  });
  const preferRegistryTargets = input.entityTrackingMode === "dynamic_characters"
    && input.mergedWithRegistryTargets.length > 0;
  const displayPoolTargets = preferRegistryTargets
    ? [...input.mergedWithRegistryTargets]
    : displayPool
      .map(ownerName => input.resolveTarget(ownerName))
      .filter((target): target is UiRenderTarget => Boolean(target));
  return input.includeAllTargets
    ? displayPoolTargets
    : displayPoolTargets.filter(target => input.shouldKeepTarget(target));
}

export function filterRenderTargetsForTrackingMode(input: {
  entityTrackingMode: BetterSimTrackerSettings["entityTrackingMode"];
  targets: UiRenderTarget[];
}): UiRenderTarget[] {
  if (input.entityTrackingMode === "dynamic_characters") {
    return [...input.targets];
  }
  return input.targets.filter(target => target.registryEntry?.kind !== "narrative-entity");
}

export function isUserOwnerToken(
  ownerName: string,
  resolveDisplayName?: (ownerName: string) => string | null | undefined,
): boolean {
  const normalizedOwner = normalizeName(ownerName);
  if (!normalizedOwner) return false;
  if (normalizedOwner === normalizeName(USER_TRACKER_KEY)) return true;
  if (!resolveDisplayName) return false;
  const normalizedUserDisplayName = normalizeName(resolveDisplayName(USER_TRACKER_KEY) ?? "User");
  if (!normalizedUserDisplayName) return false;
  const displayName = resolveDisplayName(ownerName) ?? ownerName;
  return normalizeName(displayName) === normalizedUserDisplayName;
}

export function shouldKeepOwnerInRenderTargetPool(input: {
  ownerName: string;
  hasAnyStat: boolean;
  isActive: boolean;
}): boolean {
  const normalized = normalizeName(input.ownerName);
  if (!normalized) return false;
  return input.hasAnyStat || input.isActive;
}

export function resolveTrackerCardCollapsed(input: {
  cardKey: string;
  isActive: boolean;
  collapsedActiveCardKeys: ReadonlySet<string>;
  expandedInactiveCardKeys: ReadonlySet<string>;
}): boolean {
  const key = String(input.cardKey ?? "").trim();
  if (!key) return !input.isActive;
  return input.isActive
    ? input.collapsedActiveCardKeys.has(key)
    : !input.expandedInactiveCardKeys.has(key);
}

export function applyTrackerCardCollapsed(input: {
  cardKey: string;
  isActive: boolean;
  nextCollapsed: boolean;
  collapsedActiveCardKeys: Set<string>;
  expandedInactiveCardKeys: Set<string>;
}): void {
  const key = String(input.cardKey ?? "").trim();
  if (!key) return;
  if (input.isActive) {
    if (input.nextCollapsed) {
      input.collapsedActiveCardKeys.add(key);
    } else {
      input.collapsedActiveCardKeys.delete(key);
    }
    return;
  }
  if (input.nextCollapsed) {
    input.expandedInactiveCardKeys.delete(key);
  } else {
    input.expandedInactiveCardKeys.add(key);
  }
}

export function resolveCurrentLifecycleOwners(input: {
  sceneOwners: string[];
  messageOwners: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...(input.sceneOwners ?? []), ...(input.messageOwners ?? [])]) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) continue;
    const normalized = normalizeName(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(trimmed);
  }
  return out;
}

export function resolveCurrentLifecycleOwnersForTrackerData(data: TrackerData | null | undefined): string[] {
  if (!data) return [];
  if (Array.isArray(data.activeCharacters)) {
    return resolveTrackerActiveOwners(null, data);
  }
  return resolveCurrentLifecycleOwners({
    sceneOwners: resolveTrackerSceneOwners(null, data),
    messageOwners: resolveTrackerMessageOwners(null, data),
  });
}

export type TrackerRecoveryEntry = {
  kind: "error" | "stopped";
  title: string;
  detail: string;
  actionLabel: string;
};

type RenderEntry = {
  messageIndex: number;
  data: TrackerData | null;
  recovery?: TrackerRecoveryEntry | null;
};

export type RenderHistoryLookupEntry = {
  messageIndex: number;
  data: TrackerData | null;
};

type RenderHistoryLookupResolver = {
  resolveLookupNamesForOwnerInData: (
    data: TrackerData | null | undefined,
    ownerName: string,
    messageIndex: number,
  ) => string[];
  isNumericGlobalScope: (key: string) => boolean;
};

export function createRenderHistoryLookupCache(
  sortedEntries: RenderHistoryLookupEntry[],
  resolver: RenderHistoryLookupResolver,
): {
  findPreviousDataWithNumericStat: (
    messageIndex: number,
    key: string,
    ownerName: string,
  ) => { data: TrackerData; value: number } | null;
  findPreviousDataWithNonNumericStat: (
    messageIndex: number,
    def: UiNonNumericStatDefinition,
    ownerName: string,
  ) => TrackerData | null;
  findPreviousDataWithBuiltInTextStat: (
    stat: "mood" | "lastThought",
    messageIndex: number,
    ownerName: string,
  ) => TrackerData | null;
  resolvePreviousNonNumericValue: (
    data: TrackerData,
    def: UiNonNumericStatDefinition,
    ownerName: string,
    messageIndex: number,
  ) => CustomNonNumericValue | undefined;
  resolvePreviousBuiltInTextValue: (
    data: TrackerData,
    stat: "mood" | "lastThought",
    ownerName: string,
    messageIndex: number,
  ) => string | undefined;
} {
  const lookupNamesByDataCache = new WeakMap<TrackerData, Map<string, string[]>>();
  const lookupNamesWithoutDataCache = new Map<string, string[]>();
  const numericResultCache = new Map<string, { data: TrackerData; value: number } | null>();
  const nonNumericResultCache = new Map<string, TrackerData | null>();
  const textResultCache = new Map<string, TrackerData | null>();
  const nonNumericValueCache = new WeakMap<TrackerData, Map<string, CustomNonNumericValue | undefined>>();
  const builtInTextValueCache = new WeakMap<TrackerData, Map<string, string | undefined>>();

  const resolveLookupNames = (
    data: TrackerData | null | undefined,
    ownerName: string,
    messageIndex: number,
    candidateMessageIndex: number,
  ): string[] => {
    const cacheKey = `${candidateMessageIndex}|${messageIndex}|${ownerName.toLowerCase()}`;
    const cache = data
      ? (lookupNamesByDataCache.get(data) ?? new Map<string, string[]>())
      : lookupNamesWithoutDataCache;
    if (data && !lookupNamesByDataCache.has(data)) {
      lookupNamesByDataCache.set(data, cache);
    }
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const resolved = resolver.resolveLookupNamesForOwnerInData(data, ownerName, messageIndex);
    cache.set(cacheKey, resolved);
    return resolved;
  };

  const resolvePreviousNonNumericValue = (
    data: TrackerData,
    def: UiNonNumericStatDefinition,
    ownerName: string,
    messageIndex: number,
  ): CustomNonNumericValue | undefined => {
    const cacheKey = `${messageIndex}|${ownerName.toLowerCase()}|${def.id}`;
    const cache = nonNumericValueCache.get(data) ?? new Map<string, CustomNonNumericValue | undefined>();
    if (!nonNumericValueCache.has(data)) {
      nonNumericValueCache.set(data, cache);
    }
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const byOwner = data.customNonNumericStatistics?.[def.id];
    let resolved: CustomNonNumericValue | undefined;
    if (byOwner) {
      const lookupNames = def.globalScope
        ? [GLOBAL_TRACKER_KEY]
        : resolveLookupNames(data, ownerName, messageIndex, -1);
      for (const lookupName of lookupNames) {
        const value = byOwner[lookupName];
        if (value !== undefined) {
          resolved = value;
          break;
        }
      }
    }
    cache.set(cacheKey, resolved);
    return resolved;
  };

  const resolvePreviousBuiltInTextValue = (
    data: TrackerData,
    stat: "mood" | "lastThought",
    ownerName: string,
    messageIndex: number,
  ): string | undefined => {
    const cacheKey = `${messageIndex}|${ownerName.toLowerCase()}|${stat}`;
    const cache = builtInTextValueCache.get(data) ?? new Map<string, string | undefined>();
    if (!builtInTextValueCache.has(data)) {
      builtInTextValueCache.set(data, cache);
    }
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const lookupNames = resolveLookupNames(data, ownerName, messageIndex, -1);
    const source = stat === "mood" ? data.statistics.mood : data.statistics.lastThought;
    let resolved: string | undefined;
    for (const lookupName of lookupNames) {
      if (source?.[lookupName] !== undefined) {
        resolved = String(source[lookupName] ?? "");
        break;
      }
    }
    cache.set(cacheKey, resolved);
    return resolved;
  };

  const findPreviousDataWithNumericStat = (
    messageIndex: number,
    key: string,
    ownerName: string,
  ): { data: TrackerData; value: number } | null => {
    const cacheKey = `${messageIndex}|${key}|${ownerName.toLowerCase()}`;
    if (numericResultCache.has(cacheKey)) return numericResultCache.get(cacheKey) ?? null;
    let resolved: { data: TrackerData; value: number } | null = null;
    for (let i = sortedEntries.length - 1; i >= 0; i -= 1) {
      const candidate = sortedEntries[i];
      if (candidate.messageIndex >= messageIndex || !candidate.data) continue;
      const lookupNames = resolveLookupNames(candidate.data, ownerName, messageIndex, candidate.messageIndex);
      for (const lookupName of lookupNames) {
        const value = getNumericRawValue(candidate.data, key, lookupName, resolver.isNumericGlobalScope(key));
        if (value === undefined || Number.isNaN(value)) continue;
        resolved = { data: candidate.data, value };
        break;
      }
      if (resolved) break;
    }
    numericResultCache.set(cacheKey, resolved);
    return resolved;
  };

  const findPreviousDataWithNonNumericStat = (
    messageIndex: number,
    def: UiNonNumericStatDefinition,
    ownerName: string,
  ): TrackerData | null => {
    const cacheKey = `${messageIndex}|${def.id}|${ownerName.toLowerCase()}`;
    if (nonNumericResultCache.has(cacheKey)) return nonNumericResultCache.get(cacheKey) ?? null;
    let resolved: TrackerData | null = null;
    for (let i = sortedEntries.length - 1; i >= 0; i -= 1) {
      const candidate = sortedEntries[i];
      if (candidate.messageIndex >= messageIndex || !candidate.data) continue;
      const lookupNames = resolveLookupNames(candidate.data, ownerName, messageIndex, candidate.messageIndex);
      for (const lookupName of lookupNames) {
        if (hasNonNumericValue(candidate.data, def, lookupName)) {
          resolved = candidate.data;
          break;
        }
      }
      if (resolved) break;
    }
    nonNumericResultCache.set(cacheKey, resolved);
    return resolved;
  };

  const findPreviousDataWithBuiltInTextStat = (
    stat: "mood" | "lastThought",
    messageIndex: number,
    ownerName: string,
  ): TrackerData | null => {
    const cacheKey = `${stat}|${messageIndex}|${ownerName.toLowerCase()}`;
    if (textResultCache.has(cacheKey)) return textResultCache.get(cacheKey) ?? null;
    let resolved: TrackerData | null = null;
    for (let i = sortedEntries.length - 1; i >= 0; i -= 1) {
      const candidate = sortedEntries[i];
      if (candidate.messageIndex >= messageIndex || !candidate.data) continue;
      const lookupNames = resolveLookupNames(candidate.data, ownerName, messageIndex, candidate.messageIndex);
      const source = stat === "mood" ? candidate.data.statistics.mood : candidate.data.statistics.lastThought;
      if (lookupNames.some(lookupName => source?.[lookupName] !== undefined)) {
        resolved = candidate.data;
        break;
      }
    }
    textResultCache.set(cacheKey, resolved);
    return resolved;
  };

  return {
    findPreviousDataWithNumericStat,
    findPreviousDataWithNonNumericStat,
    findPreviousDataWithBuiltInTextStat,
    resolvePreviousNonNumericValue,
    resolvePreviousBuiltInTextValue,
  };
}

const ROOT_CLASS = "bst-root";
const collapsedTrackerMessages = new Set<number>();
const expandedTrackerMessages = new Set<number>();
const collapsedActiveCardKeys = new Set<string>();
const expandedInactiveCardKeys = new Set<string>();
const collapsedSceneMessages = new Set<number>();
const expandedThoughtKeys = new Set<string>();
const expandedArrayValueKeys = new Set<string>();
const expandedTextShortKeys = new Set<string>();
const renderedCardKeys = new Set<string>();
let overflowResyncBound = false;
let overflowResyncScheduled = false;
let deferredOverflowResyncScheduled = false;
export const EDIT_STATS_BACKDROP_CLASS = "bst-edit-backdrop";
export const EDIT_STATS_MODAL_CLASS = "bst-edit-modal";
export const EDIT_STATS_DIALOG_CLASS = "bst-edit-dialog";
export const MAX_EDIT_LAST_THOUGHT_CHARS = 600;
export const BST_UI_SURFACE_CONTRACT = {
  headerClass: "bst-surface-header",
  footerClass: "bst-surface-footer",
  disclosureIconClass: "bst-disclosure-icon",
} as const;
let textareaCounterSequence = 0;
type AutoCardColorAssignment = {
  hue: number;
  color: string;
  seenAt: number;
};
const autoCardColorAssignments = new Map<string, AutoCardColorAssignment>();
const AUTO_CARD_COLOR_CACHE_LIMIT = 300;
const AUTO_CARD_MIN_HUE_DISTANCE = 24;

function syncRenderedExpandableOverflowState(): void {
  const applyExpandableToggleVisibility = (toggle: HTMLButtonElement, hidden: boolean): void => {
    toggle.hidden = hidden;
    toggle.toggleAttribute("hidden", hidden);
    if (hidden) {
      toggle.style.setProperty("display", "none", "important");
      toggle.style.setProperty("visibility", "hidden", "important");
      toggle.style.setProperty("pointer-events", "none", "important");
      toggle.style.setProperty("margin-top", "0", "important");
      toggle.style.setProperty("padding", "0", "important");
      toggle.style.setProperty("border-width", "0", "important");
      toggle.style.setProperty("min-height", "0", "important");
      toggle.style.setProperty("height", "0", "important");
      toggle.style.setProperty("overflow", "hidden", "important");
    } else {
      toggle.style.removeProperty("display");
      toggle.style.removeProperty("visibility");
      toggle.style.removeProperty("pointer-events");
      toggle.style.removeProperty("margin-top");
      toggle.style.removeProperty("padding");
      toggle.style.removeProperty("border-width");
      toggle.style.removeProperty("min-height");
      toggle.style.removeProperty("height");
      toggle.style.removeProperty("overflow");
    }
  };
  const syncThoughtOverflowIn = (host: ParentNode | null | undefined): void => {
    if (!host) return;
    host.querySelectorAll<HTMLElement>('[data-bst-thought-container="1"]').forEach(container => {
      const key = String(container.getAttribute("data-bst-thought-key") ?? "").trim();
      const textNode = container.querySelector<HTMLElement>(".bst-thought-text, .bst-mood-bubble-text");
      const toggle = container.querySelector<HTMLButtonElement>('[data-bst-action="toggle-thought"]');
      if (!textNode || !toggle) return;
      const state = resolveThoughtToggleState({
        scrollHeight: textNode.scrollHeight,
        clientHeight: textNode.clientHeight,
        scrollWidth: textNode.scrollWidth,
        clientWidth: textNode.clientWidth,
      }, expandedThoughtKeys.has(key));
      if (!state.overflowing) {
        if (key) expandedThoughtKeys.delete(key);
        container.classList.remove("bst-thought-expanded");
      }
      applyExpandableToggleVisibility(toggle, state.hidden);
      toggle.setAttribute("aria-expanded", state.ariaExpanded);
      toggle.textContent = state.label;
    });
  };
  const syncTextShortOverflowIn = (host: ParentNode | null | undefined): void => {
    if (!host) return;
    host.querySelectorAll<HTMLElement>('[data-bst-text-short-container="1"]').forEach(container => {
      const key = String(container.getAttribute("data-bst-text-short-key") ?? "").trim();
      const textNode = container.querySelector<HTMLElement>(".bst-text-short-value-text");
      const toggle = container.querySelector<HTMLButtonElement>('[data-bst-action="toggle-text-short"]');
      if (!textNode || !toggle) return;
      const state = resolveTextShortToggleState({
        scrollHeight: textNode.scrollHeight,
        clientHeight: textNode.clientHeight,
        scrollWidth: textNode.scrollWidth,
        clientWidth: textNode.clientWidth,
      }, expandedTextShortKeys.has(key));
      if (!state.overflowing) {
        if (key) expandedTextShortKeys.delete(key);
        container.classList.remove("bst-text-short-expanded");
      }
      applyExpandableToggleVisibility(toggle, state.hidden);
      toggle.setAttribute("aria-expanded", state.ariaExpanded);
      toggle.textContent = state.label;
    });
  };
  document.querySelectorAll<HTMLElement>(`.${ROOT_CLASS}, .bst-scene-root`).forEach(host => {
    syncThoughtOverflowIn(host);
    syncTextShortOverflowIn(host);
  });
}

function scheduleDeferredOverflowResync(): void {
  if (deferredOverflowResyncScheduled || typeof window === "undefined") return;
  deferredOverflowResyncScheduled = true;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      deferredOverflowResyncScheduled = false;
      syncRenderedExpandableOverflowState();
    });
  });
}

function bindOverflowResyncEvents(): void {
  if (overflowResyncBound || typeof window === "undefined") return;
  const schedule = (): void => {
    if (overflowResyncScheduled) return;
    overflowResyncScheduled = true;
    window.requestAnimationFrame(() => {
      overflowResyncScheduled = false;
      syncRenderedExpandableOverflowState();
    });
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  overflowResyncBound = true;
}

export const SETTINGS_SUBDRAWER_STYLE_CONTRACT = {
  chevronIcon: "\\f13a",
  chevronSize: 28,
  summaryMinHeight: 44,
  closedRotationDeg: -90,
  openRotationDeg: 0,
} as const;

function toPercent(value: StatValue): number {
  if (typeof value === "number") return Math.max(0, Math.min(100, value));
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function toOwnerClassSuffix(value: string): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function pushUniqueCharacterName(target: string[], seen: Set<string>, raw: unknown): void {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return;
  if (name === GLOBAL_TRACKER_KEY) return;
  const key = normalizeName(name);
  if (!key || seen.has(key)) return;
  seen.add(key);
  target.push(name);
}

export function collectCharacterNamesFromTrackerData(data: TrackerData): string[];
export function collectCharacterNamesFromTrackerData(context: STContext | null, data: TrackerData): string[];
export function collectCharacterNamesFromTrackerData(
  contextOrData: STContext | null | TrackerData,
  maybeData?: TrackerData,
): string[] {
  const context = maybeData ? (contextOrData as STContext | null) : null;
  const data = maybeData ?? (contextOrData as TrackerData);
  const names: string[] = [];
  const seen = new Set<string>();
  const preferredNames = resolveTrackerSceneOwners(context, data);
  const explicitActiveCharacters = Array.isArray(data.activeCharacters) ? data.activeCharacters : [];
  const hasExplicitUserOwner = explicitActiveCharacters.some(name => normalizeName(name) === normalizeName(USER_TRACKER_KEY));
  const fallbackNames = preferredNames.length
    ? preferredNames
    : (data.entityOwnerMap
      ? Object.keys(data.entityOwnerMap)
      : (data.activeCharacters ?? []));
  for (const name of fallbackNames) {
    pushUniqueCharacterName(names, seen, name);
  }
  if (data.entityOwnerMap) {
    for (const name of Object.keys(data.entityOwnerMap)) {
      pushUniqueCharacterName(names, seen, name);
    }
  }
  if (hasExplicitUserOwner) {
    pushUniqueCharacterName(names, seen, USER_TRACKER_KEY);
  }

  const hasExplicitEntityIdentity = preferredNames.length > 0
    || (data.entityOwnerMap != null && Object.keys(data.entityOwnerMap).length > 0);
  if (hasExplicitEntityIdentity) {
    return names;
  }

  const builtInStatMaps: unknown[] = [
    data.statistics?.affection,
    data.statistics?.trust,
    data.statistics?.desire,
    data.statistics?.connection,
    data.statistics?.mood,
    data.statistics?.lastThought,
  ];
  for (const statMap of builtInStatMaps) {
    if (!statMap || typeof statMap !== "object") continue;
    for (const name of Object.keys(statMap as Record<string, unknown>)) {
      pushUniqueCharacterName(names, seen, name);
    }
  }

  for (const statMap of Object.values(data.customStatistics ?? {})) {
    if (!statMap || typeof statMap !== "object") continue;
    for (const name of Object.keys(statMap as Record<string, unknown>)) {
      pushUniqueCharacterName(names, seen, name);
    }
  }
  for (const statMap of Object.values(data.customNonNumericStatistics ?? {})) {
    if (!statMap || typeof statMap !== "object") continue;
    for (const name of Object.keys(statMap as Record<string, unknown>)) {
      pushUniqueCharacterName(names, seen, name);
    }
  }

  return names;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function bindTextareaCounters(
  container: ParentNode,
  shouldSkip?: (textarea: HTMLTextAreaElement) => boolean,
): () => void {
  const shouldIgnore = (textarea: HTMLTextAreaElement): boolean => {
    if (shouldSkip?.(textarea)) return true;
    const styles = window.getComputedStyle(textarea);
    return styles.display === "none" || styles.visibility === "hidden";
  };

  const updateOne = (textarea: HTMLTextAreaElement): void => {
    let counterId = String(textarea.dataset.bstCounterId ?? "").trim();
    if (shouldIgnore(textarea)) {
      if (counterId) {
        container.querySelector(`.bst-textarea-counter[data-bst-counter-id="${counterId}"]`)?.remove();
      }
      return;
    }
    if (!counterId) {
      textareaCounterSequence += 1;
      counterId = `bst-textarea-${textareaCounterSequence}`;
      textarea.dataset.bstCounterId = counterId;
    }
    let counter = container.querySelector(`.bst-textarea-counter[data-bst-counter-id="${counterId}"]`) as HTMLElement | null;
    if (!counter) {
      counter = document.createElement("div");
      counter.className = "bst-textarea-counter";
      counter.dataset.bstCounterId = counterId;
      textarea.insertAdjacentElement("afterend", counter);
    }
    const max = Number(textarea.getAttribute("maxlength"));
    const hasMax = Number.isFinite(max) && max > 0;
    const current = textarea.value.length;
    counter.textContent = hasMax ? `${current}/${max} chars` : `${current} chars`;
    if (!hasMax) {
      counter.removeAttribute("data-state");
      return;
    }
    const warnThreshold = Math.max(1, max - Math.min(30, Math.round(max * 0.1)));
    if (current >= max) {
      counter.setAttribute("data-state", "limit");
    } else if (current >= warnThreshold) {
      counter.setAttribute("data-state", "warn");
    } else {
      counter.setAttribute("data-state", "ok");
    }
  };

  const textareas = Array.from(container.querySelectorAll("textarea")) as HTMLTextAreaElement[];
  for (const textarea of textareas) {
    if (shouldIgnore(textarea)) continue;
    if (textarea.dataset.bstCounterBound !== "1") {
      const refresh = (): void => updateOne(textarea);
      textarea.addEventListener("input", refresh);
      textarea.addEventListener("change", refresh);
      textarea.dataset.bstCounterBound = "1";
    }
    updateOne(textarea);
  }
  return (): void => {
    const nodes = Array.from(container.querySelectorAll("textarea")) as HTMLTextAreaElement[];
    for (const textarea of nodes) updateOne(textarea);
  };
}

export function resolveMoodSymbol(
  moodRaw: string,
  symbolMap: MoodSymbolMap | null | undefined = undefined,
): string {
  const label = normalizeMoodLabel(moodRaw) as MoodLabel | null;
  if (label) {
    const explicit = typeof symbolMap?.[label] === "string" ? String(symbolMap[label] ?? "").trim() : "";
    if (explicit) return explicit;
    return DEFAULT_MOOD_SYMBOL_MAP[label];
  }
  const explicitNeutral = typeof symbolMap?.Neutral === "string" ? String(symbolMap.Neutral ?? "").trim() : "";
  return explicitNeutral || DEFAULT_MOOD_SYMBOL_MAP.Neutral;
}

export function resolveMoodSymbolBoxStyleVars(
  settings: Pick<BetterSimTrackerSettings, "moodSymbolMinWidth" | "moodSymbolMinHeight" | "moodSymbolBoxRadius" | "moodSymbolFontSize">,
): Record<string, string> {
  return {
    "--bst-mood-symbol-min-width": `${settings.moodSymbolMinWidth}px`,
    "--bst-mood-symbol-min-height": `${settings.moodSymbolMinHeight}px`,
    "--bst-mood-symbol-radius": `${settings.moodSymbolBoxRadius}px`,
    "--bst-mood-symbol-font-size": `${settings.moodSymbolFontSize}px`,
  };
}

export function isBuiltInTextStatVisibleForOwner(
  settings: Pick<BetterSimTrackerSettings, "trackMood" | "trackLastThought" | "enableUserTracking" | "userTrackMood" | "userTrackLastThought">,
  ownerName: string,
  stat: "mood" | "lastThought",
  isOwnerStatEnabled?: (ownerName: string, statId: string) => boolean | undefined,
): boolean {
  const normalizedOwner = normalizeName(ownerName);
  const isUser = normalizedOwner === normalizeName(USER_TRACKER_KEY);
  if (stat === "mood") {
    if (isUser) {
      if (!settings.enableUserTracking || !settings.userTrackMood) return false;
    } else if (!settings.trackMood) {
      return false;
    }
    if (isOwnerStatEnabled?.(ownerName, "mood") === false) return false;
    return true;
  }

  if (isUser) {
    if (!settings.enableUserTracking || !settings.userTrackLastThought) return false;
  } else if (!settings.trackLastThought) {
    return false;
  }
  if (isOwnerStatEnabled?.(ownerName, "lastthought") === false) return false;
  return true;
}

export function normalizeHexColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return null;
  const normalized = value.length === 3
    ? value.split("").map(char => char + char).join("")
    : value;
  return `#${normalized.toLowerCase()}`;
}

function hexToRgb(raw: string | null): { r: number; g: number; b: number } | null {
  if (!raw) return null;
  const normalized = normalizeHexColor(raw);
  if (!normalized) return null;
  const hex = normalized.slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(value => Number.isNaN(value))) return null;
  return { r, g, b };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (value: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixRgb(base: { r: number; g: number; b: number }, target: { r: number; g: number; b: number }, amount: number): { r: number; g: number; b: number } {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: base.r + (target.r - base.r) * t,
    g: base.g + (target.g - base.g) * t,
    b: base.b + (target.b - base.b) * t,
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLinear = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildActionPalette(cardHex: string): {
  bg: string;
  border: string;
  text: string;
  hoverBg: string;
  hoverBorder: string;
  focus: string;
} {
  const base = hexToRgb(cardHex) ?? { r: 31, g: 32, b: 40 };
  const neutralDark = { r: 18, g: 21, b: 28 };
  const neutralLight = { r: 238, g: 242, b: 250 };
  const setAlpha = (hex: string, alpha: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
  };
  const lum = relativeLuminance(base);
  if (lum < 0.45) {
    const bg = mixRgb(base, neutralDark, 0.86);
    const hoverBg = mixRgb(base, neutralDark, 0.74);
    const border = mixRgb(base, neutralLight, 0.42);
    const hoverBorder = mixRgb(base, neutralLight, 0.58);
    const focus = mixRgb(base, neutralLight, 0.66);
    return {
      bg: setAlpha(rgbToHex(bg), 0.7),
      border: rgbToHex(border),
      text: "#f7f9ff",
      hoverBg: setAlpha(rgbToHex(hoverBg), 0.82),
      hoverBorder: rgbToHex(hoverBorder),
      focus: rgbToHex(focus),
    };
  }
  const bg = mixRgb(base, neutralLight, 0.84);
  const hoverBg = mixRgb(base, neutralLight, 0.92);
  const border = mixRgb(base, neutralDark, 0.36);
  const hoverBorder = mixRgb(base, neutralDark, 0.52);
  const focus = mixRgb(base, neutralDark, 0.68);
  return {
    bg: setAlpha(rgbToHex(bg), 0.78),
    border: rgbToHex(border),
    text: "#0f1523",
    hoverBg: setAlpha(rgbToHex(hoverBg), 0.9),
    hoverBorder: rgbToHex(hoverBorder),
    focus: rgbToHex(focus),
  };
}

function moodBadgeColor(moodRaw: string): string {
  const mood = moodRaw.toLowerCase();
  if (mood.includes("happy") || mood.includes("excited") || mood.includes("in love")) return "rgba(87, 214, 138, 0.25)";
  if (mood.includes("content") || mood.includes("hopeful") || mood.includes("playful")) return "rgba(89, 185, 255, 0.24)";
  if (mood.includes("frustrated") || mood.includes("angry") || mood.includes("sad") || mood.includes("lonely")) return "rgba(255, 120, 136, 0.25)";
  return "rgba(255,255,255,0.12)";
}

export function normalizeMoodLabel(moodRaw: string): string | null {
  const cleaned = moodRaw.trim().toLowerCase();
  if (!cleaned) return null;
  const exact = MOOD_LABEL_LOOKUP.get(cleaned);
  if (exact) return exact;
  for (const label of MOOD_LABELS_BY_LENGTH) {
    const needle = label.toLowerCase();
    if (cleaned.includes(needle)) return label;
  }
  return null;
}

function normalizeMoodSource(raw: unknown): MoodSource {
  return raw === "st_expressions" ? "st_expressions" : "bst_images";
}

export function getResolvedMoodSource(
  settings: BetterSimTrackerSettings,
  characterName: string,
  characterAvatar?: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id" | "kind"> | null,
): MoodSource {
  const fallback = normalizeMoodSource(settings.moodSource);
  if (!shouldUseConfiguredOwnerDefaults(null, characterName, registryEntry?.id ?? null, registryEntry?.kind ?? null)) {
    return fallback;
  }
  const entry = resolveCharacterDefaultsEntry(settings, { name: characterName, avatar: characterAvatar });
  if (!Object.keys(entry).length) return fallback;
  const override = normalizeMoodSource(entry.moodSource);
  if (entry.moodSource === "bst_images" || entry.moodSource === "st_expressions") return override;
  return fallback;
}

function getResolvedCardColor(
  settings: BetterSimTrackerSettings,
  characterName: string,
  characterAvatar?: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id" | "kind" | "cardColor"> | null,
): string | null {
  const registryColor = normalizeHexColor(registryEntry?.cardColor);
  if (registryColor) return registryColor;
  if (!shouldUseConfiguredOwnerDefaults(null, characterName, registryEntry?.id ?? null, registryEntry?.kind ?? null)) {
    return null;
  }
  const entry = resolveCharacterDefaultsEntry(settings, { name: characterName, avatar: characterAvatar });
  if (!entry || typeof entry !== "object") return null;
  return normalizeHexColor((entry as Record<string, unknown>).cardColor);
}

function thoughtKey(messageIndex: number, characterName: string): string {
  return `${messageIndex}:${normalizeName(characterName)}`;
}

export function resolveOwnerUiKey(
  ownerName: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id"> | null,
): string {
  const entityId = String(registryEntry?.id ?? "").trim();
  return entityId || normalizeName(ownerName);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampNumberInputToBounds(input: HTMLInputElement): boolean {
  if (input.type !== "number") return false;
  const rawText = String(input.value ?? "").trim();
  if (!rawText.length) return false;
  const parsed = Number(rawText);
  if (!Number.isFinite(parsed)) return false;
  const minAttr = input.getAttribute("min");
  const maxAttr = input.getAttribute("max");
  const minValue = minAttr !== null && minAttr.trim().length ? Number(minAttr) : NaN;
  const maxValue = maxAttr !== null && maxAttr.trim().length ? Number(maxAttr) : NaN;
  let next = parsed;
  if (Number.isFinite(minValue)) next = Math.max(next, minValue);
  if (Number.isFinite(maxValue)) next = Math.min(next, maxValue);
  const stepRaw = String(input.getAttribute("step") ?? "").trim();
  const forceInteger = !stepRaw.length || stepRaw === "1";
  if (forceInteger) next = Math.round(next);
  const nextText = String(next);
  if (nextText !== input.value) {
    input.value = nextText;
    return true;
  }
  return false;
}

function computeZoomPanOffset(position: number, zoom: number): number {
  return Math.round((50 - position) * (zoom - 1) * 100) / 100;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeStExpressionImageOptions(raw: unknown, fallback: StExpressionImageOptions): StExpressionImageOptions {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const zoom = toNumber(obj.zoom);
  const positionX = toNumber(obj.positionX);
  const positionY = toNumber(obj.positionY);
  return {
    zoom: clamp(zoom ?? fallback.zoom, 0.5, 3),
    positionX: clamp(positionX ?? fallback.positionX, 0, 100),
    positionY: clamp(positionY ?? fallback.positionY, 0, 100),
  };
}

export function cloneCustomStatDefinition(definition: CustomStatDefinition): CustomStatDefinition {
  const kind = normalizeCustomStatKind(definition.kind);
  const enumOptions = normalizeCustomEnumOptions(definition.enumOptions);
  const textMaxLength = normalizeCustomTextMaxLength(definition.textMaxLength);
  const booleanTrueLabel = String(definition.booleanTrueLabel ?? "enabled").trim().slice(0, 40) || "enabled";
  const booleanFalseLabel = String(definition.booleanFalseLabel ?? "disabled").trim().slice(0, 40) || "disabled";

  return {
    id: String(definition.id ?? "").trim().toLowerCase(),
    kind,
    label: String(definition.label ?? "").trim(),
    description: typeof definition.description === "string" ? definition.description : undefined,
    behaviorGuidance: typeof definition.behaviorGuidance === "string" ? definition.behaviorGuidance : undefined,
    defaultValue: normalizeCustomStatDefaultValue({
      kind,
      defaultValue: definition.defaultValue,
      enumOptions,
      textMaxLength,
      dateTimeMode: definition.dateTimeMode,
    }),
    maxDeltaPerTurn: kind === "numeric"
      ? (definition.maxDeltaPerTurn === undefined ? undefined : Number(definition.maxDeltaPerTurn))
      : undefined,
    enumOptions: kind === "enum_single" ? enumOptions : undefined,
    booleanTrueLabel: kind === "boolean" ? booleanTrueLabel : undefined,
    booleanFalseLabel: kind === "boolean" ? booleanFalseLabel : undefined,
    textMaxLength: kind === "text_short" || kind === "array" ? textMaxLength : undefined,
    dateTimeMode: kind === "date_time"
      ? (definition.dateTimeMode === "structured" ? "structured" : "timestamp")
      : undefined,
    track: Boolean(definition.track),
    trackCharacters: Boolean(definition.globalScope ? true : (definition.trackCharacters ?? definition.track)),
    trackUser: Boolean(definition.globalScope ? true : (definition.trackUser ?? definition.track)),
    globalScope: Boolean(definition.globalScope),
    privateToOwner: Boolean(definition.globalScope ? false : definition.privateToOwner),
    showOnCard: Boolean(definition.showOnCard),
    showInGraph: kind === "numeric" && Boolean(definition.showInGraph),
    includeInInjection: Boolean(definition.includeInInjection),
    color: typeof definition.color === "string" ? definition.color : undefined,
    promptOverride: typeof definition.promptOverride === "string"
      ? definition.promptOverride
      : (typeof definition.sequentialPromptTemplate === "string" ? definition.sequentialPromptTemplate : undefined),
    sequentialGroup: typeof (definition as { sequentialGroup?: string }).sequentialGroup === "string"
      ? String((definition as { sequentialGroup?: string }).sequentialGroup).trim().toLowerCase()
      : undefined,
  };
}

const DEFAULT_BUILT_IN_NUMERIC_STAT_UI: BuiltInNumericStatUiSettings = {
  affection: { showOnCard: true, showInGraph: true, includeInInjection: true },
  trust: { showOnCard: true, showInGraph: true, includeInInjection: true },
  desire: { showOnCard: true, showInGraph: true, includeInInjection: true },
  connection: { showOnCard: true, showInGraph: true, includeInInjection: true },
};

export function cloneBuiltInNumericStatUi(settings: Partial<BuiltInNumericStatUiSettings> | null | undefined): BuiltInNumericStatUiSettings {
  const row = (key: keyof BuiltInNumericStatUiSettings): BuiltInNumericStatUiSettings[typeof key] => {
    const fallback = DEFAULT_BUILT_IN_NUMERIC_STAT_UI[key];
    const raw = settings?.[key];
    return {
      showOnCard: Boolean(raw?.showOnCard ?? fallback.showOnCard),
      showInGraph: Boolean(raw?.showInGraph ?? fallback.showInGraph),
      includeInInjection: Boolean(raw?.includeInInjection ?? fallback.includeInInjection),
    };
  };
  return {
    affection: row("affection"),
    trust: row("trust"),
    desire: row("desire"),
    connection: row("connection"),
  };
}

export const BUILT_IN_STAT_LABELS: Record<"affection" | "trust" | "desire" | "connection" | "mood" | "lastThought", string> = {
  affection: "Affection",
  trust: "Trust",
  desire: "Desire",
  connection: "Connection",
  mood: "Mood",
  lastThought: "Last Thought",
};
export const BUILT_IN_NUMERIC_STAT_KEY_LIST = ["affection", "trust", "desire", "connection"] as const;
export const BUILT_IN_TRACKABLE_STAT_KEY_LIST = ["affection", "trust", "desire", "connection", "mood", "lastThought"] as const;

export function toCustomStatSlug(label: string): string {
  const normalized = String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!normalized) return "stat";
  const prefixed = /^[a-z]/.test(normalized) ? normalized : `s_${normalized}`;
  return prefixed.slice(0, 32).replace(/_+$/g, "");
}

export function suggestUniqueCustomStatId(base: string, existing: Set<string>): string {
  const root = (toCustomStatSlug(base) || "stat").slice(0, 32);
  if (!existing.has(root) && CUSTOM_STAT_ID_REGEX.test(root) && !RESERVED_CUSTOM_STAT_IDS.has(root)) {
    return root;
  }
  for (let i = 2; i < 10_000; i += 1) {
    const suffix = `_${i}`;
    const maxBaseLength = Math.max(1, 32 - suffix.length);
    const candidateRoot = root.slice(0, maxBaseLength).replace(/_+$/g, "") || "stat";
    const candidate = `${candidateRoot}${suffix}`;
    if (existing.has(candidate)) continue;
    if (!CUSTOM_STAT_ID_REGEX.test(candidate)) continue;
    if (RESERVED_CUSTOM_STAT_IDS.has(candidate)) continue;
    return candidate;
  }
  return `stat_${Date.now().toString().slice(-4)}`;
}

function stripHiddenReasoningBlocks(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<\s*(think|analysis|reasoning)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(think|analysis|reasoning)[^>]*>/gi, "")
    .trim();
}

export function sanitizeGeneratedSequentialTemplate(raw: string): string {
  let text = stripHiddenReasoningBlocks(raw);
  if (!text) return "";

  const fenceMatch = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  text = text
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .replace(/^sequential\s+prompt\s+override\s*:?\s*/i, "")
    .trim();

  if (text.startsWith("[") && text.endsWith("]")) {
    text = text.slice(1, -1).trim();
  }

  // Prefer the generated bullet block when extra chatter appears.
  const bulletLines = text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("- "));
  if (bulletLines.length >= 3) {
    text = bulletLines.slice(0, 6).join("\n");
  }

  return text.slice(0, 20_000);
}

export function sanitizeGeneratedCustomDescription(raw: string): string {
  let text = stripHiddenReasoningBlocks(raw);
  if (!text) return "";

  const fenceMatch = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text) as { description?: unknown };
      if (typeof parsed.description === "string" && parsed.description.trim()) {
        text = parsed.description.trim();
      }
    } catch {
      // Ignore malformed JSON and continue with raw text cleanup.
    }
  }

  text = text
    .replace(/^description\s*[:\-]\s*/i, "")
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();

  if (text.startsWith("- ")) {
    text = text.slice(2).trim();
  }

  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, CUSTOM_STAT_DESCRIPTION_MAX_LENGTH).trim();
}

export function sanitizeGeneratedBehaviorGuidance(raw: string): string {
  let text = stripHiddenReasoningBlocks(raw);
  if (!text) return "";

  const fenceMatch = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim();
  }

  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(line => `- ${line}`);

  if (lines.length) {
    return lines.join("\n").slice(0, 2000);
  }

  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return `- ${compact}`.slice(0, 2000);
}

export function getGlobalStExpressionImageOptions(settings: BetterSimTrackerSettings): StExpressionImageOptions {
  return sanitizeStExpressionImageOptions(
    {
      zoom: settings.stExpressionImageZoom,
      positionX: settings.stExpressionImagePositionX,
      positionY: settings.stExpressionImagePositionY,
    },
    DEFAULT_ST_EXPRESSION_IMAGE_OPTIONS,
  );
}

function getResolvedStExpressionImageOptions(
  settings: BetterSimTrackerSettings,
  characterName: string,
  characterAvatar?: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id" | "kind"> | null,
): StExpressionImageOptions {
  const globalOptions = getGlobalStExpressionImageOptions(settings);
  if (!shouldUseConfiguredOwnerDefaults(null, characterName, registryEntry?.id ?? null, registryEntry?.kind ?? null)) {
    return globalOptions;
  }
  const entry = resolveCharacterDefaultsEntry(settings, { name: characterName, avatar: characterAvatar });
  const override = entry?.stExpressionImageOptions;
  if (!override || typeof override !== "object") return globalOptions;
  return sanitizeStExpressionImageOptions(override, globalOptions);
}

function toSpriteList(data: unknown): SpriteEntry[] {
  if (Array.isArray(data)) return data as SpriteEntry[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.sprites)) return record.sprites as SpriteEntry[];
    if (Array.isArray(record.data)) return record.data as SpriteEntry[];
  }
  return [];
}

function sanitizeExpressionLabel(value: string): string {
  return value.trim().toLowerCase();
}

function buildExpressionSpriteCache(list: SpriteEntry[]): CachedExpressionSprites {
  const byLabel: Record<string, string[]> = {};
  for (const item of list) {
    const label = sanitizeExpressionLabel(String(item.label ?? ""));
    const path = String(item.path ?? "").trim();
    if (!label || !path) continue;
    if (!Array.isArray(byLabel[label])) byLabel[label] = [];
    byLabel[label].push(path);
  }
  return { fetchedAt: Date.now(), byLabel };
}

function cacheKeyForCharacter(name: string): string {
  return name.trim().toLowerCase();
}

function getCachedExpressionSpriteUrl(characterName: string, expressionLabel: string): string | null {
  const cache = stExpressionCache.get(cacheKeyForCharacter(characterName));
  if (!cache) return null;
  const list = cache.byLabel[sanitizeExpressionLabel(expressionLabel)];
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first && first.trim() ? first.trim() : null;
}

function isExpressionCacheStale(characterName: string): boolean {
  const cache = stExpressionCache.get(cacheKeyForCharacter(characterName));
  if (!cache) return true;
  return Date.now() - cache.fetchedAt > ST_EXPRESSION_CACHE_TTL_MS;
}

function scheduleExpressionSpriteFetch(
  characterName: string,
  settings: BetterSimTrackerSettings,
  onRerender?: () => void,
): void {
  const key = cacheKeyForCharacter(characterName);
  if (!key || stExpressionFetchInFlight.has(key)) return;
  stExpressionFetchInFlight.add(key);
  fetch(`/api/sprites/get?name=${encodeURIComponent(characterName)}`, { method: "GET" })
    .then(response => {
      if (!response.ok) throw new Error(`status_${response.status}`);
      return response.json();
    })
    .then(data => {
      const list = toSpriteList(data);
      stExpressionCache.set(key, buildExpressionSpriteCache(list));
      logDebug(settings, "moodImages", "st.expressions.cache.update", { characterName, count: list.length });
      onRerender?.();
    })
    .catch(error => {
      logDebug(settings, "moodImages", "st.expressions.cache.error", {
        characterName,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      stExpressionFetchInFlight.delete(key);
    });
}

function getMappedExpressionLabel(
  settings: BetterSimTrackerSettings,
  characterName: string,
  moodLabel: MoodLabel,
  characterAvatar?: string,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id" | "kind"> | null,
): string {
  const entry = shouldUseConfiguredOwnerDefaults(null, characterName, registryEntry?.id ?? null, registryEntry?.kind ?? null)
    ? resolveCharacterDefaultsEntry(settings, { name: characterName, avatar: characterAvatar })
    : {};
  const rawCharacterMap = entry?.moodExpressionMap as Record<string, unknown> | undefined;
  const readMappedValue = (map: Record<string, unknown> | undefined): string => {
    if (!map) return "";
    const direct = map[moodLabel];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    for (const [key, value] of Object.entries(map)) {
      if (typeof value !== "string" || !value.trim()) continue;
      const normalized = normalizeMoodLabel(key);
      if (normalized === moodLabel) return value.trim();
    }
    return "";
  };
  const characterOverride = readMappedValue(rawCharacterMap);
  if (characterOverride) return characterOverride;
  const rawGlobalMap = settings.moodExpressionMap as Record<string, unknown> | undefined;
  const globalOverride = readMappedValue(rawGlobalMap);
  if (globalOverride) return globalOverride;
  return DEFAULT_MOOD_EXPRESSION_MAP[moodLabel] ?? "neutral";
}

function getMoodImageUrl(
  settings: BetterSimTrackerSettings,
  characterName: string,
  moodRaw: string,
  characterAvatar: string | undefined,
  registryEntry?: Pick<TrackerEntityRegistryEntry, "id" | "kind"> | null,
  onRerender?: () => void,
): string | null {
  const entry = shouldUseConfiguredOwnerDefaults(null, characterName, registryEntry?.id ?? null, registryEntry?.kind ?? null)
    ? resolveCharacterDefaultsEntry(settings, { name: characterName, avatar: characterAvatar })
    : {};
  const normalizedMood = (normalizeMoodLabel(moodRaw) ?? "Neutral") as MoodLabel;
  const source = getResolvedMoodSource(settings, characterName, characterAvatar, registryEntry);

  if (source === "bst_images") {
    const moodImages = entry?.moodImages as Record<string, string> | undefined;
    const url = moodImages?.[normalizedMood];
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }

  const expression = getMappedExpressionLabel(settings, characterName, normalizedMood, characterAvatar, registryEntry);
  const cachedUrl = getCachedExpressionSpriteUrl(characterName, expression);
  if (cachedUrl) return cachedUrl;
  if (isExpressionCacheStale(characterName)) {
    scheduleExpressionSpriteFetch(characterName, settings, onRerender);
  }
  logDebug(settings, "moodImages", "st.expressions.missing", { characterName, mood: normalizedMood, expression });
  return null;
}

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

function colorFromName(name: string): string {
  const seed = hslFromName(name);
  return hslToHex(seed.h, seed.s, seed.l);
}

function hslFromName(name: string): { h: number; s: number; l: number } {
  const hash = hashName(name);
  return {
    h: hash % 360,
    s: 46 + (hash % 22),
    l: 24 + ((hash >> 5) % 10),
  };
}

function hashName(name: string): number {
  let hash = 0;
  const text = name.trim().toLowerCase();
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s / 100, 0, 1);
  const light = clamp(l / 100, 0, 1);
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const hPrime = hue / 60;
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hPrime >= 0 && hPrime < 1) {
    r1 = chroma;
    g1 = x;
  } else if (hPrime >= 1 && hPrime < 2) {
    r1 = x;
    g1 = chroma;
  } else if (hPrime >= 2 && hPrime < 3) {
    g1 = chroma;
    b1 = x;
  } else if (hPrime >= 3 && hPrime < 4) {
    g1 = x;
    b1 = chroma;
  } else if (hPrime >= 4 && hPrime < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }
  const match = light - chroma / 2;
  return rgbToHex({
    r: (r1 + match) * 255,
    g: (g1 + match) * 255,
    b: (b1 + match) * 255,
  });
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function trimAutoCardColorAssignments(): void {
  const overflow = autoCardColorAssignments.size - AUTO_CARD_COLOR_CACHE_LIMIT;
  if (overflow <= 0) return;
  const toDrop = [...autoCardColorAssignments.entries()]
    .sort((a, b) => a[1].seenAt - b[1].seenAt)
    .slice(0, overflow);
  for (const [key] of toDrop) {
    autoCardColorAssignments.delete(key);
  }
}

function pickDistinctAutoHue(baseHue: number, takenHues: number[]): number {
  if (!takenHues.length) return baseHue;
  let bestHue = baseHue;
  let bestScore = -1;
  for (let i = 0; i < 360; i += 1) {
    const candidate = (baseHue + i * 137) % 360;
    const minDist = Math.min(...takenHues.map(hue => hueDistance(hue, candidate)));
    if (minDist > bestScore) {
      bestScore = minDist;
      bestHue = candidate;
    }
    if (minDist >= AUTO_CARD_MIN_HUE_DISTANCE) {
      return candidate;
    }
  }
  return bestHue;
}

export function getStableAutoCardColor(name: string): string {
  const key = normalizeName(name);
  if (!key) return colorFromName(name);
  const now = Date.now();
  const existing = autoCardColorAssignments.get(key);
  if (existing) {
    existing.seenAt = now;
    return existing.color;
  }

  const hash = hashName(key);
  const baseHue = hash % 360;
  const saturation = 52 + ((hash >> 9) % 14); // 52..65
  const lightness = 24 + ((hash >> 13) % 10); // 24..33
  const takenHues = [...autoCardColorAssignments.values()].map(assignment => assignment.hue);
  const hue = pickDistinctAutoHue(baseHue, takenHues);
  const color = hslToHex(hue, saturation, lightness);
  autoCardColorAssignments.set(key, { hue, color, seenAt: now });
  trimAutoCardColorAssignments();
  return color;
}

function allocateCharacterColors(names: string[]): Record<string, string> {
  const unique = Array.from(new Set(names.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  if (!unique.length) return {};
  const out: Record<string, string> = {};

  for (const name of unique) {
    out[name] = getStableAutoCardColor(name);
  }
  return out;
}

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.${ROOT_CLASS} {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  pointer-events: auto;
}
.bst-scene-root {
  margin: 8px 0 10px;
  display: grid;
  gap: 8px;
  pointer-events: auto;
}
.bst-loading {
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(165deg, color-mix(in srgb, var(--bst-card) 86%, #ffffff 14%), color-mix(in srgb, var(--bst-card) 70%, #000 30%));
  border-radius: 12px;
  color: #f3f5f9;
  padding: 10px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04) inset;
}
.bst-loading-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}
.bst-loading-sub {
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.82;
}
.bst-loading-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
.bst-loading-stop {
  min-width: 120px;
  padding: 8px 16px;
  font-weight: 600;
}
.bst-btn-danger {
  border-color: rgba(255,99,99,0.45);
  background: rgba(255,72,72,0.18);
  color: #fff;
}
.bst-btn-danger:hover {
  border-color: rgba(255,120,120,0.7);
  background: rgba(255,72,72,0.3);
}
.bst-loading-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  overflow: hidden;
}
.bst-loading-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--bst-accent), #ffd38f);
  transition: width 0.25s ease;
  min-width: 2px;
}
.bst-loading-track-indeterminate .bst-loading-fill {
  width: 42%;
  animation: bst-indeterminate-slide 1.1s ease-in-out infinite;
}
@keyframes bst-indeterminate-slide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(30%); }
  100% { transform: translateX(230%); }
}
.bst-root-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.bst-root-actions .bst-root-action-main {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  padding: 5px 13px;
  border: 1px solid color-mix(in srgb, var(--bst-accent) 50%, rgba(255,255,255,0.30) 50%);
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--bst-accent) 30%, transparent 70%), transparent 55%),
    linear-gradient(145deg, rgba(16,22,34,0.95), rgba(9,13,22,0.92));
  box-shadow:
    0 10px 20px rgba(0,0,0,0.30),
    0 0 0 1px rgba(255,255,255,0.05) inset,
    0 1px 0 rgba(255,255,255,0.08) inset;
  color: #f1f7ff;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 0 rgba(0,0,0,0.45);
}
.bst-root-actions .bst-root-action-main:hover {
  border-color: color-mix(in srgb, var(--bst-accent) 76%, rgba(255,255,255,0.24) 24%);
  filter: brightness(1.06);
  transform: translateY(-1px);
}
.bst-root-actions .bst-root-action-main:active {
  transform: translateY(1px);
}
.bst-root-actions .bst-root-action-icon {
  width: 14px;
  min-width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  opacity: 0.95;
}
.bst-root-actions .bst-root-action-label {
  white-space: nowrap;
}
.bst-root-actions .bst-root-action-retrack {
  width: 32px;
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  padding: 0;
  font-size: 15px;
  line-height: 1;
  border: 1px solid color-mix(in srgb, var(--bst-accent) 72%, #ffffff 28%);
  background:
    radial-gradient(85% 85% at 28% 24%, rgba(255,255,255,0.28), transparent 48%),
    radial-gradient(circle at 70% 76%, color-mix(in srgb, var(--bst-accent) 32%, #0f1523 68%), #0f1523);
  box-shadow:
    0 10px 20px rgba(0,0,0,0.33),
    0 0 0 1px rgba(255,255,255,0.07) inset;
}
.bst-root-actions .bst-root-action-summary {
  width: 32px;
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  border: 1px solid color-mix(in srgb, var(--bst-accent) 55%, #ffffff 45%);
  background:
    radial-gradient(86% 86% at 28% 24%, rgba(255,255,255,0.24), transparent 50%),
    linear-gradient(145deg, rgba(14,20,31,0.96), rgba(10,14,24,0.94));
  box-shadow:
    0 8px 18px rgba(0,0,0,0.30),
    0 0 0 1px rgba(255,255,255,0.06) inset;
}
.bst-root-actions .bst-root-action-summary:hover {
  border-color: color-mix(in srgb, var(--bst-accent) 76%, #ffffff 24%);
  filter: brightness(1.07);
  transform: translateY(-1px);
}
.bst-root-actions .bst-root-action-summary:active {
  transform: translateY(1px);
}
.bst-root-actions .bst-root-action-summary.is-loading {
  cursor: progress;
  opacity: 0.86;
  filter: saturate(0.9);
  transform: none;
}
.bst-root-actions .bst-root-action-summary.is-loading:hover,
.bst-root-actions .bst-root-action-summary.is-loading:active {
  transform: none;
  filter: saturate(0.9);
}
.bst-root-actions .bst-root-action-summary.is-loading span {
  display: inline-block;
  animation: bst-summary-spin 1s linear infinite;
}
@keyframes bst-summary-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.bst-root-actions .bst-root-action-retrack:hover {
  border-color: color-mix(in srgb, var(--bst-accent) 88%, #ffffff 12%);
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.bst-root-actions .bst-root-action-retrack:active {
  transform: translateY(1px);
}
.bst-root-actions .bst-root-action-retrack span {
  display: inline-block;
  transition: transform .18s ease;
}
.bst-root-actions .bst-root-action-retrack:hover span {
  transform: rotate(-38deg);
}
.bst-root-actions .bst-root-action-retrack:focus-visible,
.bst-root-actions .bst-root-action-summary:focus-visible,
.bst-root-actions .bst-root-action-main:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.88);
  outline-offset: 1px;
}
.bst-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(165deg, color-mix(in srgb, var(--bst-card-local, var(--bst-card)) 88%, #ffffff 12%), color-mix(in srgb, var(--bst-card-local, var(--bst-card)) 72%, #000 28%));
  border: 1px solid color-mix(in srgb, var(--bst-card-local, var(--bst-accent)) 46%, #ffffff 54%);
  border-radius: var(--bst-radius);
  color: #fff;
  box-shadow: 0 8px 20px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.06) inset;
  padding: 11px 12px;
  transition: box-shadow .15s ease, transform .15s ease, border-color .2s ease;
}
.bst-card.bst-card-new {
  animation: bst-card-enter .26s ease-out;
}
@keyframes bst-card-enter {
  0% { opacity: 0; transform: translateY(6px) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.bst-card-inactive {
  border-color: rgba(255,255,255,0.12);
  box-shadow: 0 4px 12px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.03) inset;
}
.bst-card-inactive::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(5, 7, 12, 0.30);
  pointer-events: none;
}
.bst-card-inactive .bst-state {
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.9);
}
.bst-inactive-icon {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.8;
  display: inline-flex;
  align-items: center;
  transform: translateY(1px);
}
.bst-archived-icon {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.8;
  display: inline-flex;
  align-items: center;
  transform: translateY(1px);
}
.bst-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
}
.bst-name {
  font-weight: 700;
  letter-spacing: 0.2px;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bst-state {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.14);
  flex-shrink: 0;
}
.bst-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.bst-actions .bst-mini-btn {
  border-color: var(--bst-action-border, rgba(255,255,255,0.42));
  background: var(--bst-action-bg, linear-gradient(180deg, rgba(14, 18, 30, 0.92), rgba(10, 14, 24, 0.92)));
  color: var(--bst-action-text, #f6f8ff);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 1px 0 rgba(255,255,255,0.04);
}
.bst-actions .bst-mini-btn:hover {
  border-color: var(--bst-action-border-hover, rgba(255,255,255,0.6));
  background: var(--bst-action-bg-hover, linear-gradient(180deg, rgba(18, 24, 38, 0.95), rgba(12, 16, 28, 0.95)));
  color: var(--bst-action-text-hover, var(--bst-action-text, #ffffff));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16), 0 2px 8px rgba(0,0,0,0.18);
}
.bst-actions .bst-mini-btn:focus-visible {
  outline: 2px solid var(--bst-action-focus, rgba(255,255,255,0.7));
  outline-offset: 2px;
}
.bst-mini-btn {
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 7px;
  padding: 2px 6px;
  background: rgba(16,21,32,0.8);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: border-color .16s ease, background-color .16s ease, transform .1s ease;
}
.bst-mini-btn:hover {
  border-color: rgba(255,255,255,0.42);
  background: rgba(22,28,42,0.92);
}
.bst-mini-btn:active {
  transform: translateY(1px);
}
.bst-mini-btn-icon {
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  text-align: center;
}
.bst-mini-btn-accent {
  border-color: color-mix(in srgb, var(--bst-accent) 55%, #ffffff 45%);
  background: color-mix(in srgb, var(--bst-accent) 22%, #131a28 78%);
}
.bst-mini-btn-accent:hover {
  border-color: color-mix(in srgb, var(--bst-accent) 78%, #ffffff 22%);
  background: color-mix(in srgb, var(--bst-accent) 33%, #131a28 67%);
}
.bst-row { margin: 5px 0; }
.bst-row.bst-row-non-numeric {
  margin-top: 7px;
}
.bst-row.bst-row-non-numeric .bst-label {
  align-items: flex-start;
  gap: 8px;
}
.bst-row.bst-row-non-numeric .bst-label > span:first-child {
  min-width: 0;
}
.bst-array-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.bst-array-item-chip {
  display: inline-block;
  max-width: min(72%, 360px);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 60%, #ffffff 40%);
  background: color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 18%, rgba(13, 18, 30, 0.9) 82%);
  color: #f5f9ff;
  font-size: 11px;
  line-height: 1.2;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-array-item-empty {
  font-size: 11px;
  opacity: 0.75;
}
.bst-array-toggle {
  border: 1px solid rgba(255,255,255,0.34);
  background: rgba(14, 20, 30, 0.82);
  color: #dbe8ff;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.2;
  padding: 2px 8px;
  cursor: pointer;
}
.bst-array-toggle:hover {
  border-color: rgba(255,255,255,0.54);
}
.bst-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 2px;
  opacity: 0.93;
}
.bst-non-numeric-chip {
  display: inline-block;
  max-width: min(70%, 340px);
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 60%, #ffffff 40%);
  background: color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 18%, rgba(13, 18, 30, 0.9) 82%);
  color: #f5f9ff;
  font-size: 11px;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow: visible;
  text-overflow: clip;
}
.bst-text-short-value {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 45%, rgba(255,255,255,0.18) 55%);
  background: color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 10%, rgba(10, 15, 24, 0.82) 90%);
  color: #f5f9ff;
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-text-short-value-text {
  display: -webkit-box;
  width: 100%;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bst-text-short-value.bst-text-short-expanded .bst-text-short-value-text {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
.bst-expand-toggle {
  margin-top: 8px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  appearance: none;
  -webkit-appearance: none;
  width: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  border: 1px solid rgba(255,255,255,0.3) !important;
  border-radius: 999px !important;
  background: rgba(10, 15, 24, 0.72) !important;
  color: #ffffff !important;
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, transform .15s ease;
}
.bst-expand-toggle:hover {
  border-color: rgba(255,255,255,0.5);
  background: rgba(18, 25, 36, 0.8);
}
.bst-expand-toggle:active {
  transform: translateY(1px);
}
.bst-expand-toggle:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.88);
  outline-offset: 1px;
}
.bst-track {
  background: rgba(255,255,255,0.14);
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
}
.bst-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--bst-stat-color, var(--bst-accent)), color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 65%, #ffd38f 35%));
  box-shadow: 0 0 10px color-mix(in srgb, var(--bst-stat-color, var(--bst-accent)) 70%, #ffffff 30%);
  transition: width 0.5s ease;
}
.bst-row.bst-row-changed .bst-track {
  animation: bst-stat-track-pulse .45s ease;
}
@keyframes bst-stat-track-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  35% { box-shadow: 0 0 0 2px rgba(255,255,255,0.22); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
}
.bst-mood { margin-top: 10px; }
.bst-mood-emoji {
  display: block;
  font-size: var(--bst-mood-symbol-font-size, 18px);
  line-height: 1.1;
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
}
.bst-mood-wrap {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  max-width: 100%;
}
.bst-mood-wrap--image {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 14px;
  width: 100%;
  justify-content: center;
}
.bst-mood-image-frame {
  display: block;
  width: clamp(64px, 11vw, 84px);
  height: clamp(64px, 11vw, 84px);
  border-radius: clamp(12px, 3vw, 16px);
  justify-self: center;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--bst-card-local, var(--bst-accent)) 55%, #ffffff 45%);
  box-shadow: 0 12px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.25);
}
.bst-mood-image-trigger {
  display: inline-block !important;
  width: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100%;
  border: none !important;
  margin: 0;
  padding: 0 !important;
  background: transparent !important;
  color: inherit !important;
  line-height: 0;
  appearance: none;
  touch-action: manipulation;
  cursor: zoom-in !important;
  border-radius: clamp(12px, 3vw, 16px);
}
.bst-mood-image-trigger:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.85);
  outline-offset: 2px;
}
.bst-mood-image-trigger .bst-mood-image-frame {
  display: block;
}
.bst-mood-image-frame--st-expression {
  --bst-st-expression-zoom: 1.2;
  --bst-st-expression-pos-x: 50%;
  --bst-st-expression-pos-y: 20%;
}
.bst-mood-image {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover;
  object-position: center center;
  display: block;
  cursor: zoom-in;
}
.bst-mood-image--st-expression {
  object-position: center center;
  transform-origin: center center;
}
.bst-mood-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.10);
}
.bst-mood-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  max-width: 100%;
  min-width: var(--bst-mood-symbol-min-width, 34px);
  min-height: var(--bst-mood-symbol-min-height, 34px);
  padding: 4px 6px;
  border-radius: var(--bst-mood-symbol-radius, 12px);
  background: color-mix(in srgb, var(--bst-card-local, var(--bst-accent)) 16%, rgba(255,255,255,0.12) 84%);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2), 0 6px 16px rgba(0,0,0,0.28);
}
.bst-mood-bubble {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 56px;
  padding: 10px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.28);
  background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 10px 20px rgba(0,0,0,0.26);
  font-size: 13px;
  max-width: 520px;
  color: rgba(255,255,255,0.9);
  text-align: left;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-mood-bubble-text {
  display: -webkit-box;
  width: 100%;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-thought.bst-thought-expanded .bst-thought-text,
.bst-mood-bubble.bst-thought-expanded .bst-mood-bubble-text {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
@media (max-width: 560px) {
  .bst-mood-wrap {
    width: 100%;
  }
  .bst-mood-wrap--image {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
  }
  .bst-mood-image-frame {
    width: clamp(78px, 26vw, 110px);
    height: clamp(78px, 26vw, 110px);
  }
  .bst-mood-bubble {
    min-height: 52px;
    max-width: 100%;
    align-items: flex-start;
  }
}
.bst-delta {
  font-size: 10px;
  margin-left: 6px;
  opacity: 0.9;
}
.bst-delta-up { color: #94f7a8; }
.bst-delta-down { color: #ff9ea8; }
.bst-delta-flat { color: #d4d9e8; }
.bst-delta-up::before { content: "▲ "; }
.bst-delta-down::before { content: "▼ "; }
.bst-delta-flat::before { content: "• "; }
.bst-thought {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.3;
  padding: 8px;
  border-radius: 10px;
  background: rgba(0,0,0,0.18);
  font-style: italic;
  color: rgba(243,245,249,0.78);
  display: flex;
  flex-direction: column;
}
.bst-thought-text {
  display: -webkit-box;
  width: 100%;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-empty {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 11px;
  color: rgba(243,245,249,0.68);
  background: rgba(0,0,0,0.16);
  border: 1px dashed rgba(255,255,255,0.18);
}
.bst-root-collapsed .bst-body {
  display: none;
}
.bst-card-collapsed .bst-body {
  display: none;
}
.bst-collapsed-summary {
  display: none;
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.92;
  align-items: center;
  gap: 8px;
}
.bst-root-collapsed .bst-collapsed-summary,
.bst-card-collapsed .bst-collapsed-summary {
  display: flex;
}
.bst-collapsed-mood {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  font-size: 14px;
}
.bst-settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.46);
  z-index: 2147483000;
  pointer-events: auto;
}
.bst-settings {
  position: fixed;
  z-index: 2147483001;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(820px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  background:
    radial-gradient(1300px 460px at 0% 0%, rgba(255, 98, 123, 0.14), transparent 62%),
    radial-gradient(980px 360px at 100% 0%, rgba(86, 189, 255, 0.14), transparent 58%),
    #121621;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 16px;
  color: #fff;
  padding: 16px 16px 18px;
  pointer-events: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  font-family: "Segoe UI", "Trebuchet MS", sans-serif;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
}
.bst-surface-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.bst-surface-header-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.bst-surface-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  letter-spacing: 0.2px;
  font-weight: 800;
  color: #f3f5f9;
}
.bst-surface-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(220, 235, 255, 0.88);
}
.bst-surface-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.bst-surface-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.bst-surface-footer-end {
  justify-content: flex-end;
}
.bst-surface-footer-wrap {
  flex-wrap: wrap;
}
.bst-settings h3 { margin: 0; }
.bst-settings-top {
  position: sticky;
  top: -16px;
  z-index: 5;
  width: calc(100% + 32px);
  box-sizing: border-box;
  margin: -16px -16px 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, rgb(18, 24, 38), rgb(18, 24, 38));
  border-bottom: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 10px 28px rgba(4, 8, 14, 0.22);
}
.bst-settings-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.bst-settings-grid-compact { gap: 8px; }
.bst-settings-grid-single { grid-template-columns: minmax(0, 1fr); }
.bst-settings-grid .bst-check-grid {
  grid-column: 1 / -1;
}
.bst-settings-grid .bst-toggle-help {
  grid-column: 1 / -1;
  margin-top: -4px;
}
.bst-check-grid {
  display: grid;
  column-gap: 22px;
  row-gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.bst-toggle-block {
  margin-top: 8px;
}
.bst-check-grid-single { grid-template-columns: minmax(0, 1fr); }
.bst-mood-advanced-settings { margin-top: 8px; }
.bst-st-expression-control {
  display: grid;
  gap: 8px;
}
.bst-st-expression-summary {
  margin: 0;
  opacity: 0.82;
}
.bst-check-grid .bst-check {
  margin: 0;
  align-items: center;
  min-height: 30px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(11, 16, 27, 0.58);
  border-radius: 10px;
  padding: 6px 10px;
}
.bst-check-grid .bst-check:hover {
  border-color: rgba(168, 203, 245, 0.32);
  background: rgba(14, 20, 33, 0.72);
}
.bst-settings label,
.bst-custom-wizard label { font-size: 12px; display: flex; flex-direction: column; gap: 6px; color: rgba(241, 246, 255, 0.94); }
.bst-check { flex-direction: row !important; align-items: center; gap: 10px !important; }
.bst-check input[type="checkbox"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex: 0 0 19px;
  width: 19px;
  height: 19px;
  min-width: 19px;
  margin: 0;
  border-radius: 999px;
  border: 1px solid rgba(188, 212, 242, 0.55);
  background: linear-gradient(180deg, rgba(16, 27, 44, 0.88), rgba(10, 17, 30, 0.92));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 0 rgba(88, 173, 248, 0.0);
  position: relative;
  transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease, transform .12s ease;
  cursor: pointer;
}
.bst-check input[type="checkbox"]::before {
  content: "";
  display: block;
  width: 5px;
  height: 9px;
  border-right: 2px solid rgba(247, 250, 255, 0.96);
  border-bottom: 2px solid rgba(247, 250, 255, 0.96);
  transform: translate(-0.5px, -1px) rotate(45deg) scale(0);
  transform-origin: center;
  opacity: 0;
  transition: transform .14s ease, opacity .14s ease;
}
.bst-check input[type="checkbox"]:hover {
  border-color: rgba(206, 225, 249, 0.75);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 0 2px rgba(86, 180, 255, 0.18);
}
.bst-check input[type="checkbox"]:focus-visible {
  outline: 2px solid rgba(120, 214, 255, 0.56);
  outline-offset: 2px;
}
.bst-check input[type="checkbox"]:checked {
  border-color: #78c9ff;
  background: linear-gradient(180deg, #76c9ff, #2f87d7);
  border-color: color-mix(in srgb, var(--bst-accent) 66%, #d7edff 34%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bst-accent) 62%, #9fd8ff 38%),
    color-mix(in srgb, var(--bst-accent) 78%, #4eaef0 22%)
  );
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12), 0 0 0 2px rgba(86, 180, 255, 0.22);
}
.bst-check input[type="checkbox"]:checked::before {
  opacity: 1;
  transform: translate(-0.5px, -1px) rotate(45deg) scale(1);
}
.bst-check input[type="checkbox"]:active {
  transform: scale(0.94);
}
.bst-check-grid .bst-check.bst-check-disabled {
  opacity: 0.62;
  border-color: rgba(255,255,255,0.08);
  background: rgba(9, 13, 22, 0.5);
}
.bst-check-grid .bst-check.bst-check-disabled:hover {
  border-color: rgba(255,255,255,0.08);
  background: rgba(9, 13, 22, 0.5);
}
.bst-check input[type="checkbox"]:disabled {
  cursor: not-allowed;
  filter: grayscale(0.15);
  opacity: 0.9;
}
.bst-check input[type="checkbox"]:disabled:hover {
  border-color: rgba(188, 212, 242, 0.55);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 0 rgba(88, 173, 248, 0.0);
}
.bst-settings input:not([type="checkbox"]), .bst-settings select, .bst-settings textarea,
.bst-custom-wizard input:not([type="checkbox"]), .bst-custom-wizard select, .bst-custom-wizard textarea {
  background: #0d1220 !important;
  color: #f3f5f9 !important;
  border: 1px solid rgba(255,255,255,0.20) !important;
  border-radius: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.bst-settings input:not([type="checkbox"]),
.bst-settings select,
.bst-custom-wizard input:not([type="checkbox"]),
.bst-custom-wizard select {
  min-height: 36px;
}
.bst-settings input:not([type="checkbox"]):hover,
.bst-settings select:hover,
.bst-settings textarea:hover,
.bst-custom-wizard input:not([type="checkbox"]):hover,
.bst-custom-wizard select:hover,
.bst-custom-wizard textarea:hover {
  border-color: rgba(168, 203, 245, 0.48) !important;
  background: #101728 !important;
}
.bst-settings input:not([type="checkbox"]):focus-visible,
.bst-settings select:focus-visible,
.bst-settings textarea:focus-visible,
.bst-custom-wizard input:not([type="checkbox"]):focus-visible,
.bst-custom-wizard select:focus-visible,
.bst-custom-wizard textarea:focus-visible {
  outline: none;
  border-color: rgba(56,189,248,0.9) !important;
  box-shadow: 0 0 0 2px rgba(56,189,248,0.25);
}
.bst-settings label:focus-within,
.bst-custom-wizard label:focus-within {
  color: #e6f6ff;
}
.bst-settings textarea,
.bst-custom-wizard textarea {
  resize: vertical;
  min-height: 120px;
  font-family: Consolas, "Courier New", monospace;
  line-height: 1.35;
}
.bst-settings input::placeholder,
.bst-settings textarea::placeholder,
.bst-custom-wizard input::placeholder,
.bst-custom-wizard textarea::placeholder { color: rgba(243,245,249,0.6); }
.bst-settings-section {
  margin: 10px 0;
  padding: 12px 12px 13px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(180deg, rgba(11, 15, 25, 0.62), rgba(8, 11, 19, 0.56));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.bst-settings-section:hover {
  border-color: rgba(148, 189, 235, 0.28);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(2, 6, 12, 0.28);
}
.bst-color-inputs {
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  gap: 8px;
  width: 100%;
}
.bst-color-inputs input[type="color"] {
  width: 42px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(10,14,22,0.9);
}
.bst-color-inputs input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.bst-color-inputs input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.bst-color-inputs input[type="color"]::-moz-color-swatch {
  border: none;
  border-radius: 4px;
}
.bst-color-inputs input[type="text"] {
  flex: 1 1 auto;
  min-width: 120px;
}
.bst-quick-help {
  background: linear-gradient(135deg, rgba(10, 18, 32, 0.75), rgba(8, 12, 22, 0.75));
  border-color: rgba(56,189,248,0.25);
  box-shadow: inset 0 0 0 1px rgba(56,189,248,0.12);
}
.bst-quick-help .bst-help-line,
.bst-quick-help .bst-help-list {
  opacity: 0.95;
}
.bst-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  padding: 8px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(18, 24, 36, 0.6), rgba(10, 14, 22, 0.6));
  border: 1px solid rgba(255,255,255,0.08);
  position: relative;
  padding-left: 16px;
}
.bst-section-head::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(56,189,248,0.85), rgba(14,116,144,0.8));
  box-shadow: 0 0 8px rgba(56,189,248,0.25);
}
.bst-section-head:hover {
  background: linear-gradient(135deg, rgba(22, 30, 44, 0.75), rgba(12, 18, 28, 0.75));
  border-color: rgba(255,255,255,0.16);
}
.bst-section-head[aria-expanded="true"] {
  border-color: rgba(148, 189, 235, 0.32);
}
.bst-section-head:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.6);
  outline-offset: 2px;
}
.bst-settings-section h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  opacity: 0.9;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.bst-header-icon {
  font-size: 12px;
  opacity: 0.85;
}
.bst-section-toggle {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  background: rgba(14,18,28,0.8);
  color: #fff;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.bst-section-toggle:hover {
  border-color: rgba(255,255,255,0.4);
  background: rgba(20,26,38,0.9);
}
.bst-disclosure-icon,
.bst-section-icon,
.bst-prompt-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  line-height: 1;
  font-size: 18px;
  transition: transform .16s ease, color .16s ease;
  color: rgba(243,245,249,0.9);
  transform: rotate(0deg);
}
.bst-section-head:hover .bst-section-icon,
.bst-subdrawer > summary:hover .bst-disclosure-icon,
.bst-prompt-head:hover .bst-prompt-toggle {
  color: #ffffff;
}
.bst-section-collapsed .bst-section-icon {
  transform: rotate(-90deg);
}
.bst-section-collapsed .bst-section-body {
  display: none;
}
.bst-section-body {
  margin-top: 10px;
}
.bst-section-divider {
  position: relative;
  margin: 10px 0 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  opacity: 0.8;
  display: flex;
  align-items: center;
  gap: 10px;
  grid-column: 1 / -1;
}
.bst-section-divider::before,
.bst-section-divider::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.2), rgba(255,255,255,0.06));
}
.bst-minmax {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  opacity: 0.65;
}
.bst-validation {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #fbbf24;
  opacity: 0.95;
}
.bst-help-list {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  opacity: 0.92;
}
.bst-help-line {
  font-size: 12px;
  opacity: 0.9;
}
.bst-help-details {
  margin: 6px 0 10px;
}
.bst-help-details summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.85;
}
.bst-subdrawer {
  margin: 8px 0 2px;
  border: 1px solid rgba(255,255,255,0.1);
  border-left: 3px solid rgba(184, 194, 212, 0.42);
  border-radius: 12px;
  background: rgba(8, 13, 23, 0.56);
  overflow: hidden;
  transition: border-color .14s ease, box-shadow .14s ease, background-color .14s ease;
}
.bst-subdrawer > summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px 10px 14px;
  color: rgba(236, 244, 255, 0.95);
  font-size: 12px;
  font-weight: 700;
  background: linear-gradient(135deg, rgba(18, 24, 36, 0.7), rgba(10, 14, 22, 0.68));
  position: relative;
}
.bst-subdrawer:hover {
  border-color: rgba(194, 204, 223, 0.3);
  border-left-color: rgba(198, 208, 226, 0.58);
  background: rgba(10, 15, 26, 0.62);
}
.bst-subdrawer[open] {
  border-left-color: rgba(206, 216, 233, 0.74);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
.bst-subdrawer[open] > summary {
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.bst-subdrawer > summary:hover {
  background: linear-gradient(135deg, rgba(24, 31, 46, 0.82), rgba(13, 19, 31, 0.8));
}
.bst-subdrawer > summary:focus-visible {
  outline: 2px solid rgba(125, 211, 252, 0.55);
  outline-offset: 2px;
}
.bst-subdrawer > summary::-webkit-details-marker {
  display: none;
}
.bst-subdrawer-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.bst-subdrawer .bst-disclosure-icon {
  flex: 0 0 28px;
  color: rgba(233, 239, 248, 0.92);
  transform: rotate(-90deg);
}
.bst-subdrawer[open] > summary .bst-disclosure-icon {
  transform: rotate(0deg);
}
.bst-subdrawer > .bst-settings-grid {
  padding: 12px;
}
.bst-scene-order-list {
  display: grid;
  gap: 8px;
}
.bst-scene-order-empty {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px dashed rgba(255,255,255,0.16);
  font-size: 12px;
  color: rgba(226, 236, 250, 0.76);
}
.bst-scene-order-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  background: rgba(10, 16, 28, 0.62);
  padding: 8px 10px;
}
.bst-scene-order-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.bst-scene-order-name {
  font-size: 12px;
  color: rgba(241, 247, 255, 0.96);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bst-scene-order-id {
  font-size: 11px;
  color: rgba(208, 223, 244, 0.72);
  font-family: Consolas, "Courier New", monospace;
}
.bst-scene-order-actions {
  display: inline-flex;
  gap: 6px;
}
.bst-scene-stat-editor-group {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  background: rgba(10, 16, 28, 0.55);
  padding: 10px;
}
.bst-scene-stat-editor-group .bst-check-grid {
  margin-top: 0;
}
.bst-scene-stat-editor-group-title {
  font-size: 12px;
  font-weight: 700;
  color: rgba(236, 244, 255, 0.92);
  letter-spacing: 0.01em;
}
.bst-scene-plain-value {
  color: var(--bst-stat-color);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
}
.bst-prompts-stack {
  margin-top: 8px;
}
.bst-prompt-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}
.bst-prompt-caption {
  font-size: 12px;
  opacity: 0.8;
}
.bst-prompt-protocol {
  margin: 0;
  white-space: pre-wrap;
  background: #0b1020;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  padding: 8px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(243,245,249,0.75);
}
.bst-protocol-editable-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bst-protocol-editable-wrap .bst-prompt-reset {
  align-self: flex-start;
}
.bst-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(12,16,26,0.45);
  border: 1px solid rgba(255,255,255,0.08);
}
.bst-prompt-body {
  margin-top: 6px;
}
.bst-prompt-preview-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.bst-prompt-preview-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bst-prompt-preview-value {
  margin: 0;
  white-space: pre-wrap;
  background: #0b1020;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  padding: 8px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(243,245,249,0.78);
}
.bst-prompt-title {
  font-weight: 600;
  letter-spacing: 0.2px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bst-prompt-icon {
  font-size: 12px;
  opacity: 0.85;
}
.bst-prompt-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 18px;
  line-height: 1;
  margin-left: auto;
  color: rgba(243,245,249,0.9);
  transition: transform .16s ease, color .16s ease;
  transform: rotate(0deg);
}
.bst-prompt-head:hover .bst-prompt-toggle {
  color: #ffffff;
}
.bst-prompt-group.collapsed .bst-prompt-toggle {
  transform: rotate(-90deg);
}
.bst-prompt-group.collapsed .bst-prompt-body {
  display: none;
}
.bst-prompt-reset {
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 8px;
  background: rgba(14,18,28,0.8);
  color: #fff;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 12px;
  cursor: pointer;
  transition: border-color .16s ease, background-color .16s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bst-prompt-reset:hover {
  border-color: rgba(255,255,255,0.45);
  background: rgba(20,26,38,0.9);
}
.bst-prompt-generate {
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 8px;
  background: rgba(14,18,28,0.8);
  color: #fff;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 12px;
  cursor: pointer;
  transition: border-color .16s ease, background-color .16s ease, opacity .16s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bst-prompt-generate:hover {
  border-color: color-mix(in srgb, var(--bst-accent) 68%, #ffffff 32%);
  background: color-mix(in srgb, var(--bst-accent) 20%, rgba(20,26,38,0.9) 80%);
}
.bst-prompt-generate[data-loading="true"] {
  cursor: wait;
}
.bst-prompt-generate[data-loading="true"] .fa-solid {
  animation: bst-spin 0.9s linear infinite;
}
.bst-prompt-generate:disabled {
  opacity: 0.82;
}
.bst-prompt-ai-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bst-prompt-ai-status {
  font-size: 11px;
  opacity: 0.8;
  line-height: 1.35;
}
.bst-prompt-ai-status[data-state="loading"] {
  opacity: 1;
  color: #d4ecff;
}
.bst-prompt-ai-status[data-state="success"] {
  opacity: 1;
  color: #c4ffd4;
}
.bst-prompt-ai-status[data-state="error"] {
  opacity: 1;
  color: #ffcaca;
}
.bst-injection-prompt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  grid-column: 1 / -1;
}
.bst-prompt-inline .bst-prompt-head {
  border-radius: 14px 14px 0 0;
}
.bst-prompt-inline .bst-prompt-body {
  border-radius: 0 0 14px 14px;
}
.bst-btn .bst-btn-icon-left {
  margin-right: 6px;
}
.bst-open-settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.bst-btn {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 7px 10px;
  color: #fff;
  background: #23293a;
  cursor: pointer;
}
.bst-close-btn {
  min-width: 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
}
.bst-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}
.bst-btn-soft {
  border-color: color-mix(in srgb, var(--bst-accent) 45%, #ffffff 55%);
  background: color-mix(in srgb, var(--bst-accent) 16%, #1e2738 84%);
}
.bst-btn-danger {
  border-color: #d06a6a;
  color: #ffd2d2;
  background: #3a2020;
}
.bst-debug-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bst-settings-footer {
  position: sticky;
  bottom: -18px;
  z-index: 5;
  width: calc(100% + 32px);
  box-sizing: border-box;
  margin: 12px -16px -18px;
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: linear-gradient(180deg, rgba(18, 24, 38, 0.72), rgba(18, 24, 38, 0.96));
  border-top: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(6px);
}
.bst-debug-box {
  margin-top: 8px;
  background: #0b1020;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  padding: 8px;
  max-height: 220px;
  overflow: auto;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  white-space: pre-wrap;
}
.bst-custom-stats-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.bst-custom-stats-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.bst-custom-stats-status {
  margin-top: 8px;
  font-size: 12px;
}
.bst-custom-stats-status.is-success {
  color: #7bf2b6;
}
.bst-custom-stats-status.is-error {
  color: #ff9ea0;
}
.bst-custom-stats-status.is-info {
  color: #b8cae8;
}
.bst-custom-import-box {
  width: min(860px, 94vw);
  max-width: 100%;
  display: grid;
  gap: 10px;
}
.bst-custom-import-textarea {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.45;
}
.bst-custom-import-status {
  font-size: 12px;
}
.bst-custom-import-status.is-success {
  color: #7bf2b6;
}
.bst-custom-import-status.is-error {
  color: #ff9ea0;
}
.bst-custom-import-status.is-info {
  color: #b8cae8;
}
.bst-custom-stats-top-centered {
  justify-content: center;
}
.bst-custom-stats-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.bst-custom-stat-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(11, 16, 27, 0.58);
}
.bst-custom-stat-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.bst-custom-stat-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.bst-custom-stat-id {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  font-size: 11px;
  font-family: Consolas, "Courier New", monospace;
  opacity: 0.9;
}
.bst-custom-stat-meta {
  font-size: 11px;
  opacity: 0.85;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.bst-custom-stat-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bst-custom-stat-flag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.08);
  font-size: 11px;
  opacity: 0.9;
}
.bst-custom-stat-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  align-content: flex-start;
}
.bst-custom-stat-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.24);
  background: rgba(255,255,255,0.08);
  color: #d8e6ff;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.bst-custom-stat-toggle:hover {
  border-color: rgba(170, 214, 255, 0.8);
}
.bst-custom-stat-toggle-pill {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.14);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.bst-custom-stat-toggle-pill::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #d7dde8;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, background 0.15s ease;
}
.bst-custom-stat-toggle.is-on {
  border-color: rgba(123, 242, 182, 0.62);
  background: rgba(26, 68, 50, 0.38);
  color: #c9ffe6;
}
.bst-custom-stat-toggle.is-on .bst-custom-stat-toggle-pill {
  border-color: rgba(123, 242, 182, 0.7);
  background: rgba(93, 222, 161, 0.35);
}
.bst-custom-stat-toggle.is-on .bst-custom-stat-toggle-pill::after {
  transform: translateX(16px);
  background: #d9ffe8;
}
.bst-custom-stat-toggle.is-off {
  border-color: rgba(255, 158, 160, 0.45);
  background: rgba(64, 24, 30, 0.3);
  color: #ffd4d5;
}
.bst-custom-stat-toggle-label {
  font-size: 12px;
  font-weight: 600;
}
.bst-custom-stat-toggle.bst-custom-stat-toggle-compact {
  min-height: 26px;
  padding: 2px 8px;
  gap: 6px;
}
.bst-custom-stat-toggle.bst-custom-stat-toggle-compact .bst-custom-stat-toggle-pill {
  width: 28px;
  height: 15px;
}
.bst-custom-stat-toggle.bst-custom-stat-toggle-compact .bst-custom-stat-toggle-pill::after {
  width: 11px;
  height: 11px;
}
.bst-custom-stat-toggle.bst-custom-stat-toggle-compact.is-on .bst-custom-stat-toggle-pill::after {
  transform: translateX(13px);
}
.bst-custom-stat-toggle.bst-custom-stat-toggle-compact .bst-custom-stat-toggle-label {
  font-size: 11px;
  font-weight: 600;
}
.bst-character-toggle-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(13, 18, 29, 0.66), rgba(10, 14, 22, 0.54));
}
.bst-custom-stat-empty {
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  opacity: 0.82;
  background: rgba(6, 10, 18, 0.44);
}
.bst-custom-wizard-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 2147483250;
}
.bst-custom-wizard-backdrop.bst-custom-wizard-backdrop-top {
  z-index: 2147483350;
}
.bst-custom-wizard {
  position: fixed;
  z-index: 2147483251;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(760px, calc(100vw - 20px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.18);
  background: linear-gradient(180deg, rgba(13, 19, 31, 0.98), rgba(9, 14, 24, 0.98));
  box-shadow: 0 20px 54px rgba(0,0,0,0.5);
  color: #f3f5f9;
  padding: 12px 12px 14px;
}
.bst-custom-wizard.bst-custom-wizard-top {
  z-index: 2147483351;
}
.bst-custom-wizard.bst-custom-wizard-muted {
  pointer-events: none;
  filter: grayscale(0.2) brightness(0.75);
}
.bst-custom-wizard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.bst-custom-wizard-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.bst-custom-wizard-step {
  font-size: 12px;
  opacity: 0.84;
}
.bst-custom-wizard-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.bst-custom-wizard-grid-single {
  grid-template-columns: minmax(0, 1fr);
}
.bst-array-default-editor,
.bst-enum-options-editor {
  display: grid;
  gap: 8px;
}
.bst-array-default-list,
.bst-enum-options-list {
  display: grid;
  gap: 6px;
}
.bst-array-default-row,
.bst-enum-options-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.bst-array-default-row input,
.bst-enum-options-row input {
  width: 100%;
  min-width: 0;
}
.bst-array-default-actions,
.bst-enum-options-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bst-array-default-actions .bst-btn,
.bst-enum-options-actions .bst-btn {
  min-width: 96px;
}
.bst-icon-btn {
  width: 44px;
  height: 44px;
  min-width: 44px !important;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bst-custom-wizard-panel {
  display: none;
  margin-top: 8px;
}
.bst-custom-wizard-panel.is-active {
  display: block;
}
.bst-custom-wizard-error {
  display: none;
  margin-top: 8px;
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255,127,127,0.45);
  background: rgba(88, 19, 19, 0.5);
  color: #ffd6d6;
  font-size: 12px;
  white-space: pre-wrap;
}
.bst-custom-wizard-review {
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(7, 11, 19, 0.7);
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
}
.bst-custom-wizard-actions {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.bst-custom-wizard-actions .bst-btn {
  min-width: 96px;
}
.bst-custom-ai-row {
  margin-top: 8px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.bst-custom-ai-btn {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--bst-accent) 62%, #ffffff 38%);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bst-accent) 26%, #182338 74%),
    color-mix(in srgb, var(--bst-accent) 14%, #111b2b 86%)
  );
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    0 6px 16px rgba(0,0,0,0.28);
  font-weight: 600;
  letter-spacing: 0.2px;
  padding-inline: 12px;
  transition: transform .14s ease, box-shadow .16s ease, border-color .16s ease, filter .16s ease;
}
.bst-custom-ai-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--bst-accent) 74%, #ffffff 26%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 9px 20px rgba(0,0,0,0.34),
    0 0 0 1px color-mix(in srgb, var(--bst-accent) 36%, transparent);
  filter: brightness(1.03);
}
.bst-custom-ai-btn:active:not(:disabled) {
  filter: brightness(0.98);
}
.bst-custom-ai-btn[data-loading="true"] {
  cursor: wait;
}
.bst-custom-ai-btn:disabled {
  opacity: 0.86;
}
.bst-custom-ai-btn .bst-custom-ai-btn-icon {
  margin-right: 6px;
  font-size: 12px;
  opacity: 0.95;
}
.bst-custom-ai-btn[data-loading="true"] .bst-custom-ai-btn-icon {
  animation: bst-spin 0.9s linear infinite;
}
@keyframes bst-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.bst-custom-ai-status {
  font-size: 12px;
  opacity: 0.84;
  line-height: 1.35;
}
.bst-custom-ai-status[data-state="loading"] {
  opacity: 1;
  color: #d4ecff;
}
.bst-custom-ai-status[data-state="success"] {
  opacity: 1;
  color: #c4ffd4;
}
.bst-custom-ai-status[data-state="error"] {
  opacity: 1;
  color: #ffcaca;
}
.bst-custom-char-counter,
.bst-textarea-counter {
  margin-top: 4px;
  text-align: right;
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.72;
  color: rgba(241, 246, 255, 0.88);
}
.bst-custom-char-counter[data-state="warn"],
.bst-textarea-counter[data-state="warn"] {
  opacity: 1;
  color: #ffe08a;
}
.bst-custom-char-counter[data-state="limit"],
.bst-textarea-counter[data-state="limit"] {
  opacity: 1;
  color: #ffb3b3;
}
.bst-edit-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 10, 18, 0.72);
  z-index: 2147483008;
  display: grid;
  place-items: center;
  padding: 12px;
}
.bst-edit-dialog {
  position: fixed;
  inset: 0;
  margin: 0;
  padding: 12px;
  width: 100vw;
  height: 100dvh;
  max-width: 100vw;
  max-height: 100dvh;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  overflow: auto;
  z-index: 2147483647;
}
.bst-edit-dialog::backdrop {
  background: rgba(6, 10, 18, 0.72);
  z-index: 2147483647;
}
.bst-edit-modal {
  width: min(760px, calc(100vw - 20px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  background: linear-gradient(160deg, rgba(18, 23, 34, 0.98), rgba(10, 14, 24, 0.98));
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 16px;
  padding: 16px;
  color: #f3f5f9;
  box-shadow: 0 18px 44px rgba(0,0,0,0.45);
}
.bst-edit-head {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.bst-edit-head .bst-surface-title,
.bst-graph-top .bst-surface-title,
.bst-character-panel .bst-surface-title {
  font-size: 16px;
}
.bst-edit-sub {
  font-size: 12px;
  opacity: 0.78;
  margin-bottom: 12px;
}
.bst-edit-grid {
  display: grid;
  gap: 10px;
}
.bst-edit-grid.bst-edit-grid-two {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.bst-edit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: rgba(241, 246, 255, 0.94);
}
.bst-edit-field.bst-check {
  margin-bottom: 8px;
}
.bst-edit-field input:not([type="checkbox"]),
.bst-edit-field select,
.bst-edit-field textarea {
  width: 100%;
}
.bst-edit-modal input:not([type="checkbox"]),
.bst-edit-modal select,
.bst-edit-modal textarea {
  background: #0d1220;
  color: #f3f5f9;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  box-sizing: border-box;
  padding: 8px 10px;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.bst-edit-modal input:not([type="checkbox"]):hover,
.bst-edit-modal select:hover,
.bst-edit-modal textarea:hover {
  border-color: rgba(168, 203, 245, 0.48);
  background: #101728;
}
.bst-edit-modal input:not([type="checkbox"]):focus-visible,
.bst-edit-modal select:focus-visible,
.bst-edit-modal textarea:focus-visible {
  outline: none;
  border-color: rgba(56,189,248,0.9);
  box-shadow: 0 0 0 2px rgba(56,189,248,0.25);
}
.bst-edit-modal input::placeholder,
.bst-edit-modal textarea::placeholder {
  color: rgba(243,245,249,0.6);
}
.bst-edit-divider {
  margin: 10px 0;
  height: 1px;
  background: rgba(255,255,255,0.12);
}
.bst-edit-actions {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.bst-edit-array-status {
  font-size: 11px;
  color: rgba(255, 222, 160, 0.92);
  min-height: 14px;
}
.bst-graph-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 2147483010;
}
.bst-graph-modal {
  position: fixed;
  z-index: 2147483011;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(860px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  overflow: auto;
  background: #121621;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 16px;
  padding: 16px;
  color: #fff;
  background: linear-gradient(160deg, rgba(18, 23, 34, 0.98), rgba(10, 14, 24, 0.98));
}
.bst-mood-preview-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 12px;
  background: rgba(0,0,0,0.72);
  z-index: 2147483646;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  opacity: 1;
  animation: bst-fade-in .16s ease forwards;
}
.bst-mood-preview-dialog {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  width: 100vw;
  height: 100dvh;
  max-width: 100vw;
  max-height: 100dvh;
  padding: 12px;
  border: 0;
  background: transparent;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 2147483647;
  animation: bst-fade-in .16s ease forwards;
}
.bst-mood-preview-dialog::backdrop {
  background: rgba(0,0,0,0.72);
}
.bst-mood-preview-modal {
  position: relative;
  z-index: 2147483647;
  isolation: isolate;
  width: min(960px, 94vw);
  max-height: calc(100dvh - 24px);
  display: grid;
  grid-template-rows: auto auto;
  place-items: center;
  gap: 10px;
  transform: none;
  animation: bst-modal-in .16s ease forwards;
}
.bst-mood-preview-image {
  max-width: 100%;
  max-height: calc(100dvh - 24px);
  object-fit: contain;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 20px 64px rgba(0,0,0,0.56);
  cursor: zoom-out;
}
.bst-mood-preview-close {
  position: absolute;
  z-index: 2;
  top: 6px;
  right: 6px;
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.38);
  background: rgba(10,12,16,0.68);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  touch-action: manipulation;
  cursor: pointer;
}
.bst-mood-preview-caption {
  font-size: 12px;
  color: rgba(244, 247, 255, 0.92);
  background: rgba(10,12,16,0.52);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 999px;
  padding: 6px 12px;
}
.bst-mood-preview-backdrop.is-closing {
  animation: bst-fade-out .14s ease forwards;
}
.bst-mood-preview-backdrop.is-closing .bst-mood-preview-modal {
  animation: bst-modal-out .14s ease forwards;
}
.bst-mood-preview-open {
  overflow: hidden !important;
}
@keyframes bst-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes bst-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes bst-modal-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bst-modal-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(8px) scale(0.985); }
}
.bst-graph-top {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.bst-graph-controls {
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 8px;
}
.bst-graph-window-select {
  background: #0d1220;
  color: #f3f5f9;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 8px;
  padding: 4px 6px;
}
.bst-graph-window-select.active {
  border-color: color-mix(in srgb, var(--bst-accent) 70%, #ffffff 30%);
  box-shadow: 0 0 0 2px rgba(56,189,248,0.2);
}
.bst-graph-canvas {
  position: relative;
}
.bst-graph-svg {
  width: 100%;
  height: 320px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  background: #0d1220;
}
.bst-graph-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(8, 12, 20, 0.95);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: #f3f5f9;
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
  opacity: 0;
  transition: opacity .12s ease;
}
.bst-graph-tooltip.visible {
  opacity: 1;
}
.bst-graph-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  opacity: 0.92;
  user-select: none;
}
.bst-graph-legend {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.bst-graph-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.bst-legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  display: inline-block;
}
.bst-character-panel {
  margin-top: 12px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(155deg, rgba(19,24,36,0.78), rgba(14,18,28,0.95));
  color: #f1f3f8;
  display: grid;
  gap: 12px;
}
.bst-character-panel > .bst-surface-header {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.bst-character-panel > .bst-surface-header .bst-surface-title {
  font-size: 16px;
}
.bst-character-panel > .bst-surface-header .bst-surface-subtitle {
  max-width: 76ch;
}
.bst-character-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bst-character-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(10, 15, 25, 0.62);
  color: rgba(241, 246, 255, 0.9);
  font-size: 11px;
  line-height: 1.35;
}
.bst-character-meta-pill strong {
  font-weight: 700;
}
.bst-character-section {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(13, 18, 29, 0.64), rgba(10, 14, 22, 0.58));
}
.bst-character-section > .bst-character-divider:first-child {
  margin-top: 0;
  padding-top: 0;
}
.bst-character-section > .bst-character-divider:first-child::after {
  background: linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04));
}
.bst-character-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.bst-character-grid-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.bst-character-grid-single {
  grid-template-columns: minmax(0, 1fr);
}
.bst-character-grid label {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bst-character-st-tools {
  display: grid;
  gap: 8px;
}
.bst-character-panel input[type="text"],
.bst-character-panel input[type="number"],
.bst-character-panel select,
.bst-character-panel textarea {
  background: rgba(16,20,30,0.7);
  border: 1px solid rgba(255,255,255,0.18);
  color: #f4f7ff;
  border-radius: 8px;
  padding: 6px 8px;
}
.bst-character-panel input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--bst-accent) 70%, #ffffff 30%);
  outline-offset: 1px;
}
.bst-character-wide {
  grid-column: 1 / -1;
}
.bst-character-divider {
  position: relative;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.35px;
  opacity: 0.86;
  padding-top: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.bst-character-divider::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05));
}
.bst-character-help {
  font-size: 11px;
  opacity: 0.75;
}
.bst-character-help-compact {
  margin: 0;
}
.bst-character-map {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.bst-character-map-row {
  font-size: 11px;
  display: grid;
  gap: 4px;
}
.bst-character-warning {
  font-size: 11px;
  color: #ffb3bd;
}
.bst-character-moods {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.bst-mood-slot {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 8px;
  background: rgba(12,16,24,0.7);
  display: grid;
  gap: 6px;
}
.bst-mood-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  overflow: hidden;
}
.bst-mood-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bst-mood-label {
  font-size: 11px;
  font-weight: 600;
}
.bst-mood-actions {
  display: grid;
  gap: 6px;
}
.bst-mood-actions .bst-btn {
  padding: 4px 8px;
  font-size: 11px;
}
.bst-mood-input {
  display: none;
}
.bst-character-actions {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 820px) {
  .bst-mini-btn {
    min-height: 30px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .bst-card {
    padding: 9px 10px;
  }
  .bst-head {
    gap: 6px;
    margin-bottom: 4px;
  }
  .bst-name {
    font-size: 13px;
  }
  .bst-state {
    font-size: 11px;
    padding: 1px 6px;
  }
  .bst-row {
    margin: 4px 0;
  }
  .bst-label {
    font-size: 11px;
  }
  .bst-row.bst-row-non-numeric .bst-label {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .bst-array-item-chip {
    max-width: 100%;
  }
  .bst-non-numeric-chip {
    max-width: 100%;
    margin-left: 0;
  }
  .bst-track {
    height: 7px;
  }
  .bst-actions {
    gap: 4px;
  }
  .bst-actions .bst-mini-btn {
    min-height: 28px;
    padding: 2px 6px;
    font-size: 11px;
  }
  .bst-actions .bst-graph-label {
    display: none;
  }
  .bst-root-action-main {
    padding: 3px 9px;
    font-size: 10px;
  }
  .bst-root-action-retrack {
    width: 28px;
    min-width: 28px;
    height: 28px;
  }
  .bst-root-action-summary {
    width: 28px;
    min-width: 28px;
    height: 28px;
  }
  .bst-mood-preview-backdrop {
    padding: calc(env(safe-area-inset-top, 0px) + 6px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }
  .bst-mood-preview-dialog {
    padding: calc(env(safe-area-inset-top, 0px) + 6px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }
  .bst-mood-preview-modal {
    width: min(100%, calc(100vw - 16px));
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 14px);
    gap: 8px;
  }
  .bst-mood-preview-image {
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 78px);
    border-radius: 10px;
  }
  .bst-mood-preview-close {
    top: calc(env(safe-area-inset-top, 0px) + 2px);
    right: 2px;
  }
  .bst-mood-preview-caption {
    font-size: 11px;
    padding: 5px 10px;
  }
  .bst-edit-backdrop {
    place-items: start center;
    overflow-y: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }
  .bst-edit-dialog {
    place-items: start center;
    overflow-y: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }
  .bst-edit-modal {
    width: min(100%, calc(100vw - 12px));
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
    margin: 0;
    border-radius: 12px;
  }
  .bst-edit-grid.bst-edit-grid-two {
    grid-template-columns: minmax(0, 1fr);
  }
  .bst-settings {
    left: 0;
    top: 0;
    transform: none;
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 12px 10px 18px;
  }
  .bst-settings-top {
    top: -12px;
    width: calc(100% + 20px);
    margin: -12px -10px 12px;
    padding: calc(env(safe-area-inset-top, 0px) + 10px) 10px 10px;
  }
  .bst-settings-top::before {
    left: 10px;
    top: calc(env(safe-area-inset-top, 0px) + 10px);
    bottom: 10px;
  }
  .bst-settings-top .bst-surface-header-copy {
    padding-left: 14px;
  }
  .bst-settings-top-actions {
    gap: 6px;
  }
  .bst-surface-title {
    font-size: 18px;
  }
  .bst-close-btn {
    min-width: 40px;
    width: 40px;
    height: 40px;
    font-size: 20px;
  }
  .bst-settings-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .bst-character-grid-three {
    grid-template-columns: minmax(0, 1fr);
  }
  .bst-check-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .bst-settings label {
    font-size: 13px;
  }
  .bst-help-list,
  .bst-help-line {
    font-size: 13px;
  }
  .bst-settings input,
  .bst-settings select {
    font-size: 16px;
    padding: 9px 10px;
  }
  .bst-btn {
    min-height: 40px;
    font-size: 13px;
  }
  .bst-btn-icon {
    min-height: 40px;
    width: 40px;
    min-width: 40px;
  }
  .bst-debug-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .bst-settings-footer {
    bottom: -18px;
    width: calc(100% + 20px);
    margin: 12px -10px -18px;
    padding: 10px;
    justify-content: stretch;
  }
  .bst-settings-footer .bst-btn {
    flex: 1 1 0;
  }
  .bst-custom-stat-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .bst-custom-stat-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .bst-custom-wizard {
    left: 0;
    top: 0;
    transform: none;
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 12px 10px 14px;
  }
  .bst-custom-wizard-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .bst-array-default-row,
  .bst-enum-options-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .bst-custom-wizard-actions {
    flex-wrap: wrap;
  }
  .bst-custom-wizard-actions .bst-btn {
    flex: 1 1 0;
  }
  .bst-graph-modal {
    left: 0;
    top: 0;
    transform: none;
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 10px;
  }
  .bst-graph-top {
    align-items: center;
    gap: 8px;
  }
  .bst-graph-title {
    font-size: 14px;
  }
  .bst-graph-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .bst-graph-window-select {
    font-size: 16px;
    padding: 6px 8px;
  }
  .bst-graph-svg {
    height: 250px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bst-loading-track-indeterminate .bst-loading-fill,
  .bst-row.bst-row-changed .bst-track,
  .bst-card.bst-card-new,
  .bst-mood-preview-dialog,
  .bst-mood-preview-backdrop,
  .bst-mood-preview-modal,
  .bst-mood-preview-backdrop.is-closing,
  .bst-mood-preview-backdrop.is-closing .bst-mood-preview-modal {
    animation: none !important;
  }
  .bst-fill,
  .bst-card,
  .bst-mini-btn {
    transition: none !important;
  }
}
`;
  document.head.appendChild(style);
}

export function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota errors
  }
}

function findMessageContainer(messageIndex: number | null): HTMLElement | null {
  if (messageIndex == null) return null;
  const selectors = [
    `.mes[mesid="${messageIndex}"]`,
    `.mes[data-mesid="${messageIndex}"]`,
    `[mesid="${messageIndex}"]`,
    `[data-mesid="${messageIndex}"]`
  ];
  for (const selector of selectors) {
    const found = document.querySelector(selector);
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

function getPreferredTrackerMount(anchor: HTMLElement): HTMLElement {
  return (
    (anchor.querySelector(".mes_block") as HTMLElement | null) ??
    (anchor.querySelector(".mes_text") as HTMLElement | null) ??
    anchor
  );
}

function getPreferredSceneMount(anchor: HTMLElement): { parent: HTMLElement; before: Element | null } {
  const mesBlock = (anchor.querySelector(".mes_block") as HTMLElement | null) ?? anchor;
  const mesText = mesBlock.querySelector(".mes_text");
  return { parent: mesBlock, before: mesText };
}

function getRoot(messageIndex: number | null): HTMLDivElement | null {
  const anchor = findMessageContainer(messageIndex);
  if (!anchor) return null;

  const indexKey = String(messageIndex);
  let root = document.querySelector(`.${ROOT_CLASS}[data-message-index="${indexKey}"]`) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.dataset.messageIndex = indexKey;
  }

  const preferredMount = getPreferredTrackerMount(anchor);

  if (root.parentElement !== preferredMount) {
    preferredMount.appendChild(root);
  }
  return root;
}

function getSceneRoot(messageIndex: number | null): HTMLDivElement | null {
  const anchor = findMessageContainer(messageIndex);
  if (!anchor) return null;
  const indexKey = String(messageIndex);
  let sceneRoot = document.querySelector(`.bst-scene-root[data-message-index="${indexKey}"]`) as HTMLDivElement | null;
  if (!sceneRoot) {
    sceneRoot = document.createElement("div");
    sceneRoot.className = "bst-scene-root";
    sceneRoot.dataset.messageIndex = indexKey;
  }
  const mount = getPreferredSceneMount(anchor);
  if (sceneRoot.parentElement !== mount.parent) {
    mount.parent.insertBefore(sceneRoot, mount.before);
  } else if (mount.before && sceneRoot.nextElementSibling !== mount.before) {
    mount.parent.insertBefore(sceneRoot, mount.before);
  }
  return sceneRoot;
}

export function renderTracker(
  entries: RenderEntry[],
  settings: BetterSimTrackerSettings,
  allCharacters: string[],
  isGroupChat: boolean,
  uiState: TrackerUiState,
  latestAiIndex: number | null,
  summaryBusyMessageIndices: Set<number> | undefined,
  isUserMessageIndex?: (messageIndex: number) => boolean,
  resolveDisplayName?: (characterName: string) => string,
  resolveCharacterAvatar?: (characterName: string) => string | null,
  resolveOwnerRenderIdentity?: (characterName: string) => OwnerRenderIdentity | null,
  isTrackerEnabled?: (characterName: string) => boolean,
  isOwnerStatEnabled?: (characterName: string, statId: string) => boolean,
  resolveLifecycleRegistryState?: (characterName: string, messageIndex: number) => CardLifecycleRegistryState | null,
  resolveLifecycleRegistryStateByEntityId?: (entityId: string, messageIndex: number) => CardLifecycleRegistryState | null,
  resolveRegistryOwnersForMessage?: (messageIndex: number) => string[],
  resolveRegistryEntriesForMessage?: (messageIndex: number) => TrackerEntityRegistryEntry[],
  resolveRegistryEntryForMessage?: (ownerName: string, messageIndex: number) => TrackerEntityRegistryEntry | null,
  resolveRegistryEntryByEntityIdForMessage?: (entityId: string, messageIndex: number) => TrackerEntityRegistryEntry | null,
  onOpenGraph?: (target: TrackerGraphTarget) => void,
  onRetrackMessage?: (messageIndex: number) => void,
  onSendSummaryMessage?: (messageIndex: number) => void,
  onCancelExtraction?: () => void,
  onEditStats?: (payload: EditStatsPayload) => void,
  resolveEntryData?: (messageIndex: number) => TrackerData | null,
  onRequestRerender?: () => void,
  onSyncEntityRegistry?: (payload: {
    messageIndex: number;
    targets: TrackerRegistrySyncTarget[];
    getLifecycleState: (target: TrackerRegistrySyncTarget) => CardLifecycleState;
  }) => void,
  onRecoverTracker?: (messageIndex: number) => void,
): void {
  ensureStyles();
  const palette = allocateCharacterColors(allCharacters);
  const sortedEntries = [...entries].sort((a, b) => a.messageIndex - b.messageIndex);
  const knownCharactersAcrossEntries: string[] = [];
  const knownAcrossSeen = new Set<string>();
  for (const entry of sortedEntries) {
    if (!entry.data) continue;
    for (const name of collectCharacterNamesFromTrackerData(entry.data)) {
      pushUniqueCharacterName(knownCharactersAcrossEntries, knownAcrossSeen, name);
    }
  }
  const isUserEntryIndex = (messageIndex: number): boolean => Boolean(isUserMessageIndex?.(messageIndex));
  const latestTrackedMessageIndex = [...sortedEntries].reverse().find(item => item.data)?.messageIndex ?? null;
  const latestTrackedAiMessageIndex = [...sortedEntries]
    .reverse()
    .find(item => item.data && !isUserEntryIndex(item.messageIndex))
    ?.messageIndex ?? null;
  const latestTrackedUserMessageIndex = [...sortedEntries]
    .reverse()
    .find(item => item.data && isUserEntryIndex(item.messageIndex))
    ?.messageIndex ?? null;
  const isMessageCollapsed = (messageIndex: number): boolean =>
    settings.collapseCardsByDefault
      ? !expandedTrackerMessages.has(messageIndex)
      : collapsedTrackerMessages.has(messageIndex);
  const numericGlobalScopeById = new Map(
    (settings.customStats ?? [])
      .map(def => [String(def.id ?? "").trim().toLowerCase(), Boolean(def.globalScope)] as const),
  );
  const isNumericGlobalScope = (key: string): boolean =>
    Boolean(numericGlobalScopeById.get(String(key ?? "").trim().toLowerCase()));
  const resolveLookupNamesForOwnerInData = (
    data: TrackerData | null | undefined,
    ownerName: string,
    messageIndex: number,
  ): string[] => {
    const names: string[] = [];
    const seen = new Set<string>();
    const push = (raw: unknown): void => {
      const value = String(raw ?? "").trim();
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(value);
    };
    push(ownerName);
    const resolvedRegistryEntry = resolveRegistryEntryForOwnerInMessageData({
      ownerName,
      messageIndex,
      data,
      resolveRegistryEntryForMessage,
      resolveRegistryEntryByEntityIdForMessage,
    });
    const targetEntityId = resolveTrackerDataEntityOwnerSnapshot(data, ownerName)?.entityId
      ?? resolvedRegistryEntry?.id
      ?? null;
    const registryEntryForEntityId = targetEntityId
      ? resolveRegistryEntryByEntityIdForMessage?.(targetEntityId, messageIndex) ?? null
      : null;
    if (targetEntityId && data?.entityOwnerMap) {
      for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
        if (snapshot?.entityId !== targetEntityId) continue;
        push(snapshotOwner);
        push(snapshot.ownerName);
        push(snapshot.canonicalName);
        for (const alias of snapshot.aliases ?? []) push(alias);
      }
    }
    for (const lookupName of resolveRegistryLookupNamesForOwner(
      ownerName,
      registryEntryForEntityId ?? resolvedRegistryEntry,
    )) {
      push(lookupName);
    }
    return names;
  };
  const resolveLookupNamesForOwner = (
    ownerName: string,
    messageIndex: number,
  ): string[] => resolveLookupNamesForOwnerInData(null, ownerName, messageIndex);
  const historyLookupCache = createRenderHistoryLookupCache(sortedEntries, {
    resolveLookupNamesForOwnerInData,
    isNumericGlobalScope,
  });
  const {
    findPreviousDataWithNumericStat,
    findPreviousDataWithNonNumericStat,
    findPreviousDataWithBuiltInTextStat,
    resolvePreviousNonNumericValue,
    resolvePreviousBuiltInTextValue,
  } = historyLookupCache;
  const lifecycleSnapshots: CardLifecycleSnapshot[] = buildLifecycleHistorySnapshotsFromTrackerEntries(
    null,
    sortedEntries.filter(item => item.data),
  );
  const buildEffectiveEditModalData = (
    messageIndex: number,
    owner: string,
    data: TrackerData,
  ): TrackerData => {
    const out = cloneTrackerDataForEdit(data);
    const isGlobalOwner = owner === GLOBAL_TRACKER_KEY;
    const isUserOwner = owner === USER_TRACKER_KEY;

    if (!isGlobalOwner && !isUserOwner) {
      if (settings.trackAffection && out.statistics.affection?.[owner] === undefined && !isNumericExplicitlyCleared(out, "affection", owner, false)) {
        const prev = findPreviousDataWithNumericStat(messageIndex, "affection", owner);
        if (prev) out.statistics.affection[owner] = prev.value;
      }
      if (settings.trackTrust && out.statistics.trust?.[owner] === undefined && !isNumericExplicitlyCleared(out, "trust", owner, false)) {
        const prev = findPreviousDataWithNumericStat(messageIndex, "trust", owner);
        if (prev) out.statistics.trust[owner] = prev.value;
      }
      if (settings.trackDesire && out.statistics.desire?.[owner] === undefined && !isNumericExplicitlyCleared(out, "desire", owner, false)) {
        const prev = findPreviousDataWithNumericStat(messageIndex, "desire", owner);
        if (prev) out.statistics.desire[owner] = prev.value;
      }
      if (settings.trackConnection && out.statistics.connection?.[owner] === undefined && !isNumericExplicitlyCleared(out, "connection", owner, false)) {
        const prev = findPreviousDataWithNumericStat(messageIndex, "connection", owner);
        if (prev) out.statistics.connection[owner] = prev.value;
      }
    }

    const nonNumericDefs = getNonNumericStatDefinitions(settings).filter(def => {
      if (isGlobalOwner) return def.globalScope;
      if (def.globalScope) return false;
      return isUserOwner ? def.trackUser : def.trackCharacters;
    });
    for (const def of nonNumericDefs) {
      if (hasNonNumericValue(out, def, owner)) continue;
      if (isNonNumericExplicitlyCleared(out, def.id, owner, def.globalScope)) continue;
      const prev = findPreviousDataWithNonNumericStat(messageIndex, def, owner);
      if (!prev) continue;
      const sourceOwner = def.globalScope ? GLOBAL_TRACKER_KEY : owner;
      const prevValue = resolvePreviousNonNumericValue(prev, def, owner, messageIndex);
      if (prevValue === undefined) continue;
      const customNonNumeric = out.customNonNumericStatistics ?? {};
      const byOwner = customNonNumeric[def.id] ?? {};
      byOwner[sourceOwner] = Array.isArray(prevValue) ? [...prevValue] : prevValue;
      customNonNumeric[def.id] = byOwner;
      out.customNonNumericStatistics = customNonNumeric;
    }

    if (!isGlobalOwner) {
      if (settings.trackMood && out.statistics.mood?.[owner] === undefined && !isTextStatExplicitlyCleared(out, "mood", owner)) {
        const prevMood = findPreviousDataWithBuiltInTextStat("mood", messageIndex, owner);
        const prevMoodValue = prevMood ? resolvePreviousBuiltInTextValue(prevMood, "mood", owner, messageIndex) : undefined;
        if (prevMoodValue !== undefined) {
          out.statistics.mood[owner] = prevMoodValue;
        }
      }
      if (settings.trackLastThought && out.statistics.lastThought?.[owner] === undefined && !isTextStatExplicitlyCleared(out, "lastThought", owner)) {
        const prevThought = findPreviousDataWithBuiltInTextStat("lastThought", messageIndex, owner);
        const prevThoughtValue = prevThought ? resolvePreviousBuiltInTextValue(prevThought, "lastThought", owner, messageIndex) : undefined;
        if (prevThoughtValue !== undefined) {
          out.statistics.lastThought[owner] = prevThoughtValue;
        }
      }
    }
    return out;
  };
  const wanted = new Set(entries.map(entry => String(entry.messageIndex)));

  document.querySelectorAll(`.${ROOT_CLASS}`).forEach(node => {
    const el = node as HTMLElement;
    const idx = String(el.dataset.messageIndex ?? "");
    if (!wanted.has(idx)) {
      el.remove();
    }
  });
  document.querySelectorAll(".bst-scene-root").forEach(node => {
    const el = node as HTMLElement;
    const idx = String(el.dataset.messageIndex ?? "");
    if (!wanted.has(idx)) {
      el.remove();
    }
  });

  if (!settings.enabled) {
    return;
  }

  for (const entry of entries) {
    const root = getRoot(entry.messageIndex);
    if (!root) continue;
    const wantsSceneAboveMessage = settings.sceneCardEnabled && settings.sceneCardPosition === "above_message";
    const sceneRoot = wantsSceneAboveMessage ? getSceneRoot(entry.messageIndex) : null;
    if (!wantsSceneAboveMessage) {
      document.querySelector(`.bst-scene-root[data-message-index="${entry.messageIndex}"]`)?.remove();
    }

    root.style.setProperty("--bst-card", "#1f2028");
    root.style.setProperty("--bst-accent", settings.accentColor);
    root.style.setProperty("--bst-radius", `${settings.borderRadius}px`);
    for (const [name, value] of Object.entries(resolveMoodSymbolBoxStyleVars(settings))) {
      root.style.setProperty(name, value);
    }
    root.style.opacity = `${settings.cardOpacity}`;
    root.style.fontSize = `${settings.fontSize}px`;
    root.style.display = "grid";
    if (sceneRoot) {
      sceneRoot.style.setProperty("--bst-card", "#1f2028");
      sceneRoot.style.setProperty("--bst-accent", settings.accentColor);
      sceneRoot.style.setProperty("--bst-radius", `${settings.borderRadius}px`);
      for (const [name, value] of Object.entries(resolveMoodSymbolBoxStyleVars(settings))) {
        sceneRoot.style.setProperty(name, value);
      }
      sceneRoot.style.opacity = `${settings.cardOpacity}`;
      sceneRoot.style.fontSize = `${settings.fontSize}px`;
      sceneRoot.style.display = "grid";
    }

    if (!root.dataset.bstBound) {
      root.dataset.bstBound = "1";
      const openPreviewFromTarget = (target: EventTarget | null): boolean => {
        const node = target as HTMLElement | null;
        const preview = node?.closest('[data-bst-action="open-mood-preview"]') as HTMLElement | null;
        if (!preview) return false;
        const src = String(preview.getAttribute("data-bst-image-src") ?? "").trim();
        const alt = String(preview.getAttribute("data-bst-image-alt") ?? "").trim() || "Mood image";
        const character = String(preview.getAttribute("data-bst-image-character") ?? "").trim();
        const mood = String(preview.getAttribute("data-bst-image-mood") ?? "").trim();
        if (src) {
          openMoodImageModal(src, alt, character, mood);
        }
        return true;
      };
      root.addEventListener("click", event => {
        const target = event.target as HTMLElement | null;
        if (openPreviewFromTarget(target)) {
          return;
        }
        const thoughtToggle = target?.closest('[data-bst-action="toggle-thought"]') as HTMLElement | null;
        if (thoughtToggle) {
          const key = String(thoughtToggle.getAttribute("data-bst-thought-key") ?? "").trim();
          if (!key) return;
          const expanded = expandedThoughtKeys.has(key);
          if (expanded) {
            expandedThoughtKeys.delete(key);
          } else {
            expandedThoughtKeys.add(key);
          }
          root.dataset.bstRenderSignature = "";
          if (onRequestRerender) {
            onRequestRerender();
          } else {
            const container = root.querySelector(`[data-bst-thought-container="1"][data-bst-thought-key="${CSS.escape(key)}"]`) as HTMLElement | null;
            if (container) {
              container.classList.toggle("bst-thought-expanded", !expanded);
            }
            thoughtToggle.setAttribute("aria-expanded", String(!expanded));
            thoughtToggle.textContent = expanded ? "More" : "Less";
          }
          return;
        }
        const textShortToggle = target?.closest('[data-bst-action="toggle-text-short"]') as HTMLElement | null;
        if (textShortToggle) {
          const key = String(textShortToggle.getAttribute("data-bst-text-short-key") ?? "").trim();
          if (!key) return;
          const expanded = expandedTextShortKeys.has(key);
          if (expanded) {
            expandedTextShortKeys.delete(key);
          } else {
            expandedTextShortKeys.add(key);
          }
          root.dataset.bstRenderSignature = "";
          if (onRequestRerender) {
            onRequestRerender();
          } else {
            const container = root.querySelector(`[data-bst-text-short-container="1"][data-bst-text-short-key="${CSS.escape(key)}"]`) as HTMLElement | null;
            if (container) {
              container.classList.toggle("bst-text-short-expanded", !expanded);
            }
            textShortToggle.setAttribute("aria-expanded", String(!expanded));
            textShortToggle.textContent = expanded ? "More" : "Less";
          }
          return;
        }
        const arrayToggle = target?.closest('[data-bst-action="toggle-array-values"]') as HTMLElement | null;
        if (arrayToggle) {
          const key = String(arrayToggle.getAttribute("data-bst-array-key") ?? "").trim();
          if (!key) return;
          if (expandedArrayValueKeys.has(key)) {
            expandedArrayValueKeys.delete(key);
          } else {
            expandedArrayValueKeys.add(key);
          }
          root.dataset.bstRenderSignature = "";
          onRequestRerender?.();
          return;
        }
        const button = target?.closest('[data-bst-action="graph"]') as HTMLElement | null;
        if (button) {
          const name = String(button.getAttribute("data-character") ?? "").trim();
          const entityId = String(button.getAttribute("data-entity-id") ?? "").trim();
          if (!name) return;
          onOpenGraph?.({ ownerName: name, entityId: entityId || null });
          return;
        }
        const edit = target?.closest('[data-bst-action="edit-stats"]') as HTMLElement | null;
        if (edit) {
          const idx = Number(edit.getAttribute("data-bst-edit-message") ?? root.dataset.messageIndex);
          const character = String(edit.getAttribute("data-bst-edit-character") ?? "").trim();
          const data = Number.isNaN(idx) ? null : resolveEntryData?.(idx) ?? null;
          if (!data || !character) return;
          openEditStatsModal({
            messageIndex: idx,
            character,
            displayName: resolveDisplayName?.(character),
            data: buildEffectiveEditModalData(idx, character, data),
            settings,
            onSave: onEditStats,
          });
          return;
        }
        const sceneCollapse = target?.closest('[data-bst-action="toggle-scene-collapse"]') as HTMLElement | null;
        if (sceneCollapse) {
          const idx = Number(sceneRoot?.dataset.messageIndex ?? root.dataset.messageIndex);
          if (Number.isNaN(idx)) return;
          if (collapsedSceneMessages.has(idx)) {
            collapsedSceneMessages.delete(idx);
          } else {
            collapsedSceneMessages.add(idx);
          }
          root.dataset.bstRenderSignature = "";
          sceneRoot?.setAttribute("data-bst-render-signature", "");
          onRequestRerender?.();
          return;
        }
        const retrack = target?.closest('[data-bst-action="retrack"]') as HTMLElement | null;
        if (retrack) {
          const idx = Number(root.dataset.messageIndex);
          if (!Number.isNaN(idx)) {
            onRetrackMessage?.(idx);
          }
          return;
        }
        const recover = target?.closest('[data-bst-action="recover-tracker"]') as HTMLElement | null;
        if (recover) {
          const idx = Number(root.dataset.messageIndex);
          if (!Number.isNaN(idx)) {
            onRecoverTracker?.(idx);
          }
          return;
        }
        const sendSummary = target?.closest('[data-bst-action="send-summary"]') as HTMLButtonElement | null;
        if (sendSummary) {
          if (sendSummary.disabled || sendSummary.dataset.loading === "true") {
            return;
          }
          const idx = Number(root.dataset.messageIndex);
          if (!Number.isNaN(idx)) {
            onSendSummaryMessage?.(idx);
          }
          return;
        }
        const collapse = target?.closest('[data-bst-action="toggle-all-collapse"]') as HTMLElement | null;
        if (collapse) {
          const idx = Number(root.dataset.messageIndex);
          if (Number.isNaN(idx)) return;
          const nextCollapsed = !isMessageCollapsed(idx);
          root.classList.toggle("bst-root-collapsed", nextCollapsed);
          sceneRoot?.classList.toggle("bst-root-collapsed", nextCollapsed);
          if (nextCollapsed) {
            if (settings.collapseCardsByDefault) {
              expandedTrackerMessages.delete(idx);
            } else {
              collapsedTrackerMessages.add(idx);
            }
          } else {
            if (settings.collapseCardsByDefault) {
              expandedTrackerMessages.add(idx);
            } else {
              collapsedTrackerMessages.delete(idx);
            }
          }
          root.querySelectorAll<HTMLElement>(".bst-card[data-bst-card-key]").forEach(card => {
            const cardKey = String(card.dataset.bstCardKey ?? "").trim();
            const isActive = card.dataset.bstCardActive === "true";
            applyTrackerCardCollapsed({
              cardKey,
              isActive,
              nextCollapsed,
              collapsedActiveCardKeys,
              expandedInactiveCardKeys,
            });
          });
          collapse.setAttribute("aria-expanded", String(!nextCollapsed));
          collapse.setAttribute("title", nextCollapsed ? "Expand cards" : "Collapse cards");
          collapse.innerHTML = nextCollapsed
            ? `<span class="bst-root-action-icon" aria-hidden="true">&#9656;</span><span class="bst-root-action-label">Expand cards</span>`
            : `<span class="bst-root-action-icon" aria-hidden="true">&#9662;</span><span class="bst-root-action-label">Collapse cards</span>`;
          root.dataset.bstRenderSignature = "";
          onRequestRerender?.();
          return;
        }
        const cardCollapse = target?.closest('[data-bst-action="toggle-card-collapse"]') as HTMLElement | null;
        if (cardCollapse) {
          const cardKey = String(cardCollapse.getAttribute("data-bst-card-key") ?? "").trim();
          const isActive = cardCollapse.getAttribute("data-bst-card-active") === "true";
          const nextCollapsed = cardCollapse.getAttribute("aria-expanded") !== "false";
          applyTrackerCardCollapsed({
            cardKey,
            isActive,
            nextCollapsed,
            collapsedActiveCardKeys,
            expandedInactiveCardKeys,
          });
          root.dataset.bstRenderSignature = "";
          onRequestRerender?.();
          return;
        }
        const cancel = target?.closest('[data-bst-action="cancel-extraction"]') as HTMLElement | null;
        if (cancel) {
          onCancelExtraction?.();
          return;
        }
      });
      root.addEventListener("pointerup", event => {
        const pointer = event as PointerEvent;
        if (pointer.pointerType !== "touch") return;
        if (openPreviewFromTarget(event.target)) {
          event.preventDefault();
        }
      }, { passive: false });
    }
    if (sceneRoot && !sceneRoot.dataset.bstBound) {
      sceneRoot.dataset.bstBound = "1";
      sceneRoot.addEventListener("click", event => {
        const target = event.target as HTMLElement | null;
        const preview = target?.closest('[data-bst-action="open-mood-preview"]') as HTMLElement | null;
        if (preview) {
          const src = String(preview.getAttribute("data-bst-image-src") ?? "").trim();
          const alt = String(preview.getAttribute("data-bst-image-alt") ?? "").trim() || "Mood image";
          const character = String(preview.getAttribute("data-bst-image-character") ?? "").trim();
          const mood = String(preview.getAttribute("data-bst-image-mood") ?? "").trim();
          if (src) {
            openMoodImageModal(src, alt, character, mood);
          }
          return;
        }
        const edit = target?.closest('[data-bst-action="edit-stats"]') as HTMLElement | null;
        if (edit) {
          const idx = Number(edit.getAttribute("data-bst-edit-message") ?? sceneRoot.dataset.messageIndex);
          const character = String(edit.getAttribute("data-bst-edit-character") ?? "").trim();
          const data = Number.isNaN(idx) ? null : resolveEntryData?.(idx) ?? null;
          if (!data || !character) return;
          openEditStatsModal({
            messageIndex: idx,
            character,
            displayName: resolveDisplayName?.(character),
            data: buildEffectiveEditModalData(idx, character, data),
            settings,
            onSave: onEditStats,
          });
          return;
        }
        const sceneCollapse = target?.closest('[data-bst-action="toggle-scene-collapse"]') as HTMLElement | null;
        if (sceneCollapse) {
          const idx = Number(sceneRoot.dataset.messageIndex);
          if (Number.isNaN(idx)) return;
          if (collapsedSceneMessages.has(idx)) {
            collapsedSceneMessages.delete(idx);
          } else {
            collapsedSceneMessages.add(idx);
          }
          root.dataset.bstRenderSignature = "";
          sceneRoot.dataset.bstRenderSignature = "";
          onRequestRerender?.();
          return;
        }
        const arrayToggle = target?.closest('[data-bst-action="toggle-array-values"]') as HTMLElement | null;
        if (arrayToggle) {
          const key = String(arrayToggle.getAttribute("data-bst-array-key") ?? "").trim();
          if (!key) return;
          if (expandedArrayValueKeys.has(key)) {
            expandedArrayValueKeys.delete(key);
          } else {
            expandedArrayValueKeys.add(key);
          }
          root.dataset.bstRenderSignature = "";
          sceneRoot.dataset.bstRenderSignature = "";
          onRequestRerender?.();
          return;
        }
        const textShortToggle = target?.closest('[data-bst-action="toggle-text-short"]') as HTMLElement | null;
        if (!textShortToggle) return;
        const key = String(textShortToggle.getAttribute("data-bst-text-short-key") ?? "").trim();
        if (!key) return;
        if (expandedTextShortKeys.has(key)) {
          expandedTextShortKeys.delete(key);
        } else {
          expandedTextShortKeys.add(key);
        }
        root.dataset.bstRenderSignature = "";
        sceneRoot.dataset.bstRenderSignature = "";
        onRequestRerender?.();
      });
    }
    root.classList.toggle("bst-root-collapsed", isMessageCollapsed(entry.messageIndex));
    sceneRoot?.classList.toggle("bst-root-collapsed", isMessageCollapsed(entry.messageIndex));

    if (uiState.phase === "generating" && uiState.messageIndex === entry.messageIndex) {
      if (sceneRoot) {
        sceneRoot.dataset.bstRenderPhase = "generating";
        sceneRoot.dataset.bstRenderSignature = "";
        sceneRoot.innerHTML = "";
      }
      root.dataset.bstRenderPhase = "generating";
      root.dataset.bstRenderSignature = "";
      root.innerHTML = "";
      const loadingBox = document.createElement("div");
      loadingBox.className = "bst-loading";
      loadingBox.innerHTML = `
        <div class="bst-loading-row">
          <span>AI message is generating</span>
          <span>running</span>
        </div>
        <div class="bst-loading-track bst-loading-track-indeterminate"><div class="bst-loading-fill"></div></div>
        <div class="bst-loading-sub">Tracker will run after generation finishes.</div>
      `;
      root.appendChild(loadingBox);
      continue;
    }

    if (uiState.phase === "extracting" && uiState.messageIndex === entry.messageIndex) {
      if (sceneRoot) {
        sceneRoot.dataset.bstRenderPhase = "extracting";
        sceneRoot.dataset.bstRenderSignature = "";
        sceneRoot.innerHTML = "";
      }
      root.dataset.bstRenderPhase = "extracting";
      root.dataset.bstRenderSignature = "";
      root.innerHTML = "";
      const done = Math.max(0, Math.floor(Number(uiState.done) || 0));
      const progress = resolveExtractionProgressDisplayWithLabel(uiState.done, uiState.total, uiState.stepLabel);
      const copy = resolveExtractionLoadingCopy(done, uiState.stepLabel);
      const title = copy.title;
      const subtitle = copy.subtitle;
      const loadingBox = document.createElement("div");
      loadingBox.className = "bst-loading";
      loadingBox.innerHTML = `
        <div class="bst-loading-row">
          <span>${title}</span>
          <span>${progress.stageText}${progress.stageText === "preparing" ? "" : ` (${progress.percent}%)`}</span>
        </div>
        <div class="bst-loading-track"><div class="bst-loading-fill" style="width:${Math.round(progress.ratio * 100)}%"></div></div>
        <div class="bst-loading-sub">${subtitle}</div>
        <div class="bst-loading-actions">
          <button class="bst-btn bst-btn-danger bst-loading-stop" data-bst-action="cancel-extraction">Stop</button>
        </div>
      `;
      root.appendChild(loadingBox);
      continue;
    }

    const data = entry.data;
    if (!data) {
      if (sceneRoot) {
        sceneRoot.style.display = "none";
        sceneRoot.dataset.bstRenderPhase = "idle";
        sceneRoot.dataset.bstRenderSignature = "";
        sceneRoot.innerHTML = "";
      }
      const recovery = entry.recovery;
      if (!recovery) {
        root.style.display = "none";
        root.dataset.bstRenderPhase = "idle";
        root.dataset.bstRenderSignature = "";
        continue;
      }
      root.style.display = "grid";
      const recoverySignature = [
        `msg:${entry.messageIndex}`,
        `recovery:${recovery.kind}`,
        `title:${recovery.title}`,
        `detail:${recovery.detail}`,
        `action:${recovery.actionLabel}`,
      ].join("|#|");
      if (root.dataset.bstRenderPhase === "idle" && root.dataset.bstRenderSignature === recoverySignature) {
        continue;
      }
      root.dataset.bstRenderPhase = "idle";
      root.dataset.bstRenderSignature = recoverySignature;
      root.innerHTML = "";
      const recoveryBox = document.createElement("div");
      recoveryBox.className = "bst-loading";
      recoveryBox.innerHTML = `
        <div class="bst-loading-row">
          <span>${escapeHtml(recovery.title)}</span>
          <span>${recovery.kind === "error" ? "error" : "stopped"}</span>
        </div>
        <div class="bst-loading-sub">${escapeHtml(recovery.detail)}</div>
        <div class="bst-loading-actions">
          <button class="bst-btn bst-btn-soft" data-bst-action="recover-tracker">${escapeHtml(recovery.actionLabel)}</button>
        </div>
      `;
      root.appendChild(recoveryBox);
      continue;
    }

    const showSummaryAction = latestAiIndex != null && entry.messageIndex === latestAiIndex;
    const showRetrackAction = latestTrackedMessageIndex != null && entry.messageIndex === latestTrackedMessageIndex;
    const retrackTargetsUserMessage = showRetrackAction && Boolean(isUserMessageIndex?.(entry.messageIndex));
    const summaryBusy = Boolean(showSummaryAction && summaryBusyMessageIndices?.has(entry.messageIndex));
    const userMessageEntry = Boolean(isUserMessageIndex?.(entry.messageIndex));
    const collapsed = isMessageCollapsed(entry.messageIndex);
    const resolvedSceneOwners = resolveTrackerSceneOwners(null, data);
    const currentLifecycleOwners = resolveCurrentLifecycleOwnersForTrackerData(data);
    const resolvedActiveEntityIds = resolveTrackerActiveEntityIds(null, data);
    const activeSet = new Set(currentLifecycleOwners.map(normalizeName));
    const allNumericDefs = getNumericStatDefinitions(settings);
    const cardNumericDefs = allNumericDefs.filter(def => def.showOnCard);
    const allNonNumericDefs = getNonNumericStatDefinitions(settings);
    const cardNonNumericDefs = allNonNumericDefs.filter(def => def.showOnCard);
    const sceneCardDefs = cardNonNumericDefs.filter(def => def.globalScope);
    const ownerCardNonNumericDefs = cardNonNumericDefs.filter(
      def => !(settings.sceneCardEnabled && def.globalScope),
    );
  const getEffectiveNumericRawValue = (
      key: string,
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): number | undefined => {
      const current = resolveCurrentNumericRawValue(data, key, name, {
        globalScope: isNumericGlobalScope(key),
        registryEntry,
      });
      if (current !== undefined && !Number.isNaN(current)) return current;
      if (resolveCurrentNumericRawValue(data, key, name, {
        globalScope: isNumericGlobalScope(key),
        registryEntry,
      }) === undefined && resolveRegistryLookupNamesForOwner(name, registryEntry ?? null)
        .some(lookupName => isNumericExplicitlyCleared(data, key, lookupName, isNumericGlobalScope(key)))) return undefined;
      const previous = findPreviousDataWithNumericStat(entry.messageIndex, key, name);
      if (previous) return previous.value;
      return undefined;
    };
    const hasEffectiveNumericValue = (
      key: string,
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): boolean =>
      getEffectiveNumericRawValue(key, name, registryEntry) !== undefined;
    const hasEffectiveNonNumericValue = (
      def: UiNonNumericStatDefinition,
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): boolean =>
      hasCurrentNonNumericValue(data, def, name, registryEntry)
        || (!resolveRegistryLookupNamesForOwner(name, registryEntry ?? null)
          .some(lookupName => isNonNumericExplicitlyCleared(data, def.id, lookupName, def.globalScope))
          && Boolean(findPreviousDataWithNonNumericStat(entry.messageIndex, def, name)));
    const resolveEffectiveNonNumericValue = (
      def: UiNonNumericStatDefinition,
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): string | boolean | string[] | null => {
      const current = resolveCurrentNonNumericRawValue(data, def.id, name, {
        globalScope: def.globalScope,
        registryEntry,
      });
      if (current !== undefined) return current;
      if (resolveRegistryLookupNamesForOwner(name, registryEntry ?? null)
        .some(lookupName => isNonNumericExplicitlyCleared(data, def.id, lookupName, def.globalScope))) {
        return def.kind === "array" ? [] : null;
      }
      const previous = findPreviousDataWithNonNumericStat(entry.messageIndex, def, name);
      if (previous) {
        const previousValue = resolvePreviousNonNumericValue(previous, def, name, entry.messageIndex);
        if (previousValue !== undefined) return previousValue;
      }
      if (shouldSuppressAliasNonNumericDefaultFallback(registryEntry, def.globalScope)) {
        return null;
      }
      return current ?? resolveNonNumericValue(data, def, name);
    };
    const getEffectiveMoodText = (
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): string => {
      if (!isBuiltInTextStatVisibleForOwner(settings, name, "mood", isOwnerStatEnabled)) return "";
      const current = resolveCurrentBuiltInTextValue(data, "mood", name, registryEntry);
      if (current !== undefined) return current;
      if (resolveRegistryLookupNamesForOwner(name, registryEntry ?? null)
        .some(lookupName => isTextStatExplicitlyCleared(data, "mood", lookupName))) return "";
      const previous = findPreviousDataWithBuiltInTextStat("mood", entry.messageIndex, name);
      const previousValue = previous ? resolvePreviousBuiltInTextValue(previous, "mood", name, entry.messageIndex) : undefined;
      if (previousValue !== undefined) return previousValue;
      return "";
    };
    const getEffectiveLastThoughtText = (
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): string => {
      if (!isBuiltInTextStatVisibleForOwner(settings, name, "lastThought", isOwnerStatEnabled)) return "";
      const current = resolveCurrentBuiltInTextValue(data, "lastThought", name, registryEntry);
      if (current !== undefined) return current;
      if (resolveRegistryLookupNamesForOwner(name, registryEntry ?? null)
        .some(lookupName => isTextStatExplicitlyCleared(data, "lastThought", lookupName))) return "";
      const previous = findPreviousDataWithBuiltInTextStat("lastThought", entry.messageIndex, name);
      const previousValue = previous ? resolvePreviousBuiltInTextValue(previous, "lastThought", name, entry.messageIndex) : undefined;
      if (previousValue !== undefined) return previousValue;
      return "";
    };
    const hasAnyStatFor = (
      name: string,
      registryEntry?: Pick<TrackerEntityRegistryEntry, "ownerName" | "canonicalName" | "aliases" | "kind"> | null,
    ): boolean =>
      cardNumericDefs.some(def => hasEffectiveNumericValue(def.key, name, registryEntry)) ||
      ownerCardNonNumericDefs.some(def => hasEffectiveNonNumericValue(def, name, registryEntry)) ||
      getEffectiveMoodText(name, registryEntry) !== "" ||
      getEffectiveLastThoughtText(name, registryEntry) !== "";
    const forceAllInGroup = isGroupChat;
    const dataCharacterNames = collectCharacterNamesFromTrackerData(data);
    const mergedCharacters: string[] = [];
    const mergedSeen = new Set<string>();
    for (const name of allCharacters) {
      pushUniqueCharacterName(mergedCharacters, mergedSeen, name);
    }
    for (const name of knownCharactersAcrossEntries) {
      pushUniqueCharacterName(mergedCharacters, mergedSeen, name);
    }
    for (const name of dataCharacterNames) {
      pushUniqueCharacterName(mergedCharacters, mergedSeen, name);
    }
    const registryEntriesForMessage = resolveRegistryEntriesForMessage?.(entry.messageIndex) ?? [];
    const activeEntityIdSet = new Set(resolvedActiveEntityIds);
    const registryOwnersForMessage = registryEntriesForMessage.length > 0
      ? resolveRegistryOwnersFromEntries(registryEntriesForMessage)
      : (resolveRegistryOwnersForMessage?.(entry.messageIndex) ?? []);
    const mergedWithRegistryOwners = registryEntriesForMessage.length > 0
      ? mergeRegistryEntitiesIntoTargets({
        targets: mergedCharacters,
        registryEntries: registryEntriesForMessage,
        resolveRegistryEntry: ownerName => resolveRegistryEntryForMessage?.(ownerName, entry.messageIndex) ?? null,
      })
      : mergeRegistryOwnersIntoTargets(
        mergedCharacters,
        registryOwnersForMessage,
      );
    const mergedWithRegistryTargets = registryEntriesForMessage.length > 0
      ? mergeRegistryRenderTargets({
        targets: mergedCharacters,
        registryEntries: registryEntriesForMessage,
        resolveRegistryEntry: ownerName => resolveRegistryEntryForMessage?.(ownerName, entry.messageIndex) ?? null,
      })
      : mergedWithRegistryOwners.map(name =>
        buildUiRenderTarget(
          name,
          resolveRegistryEntryForOwnerInMessageData({
            ownerName: name,
            messageIndex: entry.messageIndex,
            data,
            resolveRegistryEntryForMessage,
            resolveRegistryEntryByEntityIdForMessage,
          }),
        )).filter((target): target is UiRenderTarget => Boolean(target));
    const includeAllTargets = forceAllInGroup || settings.showInactive;
    const displayPoolTargets = selectDisplayPoolTargetsWithRegistry({
      entityTrackingMode: settings.entityTrackingMode,
      includeAllTargets,
      activeCharacters: resolvedSceneOwners,
      dataCharacterNames,
      mergedWithRegistryTargets,
      resolveTarget: name => buildUiRenderTarget(name, resolveRegistryEntryForOwnerInMessageData({
        ownerName: name,
        messageIndex: entry.messageIndex,
        data,
        resolveRegistryEntryForMessage,
        resolveRegistryEntryByEntityIdForMessage,
      })),
      shouldKeepTarget: target => shouldKeepOwnerInRenderTargetPool({
        ownerName: target.ownerName,
        hasAnyStat: hasAnyStatFor(target.ownerName, target.registryEntry),
        isActive: target.registryEntry?.id
          ? activeEntityIdSet.has(target.registryEntry.id)
          : activeSet.has(normalizeName(target.ownerName)),
      }),
    });
    const isRenderedUserOwner = (name: string): boolean => isUserOwnerToken(name, resolveDisplayName);
    const modeFilteredDisplayPoolTargets = filterRenderTargetsForTrackingMode({
      entityTrackingMode: settings.entityTrackingMode,
      targets: displayPoolTargets,
    });
    const scopedDisplayPoolTargets = userMessageEntry
      ? modeFilteredDisplayPoolTargets.filter(target => isRenderedUserOwner(target.ownerName))
      : modeFilteredDisplayPoolTargets.filter(target => !isRenderedUserOwner(target.ownerName));
    const displayOrder = new Map(scopedDisplayPoolTargets.map((target, index) => [target.uiKey, index]));
    const targetSource = includeAllTargets
      ? scopedDisplayPoolTargets
      : scopedDisplayPoolTargets.filter(target => shouldKeepOwnerInRenderTargetPool({
        ownerName: target.ownerName,
        hasAnyStat: hasAnyStatFor(target.ownerName, target.registryEntry),
        isActive: target.registryEntry?.id
          ? activeEntityIdSet.has(target.registryEntry.id)
          : activeSet.has(normalizeName(target.ownerName)),
      }));
    const uniqueTargets: UiRenderTarget[] = [];
    const uniqueTargetKeys = new Set<string>();
    for (const target of targetSource) {
      if (isTrackerEnabled?.(target.ownerName) === false) continue;
      if (uniqueTargetKeys.has(target.uiKey)) continue;
      uniqueTargetKeys.add(target.uiKey);
      uniqueTargets.push(target);
    }
    const getLifecycleState = (target: UiRenderTarget) => resolveCardLifecycleState({
      ownerName: target.ownerName,
      entityId: target.registryEntry?.id ?? null,
      currentMessageIndex: entry.messageIndex,
      currentActiveCharacters: currentLifecycleOwners,
      currentActiveEntityIds: resolvedActiveEntityIds,
      history: lifecycleSnapshots,
      autoArchiveInactiveCards: settings.autoArchiveInactiveCards,
      archiveInactiveAfterTurns: settings.archiveInactiveAfterTurns,
        registryState: resolveLifecycleRegistryStateForOwnerInMessageData({
          ownerName: target.ownerName,
          messageIndex: entry.messageIndex,
          data,
          resolveLifecycleRegistryState,
          resolveLifecycleRegistryStateByEntityId,
        }),
      });
      const targets = filterArchivedRenderTargets(
        filterTechnicalSourceRenderTargets(
          filterShadowedAliasRenderTargets(uniqueTargets),
          resolveOwnerRenderIdentity,
        ),
        getLifecycleState,
      )
        .sort((a, b) => {
        const rank = (state: "active" | "inactive" | "archived"): number =>
          state === "active" ? 0 : state === "inactive" ? 1 : 2;
        const aRank = rank(getLifecycleState(a));
        const bRank = rank(getLifecycleState(b));
        if (aRank !== bRank) return aRank - bRank;
        const aOrder = displayOrder.get(a.uiKey) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = displayOrder.get(b.uiKey) ?? Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.ownerName.localeCompare(b.ownerName);
        });
      onSyncEntityRegistry?.({
        messageIndex: entry.messageIndex,
        targets: uniqueTargets.map(target => ({
          ownerName: target.ownerName,
          registryEntry: target.registryEntry,
        })),
        getLifecycleState: target => getLifecycleState(
          buildUiRenderTarget(
            target.ownerName,
            target.registryEntry
              ?? resolveRegistryEntryForOwnerInMessageData({
                ownerName: target.ownerName,
                messageIndex: entry.messageIndex,
                data,
                resolveRegistryEntryForMessage,
                resolveRegistryEntryByEntityIdForMessage,
              }),
          ) ?? { ownerName: target.ownerName, uiKey: normalizeName(target.ownerName), registryEntry: null },
        ),
      });

      const cardHtmlByName: Array<{ name: string; displayName: string; ownerClass: string; html: string; isActive: boolean; isCollapsed: boolean; cardKey: string; isNew: boolean; cardColor: string }> = [];
    const signatureParts: string[] = [
      `msg:${entry.messageIndex}`,
      `collapsed:${collapsed ? "1" : "0"}`,
      `retrack:${showRetrackAction ? "1" : "0"}`,
      `summary:${showSummaryAction ? "1" : "0"}`,
      `retrackUser:${retrackTargetsUserMessage ? "1" : "0"}`,
      `summarybusy:${summaryBusy ? "1" : "0"}`,
      `collapseDefault:${settings.collapseCardsByDefault ? "1" : "0"}`,
      `inactive:${settings.showInactive ? "1" : "0"}`,
      `archive:${settings.autoArchiveInactiveCards ? "1" : "0"}`,
      `archiveafter:${settings.archiveInactiveAfterTurns}`,
      `thought:${settings.showLastThought ? "1" : "0"}`,
      `inactivelabel:${settings.inactiveLabel}`,
      `scale:${settings.fontSize}|${settings.cardOpacity}`
    ];

    for (const target of targets) {
      const name = target.ownerName;
      const lifecycleState = getLifecycleState(target);
      const isActive = lifecycleState === "active";
      if (!isActive && !settings.showInactive) continue;
      const displayName = resolveDisplayName?.(name)
        ?? (name === USER_TRACKER_KEY ? "User" : name);
      const registryEntry = target.registryEntry;
      const ownerUiKey = target.uiKey;
      const isUserCard = isRenderedUserOwner(name);
      const moodLookupName = isUserCard ? displayName : name;
      const characterAvatar = resolveCharacterAvatar?.(name) ?? undefined;
      const cardKey = `${entry.messageIndex}:${ownerUiKey}`;
      const cardCollapsed = resolveTrackerCardCollapsed({
        cardKey,
        isActive,
        collapsedActiveCardKeys,
        expandedInactiveCardKeys,
      });
      const baseEnabledNumeric = getNumericStatsForCharacter(data, name, settings);
      const baseEnabledNonNumeric = ownerCardNonNumericDefs.filter(def => (isUserCard ? def.trackUser : def.trackCharacters));
      const ownerStatEnabled = (statId: string): boolean => isOwnerStatEnabled?.(name, statId) !== false;
      const baseEnabledNumericScoped = baseEnabledNumeric.filter(def => ownerStatEnabled(String(def.key)));
      const baseEnabledNonNumericScoped = baseEnabledNonNumeric.filter(def => ownerStatEnabled(String(def.id)));
      const enabledNumeric = orderOwnerCardStats(
        baseEnabledNumericScoped,
        settings.characterCardStatOrder ?? [],
        def => String(def.key).trim().toLowerCase(),
      );
      const enabledNonNumeric = orderOwnerCardStats(
        baseEnabledNonNumericScoped,
        settings.characterCardStatOrder ?? [],
        def => String(def.id).trim().toLowerCase(),
      );
      const moodText = getEffectiveMoodText(name, registryEntry);
      const previousMoodData = findPreviousDataWithBuiltInTextStat("mood", entry.messageIndex, name);
      const prevMoodValue = previousMoodData
        ? resolvePreviousBuiltInTextValue(previousMoodData, "mood", name, entry.messageIndex)
        : undefined;
      const prevMood = prevMoodValue !== undefined ? prevMoodValue : moodText;
      const moodTrend = prevMood === moodText ? "stable" : "shifted";
      const canEdit = isUserCard
        ? (latestTrackedUserMessageIndex != null && entry.messageIndex === latestTrackedUserMessageIndex)
        : (latestTrackedAiMessageIndex != null && entry.messageIndex === latestTrackedAiMessageIndex);
      const moodSource = moodText ? getResolvedMoodSource(settings, moodLookupName, characterAvatar, registryEntry) : "bst_images";
      const stExpressionImageOptions = moodSource === "st_expressions"
        ? getResolvedStExpressionImageOptions(settings, moodLookupName, characterAvatar, registryEntry)
        : null;
      const moodImage = moodText
        ? getMoodImageUrl(settings, moodLookupName, moodText, characterAvatar, registryEntry, onRequestRerender)
        : null;
      const lastThoughtText = settings.showLastThought
        ? getEffectiveLastThoughtText(name, registryEntry)
        : "";
      const thoughtUiKey = thoughtKey(entry.messageIndex, ownerUiKey);
      const stExpressionImageStyle = (() => {
        if (!stExpressionImageOptions) return "";
        const panX = computeZoomPanOffset(stExpressionImageOptions.positionX, stExpressionImageOptions.zoom);
        const panY = computeZoomPanOffset(stExpressionImageOptions.positionY, stExpressionImageOptions.zoom);
        return ` style="object-position:${stExpressionImageOptions.positionX.toFixed(2)}% ${stExpressionImageOptions.positionY.toFixed(2)}% !important;transform:translate(${panX.toFixed(2)}%, ${panY.toFixed(2)}%) scale(${stExpressionImageOptions.zoom.toFixed(2)}) !important;transform-origin:center center !important;"`;
      })();
      const collapsedSummary = enabledNumeric.map(def => {
        const value = toPercent(getEffectiveNumericRawValue(def.key, name, registryEntry) ?? def.defaultValue);
        return `<span>${def.short} ${value}%</span>`;
      }).join("");
      const collapsedNonNumeric = enabledNonNumeric.map(def => {
        const value = resolveEffectiveNonNumericValue(def, name, registryEntry);
        if (value == null) return "";
        const text = formatNonNumericForDisplay(def, value);
        return `<span>${escapeHtml(shortLabelFrom(def.label))} ${escapeHtml(text)}</span>`;
      }).filter(Boolean).join("");
      const showCollapsedMood = moodText !== "";
      const cardColor = (isUserCard ? normalizeHexColor(settings.userCardColor) : null)
        ?? getResolvedCardColor(settings, moodLookupName, characterAvatar, registryEntry)
        ?? palette[name]
        ?? getStableAutoCardColor(name);
      const isNew = !renderedCardKeys.has(cardKey);
      renderedCardKeys.add(cardKey);
      const cardHtml = `
        <div class="bst-head">
          <div class="bst-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
          <div class="bst-actions">
            <button class="bst-mini-btn bst-mini-btn-icon" data-bst-action="toggle-card-collapse" data-bst-card-key="${escapeHtml(cardKey)}" data-bst-card-active="${isActive ? "true" : "false"}" title="${cardCollapsed ? `Expand ${escapeHtml(displayName)}` : `Collapse ${escapeHtml(displayName)}`}" aria-expanded="${cardCollapsed ? "false" : "true"}"><span aria-hidden="true">${cardCollapsed ? "&#9656;" : "&#9662;"}</span></button>
            ${!isUserCard ? `<button class="bst-mini-btn" data-bst-action="graph" data-character="${name}" data-entity-id="${escapeHtml(registryEntry?.id ?? "")}" title="Open relationship graph"><span aria-hidden="true">&#128200;</span> <span class="bst-graph-label">Graph</span></button>` : ""}
            ${canEdit ? `<button class="bst-mini-btn bst-mini-btn-icon" data-bst-action="edit-stats" data-bst-edit-message="${entry.messageIndex}" data-bst-edit-character="${escapeHtml(name)}" title="Edit last tracker stats for ${escapeHtml(displayName)}" aria-label="Edit last tracker stats for ${escapeHtml(displayName)}"><span aria-hidden="true">&#9998;</span></button>` : ""}
            ${!isUserCard ? `<div class="bst-state" title="${isActive ? "Active" : settings.inactiveLabel}">${isActive ? "Active" : `${settings.inactiveLabel} <span class="fa-solid fa-ghost bst-inactive-icon" aria-hidden="true"></span>`}</div>` : ""}
          </div>
        </div>
        ${enabledNumeric.length || enabledNonNumeric.length || showCollapsedMood ? `
        <div class="bst-collapsed-summary" title="Tracked stats">
          ${collapsedSummary || ""}
          ${collapsedNonNumeric || ""}
          ${showCollapsedMood ? `<span class="bst-collapsed-mood" title="${moodText}">${escapeHtml(resolveMoodSymbol(moodText, settings.moodSymbolMap))}</span>` : ""}
        </div>` : ""}
        <div class="bst-body"${cardCollapsed ? ` style="display:none"` : ""}>
        ${enabledNumeric.map(({ key, label, color, defaultValue }) => {
          const defDefault = defaultValue ?? 50;
          const currentValueRaw = resolveCurrentNumericRawValue(data, key, name, {
            globalScope: isNumericGlobalScope(key),
            registryEntry,
          });
          const hasCurrentValue = currentValueRaw !== undefined && !Number.isNaN(currentValueRaw);
          const effectiveValueRaw = getEffectiveNumericRawValue(key, name, registryEntry);
          const value = toPercent(effectiveValueRaw ?? defDefault);
          const previousForStat = findPreviousDataWithNumericStat(entry.messageIndex, key, name);
          const hasPrevValue = Boolean(previousForStat);
          const prevValue = toPercent(previousForStat ? previousForStat.value : value);
          const delta = Math.round(value - prevValue);
          const deltaClass = delta > 0 ? "bst-delta bst-delta-up" : delta < 0 ? "bst-delta bst-delta-down" : "bst-delta bst-delta-flat";
          const showDelta = latestAiIndex != null && entry.messageIndex === latestAiIndex && hasPrevValue && hasCurrentValue;
          const rowClass = showDelta && delta !== 0 ? "bst-row bst-row-changed" : "bst-row";
          return `
            <div class="${rowClass}">
              <div class="bst-label"><span>${label}</span><span>${value}%${showDelta ? `<span class="${deltaClass}">${formatDelta(delta)}</span>` : ""}</span></div>
              <div class="bst-track"><div class="bst-fill" style="width:${value}%;--bst-stat-color:${color};"></div></div>
            </div>
          `;
        }).join("")}
        ${enabledNonNumeric.map(def => {
          if (!hasEffectiveNonNumericValue(def, name, registryEntry)) return "";
          const resolved = resolveEffectiveNonNumericValue(def, name, registryEntry);
          const color = def.color || "#9bd5ff";
          if (def.kind === "array") {
            const items = Array.isArray(resolved) ? resolved : normalizeNonNumericArrayItems(resolved, def.textMaxLength);
            const arrayKey = `arr:${entry.messageIndex}:${ownerUiKey}:${def.id}`;
            const expanded = expandedArrayValueKeys.has(arrayKey);
            const hasOverflow = items.length > 4;
            const visibleItems = hasOverflow && !expanded ? items.slice(0, 4) : items;
            const chips = visibleItems.length
              ? visibleItems.map(item => `<span class="bst-array-item-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(item)}">${escapeHtml(item)}</span>`).join("")
              : `<span class="bst-array-item-empty">No items</span>`;
            return `
              <div class="bst-row bst-row-non-numeric">
                <div class="bst-label">
                  <span>${escapeHtml(def.label)}</span>
                </div>
                <div class="bst-array-items">
                  ${chips}
                  ${hasOverflow
                    ? `<button type="button" class="bst-array-toggle" data-bst-action="toggle-array-values" data-bst-array-key="${escapeHtml(arrayKey)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "Show less" : `+${items.length - 4} more`}</button>`
                    : ""}
                </div>
              </div>
            `;
          }
          if (def.kind === "date_time" && def.dateTimeMode === "structured") {
            return `
              <div class="bst-row bst-row-non-numeric">
                <div class="bst-label">
                  <span>${escapeHtml(def.label)}</span>
                </div>
                <div class="bst-array-items">
                  ${renderDateTimeStructuredChips(resolved ?? "", color)}
                </div>
              </div>
            `;
          }
          if (def.kind === "text_short") {
            const displayValue = resolved == null ? "not set" : formatNonNumericForDisplay(def, resolved);
            const textShortKey = `txt:${entry.messageIndex}:${ownerUiKey}:${def.id}`;
            return `
              <div class="bst-row bst-row-non-numeric">
                <div class="bst-label">
                  <span>${escapeHtml(def.label)}</span>
                </div>
                ${renderTextShortMarkup({
                  text: displayValue,
                  key: textShortKey,
                  color,
                  expanded: expandedTextShortKeys.has(textShortKey),
                })}
              </div>
            `;
          }
          const displayValue = resolved == null ? "not set" : formatNonNumericForDisplay(def, resolved);
          return `
            <div class="bst-row bst-row-non-numeric">
              <div class="bst-label">
                <span>${escapeHtml(def.label)}</span>
                <span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValue)}">${escapeHtml(displayValue)}</span>
              </div>
            </div>
          `;
        }).join("")}
        ${moodText !== "" ? `
        <div class="bst-mood${moodImage ? " bst-mood-has-image" : ""}" title="${moodText} (${moodTrend})">
          <div class="bst-mood-wrap ${moodImage ? "bst-mood-wrap--image" : "bst-mood-wrap--emoji"}">
            ${moodImage
              ? `<button type="button" class="bst-mood-image-trigger" data-bst-action="open-mood-preview" data-bst-image-src="${escapeHtml(moodImage)}" data-bst-image-alt="${escapeHtml(moodText)}" data-bst-image-character="${escapeHtml(displayName)}" data-bst-image-mood="${escapeHtml(moodText)}" aria-label="Open mood image preview for ${escapeHtml(displayName)} (${escapeHtml(moodText)})"><span class="bst-mood-image-frame${moodSource === "st_expressions" ? " bst-mood-image-frame--st-expression" : ""}"><img class="bst-mood-image${moodSource === "st_expressions" ? " bst-mood-image--st-expression" : ""}" src="${escapeHtml(moodImage)}" alt="${escapeHtml(moodText)}"${stExpressionImageStyle}></span></button>`
              : `<span class="bst-mood-chip"><span class="bst-mood-emoji">${escapeHtml(resolveMoodSymbol(moodText, settings.moodSymbolMap))}</span></span>`}
            ${moodImage && lastThoughtText
              ? renderThoughtMarkup(lastThoughtText, thoughtUiKey, "bubble", expandedThoughtKeys.has(thoughtUiKey))
              : moodImage
                ? ""
                : `<span class="bst-mood-badge" style="background:${moodBadgeColor(moodText)};">${moodText} (${moodTrend})</span>`}
          </div>
        </div>` : ""}
        ${settings.showLastThought && lastThoughtText !== "" && !moodImage ? renderThoughtMarkup(lastThoughtText, thoughtUiKey, "panel", expandedThoughtKeys.has(thoughtUiKey)) : ""}
        ${enabledNumeric.length === 0 && enabledNonNumeric.length === 0 && moodText === "" && !(settings.showLastThought && lastThoughtText !== "") ? `<div class="bst-empty">No stats recorded.</div>` : ""}
        </div>
      `;
      const ownerClass = `bst-owner-${toOwnerClassSuffix(displayName)}`;
      cardHtmlByName.push({ name, displayName, ownerClass, html: cardHtml, isActive, isCollapsed: cardCollapsed, cardKey, isNew, cardColor });
      const nonNumericSignature = enabledNonNumeric.map(def => {
        const value = resolveEffectiveNonNumericValue(def, name, registryEntry);
        if (value == null) return `${def.id}:not_set`;
        if (Array.isArray(value)) return `${def.id}:[${value.join("|")}]`;
        return `${def.id}:${typeof value === "boolean" ? String(value) : value}`;
      }).join("|");
      signatureParts.push(`card:${ownerUiKey}:${name}:${isActive ? "1" : "0"}:${moodText}:${moodImage ?? ""}:${lastThoughtText}:${nonNumericSignature}:${cardColor}:${cardHtml}`);
    }

    const hasSceneCard = settings.sceneCardEnabled && sceneCardDefs.length > 0;
    const hasEffectiveSceneValue = (def: UiNonNumericStatDefinition): boolean =>
      hasNonNumericValue(data, def, GLOBAL_TRACKER_KEY) ||
      Boolean(findPreviousDataWithNonNumericStat(entry.messageIndex, def, GLOBAL_TRACKER_KEY));
    const resolveSceneValue = (def: UiNonNumericStatDefinition): string | boolean | string[] | null => {
      if (hasNonNumericValue(data, def, GLOBAL_TRACKER_KEY)) {
        return resolveNonNumericValue(data, def, GLOBAL_TRACKER_KEY);
      }
      const previous = findPreviousDataWithNonNumericStat(entry.messageIndex, def, GLOBAL_TRACKER_KEY);
      if (previous) {
        return resolveNonNumericValue(previous, def, GLOBAL_TRACKER_KEY);
      }
      return resolveNonNumericValue(data, def, GLOBAL_TRACKER_KEY);
    };
    const baseSceneValues = hasSceneCard
      ? sceneCardDefs.map(def => {
        const value = resolveSceneValue(def);
        const hasCurrentValue = hasEffectiveSceneValue(def);
        const hasResolvedValue = value != null && (def.kind !== "array" || (Array.isArray(value) ? value.length > 0 : normalizeNonNumericArrayItems(value, def.textMaxLength).length > 0));
        return {
          def,
          value,
          hasValue: hasCurrentValue || hasResolvedValue,
        };
      })
      : [];
    const order = new Map((settings.sceneCardStatOrder ?? []).map((id, index) => [String(id ?? "").trim().toLowerCase(), index]));
    const sceneDisplayById = settings.sceneCardStatDisplay ?? {};
    const sceneValues = [...baseSceneValues]
      .map(item => {
        const id = String(item.def.id ?? "").trim().toLowerCase();
        const display = sceneDisplayById[id] ?? null;
        return { ...item, id, display };
      })
      .filter(item => item.display?.visible !== false)
      .filter(item => item.hasValue || item.display?.hideWhenEmpty !== true)
      .sort((a, b) => {
        const aIdx = order.get(a.id);
        const bIdx = order.get(b.id);
        const aRank = aIdx == null ? Number.MAX_SAFE_INTEGER : aIdx;
        const bRank = bIdx == null ? Number.MAX_SAFE_INTEGER : bIdx;
        if (aRank !== bRank) return aRank - bRank;
        return a.def.label.localeCompare(b.def.label);
      });
    const sceneCardVisible = settings.sceneCardShowWhenEmpty || sceneValues.length > 0;
    const canEditSceneCard =
      (latestTrackedAiMessageIndex != null && entry.messageIndex === latestTrackedAiMessageIndex) ||
      (latestTrackedUserMessageIndex != null && entry.messageIndex === latestTrackedUserMessageIndex);
    const sceneCollapsed = collapsedSceneMessages.has(entry.messageIndex);
    const sceneCardHtml = sceneCardVisible
      ? `
        <div class="bst-head">
          <div class="bst-name" title="${escapeHtml(settings.sceneCardTitle)}">${escapeHtml(settings.sceneCardTitle)}</div>
          <div class="bst-actions">
            <button class="bst-mini-btn bst-mini-btn-icon" data-bst-action="toggle-scene-collapse" title="${sceneCollapsed ? "Expand scene card" : "Collapse scene card"}" aria-expanded="${sceneCollapsed ? "false" : "true"}"><span aria-hidden="true">${sceneCollapsed ? "&#9656;" : "&#9662;"}</span></button>
            ${canEditSceneCard
              ? `<button class="bst-mini-btn bst-mini-btn-icon" data-bst-action="edit-stats" data-bst-edit-message="${entry.messageIndex}" data-bst-edit-character="${escapeHtml(GLOBAL_TRACKER_KEY)}" title="Edit latest Scene tracker stats" aria-label="Edit latest Scene tracker stats"><span aria-hidden="true">&#9998;</span></button>`
              : ""}
            <div class="bst-state" title="Global scene stats">Global</div>
          </div>
        </div>
        <div class="bst-body"${sceneCollapsed ? ` style="display:none"` : ""}>
          ${sceneValues.map(item => {
            const def = item.def;
            const resolved = item.value as string | boolean | string[];
            const display = item.display;
            const color = display?.colorOverride || settings.sceneCardValueColor || def.color || settings.accentColor || "#9bd5ff";
            const statLabel = display?.labelOverride?.trim() ? display.labelOverride.trim() : def.label;
            const showLabel = display?.showLabel !== false;
            const valueStyle = display?.valueStyle === "chip" || display?.valueStyle === "plain" ? display.valueStyle : "auto";
            const textMaxLength = display?.textMaxLength ?? null;
            const statLayout = display?.layoutOverride === "chips" || display?.layoutOverride === "rows"
              ? display.layoutOverride
              : settings.sceneCardLayout;
            if (statLayout === "rows") {
              if (def.kind === "date_time" && def.dateTimeMode === "structured") {
                return `
                  <div class="bst-row bst-row-non-numeric">
                    <div class="bst-label">
                      ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                    </div>
                    <div class="bst-array-items">
                      ${renderDateTimeStructuredChips(resolved ?? "", color, {
                        showWeekday: display?.dateTimeShowWeekday,
                        showDate: display?.dateTimeShowDate,
                        showTime: display?.dateTimeShowTime,
                        showPhase: display?.dateTimeShowPhase,
                        showPartLabels: display?.dateTimeShowPartLabels,
                        labelWeekday: display?.dateTimeLabelWeekday,
                        labelDate: display?.dateTimeLabelDate,
                        labelTime: display?.dateTimeLabelTime,
                        labelPhase: display?.dateTimeLabelPhase,
                        dateFormat: display?.dateTimeDateFormat,
                        partOrder: display?.dateTimePartOrder,
                      })}
                    </div>
                  </div>
                `;
              }
              if (def.kind === "array") {
                const items = Array.isArray(resolved) ? resolved : normalizeNonNumericArrayItems(resolved, def.textMaxLength);
                const textValueRaw = items.length ? items.join(", ") : "Not set";
                const textValue = truncateDisplayText(textValueRaw, textMaxLength);
                return `
                  <div class="bst-row bst-row-non-numeric">
                    <div class="bst-label">
                      ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                      ${valueStyle === "plain"
                        ? `<span class="bst-scene-plain-value" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(textValueRaw)}">${escapeHtml(textValue)}</span>`
                        : `<span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(textValueRaw)}">${escapeHtml(textValue)}</span>`}
                    </div>
                  </div>
                `;
              }
              if (def.kind === "text_short") {
                const displayValueRaw = resolved == null ? "Not set" : formatNonNumericForDisplay(def, resolved);
                const sceneTextShortKey = `txtscene:${entry.messageIndex}:${def.id}`;
                return `
                  <div class="bst-row bst-row-non-numeric">
                    <div class="bst-label">
                      ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                    </div>
                    ${renderTextShortMarkup({
                      text: displayValueRaw,
                      key: sceneTextShortKey,
                      color,
                      expanded: expandedTextShortKeys.has(sceneTextShortKey),
                    })}
                  </div>
                `;
              }
              if (def.kind === "date_time") {
                const dateFormat =
                  display?.dateTimeDateFormat === "dmy" ||
                  display?.dateTimeDateFormat === "mdy" ||
                  display?.dateTimeDateFormat === "d_mmm_yyyy" ||
                  display?.dateTimeDateFormat === "mmmm_d_yyyy" ||
                  display?.dateTimeDateFormat === "mmmm_do_yyyy"
                    ? display.dateTimeDateFormat
                    : "iso";
                const displayValueRaw = formatDateTimeTimestampDisplay(resolved ?? "", dateFormat);
                const displayValue = truncateDisplayText(displayValueRaw, textMaxLength);
                return `
                  <div class="bst-row bst-row-non-numeric">
                    <div class="bst-label">
                      ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                      ${valueStyle === "plain"
                        ? `<span class="bst-scene-plain-value" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`
                        : `<span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`}
                    </div>
                  </div>
                `;
              }
              const displayValueRaw = resolved == null ? "Not set" : formatNonNumericForDisplay(def, resolved);
              const displayValue = truncateDisplayText(displayValueRaw, textMaxLength);
              return `
                <div class="bst-row bst-row-non-numeric">
                  <div class="bst-label">
                    ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                    ${valueStyle === "plain"
                      ? `<span class="bst-scene-plain-value" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`
                      : `<span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`}
                  </div>
                </div>
              `;
            }
            if (def.kind === "date_time" && def.dateTimeMode === "structured") {
              return `
                <div class="bst-row bst-row-non-numeric">
                  <div class="bst-label">
                    ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                  </div>
                  <div class="bst-array-items">
                    ${renderDateTimeStructuredChips(resolved ?? "", color, {
                      showWeekday: display?.dateTimeShowWeekday,
                      showDate: display?.dateTimeShowDate,
                      showTime: display?.dateTimeShowTime,
                      showPhase: display?.dateTimeShowPhase,
                      showPartLabels: display?.dateTimeShowPartLabels,
                      labelWeekday: display?.dateTimeLabelWeekday,
                      labelDate: display?.dateTimeLabelDate,
                      labelTime: display?.dateTimeLabelTime,
                      labelPhase: display?.dateTimeLabelPhase,
                      dateFormat: display?.dateTimeDateFormat,
                      partOrder: display?.dateTimePartOrder,
                    })}
                  </div>
                </div>
              `;
            }
            if (def.kind === "array") {
              const items = Array.isArray(resolved) ? resolved : normalizeNonNumericArrayItems(resolved, def.textMaxLength);
              const arrayLimit = Math.max(1, Math.min(MAX_CUSTOM_ARRAY_ITEMS, display?.arrayCollapsedLimit ?? settings.sceneCardArrayCollapsedLimit));
              const sceneArrayKey = `arrscene:${entry.messageIndex}:${def.id}`;
              const expanded = expandedArrayValueKeys.has(sceneArrayKey);
              const hasOverflow = items.length > arrayLimit;
              const visibleItems = hasOverflow && !expanded ? items.slice(0, arrayLimit) : items;
              const chips = visibleItems.length
                ? visibleItems.map(itemValue => {
                  const value = truncateDisplayText(itemValue, textMaxLength);
                  return `<span class="bst-array-item-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(itemValue)}">${escapeHtml(value)}</span>`;
                }).join("")
                : `<span class="bst-array-item-empty">Not set</span>`;
              return `
                <div class="bst-row bst-row-non-numeric">
                  <div class="bst-label">
                    ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                  </div>
                  <div class="bst-array-items">
                    ${chips}
                    ${hasOverflow
                      ? `<button type="button" class="bst-array-toggle" data-bst-action="toggle-array-values" data-bst-array-key="${escapeHtml(sceneArrayKey)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "Show less" : `+${items.length - arrayLimit} more`}</button>`
                      : ""}
                  </div>
                </div>
              `;
            }
            if (def.kind === "text_short") {
              const displayValueRaw = resolved == null ? "Not set" : formatNonNumericForDisplay(def, resolved);
              const sceneTextShortKey = `txtscene:${entry.messageIndex}:${def.id}`;
              return `
                <div class="bst-row bst-row-non-numeric">
                  <div class="bst-label">
                    ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                  </div>
                  ${renderTextShortMarkup({
                    text: displayValueRaw,
                    key: sceneTextShortKey,
                    color,
                    expanded: expandedTextShortKeys.has(sceneTextShortKey),
                  })}
                </div>
              `;
            }
            if (def.kind === "date_time") {
              const dateFormat =
                display?.dateTimeDateFormat === "dmy" ||
                display?.dateTimeDateFormat === "mdy" ||
                display?.dateTimeDateFormat === "d_mmm_yyyy" ||
                display?.dateTimeDateFormat === "mmmm_d_yyyy" ||
                display?.dateTimeDateFormat === "mmmm_do_yyyy"
                  ? display.dateTimeDateFormat
                  : "iso";
              const displayValueRaw = formatDateTimeTimestampDisplay(resolved ?? "", dateFormat);
              const displayValue = truncateDisplayText(displayValueRaw, textMaxLength);
              return `
                <div class="bst-row bst-row-non-numeric">
                  <div class="bst-label">
                    ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                    ${valueStyle === "plain"
                      ? `<span class="bst-scene-plain-value" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`
                      : `<span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`}
                  </div>
                </div>
              `;
            }
            const displayValueRaw = resolved == null ? "Not set" : formatNonNumericForDisplay(def, resolved);
            const displayValue = truncateDisplayText(displayValueRaw, textMaxLength);
            return `
              <div class="bst-row bst-row-non-numeric">
                <div class="bst-label">
                  ${showLabel ? `<span>${escapeHtml(statLabel)}</span>` : ""}
                  ${valueStyle === "plain"
                    ? `<span class="bst-scene-plain-value" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`
                    : `<span class="bst-non-numeric-chip" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(displayValueRaw)}">${escapeHtml(displayValue)}</span>`}
                </div>
              </div>
            `;
          }).join("")}
          ${sceneValues.length === 0 ? `<div class="bst-empty">No global stats recorded.</div>` : ""}
        </div>
      `
      : "";
    signatureParts.push(`scene:${sceneCardVisible ? "1" : "0"}:${sceneCollapsed ? "1" : "0"}:${settings.sceneCardEnabled ? "1" : "0"}:${settings.sceneCardPosition}:${settings.sceneCardLayout}:${(settings.sceneCardStatOrder ?? []).join(",")}:${JSON.stringify(settings.sceneCardStatDisplay ?? {})}:${settings.sceneCardTitle}:${settings.sceneCardColor}:${settings.sceneCardValueColor}:${settings.sceneCardShowWhenEmpty ? "1" : "0"}:${settings.sceneCardArrayCollapsedLimit}:${sceneCardHtml}`);
    const renderSignature = signatureParts.join("|#|");
    if (root.dataset.bstRenderPhase === "idle" && root.dataset.bstRenderSignature === renderSignature) {
      continue;
    }
    root.dataset.bstRenderPhase = "idle";
    root.dataset.bstRenderSignature = renderSignature;
    root.innerHTML = "";

    const totalVisibleCards = cardHtmlByName.length + (sceneCardVisible ? 1 : 0);
    const cardNoun = totalVisibleCards === 1 ? "card" : "cards";
    const collapseLabel = collapsed ? `Expand ${cardNoun}` : `Collapse ${cardNoun}`;
    const actions = document.createElement("div");
    actions.className = "bst-root-actions";
    actions.innerHTML = `
      <button class="bst-mini-btn bst-root-action-main" data-bst-action="toggle-all-collapse" title="${collapseLabel}" aria-expanded="${String(!collapsed)}">
        <span class="bst-root-action-icon" aria-hidden="true">${collapsed ? "&#9656;" : "&#9662;"}</span>
        <span class="bst-root-action-label">${collapseLabel}</span>
      </button>
      ${showSummaryAction ? `<button class="bst-mini-btn bst-mini-btn-icon bst-root-action-summary${summaryBusy ? " is-loading" : ""}" data-bst-action="send-summary" data-loading="${summaryBusy ? "true" : "false"}" title="${summaryBusy ? "Generating prose summary of current tracked stats..." : "Generate prose summary of current tracked stats and post as a Note"}" aria-label="${summaryBusy ? "Generating prose summary of current tracked stats..." : "Generate prose summary of current tracked stats and post as a Note"}"${summaryBusy ? " disabled" : ""}><span aria-hidden="true">${summaryBusy ? "&#8987;" : "&#128221;"}</span></button>` : ""}
      ${showRetrackAction ? `<button class="bst-mini-btn bst-mini-btn-icon bst-mini-btn-accent bst-root-action-retrack" data-bst-action="retrack" title="${retrackTargetsUserMessage ? "Retrack this user message" : "Retrack this AI message"}" aria-label="${retrackTargetsUserMessage ? "Retrack this user message" : "Retrack this AI message"}"><span aria-hidden="true">&#x21BB;</span></button>` : ""}
    `;
    root.appendChild(actions);

    const appendSceneCard = (target: HTMLElement): void => {
      if (!sceneCardVisible) {
        target.innerHTML = "";
        return;
      }
      const card = document.createElement("div");
      card.className = "bst-card bst-scene-card";
      const color = normalizeHexColor(settings.sceneCardColor)
        ?? palette[GLOBAL_TRACKER_KEY]
        ?? getStableAutoCardColor(GLOBAL_TRACKER_KEY);
      card.style.setProperty("--bst-card-local", color);
      const scenePalette = buildActionPalette(color);
      card.style.setProperty("--bst-action-bg", scenePalette.bg);
      card.style.setProperty("--bst-action-border", scenePalette.border);
      card.style.setProperty("--bst-action-text", scenePalette.text);
      card.style.setProperty("--bst-action-bg-hover", scenePalette.hoverBg);
      card.style.setProperty("--bst-action-border-hover", scenePalette.hoverBorder);
      card.style.setProperty("--bst-action-focus", scenePalette.focus);
      card.innerHTML = sceneCardHtml;
      target.innerHTML = "";
      target.appendChild(card);
    };
    const appendOwnerCards = (): void => {
      for (const item of cardHtmlByName) {
        const card = document.createElement("div");
        card.className = `bst-card ${item.ownerClass}${item.isActive ? "" : " bst-card-inactive"}${item.isNew ? " bst-card-new" : ""}${item.isCollapsed ? " bst-card-collapsed" : ""}`;
        card.dataset.bstOwner = item.displayName;
        card.dataset.bstOwnerClass = item.ownerClass;
        card.dataset.bstCardKey = item.cardKey;
        card.dataset.bstCardActive = item.isActive ? "true" : "false";
        card.style.setProperty("--bst-card-local", item.cardColor);
        const palette = buildActionPalette(item.cardColor);
        card.style.setProperty("--bst-action-bg", palette.bg);
        card.style.setProperty("--bst-action-border", palette.border);
        card.style.setProperty("--bst-action-text", palette.text);
        card.style.setProperty("--bst-action-bg-hover", palette.hoverBg);
        card.style.setProperty("--bst-action-border-hover", palette.hoverBorder);
        card.style.setProperty("--bst-action-focus", palette.focus);
        card.innerHTML = item.html;
        root.appendChild(card);
      }
    };
    const syncThoughtOverflowIn = (host: ParentNode | null | undefined): void => {
      if (!host) return;
      host.querySelectorAll<HTMLElement>('[data-bst-thought-container="1"]').forEach(container => {
        const key = String(container.getAttribute("data-bst-thought-key") ?? "").trim();
        const textNode = container.querySelector<HTMLElement>(".bst-thought-text, .bst-mood-bubble-text");
        const toggle = container.querySelector<HTMLButtonElement>('[data-bst-action="toggle-thought"]');
        if (!textNode || !toggle) return;
        const state = resolveThoughtToggleState({
          scrollHeight: textNode.scrollHeight,
          clientHeight: textNode.clientHeight,
          scrollWidth: textNode.scrollWidth,
          clientWidth: textNode.clientWidth,
        }, expandedThoughtKeys.has(key));
        if (!state.overflowing) {
          if (key) expandedThoughtKeys.delete(key);
          container.classList.remove("bst-thought-expanded");
        }
        toggle.hidden = state.hidden;
        toggle.setAttribute("aria-expanded", state.ariaExpanded);
        toggle.textContent = state.label;
      });
    };
    const syncTextShortOverflowIn = (host: ParentNode | null | undefined): void => {
      if (!host) return;
      host.querySelectorAll<HTMLElement>('[data-bst-text-short-container="1"]').forEach(container => {
        const key = String(container.getAttribute("data-bst-text-short-key") ?? "").trim();
        const textNode = container.querySelector<HTMLElement>(".bst-text-short-value-text");
        const toggle = container.querySelector<HTMLButtonElement>('[data-bst-action="toggle-text-short"]');
        if (!textNode || !toggle) return;
        const state = resolveTextShortToggleState({
          scrollHeight: textNode.scrollHeight,
          clientHeight: textNode.clientHeight,
          scrollWidth: textNode.scrollWidth,
          clientWidth: textNode.clientWidth,
        }, expandedTextShortKeys.has(key));
        if (!state.overflowing) {
          if (key) expandedTextShortKeys.delete(key);
          container.classList.remove("bst-text-short-expanded");
        }
        toggle.hidden = state.hidden;
        toggle.setAttribute("aria-expanded", state.ariaExpanded);
        toggle.textContent = state.label;
      });
    };
    if (sceneRoot) {
      const sceneSignature = `sceneRoot:${sceneCardVisible ? "1" : "0"}:${sceneCollapsed ? "1" : "0"}:${sceneCardHtml}`;
      if (sceneRoot.dataset.bstRenderPhase !== "idle" || sceneRoot.dataset.bstRenderSignature !== sceneSignature) {
        sceneRoot.dataset.bstRenderPhase = "idle";
        sceneRoot.dataset.bstRenderSignature = sceneSignature;
        sceneRoot.style.display = sceneCardVisible ? "grid" : "none";
        appendSceneCard(sceneRoot);
      }
    }
    if (sceneCardVisible && settings.sceneCardPosition === "above_tracker_cards") {
      const inlineSceneHost = document.createElement("div");
      inlineSceneHost.className = "bst-inline-scene-host";
      root.appendChild(inlineSceneHost);
      appendSceneCard(inlineSceneHost);
      appendOwnerCards();
      syncThoughtOverflowIn(inlineSceneHost);
      syncThoughtOverflowIn(root);
      syncTextShortOverflowIn(inlineSceneHost);
      syncTextShortOverflowIn(root);
    } else {
      appendOwnerCards();
      if (sceneCardVisible && !sceneRoot) {
        const inlineSceneHost = document.createElement("div");
        inlineSceneHost.className = "bst-inline-scene-host";
        root.appendChild(inlineSceneHost);
        appendSceneCard(inlineSceneHost);
        syncThoughtOverflowIn(inlineSceneHost);
        syncTextShortOverflowIn(inlineSceneHost);
      }
      syncThoughtOverflowIn(root);
      syncTextShortOverflowIn(root);
    }
    syncThoughtOverflowIn(sceneRoot);
    syncTextShortOverflowIn(sceneRoot);
    bindOverflowResyncEvents();
    scheduleDeferredOverflowResync();
  }
}

export function removeTrackerUI(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll(".bst-scene-root").forEach(el => el.remove());
  document.getElementById(STYLE_ID)?.remove();
  document.querySelector(".bst-settings-backdrop")?.remove();
  document.querySelector(".bst-settings")?.remove();
  closeMoodImageModal(true);
  closeStExpressionFrameEditor();
  closeGraphModal();
}

function hasCharacterSnapshot(entry: TrackerData, character: string): boolean {
  for (const statKey of BUILT_IN_NUMERIC_STAT_KEYS) {
    if (hasNumericValue(entry, statKey, character)) return true;
  }
  if (entry.customStatistics) {
    for (const values of Object.values(entry.customStatistics)) {
      if (values?.[character] !== undefined) return true;
    }
  }
  if (entry.customNonNumericStatistics) {
    for (const values of Object.values(entry.customNonNumericStatistics)) {
      if (values?.[character] !== undefined) return true;
    }
  }
  return (
    entry.statistics.mood?.[character] !== undefined ||
    entry.statistics.lastThought?.[character] !== undefined
  );
}

