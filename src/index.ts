import {
  buildRecentContext,
  getAllTrackedCharacterNames,
  resolveActiveCharacterAnalysis,
  setManualInactiveCharacter,
} from "./activity";
import { resolveCharacterDefaultsEntry } from "./characterDefaults";
import { resolveAutoBootstrapTarget } from "./bootstrapTargets";
import {
  isAliasResolvedOwner,
  projectTrackerDataToMessageScopedOwners,
  resolveCharacterIdentity,
  resolveCharacterFromContext,
  resolveEntityResolverCandidateOwners,
  constrainFallbackOwnerScopesToPreviousUserScene,
  constrainResolvedOwnerScopesToPreviousUserScene,
  buildEntityResolverContinuitySnapshot,
  selectResolverContinuityHistoryEntries,
  resolveExtractionOwnerScopes,
  resolveEntityTrackingMode,
  filterResolvedEntitiesToTrackedOwners,
  resolveInitialExtractionOwners,
  resolveModelExtractionOwnerScopes,
  resolvePersistedSnapshotResolvedEntities,
  resolvePersistedSnapshotActiveEntityIds,
  resolvePersistedSnapshotActiveOwners,
  resolvePersistedSnapshotEntityOwners,
  resolveStableEntityIdForOwner,
  resolveUserExtractionOwnerScopes,
} from "./entityResolution";
import {
  buildMultiCharacterResolverPrompt,
  parseMultiCharacterResolverResponse,
  resolveMessageEntityIdsFromResolvedEntities,
  resolveMessageOwnersFromResolvedEntities,
  resolveSceneEntityIdsFromResolvedEntities,
  resolveSceneOwnersFromResolvedEntities,
} from "./entityResolver";
import { materializeNarrativeEntityCreations } from "./narrativeEntityResolution";
import {
  buildActiveSeedDefaultsPolicy,
  resolveSeededOwnerLookupValue,
  shouldUseConfiguredOwnerDefaults,
} from "./entitySeedPolicy";
import {
  buildEntitySourceKey,
  getEntityRegistryEntryByOwnerName,
  getEntityRegistryEntryForMessage,
  getEntityRegistryEntryByEntityIdForMessage,
  getEntityRegistryLifecycleStateForMessage,
  getEntityRegistryLifecycleStateForEntityIdForMessage,
  listEntityRegistryEntriesForMessage,
  listEntityRegistryOwnersForMessage,
  listTrackerDataLookupNamesForOwnerWithEntityFallback,
  resolveEntityRegistryLookupValue,
  resolveTrackerDataLookupValue,
  resolveTrackerEntityIdsForOwners,
  resolveTrackerSceneOwners,
  syncEntityRegistryFromRender,
} from "./entityRegistry";
import { syncEntityRegistryFromTrackerData } from "./entityRegistrySync";
import { hasTrackedValueForOwner, hasTrackedValueForSelection } from "./trackerDataPresence";
import { applyEditedTrackerActiveState, buildEditedTrackerDataSnapshot, syncEditedTrackerEntityState } from "./trackerEditState";
import {
  buildEntityScopedCustomNonNumericStatisticsBuckets,
  buildEntityScopedCustomStatisticsBuckets,
  buildEntityScopedStatisticsBuckets,
  buildTargetToEntityMap,
} from "./entityScopedBuckets";
import { buildPersistedTrackerSnapshot } from "./persistedTrackerSnapshot";
import {
  buildFallbackSummaryProse as buildFallbackSummaryProseHelper,
  buildSummaryTrackerStateLines as buildSummaryTrackerStateLinesHelper,
  collectSummaryCharacters as collectSummaryCharactersHelper,
} from "./trackerSummary";
import type { Character } from "./types";
import { extractStatisticsParallel } from "./extractor";
import { buildProgressResolveActive } from "./extractorProgress";
import {
  buildNoActiveContinuityTrackerData,
  overlayLatestOwnerScopedContinuity,
  resolveBaselineBeforeIndex,
  selectNoActiveContinuityTrackerEntry,
  shouldBypassConfidenceControls,
} from "./extractorHelpers";
import { resolveExtractionFailurePolicy } from "./extractionFailurePolicy";
import { shouldReplayUserTurnAfterExtraction } from "./extractionContinuationPolicy";
import { isTrackableAiMessage, isTrackableMessage, isTrackableUserMessage } from "./messageFilter";
import { clearPromptInjection, getLastInjectedPrompt, getLastInjectedPromptDebug } from "./promptInjection";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
import { enforceDebugStorageBudget, persistDebugStorageValue, trimDebugRecordForStorage, trimTraceLinesForStorage } from "./debugStorage";
import {
  buildTrackerSummaryGenerationPrompt,
  buildTrackerSummaryLengthenPrompt,
  buildTrackerSummaryNoNumbersRewritePrompt,
  moodOptions,
} from "./prompts";
import { upsertSettingsPanel } from "./settingsPanel";
import { discoverConnectionProfiles, getActiveConnectionProfileId, getContext, getSettingsProvenance, loadSettings, logDebug, resolveConnectionProfileId, saveSettings } from "./settings";
import {
  clearTrackerDataForMessage,
  clearTrackerDataForCurrentChat,
  getLatestTrackerDataWithIndexBefore,
  getRecentTrackerHistory,
  getRecentTrackerHistoryEntries,
  getTrackerDataFromMessage,
  mergeCustomNonNumericStatisticsWithFallback,
  mergeCustomStatisticsWithFallback,
  mergeTrackerDataChronologically,
  mergeStatisticsWithFallback,
  writeTrackerDataToMessage
} from "./storage";
import { getAllNumericStatDefinitions } from "./statRegistry";
import type {
  BetterSimTrackerSettings,
  ClearedCustomNonNumericStatistics,
  ClearedCustomStatistics,
  ClearedStatistics,
  CustomNonNumericValue,
  CustomNonNumericStatistics,
  CustomStatistics,
  DeltaDebugRecord,
  STContext,
  Statistics,
  TrackerData,
  TrackerGraphTarget,
} from "./types";
import {
  removeTrackerUI,
  rerenderExtractionLoadingInPlace,
  renderTracker,
  type TrackerRecoveryEntry,
  type TrackerUiState,
} from "./ui";
import { getGraphPreferences } from "./graphPreferences";
import { closeGraphModal, openGraphModal } from "./graphModal";
import { buildStatSeries, selectGraphTimelineEntries } from "./graphTimeline";
import { cancelActiveGenerations, generateJson } from "./generator";
import { registerSlashCommands } from "./slashCommands";
import { initCharacterPanel } from "./characterPanel";
import { initPersonaPanel } from "./personaPanel";
import { initDynamicCharactersPanel } from "./dynamicCharactersPanel";
import { extractLorebookEntriesFromPayload, readLorebookContext } from "./lorebook";
import { normalizeDateTimeWithMode } from "./dateTime";
import {
  normalizeCustomNonNumericValue,
  normalizeCustomTextMaxLength,
  normalizeNonNumericArrayItems,
} from "./customStatRuntime";
import {
  hasCharacterOwnedTrackedValueForSelection,
  hasCharacterOwnedTrackedValueForCharacter,
  overlayLatestGlobalCustomStats,
  selectLatestRelevantHistoryEntry,
} from "./extractionBaselineHelpers";
import {
  buildMergedPromptMacroData,
  resolveHighestStoredTrackerMessageIndex,
  resolveLatestStoredTrackerData,
  resolveLatestStoredTrackerDataBefore,
} from "./runtimeState";
import { buildMacroPreviewCandidates, getBstMacroDebugSnapshot, syncBstMacros } from "./runtimeMacros";
import { createPromptRefreshController } from "./runtimePromptSync";
import { persistChatNow, persistChatNowBestEffort } from "./persistence";
import {
  countSummarySentences,
  hasNumericCharacters,
  normalizeSummaryProse,
  sanitizeGeneratedSummaryText,
  wrapAsSystemNarrativeText,
} from "./summaryText";
import {
  buildDiagnosticsDebugDetails,
  buildDiagnosticsReport,
  buildHistorySample,
  filterDebugRecordForDiagnostics,
  filterDiagnosticsTrace,
} from "./runtimeDiagnostics";
import {
  buildCapturedGenerationIntent,
  cloneCapturedGenerationIntent,
  getEventMessageIndex,
  sanitizeGenerationOptions,
  type CapturedGenerationIntent,
} from "./runtimeEventHelpers";
import { isManualExtractionReason } from "./extractorHelpers";
import { buildCharacterCardsContext } from "./characterCardContext";
import { getCachedCharacterCardsContext, getCachedLorebookContext } from "./promptContextCache";
import {
  buildRenderPassSnapshot,
  computeManualPlaceholderMessageIndices,
  getCachedProjectedTrackerData,
  pruneProjectedTrackerDataCache,
  resolveDirtyRenderStart,
} from "./renderQueueHelpers";
import { shouldQueueRenderAfterRefresh, type RefreshRenderSnapshot } from "./refreshRenderPolicy";
import { resolveGroupReplayTarget } from "./userTurnReplayTarget";
import { normalizeRefreshTargetMessageIndex, type RefreshTargetInput } from "./windowApi";
import { shouldRunDeferredInitRefresh } from "./initRefreshPolicy";
import { createExtractionScheduler } from "./extractionScheduler";
import { validateUserTurnReplayState } from "./userTurnReplayPolicy";
import { createBootstrapScheduler } from "./bootstrapScheduler";
import { createLateRenderRecoveryController } from "./lateRenderRecovery";
import { executeUserTurnReplay } from "./userTurnReplayExecution";
import {
  buildJsonExtractionShadowDebug,
  buildJsonExtractionShadowExpectedTrackerData,
} from "./jsonExtractionProtocolDebug";
import { runJsonExtractionProtocolShadowTransport } from "./jsonExtractionProtocolTransport";

declare const __BST_VERSION__: string;

let settings: BetterSimTrackerSettings | null = null;
let isExtracting = false;
let runSequence = 0;
let allCharacterNames: string[] = [];
let latestData: TrackerData | null = null;
let latestDataMessageIndex: number | null = null;
let latestPromptMacroData: TrackerData | null = null;
let lastExtractionBaselineDebugMeta: Record<string, unknown> | null = null;
let trackerUiState: TrackerUiState = { phase: "idle", done: 0, total: 0, messageIndex: null, stepLabel: null };
const renderProjectedTrackerDataCache = new Map<number, import("./renderQueueHelpers").ProjectedTrackerDataCacheEntry>();
let previousRenderPassSnapshot: import("./renderQueueHelpers").RenderPassSnapshot | null = null;
let previousRefreshRenderSnapshot: RefreshRenderSnapshot | null = null;
const trackerRecoveryByMessage = new Map<number, TrackerRecoveryEntry>();
let renderQueued = false;
let swipeExtractionTimer: number | null = null;
let pendingSwipeExtraction: { reason: string; messageIndex?: number; waitForGenerationEnd?: boolean } | null = null;
let lastDebugRecord: DeltaDebugRecord | null = null;
let runtimeManifestVersion: string | null = null;
let debugTrace: string[] = [];
let traceCacheKey: string | null = null;
let traceCacheLines: string[] = [];
let lastActivityAnalysis: {
  allCharacterNames: string[];
  activeCharacters: string[];
  reasons: Record<string, string>;
  lookback: number;
  manualInactiveCharacters: string[];
} | null = null;
let chatGenerationInFlight = false;
let chatGenerationSawCharacterRender = false;
let chatGenerationStartLastAiIndex: number | null = null;
let swipeGenerationActive = false;
let pendingLateRenderExtraction = false;
let pendingLateRenderStartLastAiIndex: number | null = null;
let promptRefreshController: ReturnType<typeof createPromptRefreshController> | null = null;
let dynamicCharactersPanelController: ReturnType<typeof initDynamicCharactersPanel> | null = null;
const BOOTSTRAP_CONTINUE_REASON = "AUTO_BOOTSTRAP_MISSING_TRACKER_CONTINUE";
let userTurnGateActive = false;
let userTurnGateMessageIndex: number | null = null;
let userTurnGateMessageText = "";
let userTurnGatePendingIntent: CapturedGenerationIntent | null = null;
let userTurnGateStopTimer: number | null = null;
let userTurnGateReplayAttempts = 0;
let chatGenerationIntent: CapturedGenerationIntent | null = null;
type PromptInjectionGenerationSnapshot = {
  prompt: string;
  capturedAt: number;
  targetIndex: number | null;
  generationType: string;
};
type PromptInjectionMessageSnapshot = {
  messageIndex: number;
  prompt: string;
  capturedAt: number;
  targetIndex: number | null;
  generationType: string;
};
let pendingGenerationInjectionSnapshot: PromptInjectionGenerationSnapshot | null = null;
let lastMessageInjectionSnapshot: PromptInjectionMessageSnapshot | null = null;
let slashCommandsRegistered = false;
const registeredEventSources = new WeakSet<object>();
let activeExtractionRunId: number | null = null;
const cancelledExtractionRuns = new Set<number>();
const activeSummaryRuns = new Set<number>();
let settingsModalModulePromise: Promise<typeof import("./settingsModal")> | null = null;

type RefreshFromStoredDataOptions = {
  allowBootstrapScheduling?: boolean;
  syncDynamicCharactersPanel?: boolean;
  syncSettingsPanel?: boolean;
};

const extractionScheduler = createExtractionScheduler({
  timers: {
    setTimeout: (fn, delay) => window.setTimeout(fn, delay),
    clearTimeout: id => window.clearTimeout(id),
  },
  onFire: (reason, targetMessageIndex) => {
    pushTrace("extract.schedule.fire", { reason, targetMessageIndex: targetMessageIndex ?? null });
    void runExtraction(reason, targetMessageIndex ?? undefined);
  },
  onSkip: (reason, targetMessageIndex) => {
    pushTrace("extract.schedule.skip", {
      reason: "duplicate_pending_schedule",
      trigger: reason,
      targetMessageIndex: targetMessageIndex ?? null,
    });
  },
});
const bootstrapScheduler = createBootstrapScheduler({
  getScopeKey: () => {
    const activeContext = getSafeContext();
    return activeContext ? getDebugScopeKey(activeContext) : "global";
  },
  onSchedule: ({ reason, targetMessageIndex }) => {
    pushTrace("extract.bootstrap.schedule", {
      reason,
      targetMessageIndex,
    });
    scheduleExtraction("AUTO_BOOTSTRAP_MISSING_TRACKER", targetMessageIndex, 140);
  },
});

function loadSettingsModalModule(): Promise<typeof import("./settingsModal")> {
  if (!settingsModalModulePromise) {
    settingsModalModulePromise = import("./settingsModal");
  }
  return settingsModalModulePromise;
}
let summaryVisibilityReloadInFlight = false;
const BUILT_IN_NUMERIC_KEYS = new Set(["affection", "trust", "desire", "connection"]);
const EDIT_MOOD_LABELS = new Map(moodOptions.map(label => [label.toLowerCase(), label]));
const LOREBOOK_ACTIVATED_METADATA_KEY = "bstLorebookActivatedEntries";
const TRACKER_RECOVERY_METADATA_KEY = "bstTrackerRecoveries";
let lastActivatedLorebookEntries: string[] = [];
function getPreferredCharacterOwner(data: TrackerData): string | null {
  for (const name of data.activeCharacters ?? []) {
    const candidate = String(name ?? "").trim();
    if (!candidate || candidate === USER_TRACKER_KEY || candidate === GLOBAL_TRACKER_KEY) continue;
    return candidate;
  }
  const fromMood = Object.keys(data.statistics.mood ?? {}).find(key => {
    const candidate = String(key ?? "").trim();
    return candidate && candidate !== USER_TRACKER_KEY && candidate !== GLOBAL_TRACKER_KEY;
  });
  if (fromMood) return fromMood;
  const fromAffection = Object.keys(data.statistics.affection ?? {}).find(key => {
    const candidate = String(key ?? "").trim();
    return candidate && candidate !== USER_TRACKER_KEY && candidate !== GLOBAL_TRACKER_KEY;
  });
  return fromAffection ? String(fromAffection).trim() : null;
}

function refreshPromptMacroData(context: STContext): void {
  if (!latestData) {
    latestPromptMacroData = null;
    return;
  }
  if (swipeGenerationActive) {
    const swipeTargetIndex = getLastAiMessageIndex(context);
    if (swipeTargetIndex != null) {
      const previous = resolveLatestStoredTrackerDataBefore(context, swipeTargetIndex);
      if (previous.data) {
        latestPromptMacroData = buildMergedPromptMacroData(context, previous.data, {
          beforeMessageIndexExclusive: swipeTargetIndex,
        });
        return;
      }
    }
  }
  latestPromptMacroData = buildMergedPromptMacroData(context, latestData);
}

function snapshotInjectionForGeneration(targetIndex: number | null, generationType: string): void {
  const prompt = getLastInjectedPrompt();
  pendingGenerationInjectionSnapshot = {
    prompt,
    capturedAt: Date.now(),
    targetIndex,
    generationType,
  };
  pushTrace("prompt.inject.snapshot", {
    targetIndex,
    generationType,
    promptChars: prompt.length,
  });
}

function bindInjectionSnapshotToLatestAiMessage(context: STContext): void {
  if (!pendingGenerationInjectionSnapshot) return;
  const messageIndex = getLastAiMessageIndex(context);
  if (messageIndex == null) return;
  lastMessageInjectionSnapshot = {
    messageIndex,
    ...pendingGenerationInjectionSnapshot,
  };
  pushTrace("prompt.inject.bound", {
    messageIndex,
    targetIndex: pendingGenerationInjectionSnapshot.targetIndex,
    generationType: pendingGenerationInjectionSnapshot.generationType,
    promptChars: pendingGenerationInjectionSnapshot.prompt.length,
  });
  pendingGenerationInjectionSnapshot = null;
}

function collectSummaryCharacters(context: STContext | null, data: TrackerData): string[] {
  return collectSummaryCharactersHelper(context, data);
}

function describeLorebookPayload(payload: unknown): string {
  if (Array.isArray(payload)) return `array:${payload.length}`;
  if (payload instanceof Set) return `set:${payload.size}`;
  if (payload instanceof Map) return `map:${payload.size}`;
  if (payload && typeof payload === "object") return "object";
  return typeof payload;
}

type WorldInfoModule = {
  checkWorldInfo?: (
    chat: string[],
    maxContext: number,
    isDryRun: boolean,
    globalScanData?: unknown,
  ) => Promise<unknown>;
  world_info_include_names?: boolean;
};

type ScriptSettingsModule = {
  max_context?: unknown;
};

async function loadWorldInfoModule(): Promise<WorldInfoModule | null> {
  try {
    const loader = Function("return import('/scripts/world-info.js')") as () => Promise<unknown>;
    return await loader() as WorldInfoModule;
  } catch {
    return null;
  }
}

async function readWorldInfoMaxContext(): Promise<number> {
  try {
    const loader = Function("return import('/script.js')") as () => Promise<unknown>;
    const module = await loader() as ScriptSettingsModule;
    const parsed = Number(module?.max_context);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  } catch {
    // ignore dynamic import failures and use fallback
  }
  return 2048;
}

function buildWorldInfoScanChat(context: STContext, includeNames: boolean): string[] {
  return (context.chat ?? [])
    .filter(message => isTrackableMessage(message))
    .map(message => {
      const mes = String(message?.mes ?? "").trim();
      if (!mes) return "";
      const name = String(message?.name ?? "").trim();
      if (includeNames && name) {
        return `${name}: ${mes}`;
      }
      return mes;
    })
    .filter(Boolean)
    .reverse();
}

async function refreshLorebookEntriesFromWorldInfoScan(context: STContext, runId: number, reason: string): Promise<void> {
  const worldInfoModule = await loadWorldInfoModule();
  const checkWorldInfo = worldInfoModule?.checkWorldInfo;
  if (typeof checkWorldInfo !== "function") {
    pushTrace("lorebook.scan.skip", { runId, reason, detail: "module_unavailable" });
    return;
  }

  const chatForScan = buildWorldInfoScanChat(context, Boolean(worldInfoModule?.world_info_include_names ?? true));
  if (!chatForScan.length) {
    pushTrace("lorebook.scan.skip", { runId, reason, detail: "empty_chat" });
    return;
  }

  const maxContext = await readWorldInfoMaxContext();
  try {
    const activated = await checkWorldInfo(chatForScan, maxContext, true);
    const acceptedCount = cacheLorebookActivatedEntries(context, activated);
    pushTrace("lorebook.scan", {
      runId,
      reason,
      mode: "dry_run",
      maxContext,
      scannedMessages: chatForScan.length,
      acceptedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushTrace("lorebook.scan.error", { runId, reason, error: message });
  }
}

function cacheLorebookActivatedEntries(context: STContext, payload: unknown): number {
  const entries = extractLorebookEntriesFromPayload(payload, 120);
  if (!entries.length) return 0;
  lastActivatedLorebookEntries = entries;
  if (!context.chatMetadata || typeof context.chatMetadata !== "object") {
    context.chatMetadata = {};
  }
  context.chatMetadata[LOREBOOK_ACTIVATED_METADATA_KEY] = entries;
  context.saveMetadataDebounced?.();
  return entries.length;
}

function buildSummaryTrackerStateLines(
  context: STContext | null,
  data: TrackerData,
  currentSettings: BetterSimTrackerSettings,
  userDisplayName = "User",
): string {
  return buildSummaryTrackerStateLinesHelper(context, data, currentSettings, userDisplayName);
}

function buildRecentContextUpToMessageIndex(context: STContext, messageIndex: number, messageCount: number): string {
  const maxCount = Math.max(1, messageCount);
  const endExclusive = Math.min(context.chat.length, Math.max(0, messageIndex) + 1);
  const start = Math.max(0, endExclusive - maxCount);
  const chunk = context.chat.slice(start, endExclusive);
  return chunk
    .map(message => {
      if (!message.is_user && !isTrackableAiMessage(message)) return null;
      const speaker = message.is_user ? context.name1 ?? "User" : message.name ?? "Character";
      return `${speaker}: ${message.mes}`;
    })
      .filter((line): line is string => Boolean(line))
      .join("\n\n");
}

function buildResolverContextUpToMessageIndex(context: STContext, messageIndex: number): string {
  if (messageIndex <= 0) return "";
  return buildRecentContextUpToMessageIndex(context, messageIndex - 1, 2);
}

function describeBand(value: number, low: string, medium: string, high: string): string {
  if (value <= 30) return low;
  if (value <= 60) return medium;
  return high;
}

function buildFallbackSummaryProse(
  context: STContext | null,
  data: TrackerData,
  currentSettings: BetterSimTrackerSettings,
): string {
  return buildFallbackSummaryProseHelper(context, data, currentSettings);
}

async function generateTrackerSummaryProse(input: {
  context: STContext;
  settings: BetterSimTrackerSettings;
  data: TrackerData;
  messageIndex: number;
}): Promise<{ text: string; profileId: string | null }> {
  const { context, settings, data, messageIndex } = input;
  const userDisplayName = context.name1 ?? "User";
  const normalizeSummaryName = (name: string): string => (name === USER_TRACKER_KEY ? userDisplayName : name);
  const characters = collectSummaryCharacters(context, data).map(normalizeSummaryName);
  const summaryActiveCharacters = resolveTrackerSceneOwners(context, data).map(normalizeSummaryName);
  const trackedDimensions: string[] = [];
  if (settings.trackAffection) trackedDimensions.push("warmth/care");
  if (settings.trackTrust) trackedDimensions.push("trust/safety");
  if (settings.trackDesire) trackedDimensions.push("desire/tension");
  if (settings.trackConnection) trackedDimensions.push("connection/closeness");
  if (settings.trackMood) trackedDimensions.push("mood tone");
  const trackedCustomLabels = (settings.customStats ?? [])
    .filter(stat => Boolean(stat.track))
    .map(stat => String(stat.label ?? stat.id).trim() || stat.id)
    .filter(Boolean)
    .slice(0, 8);
  if (trackedCustomLabels.length) {
    trackedDimensions.push(`custom cues (${trackedCustomLabels.join(", ")})`);
  }
  const contextText = buildRecentContextUpToMessageIndex(context, messageIndex, settings.contextMessages);
  const trackerStateLines = buildSummaryTrackerStateLines(context, data, settings, userDisplayName);
  const prompt = buildTrackerSummaryGenerationPrompt({
    userName: userDisplayName,
    activeCharacters: summaryActiveCharacters,
    characters,
    contextText,
    trackerStateLines,
    trackedDimensions,
  });

  const first = await generateJson(prompt, settings);
  let summary = sanitizeGeneratedSummaryText(first.text);
  let profileId: string | null = first.meta.profileId;
  if (!summary) {
    throw new Error("Summary generation returned empty text.");
  }

  if (hasNumericCharacters(summary)) {
    const rewrite = await generateJson(
      buildTrackerSummaryNoNumbersRewritePrompt({ draftSummary: summary }),
      settings,
    );
    const rewritten = sanitizeGeneratedSummaryText(rewrite.text);
    if (rewritten) {
      summary = rewritten;
      profileId = rewrite.meta.profileId || profileId;
    }
  }

  if (hasNumericCharacters(summary)) {
    throw new Error("Summary still contains numeric output.");
  }

  const normalized = normalizeSummaryProse(summary);
  if (!normalized) {
    throw new Error("Summary normalization produced empty text.");
  }
  let finalSummary = normalized;
  const sentenceCount = countSummarySentences(finalSummary);
  if (sentenceCount < 4 || finalSummary.length < 260) {
    const expand = await generateJson(
      buildTrackerSummaryLengthenPrompt({ draftSummary: finalSummary }),
      settings,
    );
    let expanded = sanitizeGeneratedSummaryText(expand.text);
    if (expanded) {
      if (hasNumericCharacters(expanded)) {
        const rewriteExpanded = await generateJson(
          buildTrackerSummaryNoNumbersRewritePrompt({ draftSummary: expanded }),
          settings,
        );
        const rewrittenExpanded = sanitizeGeneratedSummaryText(rewriteExpanded.text);
        if (rewrittenExpanded) {
          expanded = rewrittenExpanded;
          profileId = rewriteExpanded.meta.profileId || profileId;
        }
      }
      if (!hasNumericCharacters(expanded)) {
        const normalizedExpanded = normalizeSummaryProse(expanded);
        if (normalizedExpanded && countSummarySentences(normalizedExpanded) >= 4) {
          finalSummary = normalizedExpanded;
          profileId = expand.meta.profileId || profileId;
        }
      }
    }
  }
  return { text: finalSummary, profileId };
}

async function sendSummaryAsSystemMessage(
  context: STContext,
  summaryText: string,
  visibleForAi: boolean,
): Promise<"comment-system" | "comment-ai-visible"> {
  const anyContext = context as STContext & {
    sendSystemMessage?: (type: string, text?: string, extra?: Record<string, unknown>) => void;
    addOneMessage?: (message: Record<string, unknown>, options?: Record<string, unknown>) => void;
  };

  const compactText = summaryText.replace(/\s+/g, " ").trim();
  const now = Date.now();
  const commonExtra = {
    gen_id: now,
    api: "manual",
    model: "bettersimtracker.summary",
    bstSummaryNote: true,
    bst_summary_note: true,
    swipeable: false,
  };

  const commentMessage = {
    name: "Note",
    is_user: false,
    is_system: !visibleForAi,
    send_date: now,
    mes: compactText,
    force_avatar: "img/quill.png",
    extra: visibleForAi
      ? commonExtra
      : { ...commonExtra, type: "comment", isSmallSys: false },
  };
  context.chat.push(commentMessage);
  anyContext.addOneMessage?.(commentMessage);
  return visibleForAi ? "comment-ai-visible" : "comment-system";
}

function getTraceStorageKey(context: STContext): string {
  return `${getDebugScopeKey(context)}:trace`;
}

function readTraceLines(context: STContext): string[] {
  try {
    const key = getTraceStorageKey(context);
    if (traceCacheKey === key) return [...traceCacheLines];
    const raw = localStorage.getItem(key);
    if (!raw) {
      traceCacheKey = key;
      traceCacheLines = [];
      return [];
    }
    const parsed = JSON.parse(raw) as { lines?: unknown };
    const lines = Array.isArray(parsed?.lines)
      ? parsed.lines.filter(line => typeof line === "string") as string[]
      : [];
    traceCacheKey = key;
    traceCacheLines = lines;
    return [...lines];
  } catch {
    return [];
  }
}

function writeTraceLines(context: STContext, lines: string[]): void {
  try {
    const key = getTraceStorageKey(context);
    const trimmedLines = trimTraceLinesForStorage(lines);
    traceCacheKey = key;
    traceCacheLines = [...trimmedLines];
    persistDebugStorageValue(localStorage, key, JSON.stringify({ savedAt: Date.now(), lines: trimmedLines }));
  } catch {
    // ignore
  }
}

function pushTrace(event: string, details?: Record<string, unknown>): void {
  if (!settings?.debug) return;
  const stamp = new Date().toISOString();
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  const line = `${stamp} ${event}${payload}`;
  debugTrace.push(line);
  if (debugTrace.length > 200) {
    debugTrace.splice(0, debugTrace.length - 200);
  }
  const context = getSafeContext();
  if (context) {
    const persisted = readTraceLines(context);
    persisted.push(line);
    const capped = persisted.slice(-1000);
    writeTraceLines(context, capped);
  }
  logDebug(settings, "ui", event, details ?? {});
}

function getDebugScopeKey(context: STContext): string {
  const shortHash = (input: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const readString = (value: unknown): string => String(value ?? "").trim();
  const readObjectString = (obj: unknown, key: string): string => {
    if (!obj || typeof obj !== "object") return "";
    return readString((obj as Record<string, unknown>)[key]);
  };
  const resolveChatScopeId = (): string => {
    const anyContext = context as unknown as Record<string, unknown>;
    const direct = [
      readString(anyContext.chatId),
      readString(anyContext.chat_id),
      readString(anyContext.chatName),
      readString(anyContext.chat_name),
      readString(anyContext.chatFileName),
      readString(anyContext.chat_file_name),
    ].find(Boolean);
    if (direct) return direct;

    const meta = (anyContext.chatMetadata ?? anyContext.chat_metadata) as unknown;
    const metadataId = [
      readObjectString(meta, "chatId"),
      readObjectString(meta, "chat_id"),
      readObjectString(meta, "main_chat"),
      readObjectString(meta, "name"),
      readObjectString(meta, "file_name"),
    ].find(Boolean);
    if (metadataId) return metadataId;

    const firstMessage = (Array.isArray(context.chat) && context.chat.length > 0)
      ? (context.chat[0] as unknown as Record<string, unknown>)
      : null;
    if (firstMessage) {
      const seed = [
        readString(firstMessage.send_date),
        readString(firstMessage.created_at),
        readString(firstMessage.time),
        readString(firstMessage.name),
        readString(firstMessage.mes).slice(0, 120),
      ].filter(Boolean).join("|");
      if (seed) return `derived:${shortHash(seed)}`;
    }
    return "nochat";
  };

  const chatId = resolveChatScopeId();
  const target = context.groupId ? `group:${context.groupId}` : `char:${String(context.characterId ?? "unknown")}`;
  return `bst-debug:${chatId}|${target}`;
}

const lateRenderRecovery = createLateRenderRecoveryController({
  timers: window,
  getPendingState: () => ({
    pending: pendingLateRenderExtraction,
    startLastAiIndex: pendingLateRenderStartLastAiIndex,
  }),
  setPendingState: next => {
    pendingLateRenderExtraction = next.pending;
    pendingLateRenderStartLastAiIndex = next.startLastAiIndex;
  },
  isGenerationInFlight: () => chatGenerationInFlight,
  isExtracting: () => isExtracting,
  getCurrentLastAiIndex: () => {
    const activeContext = getSafeContext();
    return activeContext ? getLastAiMessageIndex(activeContext) : null;
  },
  hasTrackableTargetAt: messageIndex => {
    const activeContext = getSafeContext();
    return Boolean(
      activeContext &&
      messageIndex >= 0 &&
      messageIndex < activeContext.chat.length &&
      isTrackableAiMessage(activeContext.chat[messageIndex]) &&
      !getTrackerDataFromMessage(activeContext.chat[messageIndex]),
    );
  },
  onScheduleExtraction: (reason, messageIndex, delay) => {
    pushTrace(reason === "GENERATION_ENDED_LATE_POLL" ? "extract.late_poll_check" : "extract.late_render_check", {
      pending: true,
      currentLastAi: messageIndex,
      startLastAi: pendingLateRenderStartLastAiIndex,
      hasTrackableTarget: true,
    });
    scheduleExtraction(reason, messageIndex, delay);
  },
});

function saveDebugRecord(context: STContext, record: DeltaDebugRecord | null): void {
  try {
    if (!record) return;
    persistDebugStorageValue(localStorage, getDebugScopeKey(context), JSON.stringify({
      savedAt: Date.now(),
      record: trimDebugRecordForStorage(record),
    }));
  } catch {
    // ignore
  }
}

function loadDebugRecord(context: STContext): DeltaDebugRecord | null {
  try {
    const scoped = localStorage.getItem(getDebugScopeKey(context));
    if (scoped) {
      const parsed = JSON.parse(scoped) as { savedAt?: number; record?: DeltaDebugRecord } | DeltaDebugRecord;
      if ((parsed as { record?: DeltaDebugRecord }).record) {
        return (parsed as { record: DeltaDebugRecord }).record;
      }
      return parsed as DeltaDebugRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function clearDebugRecord(context: STContext): void {
  try {
    localStorage.removeItem(getDebugScopeKey(context));
    localStorage.removeItem(getTraceStorageKey(context));
    traceCacheKey = null;
    traceCacheLines = [];
    enforceDebugStorageBudget(localStorage, getDebugScopeKey(context));
  } catch {
    // ignore
  }
}

function getLastAiMessageIndex(context: STContext): number | null {
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const message = context.chat[i];
    if (isTrackableAiMessage(message)) return i;
  }
  return null;
}

function getLastUserMessageIndex(context: STContext): number | null {
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const message = context.chat[i];
    if (isTrackableUserMessage(message)) return i;
  }
  return null;
}

function getLastTrackableMessageIndex(context: STContext): number | null {
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const message = context.chat[i];
    if (isTrackableMessage(message)) return i;
  }
  return null;
}

function getLastMessageIndexIfAi(context: STContext): number | null {
  return getLastAiMessageIndex(context);
}

function getLastMessageIndexIfUser(context: STContext): number | null {
  return getLastUserMessageIndex(context);
}

function hasTrackableUserMessageBeforeIndex(context: STContext, index: number): boolean {
  if (!Number.isFinite(index) || index <= 0) return false;
  const bounded = Math.min(index, context.chat.length);
  for (let i = 0; i < bounded; i += 1) {
    if (isTrackableUserMessage(context.chat[i])) return true;
  }
  return false;
}

function getMessageScopedTrackerData(
  context: STContext,
  messageIndex: number,
  data: TrackerData,
  settingsInput: BetterSimTrackerSettings,
  options?: {
    projectOwnerScopedCustomNonNumeric?: boolean;
  },
): TrackerData {
  const message = messageIndex >= 0 && messageIndex < context.chat.length
    ? context.chat[messageIndex]
    : null;
  return getCachedProjectedTrackerData(renderProjectedTrackerDataCache, {
    messageIndex,
    messageRef: message,
    rawData: data,
    entityTrackingMode: settingsInput.entityTrackingMode,
    projectOwnerScopedCustomNonNumeric: options?.projectOwnerScopedCustomNonNumeric,
    build: () => projectTrackerDataToMessageScopedOwners(
      context,
      data,
      message,
      settingsInput,
      options,
    ),
  });
}

function getLatestRelevantTrackerDataWithIndexBefore(
  context: STContext,
  beforeIndex: number,
  activeCharacters: string[],
  activeEntityIds: string[],
  settingsInput: BetterSimTrackerSettings,
): { data: TrackerData; messageIndex: number } | null {
  if (beforeIndex <= 0 || context.chat.length === 0) return null;
  const start = Math.min(beforeIndex - 1, context.chat.length - 1);
  for (let i = start; i >= 0; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (!found) continue;
    const projected = getMessageScopedTrackerData(context, i, found, settingsInput, {
      projectOwnerScopedCustomNonNumeric: false,
    });
    const hasRelevantValue = hasTrackedValueForSelection(projected, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context);
    if (hasRelevantValue) {
      return { data: projected, messageIndex: i };
    }
  }

  // Fallback: after reload/swipe changes, per-message payload can be missing while
  // chat-state/metadata/local history still has the prior indexed snapshot.
  const historyEntries = getRecentTrackerHistoryEntries(context, Math.max(120, context.chat.length));
  let best: { data: TrackerData; messageIndex: number } | null = null;
  for (const entry of historyEntries) {
    if (entry.messageIndex >= beforeIndex) continue;
    const projected = getMessageScopedTrackerData(context, entry.messageIndex, entry.data, settingsInput, {
      projectOwnerScopedCustomNonNumeric: false,
    });
    const hasRelevantValue = hasTrackedValueForSelection(projected, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context);
    if (!hasRelevantValue) continue;
    if (!best || entry.messageIndex > best.messageIndex) {
      best = { data: projected, messageIndex: entry.messageIndex };
    }
  }
  if (best) {
    return best;
  }

  return null;
}

function getMergedRelevantTrackerDataWithIndexBefore(
  context: STContext,
  beforeIndex: number,
  activeCharacters: string[],
  activeEntityIds: string[],
  settingsInput: BetterSimTrackerSettings,
): { data: TrackerData; messageIndex: number } | null {
  if (beforeIndex <= 0 || context.chat.length === 0) return null;
  const historyEntries = getRecentTrackerHistoryEntries(context, Math.max(120, context.chat.length));
  const relevantEntries = historyEntries
    .filter(entry => entry.messageIndex < beforeIndex)
    .map(entry => ({
      messageIndex: entry.messageIndex,
      timestamp: Number(entry.data.timestamp ?? entry.timestamp ?? 0),
      data: getMessageScopedTrackerData(context, entry.messageIndex, entry.data, settingsInput, {
        projectOwnerScopedCustomNonNumeric: false,
      }),
    }))
    .filter(entry => hasTrackedValueForSelection(entry.data, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context))
    .map(entry => ({
      data: entry.data,
      messageIndex: entry.messageIndex,
      timestamp: entry.timestamp,
    }));

  if (!relevantEntries.length) return null;

  relevantEntries.sort((a, b) => {
    if (a.messageIndex !== b.messageIndex) return a.messageIndex - b.messageIndex;
    return a.timestamp - b.timestamp;
  });
  const latestEntry = relevantEntries[relevantEntries.length - 1];
  const merged = mergeTrackerDataChronologically(relevantEntries.map(entry => entry.data));
  if (!merged) return null;
  return {
    messageIndex: latestEntry.messageIndex,
    data: merged,
  };
}

function getLatestCharacterOwnedTrackerDataWithIndexBefore(
  context: STContext,
  beforeIndex: number,
  activeCharacters: string[],
  activeEntityIds: string[],
  settingsInput: BetterSimTrackerSettings,
): { data: TrackerData; messageIndex: number } | null {
  if (beforeIndex <= 0 || context.chat.length === 0) return null;
  const start = Math.min(beforeIndex - 1, context.chat.length - 1);
  for (let i = start; i >= 0; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (!found) continue;
    const projected = getMessageScopedTrackerData(context, i, found, settingsInput, {
      projectOwnerScopedCustomNonNumeric: false,
    });
    const hasRelevantValue = hasCharacterOwnedTrackedValueForSelection(projected, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context);
    if (hasRelevantValue) {
      return { data: projected, messageIndex: i };
    }
  }

  const historyEntries = getRecentTrackerHistoryEntries(context, Math.max(120, context.chat.length));
  const latestEntry = selectLatestRelevantHistoryEntry(
    historyEntries.map(entry => ({
      data: getMessageScopedTrackerData(context, entry.messageIndex, entry.data, settingsInput, {
        projectOwnerScopedCustomNonNumeric: false,
      }),
      messageIndex: entry.messageIndex,
      timestamp: Number(entry.data.timestamp ?? entry.timestamp ?? 0),
    })),
    beforeIndex,
    data => hasCharacterOwnedTrackedValueForSelection(data, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context),
  );
  if (!latestEntry) return null;
  return { data: latestEntry.data, messageIndex: latestEntry.messageIndex };
}

function getLatestCharacterOwnedUserTrackerDataWithIndexBefore(
  context: STContext,
  beforeIndex: number,
  activeCharacters: string[],
  activeEntityIds: string[],
  settingsInput: BetterSimTrackerSettings,
): { data: TrackerData; messageIndex: number } | null {
  if (beforeIndex <= 0 || context.chat.length === 0) return null;
  const start = Math.min(beforeIndex - 1, context.chat.length - 1);
  for (let i = start; i >= 0; i -= 1) {
    if (!isTrackableUserMessage(context.chat[i])) continue;
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (!found) continue;
    const projected = getMessageScopedTrackerData(context, i, found, settingsInput, {
      projectOwnerScopedCustomNonNumeric: false,
    });
    const hasRelevantValue = hasCharacterOwnedTrackedValueForSelection(projected, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context);
    if (hasRelevantValue) {
      return { data: projected, messageIndex: i };
    }
  }

  const historyEntries = getRecentTrackerHistoryEntries(context, Math.max(120, context.chat.length));
  const latestEntry = selectLatestRelevantHistoryEntry(
    historyEntries.map(entry => ({
      data: getMessageScopedTrackerData(context, entry.messageIndex, entry.data, settingsInput, {
        projectOwnerScopedCustomNonNumeric: false,
      }),
      messageIndex: entry.messageIndex,
      timestamp: Number(entry.data.timestamp ?? entry.timestamp ?? 0),
    })),
    beforeIndex,
    data => hasCharacterOwnedTrackedValueForSelection(data, {
      ownerNames: activeCharacters,
      entityIds: activeEntityIds,
    }, settingsInput, context),
    messageIndex => isTrackableUserMessage(context.chat[messageIndex]),
  );
  if (!latestEntry) return null;
  return { data: latestEntry.data, messageIndex: latestEntry.messageIndex };
}

function isRenderableTrackerIndex(context: STContext, index: number): boolean {
  if (index < 0) return false;
  if (index >= context.chat.length) return true;
  return isTrackableMessage(context.chat[index]);
}

function getGenerationTargetMessageIndex(context: STContext): number | null {
  // Generation-start timing differs:
  // - If last message is already user => next AI will be at chat.length.
  // - If last message is AI (user message not inserted yet) => next AI will be at chat.length + 1.
  const last = context.chat[context.chat.length - 1];
  if (last && isTrackableAiMessage(last)) {
    return context.chat.length + 1;
  }
  return context.chat.length;
}

function hasUserTrackingEnabledForExtraction(input: BetterSimTrackerSettings): boolean {
  const tracksUserCustomStat = (stat: { track?: boolean; trackUser?: boolean }): boolean =>
    Boolean(stat.trackUser ?? stat.track);
  if (!input.enableUserTracking) return false;
  if (input.userTrackMood) return true;
  if (input.userTrackLastThought) return true;
  return (input.customStats ?? []).some(tracksUserCustomStat);
}

function isUserExtractionReason(reason: string): boolean {
  return reason === "USER_MESSAGE_RENDERED"
    || reason === "USER_MESSAGE_EDITED";
}

function findCharacterIndexByName(context: STContext, name: string): number | null {
  const target = String(name ?? "").trim().toLowerCase();
  if (!target) return null;
  const list = context.characters ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const candidate = String(list[i]?.name ?? "").trim().toLowerCase();
    if (candidate && candidate === target) return i;
  }
  return null;
}

function resolveReplaySceneCharacterIndicesFromLatestUserTracker(context: STContext): number[] | null {
  const lastUserIndex = getLastUserMessageIndex(context);
  if (lastUserIndex == null || lastUserIndex < 0 || lastUserIndex >= context.chat.length) {
    return null;
  }
  const rawData = getTrackerDataFromMessage(context.chat[lastUserIndex]);
  if (!rawData) return null;
  const scopedData = settings
    ? getMessageScopedTrackerData(context, lastUserIndex, rawData, settings, {
        projectOwnerScopedCustomNonNumeric: false,
      })
    : rawData;
  const hasExplicitSceneResolution = Array.isArray(scopedData.entityResolution?.resolvedEntities)
    && scopedData.entityResolution.resolvedEntities.length > 0;
  if (!hasExplicitSceneResolution) {
    return null;
  }
  const sceneOwners = resolveTrackerSceneOwners(context, scopedData)
    .filter(name => name !== USER_TRACKER_KEY);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const ownerName of sceneOwners) {
    const characterIndex = findCharacterIndexByName(context, ownerName);
    if (characterIndex == null || seen.has(characterIndex)) continue;
    seen.add(characterIndex);
    out.push(characterIndex);
  }
  return out;
}

type GroupDisabledSnapshot = {
  avatarKeys: Set<string>;
  names: Set<string>;
  indices: Set<number>;
};

function buildGroupDisabledSnapshot(disabledMembers: unknown): GroupDisabledSnapshot {
  const avatarKeys = new Set<string>();
  const names = new Set<string>();
  const indices = new Set<number>();
  if (!Array.isArray(disabledMembers)) {
    return { avatarKeys, names, indices };
  }

  for (const rawMember of disabledMembers) {
    if (typeof rawMember === "number" && Number.isInteger(rawMember) && rawMember >= 0) {
      indices.add(rawMember);
      continue;
    }
    if (rawMember && typeof rawMember === "object") {
      const obj = rawMember as Record<string, unknown>;
      const rawAvatar = String(obj.avatar ?? obj.member ?? "").trim();
      if (rawAvatar) avatarKeys.add(rawAvatar);
      const rawName = String(obj.name ?? "").trim().toLowerCase();
      if (rawName) names.add(rawName);
      const rawIndex = Number(obj.chid ?? obj.character_id ?? obj.index);
      if (Number.isInteger(rawIndex) && rawIndex >= 0) indices.add(rawIndex);
      continue;
    }
    const key = String(rawMember ?? "").trim();
    if (!key) continue;
    avatarKeys.add(key);
    names.add(key.toLowerCase());
    const asIndex = Number(key);
    if (Number.isInteger(asIndex) && asIndex >= 0) indices.add(asIndex);
  }

  return { avatarKeys, names, indices };
}

function resolveCharacterIndexFromGroupMember(context: STContext, member: unknown): number | null {
  const characters = context.characters ?? [];
  if (!characters.length) return null;

  if (typeof member === "number" && Number.isInteger(member) && member >= 0 && member < characters.length) {
    return member;
  }

  let rawAvatar = "";
  let rawName = "";
  let rawIndex: number | null = null;
  if (member && typeof member === "object") {
    const obj = member as Record<string, unknown>;
    rawAvatar = String(obj.avatar ?? obj.member ?? "").trim();
    rawName = String(obj.name ?? "").trim();
    const parsed = Number(obj.chid ?? obj.character_id ?? obj.index);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < characters.length) {
      rawIndex = parsed;
    }
  } else {
    const token = String(member ?? "").trim();
    rawAvatar = token;
    rawName = token;
    const parsed = Number(token);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < characters.length) {
      rawIndex = parsed;
    }
  }

  if (rawIndex != null) return rawIndex;
  if (rawAvatar) {
    const byAvatar = characters.findIndex(character => String(character?.avatar ?? "").trim() === rawAvatar);
    if (byAvatar >= 0) return byAvatar;
  }
  if (rawName) {
    const lowered = rawName.toLowerCase();
    const byName = characters.findIndex(character => String(character?.name ?? "").trim().toLowerCase() === lowered);
    if (byName >= 0) return byName;
  }
  return null;
}

function isCharacterDisabledBySnapshot(
  context: STContext,
  snapshot: GroupDisabledSnapshot,
  characterIndex: number,
): boolean {
  const character = context.characters?.[characterIndex];
  if (!character) return false;
  if (snapshot.indices.has(characterIndex)) return true;
  const avatar = String(character.avatar ?? "").trim();
  if (avatar && snapshot.avatarKeys.has(avatar)) return true;
  const name = String(character.name ?? "").trim().toLowerCase();
  if (name && snapshot.names.has(name)) return true;
  return false;
}

function getEnabledGroupCharacterIndices(context: STContext): number[] {
  if (!context.groupId) return [];
  const groups = context.groups ?? [];
  const group = groups.find(item => String(item?.id ?? "").trim() === String(context.groupId ?? "").trim());
  if (!group || !Array.isArray(group.members) || !group.members.length) return [];

  const disabled = buildGroupDisabledSnapshot(group.disabled_members);

  const result: number[] = [];
  const seen = new Set<number>();
  for (const member of group.members as unknown[]) {
    const idx = resolveCharacterIndexFromGroupMember(context, member);
    if (idx == null) continue;
    if (isCharacterDisabledBySnapshot(context, disabled, idx)) continue;
    if (!seen.has(idx)) {
      seen.add(idx);
      result.push(idx);
    }
  }
  return result;
}

function normalizeReplayGenerationIntent(
  context: STContext,
  intent: CapturedGenerationIntent,
): {
  type: string;
  options: Record<string, unknown>;
  dryRun: boolean;
  forcedAutomaticTrigger: boolean;
  forcedGroupCharacterId: number | null;
  skipReplay: boolean;
  skipReason: string | null;
} {
  const type = String(intent.type ?? "").trim();
  const options = sanitizeGenerationOptions(intent.options);
  let forcedAutomaticTrigger = false;
  let forcedGroupCharacterId: number | null = null;
  let skipReplay = false;
  let skipReason: string | null = null;

  // During USER_MESSAGE_RENDERED race-replay, forcing automatic-trigger mode avoids
  // ST inserting a second empty user turn before generation.
  if (type.toLowerCase() === "normal") {
    const lastUserIndex = getLastUserMessageIndex(context);
    const lastAiIndex = getLastAiMessageIndex(context);
    const hasCommittedUserTurn =
      lastUserIndex != null &&
      (lastAiIndex == null || lastUserIndex > lastAiIndex);
    if (hasCommittedUserTurn && options.automatic_trigger !== true) {
      options.automatic_trigger = true;
      forcedAutomaticTrigger = true;
    }
  }

  // In group chats, replayed normal generation can fall back to ST's "send empty user message"
  // path when no member is activated. Force the last AI speaker as a safe target.
  if (context.groupId && type.toLowerCase() === "normal") {
    const group = (context.groups ?? []).find(item => String(item?.id ?? "").trim() === String(context.groupId ?? "").trim());
    const enabledIndices = getEnabledGroupCharacterIndices(context);
    const resolvedSceneOwnerIndices = resolveReplaySceneCharacterIndicesFromLatestUserTracker(context);
    const hasForcedChar =
      typeof options.force_chid === "number" &&
      Number.isInteger(options.force_chid) &&
      Number(options.force_chid) >= 0;
    const currentForcedChar = hasForcedChar ? Number(options.force_chid) : null;
    let lastAiCharacterIndex: number | null = null;
    const lastAiIndex = getLastAiMessageIndex(context);
    if (lastAiIndex != null && lastAiIndex >= 0 && lastAiIndex < context.chat.length) {
      const lastAiName = String(context.chat[lastAiIndex]?.name ?? "").trim();
      lastAiCharacterIndex = findCharacterIndexByName(context, lastAiName);
    }
    const currentCharacterId =
      typeof context.characterId === "number" && Number.isInteger(context.characterId) && context.characterId >= 0
        ? Number(context.characterId)
        : null;
    const replayTarget = resolveGroupReplayTarget({
      currentForcedChar,
      enabledIndices,
      resolvedSceneOwnerIndices,
      lastAiCharacterIndex,
      currentCharacterId,
    });
    if (replayTarget.forceChid != null) {
      options.force_chid = replayTarget.forceChid;
      forcedGroupCharacterId = replayTarget.forceChid;
    } else {
      delete options.force_chid;
      forcedGroupCharacterId = null;
    }
    skipReplay = replayTarget.skipReplay;
    skipReason = replayTarget.skipReason;
  }

  return { type, options, dryRun: intent.dryRun, forcedAutomaticTrigger, forcedGroupCharacterId, skipReplay, skipReason };
}

function resetUserTurnGate(reason: string): void {
  const hadIntent = Boolean(userTurnGatePendingIntent);
  if (userTurnGateStopTimer !== null) {
    window.clearTimeout(userTurnGateStopTimer);
    userTurnGateStopTimer = null;
  }
  userTurnGateActive = false;
  userTurnGateMessageIndex = null;
  userTurnGateMessageText = "";
  userTurnGatePendingIntent = null;
  userTurnGateReplayAttempts = 0;
  pushTrace("user_gate.reset", { reason, hadIntent });
}

function startUserTurnGate(context: STContext, messageIndex: number | null): void {
  if (userTurnGateStopTimer !== null) {
    window.clearTimeout(userTurnGateStopTimer);
    userTurnGateStopTimer = null;
  }
  const resolvedIndex =
    typeof messageIndex === "number" && messageIndex >= 0 && messageIndex < context.chat.length
      ? messageIndex
      : getLastUserMessageIndex(context);
  const messageText =
    resolvedIndex != null && resolvedIndex >= 0 && resolvedIndex < context.chat.length
      ? String(context.chat[resolvedIndex]?.mes ?? "").trim()
      : "";
  if (resolvedIndex == null) {
    resetUserTurnGate("no_trackable_user_message");
    return;
  }
  userTurnGateActive = true;
  userTurnGateMessageIndex = resolvedIndex;
  userTurnGateMessageText = messageText;
  userTurnGatePendingIntent = null;
  userTurnGateReplayAttempts = 0;
  pushTrace("user_gate.start", {
    messageIndex: resolvedIndex ?? null,
    messageChars: messageText.length,
  });
  if (
    chatGenerationInFlight &&
    !chatGenerationSawCharacterRender &&
    !userTurnGatePendingIntent &&
    chatGenerationIntent
  ) {
    userTurnGatePendingIntent = cloneCapturedGenerationIntent(chatGenerationIntent);
    userTurnGateReplayAttempts = 0;
    pushTrace("user_gate.adopt_inflight_generation", {
      type: userTurnGatePendingIntent.type,
      startLastAiIndex: chatGenerationStartLastAiIndex,
      messageIndex: userTurnGateMessageIndex,
      optionKeys: Object.keys(userTurnGatePendingIntent.options),
    });
    requestUserTurnGateStop(context, userTurnGatePendingIntent.type);
  }
}

function requestUserTurnGateStop(context: STContext, type: string): void {
  if (!userTurnGateActive) return;
  if (userTurnGateStopTimer !== null) return;
  userTurnGateStopTimer = window.setTimeout(() => {
    userTurnGateStopTimer = null;
    if (!userTurnGateActive) return;
    const stopped = Boolean(context.stopGeneration?.());
    pushTrace("user_gate.stop_generation", { stopped, type });
  }, 0);
}

function validateUserTurnGateReplay(context: STContext): { ok: boolean; reason: string } {
  return validateUserTurnReplayState({
    context,
    gateActive: userTurnGateActive,
    gatedMessageIndex: userTurnGateMessageIndex,
    gatedMessageText: userTurnGateMessageText,
    getLastUserMessageIndex,
  });
}

function finalizeUserTurnGateReplay(triggerReason: string): void {
  if (!userTurnGateActive) return;
  const context = getSafeContext();
  if (!context) {
    resetUserTurnGate("context_unavailable");
    return;
  }
  const intent = userTurnGatePendingIntent;
  if (!intent) {
    resetUserTurnGate("no_captured_generation_intent");
    return;
  }

  if (chatGenerationInFlight) {
    userTurnGateReplayAttempts += 1;
    if (userTurnGateReplayAttempts > 20) {
      pushTrace("user_gate.replay_skip", {
        reason: "generation_still_in_flight",
        attempts: userTurnGateReplayAttempts,
      });
      resetUserTurnGate("generation_still_in_flight");
      return;
    }
    requestUserTurnGateStop(context, intent.type);
    pushTrace("user_gate.replay_wait", {
      triggerReason,
      attempts: userTurnGateReplayAttempts,
      type: intent.type,
    });
    window.setTimeout(() => finalizeUserTurnGateReplay("wait_generation_end"), 120);
    return;
  }

  const replayValidation = validateUserTurnGateReplay(context);
  const replay = intent;
  const normalizedReplay = normalizeReplayGenerationIntent(context, replay);
  let shouldReplay = false;
  executeUserTurnReplay({
    triggerReason,
    intent: replay,
    replayValidation,
    hasGenerate: typeof context.generate === "function",
    normalizedReplay,
    pushTrace,
    resetGate: resetUserTurnGate,
    onReplay: () => {
      shouldReplay = true;
    },
  });
  if (!shouldReplay) return;
  chatGenerationInFlight = false;
  chatGenerationIntent = null;
  chatGenerationSawCharacterRender = false;
  chatGenerationStartLastAiIndex = null;
  swipeGenerationActive = false;
  pendingLateRenderExtraction = false;
  pendingLateRenderStartLastAiIndex = null;
  lateRenderRecovery.clear();
  pushTrace("user_gate.replay_start", {
    triggerReason,
    type: normalizedReplay.type,
    dryRun: normalizedReplay.dryRun,
    optionKeys: Object.keys(normalizedReplay.options),
    forcedAutomaticTrigger: normalizedReplay.forcedAutomaticTrigger,
    forcedGroupCharacterId: normalizedReplay.forcedGroupCharacterId,
  });
  void (async () => {
    try {
      await context.generate?.(normalizedReplay.type, normalizedReplay.options, normalizedReplay.dryRun);
      pushTrace("user_gate.replay_done", {
        type: normalizedReplay.type,
        forcedAutomaticTrigger: normalizedReplay.forcedAutomaticTrigger,
        forcedGroupCharacterId: normalizedReplay.forcedGroupCharacterId,
      });
    } catch (error) {
      pushTrace("user_gate.replay_error", {
        type: normalizedReplay.type,
        forcedAutomaticTrigger: normalizedReplay.forcedAutomaticTrigger,
        forcedGroupCharacterId: normalizedReplay.forcedGroupCharacterId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error("[BetterSimTracker] Failed to replay generation intent:", error);
    }
  })();
}

function queueRender(): void {
  if (!settings) return;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!settings) return;
    const context = getSafeContext();
    const entries: Array<{ messageIndex: number; data: TrackerData | null; recovery?: TrackerRecoveryEntry | null }> = [];

    let recoveryMapMutated = false;
    if (context) {
      pruneProjectedTrackerDataCache(renderProjectedTrackerDataCache, context.chat.length);
      for (let i = 0; i < context.chat.length; i += 1) {
        const message = context.chat[i];
        if (!isTrackableMessage(message)) continue;
        const rawData = getTrackerDataFromMessage(message);
        const data = rawData ? getMessageScopedTrackerData(context, i, rawData, settings) : null;
        if (!data) continue;
        entries.push({ messageIndex: i, data, recovery: null });
        const hadRecovery = trackerRecoveryByMessage.has(i);
        clearTrackerRecoveryWithOptions(i, false);
        if (hadRecovery) recoveryMapMutated = true;
      }
    } else {
      renderProjectedTrackerDataCache.clear();
    }

    if (latestData && latestDataMessageIndex != null && !entries.some(entry => entry.messageIndex === latestDataMessageIndex)) {
      entries.push({ messageIndex: latestDataMessageIndex, data: latestData, recovery: null });
      const hadRecovery = trackerRecoveryByMessage.has(latestDataMessageIndex);
      clearTrackerRecoveryWithOptions(latestDataMessageIndex, false);
      if (hadRecovery) recoveryMapMutated = true;
    }

    if (
      trackerUiState.phase === "extracting" &&
      trackerUiState.messageIndex != null &&
      context &&
      isRenderableTrackerIndex(context, trackerUiState.messageIndex) &&
      !entries.some(entry => entry.messageIndex === trackerUiState.messageIndex)
    ) {
      entries.push({ messageIndex: trackerUiState.messageIndex, data: null, recovery: null });
    }
    if (
      trackerUiState.phase === "generating" &&
      trackerUiState.messageIndex != null &&
      context &&
      isRenderableTrackerIndex(context, trackerUiState.messageIndex) &&
      !entries.some(entry => entry.messageIndex === trackerUiState.messageIndex)
    ) {
      entries.push({ messageIndex: trackerUiState.messageIndex, data: null, recovery: null });
    }
    if (context) {
      for (const [messageIndex, recovery] of trackerRecoveryByMessage.entries()) {
        if (messageIndex < 0 || messageIndex >= context.chat.length) {
          trackerRecoveryByMessage.delete(messageIndex);
          recoveryMapMutated = true;
          continue;
        }
        if (!isRenderableTrackerIndex(context, messageIndex)) continue;
        if (entries.some(entry => entry.messageIndex === messageIndex)) continue;
        entries.push({ messageIndex, data: null, recovery });
      }

      const existingIndices = new Set(entries.map(entry => entry.messageIndex));
      const manualPlaceholderIndices = computeManualPlaceholderMessageIndices(
        context,
        existingIndices,
        settings.autoGenerateTracker,
        (ctx, messageIndex) => isRenderableTrackerIndex(ctx, messageIndex),
      );
      for (const messageIndex of manualPlaceholderIndices) {
        entries.push({
          messageIndex,
          data: null,
          recovery: {
            kind: "stopped",
            title: "Tracker not generated",
            detail: "Auto-generation is disabled for this chat. Generate tracker manually for this message.",
            actionLabel: "Generate Tracker",
          },
        });
      }
      if (recoveryMapMutated) {
        persistTrackerRecoveries(context);
      }
    }
    const latestAiIndex = context ? getLastAiMessageIndex(context) : null;
    const nextRenderPassSnapshot = buildRenderPassSnapshot(entries, {
      settings,
      allCharacters: allCharacterNames,
      isGroupChat: Boolean(context?.groupId),
      uiState: trackerUiState,
      summaryBusyMessageIndices: activeSummaryRuns,
      isUserMessageIndex: messageIndex => {
        const liveContext = getSafeContext();
        if (!liveContext || messageIndex < 0 || messageIndex >= liveContext.chat.length) return false;
        return Boolean(liveContext.chat[messageIndex]?.is_user);
      },
    });
    const dirtyRenderStart = resolveDirtyRenderStart(previousRenderPassSnapshot, nextRenderPassSnapshot);
    previousRenderPassSnapshot = nextRenderPassSnapshot;

    pushTrace("render.queue", {
      entries: entries.length,
      uiPhase: trackerUiState.phase,
      uiMessageIndex: trackerUiState.messageIndex,
      latestDataMessageIndex,
      dirtyRenderStart,
    });

    renderTracker(entries, settings, allCharacterNames, Boolean(context?.groupId), trackerUiState, latestAiIndex, activeSummaryRuns, messageIndex => {
      const liveContext = getSafeContext();
      if (!liveContext || messageIndex < 0 || messageIndex >= liveContext.chat.length) return false;
      return Boolean(liveContext.chat[messageIndex]?.is_user);
    }, characterName => {
      if (characterName !== USER_TRACKER_KEY) return characterName;
      const liveContext = getSafeContext();
      const userLabel = String(liveContext?.name1 ?? "").trim();
      return userLabel || "User";
    }, characterName => {
      const liveContext = getSafeContext();
      const normalized = String(characterName ?? "").trim().toLowerCase();
      if (!normalized) return null;
      if (normalized === USER_TRACKER_KEY.toLowerCase()) {
        const personaAvatarId = resolveCurrentPersonaAvatarId(liveContext);
        if (personaAvatarId) {
          return `persona:${personaAvatarId}`;
        }
      }
      if (!liveContext?.characters?.length) return null;
      let character = settings
        ? findCharacterByOwner(liveContext, settings, characterName)
        : liveContext.characters.find(item => String(item?.name ?? "").trim().toLowerCase() === normalized);
      if (!character && normalized === USER_TRACKER_KEY.toLowerCase()) {
        const userName = String(liveContext.name1 ?? "").trim().toLowerCase();
        if (userName) {
          character = liveContext.characters.find(item => String(item?.name ?? "").trim().toLowerCase() === userName);
        }
      }
      const avatar = String(character?.avatar ?? "").trim();
      return avatar || null;
    }, characterName => {
      const liveContext = getSafeContext();
      if (!settings) return null;
      const mode = resolveEntityTrackingMode(settings);
      const resolved = resolveCharacterIdentity(liveContext, characterName, mode);
      if (!resolved) return null;
      const sourceKey = buildEntitySourceKey(resolved.sourceName, resolved.sourceAvatar);
      return {
        sourceKey,
        isAlias: resolved.matchedBy === "alias",
        isSource: resolved.matchedBy === "source",
      };
    }, characterName => {
      const liveContext = getSafeContext();
      return isTrackerEnabledForOwner(liveContext, settings!, characterName);
    }, (characterName, statId) => {
      const liveContext = getSafeContext();
      return isOwnerStatEnabled(liveContext, settings!, characterName, statId);
    }, (characterName, messageIndex) => {
        const liveContext = getSafeContext();
        return getEntityRegistryLifecycleStateForMessage(liveContext, characterName, messageIndex);
      }, (entityId, messageIndex) => {
        const liveContext = getSafeContext();
        return getEntityRegistryLifecycleStateForEntityIdForMessage(liveContext, entityId, messageIndex);
      }, messageIndex => {
        const liveContext = getSafeContext();
        return listEntityRegistryOwnersForMessage(liveContext, messageIndex);
    }, messageIndex => {
        const liveContext = getSafeContext();
        return listEntityRegistryEntriesForMessage(liveContext, messageIndex);
    }, (characterName, messageIndex) => {
        const liveContext = getSafeContext();
        return getEntityRegistryEntryForMessage(liveContext, characterName, messageIndex);
    }, (entityId, messageIndex) => {
        const liveContext = getSafeContext();
        return getEntityRegistryEntryByEntityIdForMessage(liveContext, entityId, messageIndex);
    }, target => {
      const context = getSafeContext();
      if (!context || !settings) return;
      const history = getRecentTrackerHistory(context, 120);
      if (history.length === 0 && latestData) {
        history.push(latestData);
      }
      const graphSummary = summarizeGraphSeries(context, history, target);
      pushTrace("graph.open", {
        character: target.ownerName,
        entityId: target.entityId ?? null,
        historySnapshots: history.length,
        snapshots: graphSummary.snapshots,
        fromTs: graphSummary.fromTs,
        toTs: graphSummary.toTs,
        latest: graphSummary.latest,
        series: graphSummary.series
      });
      openGraphModal({
        target,
        history,
        accentColor: settings.accentColor,
        settings,
        debug: settings.debug
      });
    }, messageIndex => {
      clearTrackerRecovery(messageIndex);
      void runExtraction("manual_refresh", messageIndex);
    }, messageIndex => {
      void sendTrackerSummaryToChat(messageIndex);
    }, () => {
      if (!isExtracting) return;
      if (activeExtractionRunId != null) {
        cancelledExtractionRuns.add(activeExtractionRunId);
      }
      const canceled = cancelActiveGenerations();
      pushTrace("extract.cancel", { canceled, source: "ui", runId: activeExtractionRunId });
    }, payload => {
      applyManualTrackerEdits(payload);
    }, messageIndex => {
      const liveContext = getSafeContext();
      if (!liveContext || messageIndex < 0 || messageIndex >= liveContext.chat.length) return null;
      return getTrackerDataFromMessage(liveContext.chat[messageIndex]);
    }, () => {
      queueRender();
    }, payload => {
      const liveContext = getSafeContext();
      if (!liveContext || !settings) return;
      syncEntityRegistryFromRender({
        context: liveContext,
        mode: resolveEntityTrackingMode(settings),
        messageIndex: payload.messageIndex,
        targets: payload.targets,
        getLifecycleStateByTarget: payload.getLifecycleState,
        allowSameMessageDemotion: false,
      });
    }, messageIndex => {
      clearTrackerRecovery(messageIndex);
      void runExtraction("manual_refresh", messageIndex);
    }, dirtyRenderStart);
  });
}

function queuePromptSync(context: STContext, options?: { force?: boolean }): void {
  promptRefreshController?.queuePromptSync(context, options);
}

function scheduleRefresh(delay = 80): void {
  promptRefreshController?.scheduleRefresh(delay);
}

function scheduleDeferredInitRefresh(delay: number): void {
  window.setTimeout(() => {
    if (!settings) return;
    const context = getSafeContext();
    if (!context) return;
    const lastTrackableIndex = getLastTrackableMessageIndex(context);
    if (!shouldRunDeferredInitRefresh({
      enabled: settings.enabled,
      isExtracting,
      chatGenerationInFlight,
      pendingLateRenderExtraction,
      latestDataMessageIndex,
      lastTrackableIndex,
      uiPhase: trackerUiState.phase,
    })) {
      pushTrace("refresh.init.skip", {
        delay,
        latestDataMessageIndex,
        lastTrackableIndex,
        uiPhase: trackerUiState.phase,
        isExtracting,
        chatGenerationInFlight,
        pendingLateRenderExtraction,
      });
      return;
    }
    pushTrace("refresh.init.retry", {
      delay,
      latestDataMessageIndex,
      lastTrackableIndex,
    });
    refreshFromStoredData();
  }, delay);
}

function scheduleExtraction(reason: string, targetMessageIndex?: number, delay = 180): void {
  if (settings && !settings.autoGenerateTracker && !isManualExtractionReason(reason)) {
    pushTrace("extract.schedule.skip", {
      reason: "auto_generate_disabled",
      trigger: reason,
      targetMessageIndex: targetMessageIndex ?? null,
    });
    return;
  }
  extractionScheduler.schedule(reason, targetMessageIndex, delay);
}

function scheduleSwipeExtraction(reason: string, targetMessageIndex?: number): void {
  pendingSwipeExtraction = { reason, messageIndex: targetMessageIndex, waitForGenerationEnd: false };
  if (swipeExtractionTimer !== null) {
    window.clearTimeout(swipeExtractionTimer);
  }
  swipeExtractionTimer = window.setTimeout(() => {
    const pending = pendingSwipeExtraction;
    pendingSwipeExtraction = null;
    swipeExtractionTimer = null;
    if (!pending || pending.waitForGenerationEnd) return;
    pushTrace("extract.swipe.timeout", { reason: pending.reason, targetMessageIndex: pending.messageIndex ?? null });
    scheduleExtraction(pending.reason, pending.messageIndex);
  }, 2500);
}

function clearPendingSwipeExtraction(): void {
  pendingSwipeExtraction = null;
  if (swipeExtractionTimer !== null) {
    window.clearTimeout(swipeExtractionTimer);
    swipeExtractionTimer = null;
  }
}

function setTrackerUi(context: STContext, next: TrackerUiState): void {
  const prev = trackerUiState;
  trackerUiState = next;
  pushTrace("ui.phase", {
    from: prev.phase,
    to: next.phase,
    messageIndex: next.messageIndex
  });
  if (next.phase !== "idle") {
    context.deactivateSendButtons?.();
  } else {
    context.activateSendButtons?.();
  }
}

function clearTrackerRecovery(messageIndex: number | null | undefined): void {
  clearTrackerRecoveryWithOptions(messageIndex, true);
}

function clearTrackerRecoveryWithOptions(messageIndex: number | null | undefined, persist: boolean): void {
  if (typeof messageIndex !== "number" || !Number.isFinite(messageIndex) || messageIndex < 0) return;
  const deleted = trackerRecoveryByMessage.delete(messageIndex);
  if (!deleted || !persist) return;
  const context = getSafeContext();
  if (!context) return;
  persistTrackerRecoveries(context);
}

function persistTrackerRecoveries(context: STContext): void {
  if (!context.chatMetadata || typeof context.chatMetadata !== "object") {
    context.chatMetadata = {};
  }
  const serialized: Record<string, TrackerRecoveryEntry> = {};
  for (const [messageIndex, entry] of trackerRecoveryByMessage.entries()) {
    if (!Number.isFinite(messageIndex) || messageIndex < 0) continue;
    serialized[String(messageIndex)] = {
      kind: entry.kind === "stopped" ? "stopped" : "error",
      title: String(entry.title ?? "").trim() || "Tracker generation failed",
      detail: sanitizeTrackerRecoveryDetail(entry.detail ?? ""),
      actionLabel: String(entry.actionLabel ?? "").trim() || "Retry Tracker",
    };
  }
  context.chatMetadata[TRACKER_RECOVERY_METADATA_KEY] = serialized;
  context.saveMetadataDebounced?.();
  context.saveChatDebounced?.();
}

function readPersistedTrackerRecoveries(context: STContext): void {
  trackerRecoveryByMessage.clear();
  const raw = context.chatMetadata?.[TRACKER_RECOVERY_METADATA_KEY];
  if (!raw || typeof raw !== "object") return;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0) continue;
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const kindRaw = String(record.kind ?? "").trim().toLowerCase();
    const kind = kindRaw === "stopped" ? "stopped" : "error";
    const title = String(record.title ?? "").trim();
    const detail = sanitizeTrackerRecoveryDetail(String(record.detail ?? ""));
    const actionLabel = String(record.actionLabel ?? "").trim();
    trackerRecoveryByMessage.set(idx, {
      kind,
      title: title || (kind === "stopped" ? "Tracker generation stopped" : "Tracker generation failed"),
      detail,
      actionLabel: actionLabel || (kind === "stopped" ? "Generate Tracker" : "Retry Tracker"),
    });
  }
}

function sanitizeTrackerRecoveryDetail(raw: string): string {
  const compact = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\x09\x0A\x20-\x7E]/g, " ")
    .trim();
  if (!compact) return "Unknown extraction error.";
  return compact.slice(0, 700);
}

function getErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const seen = new WeakSet<object>();
  let statusCode: number | null = null;
  let statusText = "";

  const pushMessage = (value: unknown): void => {
    const text = String(value ?? "").trim();
    if (!text || text === "[object Object]") return;
    if (!messages.includes(text)) messages.push(text);
  };

  const visit = (value: unknown, depth = 0): void => {
    if (depth > 4 || value == null) return;
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return;
      if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
        try {
          visit(JSON.parse(text), depth + 1);
        } catch {
          pushMessage(text);
        }
        return;
      }
      pushMessage(text);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      pushMessage(value);
      return;
    }
    if (value instanceof Error) {
      pushMessage(value.message);
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      visit((value as Error & { meta?: unknown }).meta, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    const record = value as Record<string, unknown>;
    const rawStatus = record.status;
    if (typeof rawStatus === "number" && Number.isFinite(rawStatus)) {
      statusCode = Math.round(rawStatus);
    } else if (typeof rawStatus === "string") {
      const parsed = Number(rawStatus);
      if (!Number.isNaN(parsed)) statusCode = Math.round(parsed);
    }
    if (typeof record.statusText === "string" && record.statusText.trim()) {
      statusText = record.statusText.trim();
    }

    pushMessage(record.message);
    pushMessage(record.error_description);
    pushMessage(record.detail);
    pushMessage(record.reason);
    pushMessage(record.error);
    if (record.code != null && (typeof record.code === "string" || typeof record.code === "number")) {
      pushMessage(`code ${record.code}`);
    }

    const nestedKeys = [
      "meta",
      "response",
      "responseText",
      "body",
      "data",
      "details",
      "cause",
      "payload",
      "result",
    ];
    for (const key of nestedKeys) {
      visit(record[key], depth + 1);
    }
  };

  visit(error);

  if (statusCode != null) {
    const prefix = statusText ? `HTTP ${statusCode} ${statusText}` : `HTTP ${statusCode}`;
    const first = messages[0];
    return first ? `${prefix}: ${first}` : prefix;
  }
  if (messages.length) return messages[0];
  const fallback = String(error ?? "").trim();
  return fallback && fallback !== "[object Object]" ? fallback : "Unknown extraction error.";
}

function getReportedExtensionVersion(): string {
  const runtime = String(runtimeManifestVersion ?? "").trim();
  if (runtime) return runtime;
  const build = String(__BST_VERSION__ ?? "").trim();
  return build || "dev";
}

async function hydrateRuntimeManifestVersion(): Promise<void> {
  try {
    const script = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
      .find(node => /\/scripts\/extensions\/third-party\/BetterSimTracker\/dist\/index\.js(?:\?|$)/i.test(String(node.src ?? "")));
    if (!script?.src) return;
    const manifestUrl = script.src.replace(/\/dist\/index\.js(?:\?.*)?$/i, "/manifest.json");
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { version?: unknown };
    const version = String(payload?.version ?? "").trim();
    if (version) runtimeManifestVersion = version;
  } catch {
    // best-effort runtime metadata hydration
  }
}

function setTrackerRecovery(
  messageIndex: number,
  entry: TrackerRecoveryEntry,
): void {
  if (!Number.isFinite(messageIndex) || messageIndex < 0) return;
  trackerRecoveryByMessage.set(messageIndex, entry);
  const context = getSafeContext();
  if (!context) return;
  persistTrackerRecoveries(context);
}

function findCharacterByName(context: STContext | null, name: string): Character | null {
  return findCharacterByOwner(context, { entityTrackingMode: "standard" }, name);
}

function findCharacterByOwner(
  context: STContext | null,
  settingsInput: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
  name: string,
): Character | null {
  const normalized = String(name ?? "").trim();
  if (!normalized) return null;
  const resolved = resolveCharacterFromContext(context, normalized, resolveEntityTrackingMode(settingsInput));
  if (resolved) return resolved;
  const key = normalized.toLowerCase();
  const characters = context?.characters ?? [];
  return characters.find(character => String(character?.name ?? "").trim().toLowerCase() === key) ?? null;
}

function parseDefaultNumber(raw: unknown): number | null {
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseDefaultText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text ? text : null;
}

function slugifyDefaultsKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "user";
}

function resolveUserDefaultsIdentity(context: STContext | null): { name: string; avatar: string | null } {
  const personaAvatarId = resolveCurrentPersonaAvatarId(context);
  if (personaAvatarId) {
    const scoped = `persona:${personaAvatarId}`;
    return { name: scoped, avatar: scoped };
  }
  const personaName = String(context?.name1 ?? "").trim() || "User";
  return { name: `persona_name:${slugifyDefaultsKey(personaName)}`, avatar: null };
}

function getConfiguredCharacterDefaults(
  context: STContext | null,
  settingsInput: BetterSimTrackerSettings,
  name: string,
  allowOwnerDefaults = true,
): {
  trackerEnabled?: boolean;
  statEnabled?: Record<string, boolean>;
  affection?: number;
  trust?: number;
  desire?: number;
  connection?: number;
  mood?: string;
  lastThought?: string;
  customStatDefaults?: Record<string, number>;
  customNonNumericStatDefaults?: Record<string, string | boolean | string[]>;
} {
  if (!allowOwnerDefaults && name !== USER_TRACKER_KEY) {
    return {};
  }
  if (name === USER_TRACKER_KEY) {
    const identity = resolveUserDefaultsIdentity(context);
    const defaultsFromSettings = resolveCharacterDefaultsEntry(settingsInput, identity);
    const legacyFallback = Object.keys(defaultsFromSettings).length
      ? {}
      : resolveCharacterDefaultsEntry(settingsInput, { name: USER_TRACKER_KEY, avatar: null });
    const merged = { ...legacyFallback, ...defaultsFromSettings };
    const trackerEnabled = merged.trackerEnabled === false ? false : undefined;
    const statEnabledRaw = merged.statEnabled && typeof merged.statEnabled === "object"
      ? merged.statEnabled as Record<string, unknown>
      : null;
    const statEnabled: Record<string, boolean> = {};
    if (statEnabledRaw) {
      for (const [rawId, rawValue] of Object.entries(statEnabledRaw)) {
        const id = String(rawId ?? "").trim().toLowerCase();
        if (!id) continue;
        if (rawValue === false) statEnabled[id] = false;
      }
    }
    const affection = parseDefaultNumber(merged.affection);
    const trust = parseDefaultNumber(merged.trust);
    const desire = parseDefaultNumber(merged.desire);
    const connection = parseDefaultNumber(merged.connection);
    const mood = parseDefaultText(merged.mood);
    const lastThought = parseDefaultText(merged.lastThought);
    const customStatDefaultsRaw = merged.customStatDefaults;
    const customStatDefaults: Record<string, number> = {};
    if (customStatDefaultsRaw && typeof customStatDefaultsRaw === "object") {
      for (const [key, value] of Object.entries(customStatDefaultsRaw as Record<string, unknown>)) {
        const id = String(key ?? "").trim().toLowerCase();
        if (!id) continue;
        const parsed = parseDefaultNumber(value);
        if (parsed == null) continue;
        customStatDefaults[id] = parsed;
      }
    }
    const customNonNumericStatDefaultsRaw = merged.customNonNumericStatDefaults;
    const customDefById = new Map(
      (settingsInput.customStats ?? []).map(def => [String(def.id ?? "").trim().toLowerCase(), def] as const),
    );
    const customNonNumericStatDefaults: Record<string, string | boolean | string[]> = {};
    if (customNonNumericStatDefaultsRaw && typeof customNonNumericStatDefaultsRaw === "object") {
      for (const [key, value] of Object.entries(customNonNumericStatDefaultsRaw as Record<string, unknown>)) {
        const id = String(key ?? "").trim().toLowerCase();
        if (!id) continue;
        const statDef = customDefById.get(id);
        const kind = statDef?.kind ?? "text_short";
        if (kind === "array") {
          const maxLength = normalizeCustomTextMaxLength(statDef?.textMaxLength, 120);
          const items = normalizeNonNumericArrayItems(value, maxLength);
          if (!items.length) continue;
          customNonNumericStatDefaults[id] = items;
          continue;
        }
        if (kind === "date_time") {
          const normalized = normalizeDateTimeWithMode(value, statDef?.dateTimeMode ?? "timestamp");
          if (!normalized) continue;
          customNonNumericStatDefaults[id] = normalized;
          continue;
        }
        if (typeof value === "boolean") {
          customNonNumericStatDefaults[id] = value;
          continue;
        }
        if (typeof value === "string") {
          const text = value.trim().replace(/\s+/g, " ");
          if (!text) continue;
          customNonNumericStatDefaults[id] = text.slice(0, 200);
        }
      }
    }
    return {
      ...(trackerEnabled === false ? { trackerEnabled: false } : {}),
      ...(Object.keys(statEnabled).length ? { statEnabled } : {}),
      ...(affection != null ? { affection } : {}),
      ...(trust != null ? { trust } : {}),
      ...(desire != null ? { desire } : {}),
      ...(connection != null ? { connection } : {}),
      ...(mood != null ? { mood } : {}),
      ...(lastThought != null ? { lastThought } : {}),
      ...(Object.keys(customStatDefaults).length ? { customStatDefaults } : {}),
      ...(Object.keys(customNonNumericStatDefaults).length ? { customNonNumericStatDefaults } : {}),
    };
  }

  const character = findCharacterByOwner(context, settingsInput, name);
  const extFromCharacter = character?.extensions as Record<string, unknown> | undefined;
  const extFromData = character?.data?.extensions as Record<string, unknown> | undefined;
  const own = ((extFromCharacter?.bettersimtracker ?? extFromData?.bettersimtracker) as Record<string, unknown> | undefined);
  const defaultsFromExtensions = (own?.defaults as Record<string, unknown> | undefined) ?? {};
  const defaultsFromSettings = resolveCharacterDefaultsEntry(settingsInput, {
    name,
    avatar: character?.avatar,
  });
  const merged = { ...defaultsFromSettings, ...defaultsFromExtensions };
  const trackerEnabled = merged.trackerEnabled === false ? false : undefined;
  const statEnabledRaw = merged.statEnabled && typeof merged.statEnabled === "object"
    ? merged.statEnabled as Record<string, unknown>
    : null;
  const statEnabled: Record<string, boolean> = {};
  if (statEnabledRaw) {
    for (const [rawId, rawValue] of Object.entries(statEnabledRaw)) {
      const id = String(rawId ?? "").trim().toLowerCase();
      if (!id) continue;
      if (rawValue === false) statEnabled[id] = false;
    }
  }
  const affection = parseDefaultNumber(merged.affection);
  const trust = parseDefaultNumber(merged.trust);
  const desire = parseDefaultNumber(merged.desire);
  const connection = parseDefaultNumber(merged.connection);
  const mood = parseDefaultText(merged.mood);
  const lastThought = parseDefaultText(merged.lastThought);
  const customStatDefaultsRaw = merged.customStatDefaults;
  const customStatDefaults: Record<string, number> = {};
  if (customStatDefaultsRaw && typeof customStatDefaultsRaw === "object") {
    for (const [key, value] of Object.entries(customStatDefaultsRaw as Record<string, unknown>)) {
      const id = String(key ?? "").trim().toLowerCase();
      if (!id) continue;
      const parsed = parseDefaultNumber(value);
      if (parsed == null) continue;
      customStatDefaults[id] = parsed;
    }
  }
  const customNonNumericStatDefaultsRaw = merged.customNonNumericStatDefaults;
  const customDefById = new Map(
    (settingsInput.customStats ?? []).map(def => [String(def.id ?? "").trim().toLowerCase(), def] as const),
  );
  const customNonNumericStatDefaults: Record<string, string | boolean | string[]> = {};
  if (customNonNumericStatDefaultsRaw && typeof customNonNumericStatDefaultsRaw === "object") {
    for (const [key, value] of Object.entries(customNonNumericStatDefaultsRaw as Record<string, unknown>)) {
      const id = String(key ?? "").trim().toLowerCase();
      if (!id) continue;
      const statDef = customDefById.get(id);
      const kind = statDef?.kind ?? "text_short";
      if (kind === "array") {
        const maxLength = normalizeCustomTextMaxLength(statDef?.textMaxLength, 120);
        const items = normalizeNonNumericArrayItems(value, maxLength);
        if (!items.length) continue;
        customNonNumericStatDefaults[id] = items;
        continue;
      }
      if (kind === "date_time") {
        const normalized = normalizeDateTimeWithMode(value, statDef?.dateTimeMode ?? "timestamp");
        if (!normalized) continue;
        customNonNumericStatDefaults[id] = normalized;
        continue;
      }
      if (typeof value === "boolean") {
        customNonNumericStatDefaults[id] = value;
        continue;
      }
      if (typeof value === "string") {
        const text = value.trim().replace(/\s+/g, " ");
        if (!text) continue;
        customNonNumericStatDefaults[id] = text.slice(0, 200);
      }
    }
  }
  return {
    ...(trackerEnabled === false ? { trackerEnabled: false } : {}),
    ...(Object.keys(statEnabled).length ? { statEnabled } : {}),
    ...(affection != null ? { affection } : {}),
    ...(trust != null ? { trust } : {}),
    ...(desire != null ? { desire } : {}),
    ...(connection != null ? { connection } : {}),
    ...(mood != null ? { mood } : {}),
    ...(lastThought != null ? { lastThought } : {}),
    ...(Object.keys(customStatDefaults).length ? { customStatDefaults } : {}),
    ...(Object.keys(customNonNumericStatDefaults).length ? { customNonNumericStatDefaults } : {}),
  };
}

function isTrackerEnabledForOwner(
  context: STContext | null,
  settingsInput: BetterSimTrackerSettings,
  name: string,
): boolean {
  return getConfiguredCharacterDefaults(
    context,
    settingsInput,
    name,
    shouldUseConfiguredOwnerDefaults(context, name),
  ).trackerEnabled !== false;
}

function isOwnerStatEnabled(
  context: STContext | null,
  settingsInput: BetterSimTrackerSettings,
  ownerName: string,
  statId: string,
): boolean {
  const id = String(statId ?? "").trim().toLowerCase();
  if (!id) return true;
  const configured = getConfiguredCharacterDefaults(
    context,
    settingsInput,
    ownerName,
    shouldUseConfiguredOwnerDefaults(context, ownerName),
  );
  return configured.statEnabled?.[id] !== false;
}

function buildSeededStatisticsForActiveCharacters(
  base: Statistics | null,
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null,
): Statistics {
  const seeded: Statistics = {
    affection: { ...(base?.affection ?? {}) },
    trust: { ...(base?.trust ?? {}) },
    desire: { ...(base?.desire ?? {}) },
    connection: { ...(base?.connection ?? {}) },
    mood: { ...(base?.mood ?? {}) },
    lastThought: { ...(base?.lastThought ?? {}) },
  };
  const allowOwnerDefaults = buildActiveSeedDefaultsPolicy(context, activeCharacters, activeEntityIds);

  for (const [index, name] of activeCharacters.entries()) {
    const entityId = activeEntityIds?.[index] ?? null;
    const configured = getConfiguredCharacterDefaults(
      context,
      settingsInput,
      name,
      allowOwnerDefaults.get(name) !== false,
    );
    if (resolveSeededOwnerLookupValue(context, seeded.affection, name, entityId) === undefined) {
      seeded.affection[name] = configured.affection ?? settingsInput.defaultAffection;
    }
    if (resolveSeededOwnerLookupValue(context, seeded.trust, name, entityId) === undefined) {
      seeded.trust[name] = configured.trust ?? settingsInput.defaultTrust;
    }
    if (resolveSeededOwnerLookupValue(context, seeded.desire, name, entityId) === undefined) {
      seeded.desire[name] = configured.desire ?? settingsInput.defaultDesire;
    }
    if (resolveSeededOwnerLookupValue(context, seeded.connection, name, entityId) === undefined) {
      seeded.connection[name] = configured.connection ?? settingsInput.defaultConnection;
    }
    if (resolveSeededOwnerLookupValue(context, seeded.mood, name, entityId) === undefined) {
      seeded.mood[name] = configured.mood ?? settingsInput.defaultMood;
    }
    if (resolveSeededOwnerLookupValue(context, seeded.lastThought, name, entityId) === undefined) {
      seeded.lastThought[name] = configured.lastThought ?? "";
    }
  }

  return seeded;
}

function buildSeededCustomStatisticsForActiveCharacters(
  base: CustomStatistics | null | undefined,
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null,
): CustomStatistics {
  const seeded: CustomStatistics = {};
  for (const [statId, values] of Object.entries(base ?? {})) {
    seeded[statId] = { ...(values ?? {}) };
  }

  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  const allowOwnerDefaults = buildActiveSeedDefaultsPolicy(context, activeCharacters, activeEntityIds);
  for (const def of customDefs) {
    if (!def.track) continue;
    if ((def.kind ?? "numeric") !== "numeric") continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    if (!seeded[statId]) seeded[statId] = {};
    for (const [index, name] of activeCharacters.entries()) {
      const entityId = activeEntityIds?.[index] ?? null;
      if (resolveSeededOwnerLookupValue(context, seeded[statId], name, entityId) !== undefined) continue;
      const configured = getConfiguredCharacterDefaults(
        context,
        settingsInput,
        name,
        allowOwnerDefaults.get(name) !== false,
      );
      const configuredValue = configured.customStatDefaults?.[statId];
      const fallback = Number(def.defaultValue);
      seeded[statId][name] = configuredValue ?? (Number.isNaN(fallback) ? 50 : fallback);
    }
  }

  return seeded;
}

function buildSeededCustomNonNumericStatisticsForActiveCharacters(
  base: CustomNonNumericStatistics | null | undefined,
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null,
): CustomNonNumericStatistics {
  const seeded: CustomNonNumericStatistics = {};
  for (const [statId, values] of Object.entries(base ?? {})) {
    seeded[statId] = { ...(values ?? {}) };
  }

  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  const allowOwnerDefaults = buildActiveSeedDefaultsPolicy(context, activeCharacters, activeEntityIds);
  for (const def of customDefs) {
    if (!def.track) continue;
    const kind = def.kind ?? "numeric";
    if (kind === "numeric") continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    if (!seeded[statId]) seeded[statId] = {};
    const normalizeValue = (raw: unknown): CustomNonNumericValue => {
      return normalizeCustomNonNumericValue(kind, raw, {
        enumOptions: def.enumOptions,
        textMaxLength: def.textMaxLength,
        dateTimeMode: def.dateTimeMode,
        preserveExplicitEmptyArray: true,
      }) ?? normalizeCustomNonNumericValue(kind, def.defaultValue, {
        enumOptions: def.enumOptions,
        textMaxLength: def.textMaxLength,
        dateTimeMode: def.dateTimeMode,
        preserveExplicitEmptyArray: true,
      }) ?? (kind === "boolean" ? false : kind === "array" ? [] : "");
    };
    for (const [index, name] of activeCharacters.entries()) {
      const entityId = activeEntityIds?.[index] ?? null;
      const existingValue = resolveSeededOwnerLookupValue(context, seeded[statId], name, entityId);
      if (existingValue !== undefined) {
        seeded[statId][name] = normalizeValue(existingValue);
        continue;
      }
      const shouldForceUnknownForAliasOwner =
        !def.globalScope &&
        isAliasResolvedOwner(context, name, settingsInput);
      const configured = getConfiguredCharacterDefaults(
        context,
        settingsInput,
        name,
        allowOwnerDefaults.get(name) !== false,
      );
      const configuredValue = configured.customNonNumericStatDefaults?.[statId];
      if (!shouldForceUnknownForAliasOwner && configuredValue !== undefined) {
        seeded[statId][name] = normalizeValue(configuredValue);
        continue;
      }
      seeded[statId][name] = shouldForceUnknownForAliasOwner
        ? (kind === "boolean" ? false : kind === "array" ? [] : "")
        : normalizeValue(undefined);
    }
  }

  return seeded;
}

function seedHistoryForActiveCharacters(
  history: TrackerData[],
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null,
): TrackerData[] {
  const targetToEntity = buildTargetToEntityMap(
    context,
    activeCharacters,
    activeEntityIds,
    resolveEntityTrackingMode(settingsInput),
  );
  return history.map(entry => {
    const statistics = buildSeededStatisticsForActiveCharacters(
      entry.statistics,
      activeCharacters,
      activeEntityIds,
      settingsInput,
      context,
    );
    const customStatistics = buildSeededCustomStatisticsForActiveCharacters(
      entry.customStatistics,
      activeCharacters,
      activeEntityIds,
      settingsInput,
      context,
    );
    const customNonNumericStatistics = buildSeededCustomNonNumericStatisticsForActiveCharacters(
      entry.customNonNumericStatistics,
      activeCharacters,
      activeEntityIds,
      settingsInput,
      context,
    );
    return {
      ...entry,
      statistics,
      statisticsByEntityId: buildEntityScopedStatisticsBuckets(statistics, targetToEntity),
      customStatistics,
      customStatisticsByEntityId: buildEntityScopedCustomStatisticsBuckets(customStatistics, targetToEntity),
      customNonNumericStatistics,
      customNonNumericStatisticsByEntityId: buildEntityScopedCustomNonNumericStatisticsBuckets(customNonNumericStatistics, targetToEntity),
    };
  });
}

function buildBaselineData(
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
  s: BetterSimTrackerSettings,
): TrackerData {
  const context = getSafeContext();
  const allowOwnerDefaults = buildActiveSeedDefaultsPolicy(context, activeCharacters, activeEntityIds);

  const pickNumber = (raw: unknown, fallback: number): number => {
    const n = Number(raw);
    if (Number.isNaN(n)) return fallback;
    return Math.max(0, Math.min(100, n));
  };

  const pickText = (raw: unknown, fallback: string): string => {
    if (typeof raw !== "string" || !raw.trim()) return fallback;
    return raw.trim();
  };

  const inferFromContext = (name: string): {
    affection: number;
    trust: number;
    desire: number;
    connection: number;
    mood: string;
  } => {
    const recent = (context?.chat ?? []).slice(-Math.max(8, s.contextMessages));
    const lines = recent
      .filter(message => {
        if (message.is_system) return false;
        const speaker = String(message.name ?? "");
        return speaker === name || message.is_user;
      })
      .map(message => String(message.mes ?? "").toLowerCase());
    const joined = lines.join("\n");
    const count = (re: RegExp): number => (joined.match(re) ?? []).length;
    const pos = count(/\b(love|care|trust|safe|support|hug|kiss|thank|gentle|close|warm|happy)\b/g);
    const neg = count(/\b(hate|angry|mad|fight|betray|jealous|cold|distant|ignore|fear|resent)\b/g);
    const romantic = count(/\b(kiss|touch|desire|want you|flirt|blush|attract|yearn|tease)\b/g);
    const affinity = Math.max(-30, Math.min(30, (pos - neg) * 4));
    const attraction = Math.max(-25, Math.min(25, romantic * 6 - Math.max(0, neg - pos) * 3));
    const mood = neg > pos ? "Frustrated" : romantic > 0 ? "Hopeful" : pos > 0 ? "Content" : "Neutral";

    return {
      affection: Math.max(0, Math.min(100, Math.round(45 + affinity))),
      trust: Math.max(0, Math.min(100, Math.round(45 + Math.max(-25, Math.min(25, (pos - neg) * 3))))),
      desire: Math.max(0, Math.min(100, Math.round(35 + attraction))),
      connection: Math.max(0, Math.min(100, Math.round(48 + Math.max(-28, Math.min(28, (pos - neg) * 3 + Math.floor(pos / 2)))))),
      mood
    };
  };

  const getCardDefaults = (name: string): {
    affection: number;
    trust: number;
    desire: number;
    connection: number;
    mood: string;
    lastThought: string;
    custom: Record<string, number>;
    customNonNumeric: Record<string, string | boolean | string[]>;
  } => {
    const contextual = inferFromContext(name);
    const defaults = getConfiguredCharacterDefaults(
      context,
      s,
      name,
      allowOwnerDefaults.get(name) !== false,
    );
    const isAliasOwner = isAliasResolvedOwner(context, name, s);
    const customDefaults: Record<string, number> = {};
    const customNonNumericDefaults: Record<string, string | boolean | string[]> = {};
    for (const def of s.customStats ?? []) {
      if (!def.track) continue;
      const kind = def.kind ?? "numeric";
      const statId = String(def.id ?? "").trim().toLowerCase();
      if (!statId) continue;
      if (kind === "numeric") {
        const configuredCustom = defaults.customStatDefaults?.[statId];
        const fallback = Number(def.defaultValue);
        customDefaults[statId] = pickNumber(configuredCustom, Number.isNaN(fallback) ? 50 : fallback);
      } else if (kind === "boolean") {
        if (isAliasOwner && !def.globalScope) {
          customNonNumericDefaults[statId] = false;
          continue;
        }
        const configuredCustom = defaults.customNonNumericStatDefaults?.[statId];
        customNonNumericDefaults[statId] = typeof configuredCustom === "boolean"
          ? configuredCustom
          : (typeof def.defaultValue === "boolean" ? def.defaultValue : false);
      } else if (kind === "array") {
        if (isAliasOwner && !def.globalScope) {
          customNonNumericDefaults[statId] = [];
          continue;
        }
        const maxLength = Math.max(20, Math.min(200, Math.round(Number(def.textMaxLength) || 120)));
        const configuredCustom = defaults.customNonNumericStatDefaults?.[statId];
        const configuredItems = Array.isArray(configuredCustom)
          ? normalizeNonNumericArrayItems(configuredCustom, maxLength)
          : normalizeNonNumericArrayItems(configuredCustom, maxLength);
        const fallbackItems = normalizeNonNumericArrayItems(def.defaultValue, maxLength);
        customNonNumericDefaults[statId] = configuredItems.length ? configuredItems : fallbackItems;
      } else if (kind === "date_time") {
        const configuredCustom = defaults.customNonNumericStatDefaults?.[statId];
        customNonNumericDefaults[statId] = normalizeDateTimeWithMode(
          configuredCustom,
          def.dateTimeMode ?? "timestamp",
          def.defaultValue,
        );
      } else {
        if (isAliasOwner && !def.globalScope) {
          customNonNumericDefaults[statId] = "";
          continue;
        }
        const configuredCustom = defaults.customNonNumericStatDefaults?.[statId];
        const text = typeof configuredCustom === "string"
          ? configuredCustom.trim()
          : String(def.defaultValue ?? "").trim();
        customNonNumericDefaults[statId] = text;
      }
    }
    const hasAnyExplicitDefaults =
      defaults.affection !== undefined ||
      defaults.trust !== undefined ||
      defaults.desire !== undefined ||
      defaults.connection !== undefined ||
      defaults.mood !== undefined ||
      defaults.lastThought !== undefined ||
      Object.keys(defaults.customStatDefaults ?? {}).length > 0 ||
      Object.keys(defaults.customNonNumericStatDefaults ?? {}).length > 0;

    if (hasAnyExplicitDefaults) {
      return {
        affection: pickNumber(defaults.affection, contextual.affection),
        trust: pickNumber(defaults.trust, contextual.trust),
        desire: pickNumber(defaults.desire, contextual.desire),
        connection: pickNumber(defaults.connection, contextual.connection),
        mood: pickText(defaults.mood, contextual.mood),
        lastThought: pickText(defaults.lastThought, ""),
        custom: customDefaults,
        customNonNumeric: customNonNumericDefaults,
      };
    }

    return { ...contextual, lastThought: "", custom: customDefaults, customNonNumeric: customNonNumericDefaults };
  };

  const baselinePerCharacter = new Map<string, ReturnType<typeof getCardDefaults>>();
  for (const name of activeCharacters) {
    baselinePerCharacter.set(name, getCardDefaults(name));
  }

  const customStatistics: CustomStatistics = {};
  const customNonNumericStatistics: CustomNonNumericStatistics = {};
  for (const def of s.customStats ?? []) {
    if (!def.track) continue;
    const kind = def.kind ?? "numeric";
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    if (kind === "numeric") {
      const fallback = Number(def.defaultValue);
      customStatistics[statId] = Object.fromEntries(
        activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.custom?.[statId] ?? (Number.isNaN(fallback) ? 50 : fallback)]),
      );
    } else {
      const maxLength = Math.max(20, Math.min(200, Math.round(Number(def.textMaxLength) || 120)));
      customNonNumericStatistics[statId] = Object.fromEntries(
        activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.customNonNumeric?.[statId] ?? (kind === "boolean"
          ? false
          : kind === "array"
            ? normalizeNonNumericArrayItems(def.defaultValue, maxLength)
            : kind === "date_time"
              ? normalizeDateTimeWithMode(def.defaultValue, def.dateTimeMode ?? "timestamp")
            : String(def.defaultValue ?? "").trim())]),
      );
    }
  }

  const targetToEntity = buildTargetToEntityMap(
    context,
    activeCharacters,
    activeEntityIds,
    resolveEntityTrackingMode(s),
  );
  const statistics: Statistics = {
    affection: s.trackAffection
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.affection ?? s.defaultAffection]))
      : {},
    trust: s.trackTrust
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.trust ?? s.defaultTrust]))
      : {},
    desire: s.trackDesire
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.desire ?? s.defaultDesire]))
      : {},
    connection: s.trackConnection
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.connection ?? s.defaultConnection]))
      : {},
    mood: s.trackMood
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.mood ?? s.defaultMood]))
      : {},
    lastThought: s.trackLastThought
      ? Object.fromEntries(activeCharacters.map(name => [name, baselinePerCharacter.get(name)?.lastThought ?? ""]))
      : {}
  };

  return {
    timestamp: Date.now(),
    activeCharacters,
    statistics,
    statisticsByEntityId: buildEntityScopedStatisticsBuckets(statistics, targetToEntity),
    customStatistics,
    customStatisticsByEntityId: buildEntityScopedCustomStatisticsBuckets(customStatistics, targetToEntity),
    customNonNumericStatistics,
    customNonNumericStatisticsByEntityId: buildEntityScopedCustomNonNumericStatisticsBuckets(customNonNumericStatistics, targetToEntity),
  };
}

function getSafeContext(): STContext | null {
  return getContext();
}

function resolveCurrentPersonaAvatarId(context: STContext | null): string | null {
  const contextRecord = (context as unknown as Record<string, unknown> | null);
  const fromContext = contextRecord && typeof contextRecord.user_avatar === "string"
    ? String(contextRecord.user_avatar).trim()
    : "";
  if (fromContext) return fromContext;

  const anyGlobal = globalThis as Record<string, unknown>;
  const fromGlobal = typeof anyGlobal.user_avatar === "string"
    ? String(anyGlobal.user_avatar).trim()
    : "";
  if (fromGlobal) return fromGlobal;

  const selectedContainer = document.querySelector("#user_avatar_block .avatar-container.selected") as HTMLElement | null;
  const selectedContainerAvatar = String(selectedContainer?.getAttribute("data-avatar-id") ?? "").trim();
  if (selectedContainerAvatar) return selectedContainerAvatar;

  const selectedAvatar = document.querySelector("#user_avatar_block .avatar.selected") as HTMLElement | null;
  const selectedAvatarId = String(selectedAvatar?.getAttribute("data-avatar-id") ?? "").trim();
  if (selectedAvatarId) return selectedAvatarId;

  return null;
}

function sanitizeInvalidChatEntries(context: STContext): number {
  if (!Array.isArray(context.chat) || context.chat.length === 0) return 0;
  let removed = 0;
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const message = context.chat[i] as unknown;
    if (!message || typeof message !== "object") {
      context.chat.splice(i, 1);
      removed += 1;
    }
  }
  if (removed > 0) {
    context.saveChatDebounced?.();
  }
  return removed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function isSummaryNoteMessage(message: unknown): message is Record<string, unknown> {
  const obj = asRecord(message);
  if (!obj) return false;
  const extra = asRecord(obj.extra);
  if (extra) {
    if (extra.bstSummaryNote === true || extra.bst_summary_note === true) return true;
    if (String(extra.model ?? "").trim().toLowerCase() === "bettersimtracker.summary") return true;
  }
  return false;
}

async function reloadCurrentChatViewAfterSummarySync(): Promise<void> {
  if (summaryVisibilityReloadInFlight) return;
  summaryVisibilityReloadInFlight = true;
  try {
    const loadScriptModule = Function("return import('/script.js')") as () => Promise<unknown>;
    const module = await loadScriptModule() as { reloadCurrentChat?: () => Promise<void> | void };
    if (typeof module.reloadCurrentChat === "function") {
      await module.reloadCurrentChat();
    }
  } catch {
    // ignore: best-effort UI refresh only
  } finally {
    summaryVisibilityReloadInFlight = false;
  }
}

function syncSummaryNoteVisibilityForCurrentChat(context: STContext, visibleForAi: boolean): number {
  if (!Array.isArray(context.chat) || context.chat.length === 0) return 0;
  let changedCount = 0;

  for (let i = 0; i < context.chat.length; i += 1) {
    const message = context.chat[i] as unknown as Record<string, unknown>;
    if (!isSummaryNoteMessage(message)) continue;

    let changed = false;
    const targetIsSystem = !visibleForAi;

    if (message.is_user !== false) {
      message.is_user = false;
      changed = true;
    }
    if (message.is_system !== targetIsSystem) {
      message.is_system = targetIsSystem;
      changed = true;
    }
    if (String(message.name ?? "").trim() !== "Note") {
      message.name = "Note";
      changed = true;
    }
    if (String(message.force_avatar ?? "").trim() !== "img/quill.png") {
      message.force_avatar = "img/quill.png";
      changed = true;
    }

    let extra = asRecord(message.extra);
    if (!extra) {
      extra = {};
      message.extra = extra;
      changed = true;
    }

    if (extra.bstSummaryNote !== true) {
      extra.bstSummaryNote = true;
      changed = true;
    }
    if (extra.bst_summary_note !== true) {
      extra.bst_summary_note = true;
      changed = true;
    }
    if (String(extra.model ?? "").trim() !== "bettersimtracker.summary") {
      extra.model = "bettersimtracker.summary";
      changed = true;
    }
    if (String(extra.api ?? "").trim() !== "manual") {
      extra.api = "manual";
      changed = true;
    }
    if (extra.swipeable !== false) {
      extra.swipeable = false;
      changed = true;
    }
    if (extra.isSmallSys !== false) {
      extra.isSmallSys = false;
      changed = true;
    }

    const currentType = String(extra.type ?? "").trim();
    if (targetIsSystem) {
      if (currentType !== "comment") {
        extra.type = "comment";
        changed = true;
      }
    } else if ("type" in extra) {
      delete extra.type;
      changed = true;
    }

    if ("swipes" in message) {
      delete message.swipes;
      changed = true;
    }
    if ("swipe_id" in message) {
      delete message.swipe_id;
      changed = true;
    }
    if ("swipe_info" in message) {
      delete message.swipe_info;
      changed = true;
    }

    if (changed) {
      changedCount += 1;
    }
  }

  if (changedCount > 0) {
    context.saveChatDebounced?.();
  }
  return changedCount;
}

type ManualEditPayload = {
  messageIndex: number;
  character: string;
  numeric: Record<string, number | null>;
  nonNumeric?: Record<string, string | boolean | string[] | null>;
  active?: boolean;
  mood?: string | null;
  lastThought?: string | null;
};

function normalizeEditMood(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return EDIT_MOOD_LABELS.get(key) ?? null;
}

function clampEditedNumber(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function filterStatisticsToCharacters(
  statistics: Statistics,
  allowedCharacters: string[],
): Statistics {
  const allowed = new Set(allowedCharacters.map(name => String(name ?? "").trim()).filter(Boolean));
  const filterMap = (map: Record<string, unknown> | undefined): Record<string, unknown> => {
    if (!map || typeof map !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(map)) {
      if (allowed.has(String(key ?? "").trim())) out[key] = value;
    }
    return out;
  };
  return {
    affection: filterMap(statistics.affection),
    trust: filterMap(statistics.trust),
    desire: filterMap(statistics.desire),
    connection: filterMap(statistics.connection),
    mood: filterMap(statistics.mood),
    lastThought: filterMap(statistics.lastThought),
  } as Statistics;
}

function filterCustomStatisticsToCharacters(
  customStatistics: CustomStatistics,
  allowedCharacters: string[],
  globalStatIds?: Set<string>,
): CustomStatistics {
  const allowed = new Set(allowedCharacters.map(name => String(name ?? "").trim()).filter(Boolean));
  const out: CustomStatistics = {};
  for (const [statId, byCharacter] of Object.entries(customStatistics ?? {})) {
    const filtered: Record<string, number> = {};
    const statKey = String(statId ?? "").trim().toLowerCase();
    const keepGlobal = Boolean(globalStatIds?.has(statKey));
    for (const [name, value] of Object.entries(byCharacter ?? {})) {
      const ownerKey = String(name ?? "").trim();
      if (!allowed.has(ownerKey) && !(keepGlobal && ownerKey === GLOBAL_TRACKER_KEY)) continue;
      const num = Number(value);
      if (Number.isNaN(num)) continue;
      filtered[name] = num;
    }
    if (Object.keys(filtered).length) out[statId] = filtered;
  }
  return out;
}

function filterCustomNonNumericStatisticsToCharacters(
  customStatistics: CustomNonNumericStatistics,
  allowedCharacters: string[],
  globalStatIds?: Set<string>,
): CustomNonNumericStatistics {
  const allowed = new Set(allowedCharacters.map(name => String(name ?? "").trim()).filter(Boolean));
  const out: CustomNonNumericStatistics = {};
  for (const [statId, byCharacter] of Object.entries(customStatistics ?? {})) {
    const filtered: Record<string, string | boolean | string[]> = {};
    const statKey = String(statId ?? "").trim().toLowerCase();
    const keepGlobal = Boolean(globalStatIds?.has(statKey));
    for (const [name, value] of Object.entries(byCharacter ?? {})) {
      const ownerKey = String(name ?? "").trim();
      if (!allowed.has(ownerKey) && !(keepGlobal && ownerKey === GLOBAL_TRACKER_KEY)) continue;
      if (typeof value === "boolean") {
        filtered[name] = value;
      } else if (Array.isArray(value)) {
        const items = normalizeNonNumericArrayItems(value, 200);
        // Preserve explicit empty arrays as clear sentinels.
        filtered[name] = items;
      } else {
        const text = String(value ?? "").trim();
        if (!text) continue;
        filtered[name] = text;
      }
    }
    if (Object.keys(filtered).length) out[statId] = filtered;
  }
  return out;
}

function applyManualTrackerEdits(payload: ManualEditPayload): void {
  const context = getSafeContext();
  if (!context || !settings) return;
  const messageIndex = Number(payload.messageIndex);
  if (!Number.isFinite(messageIndex) || messageIndex < 0 || messageIndex >= context.chat.length) return;
  const character = String(payload.character ?? "").trim();
  if (!character) return;

  const message = context.chat[messageIndex];
  if (!isTrackableMessage(message)) return;
  const current = getTrackerDataFromMessage(message);
  if (!current) return;
  const customStatById = new Map(
    (settings.customStats ?? []).map(def => [String(def.id ?? "").trim().toLowerCase(), def] as const),
  );

  const stats: Statistics = {
    affection: { ...current.statistics.affection },
    trust: { ...current.statistics.trust },
    desire: { ...current.statistics.desire },
    connection: { ...current.statistics.connection },
    mood: { ...current.statistics.mood },
    lastThought: { ...current.statistics.lastThought },
  };
  const custom: CustomStatistics = {};
  const customNonNumeric: CustomNonNumericStatistics = {};
  const clearedStatistics: ClearedStatistics = {};
  const clearedCustom: ClearedCustomStatistics = {};
  const clearedCustomNonNumeric: ClearedCustomNonNumericStatistics = {};
  for (const [key, values] of Object.entries(current.customStatistics ?? {})) {
    custom[key] = { ...(values ?? {}) };
  }
  for (const [key, values] of Object.entries(current.customNonNumericStatistics ?? {})) {
    customNonNumeric[key] = { ...(values ?? {}) };
  }
  for (const [key, values] of Object.entries(current.clearedStatistics ?? {})) {
    clearedStatistics[key as keyof ClearedStatistics] = { ...(values ?? {}) };
  }
  for (const [key, values] of Object.entries(current.clearedCustomStatistics ?? {})) {
    clearedCustom[key] = { ...(values ?? {}) };
  }
  for (const [key, values] of Object.entries(current.clearedCustomNonNumericStatistics ?? {})) {
    clearedCustomNonNumeric[key] = { ...(values ?? {}) };
  }

  const clearClearedBucketOwner = (bucket: Record<string, Record<string, true>>, statId: string, ownerKey: string): void => {
    if (!bucket[statId]) return;
    delete bucket[statId][ownerKey];
    if (Object.keys(bucket[statId]).length === 0) {
      delete bucket[statId];
    }
  };

  const markClearedBucketOwner = (bucket: Record<string, Record<string, true>>, statId: string, ownerKey: string): void => {
    if (!bucket[statId]) bucket[statId] = {};
    bucket[statId][ownerKey] = true;
  };

  for (const [rawKey, rawValue] of Object.entries(payload.numeric ?? {})) {
    const statKey = rawKey.trim().toLowerCase();
    if (!statKey) continue;
    if (BUILT_IN_NUMERIC_KEYS.has(statKey)) {
      const bucket = stats[statKey as "affection" | "trust" | "desire" | "connection"];
      if (rawValue == null) {
        delete bucket[character];
        markClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, statKey, character);
      } else if (Number.isFinite(rawValue)) {
        bucket[character] = clampEditedNumber(rawValue);
        clearClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, statKey, character);
      }
      continue;
    }
    const statDef = customStatById.get(statKey);
    const ownerKey = statDef?.globalScope ? GLOBAL_TRACKER_KEY : character;
    if (rawValue == null) {
      if (custom[statKey]) {
        delete custom[statKey][ownerKey];
        if (Object.keys(custom[statKey]).length === 0) {
          delete custom[statKey];
        }
      }
      markClearedBucketOwner(clearedCustom, statKey, ownerKey);
      continue;
    }
    if (!Number.isFinite(rawValue)) continue;
    if (!custom[statKey]) custom[statKey] = {};
    custom[statKey][ownerKey] = clampEditedNumber(rawValue);
    clearClearedBucketOwner(clearedCustom, statKey, ownerKey);
  }

  for (const [rawKey, rawValue] of Object.entries(payload.nonNumeric ?? {})) {
    const statKey = rawKey.trim().toLowerCase();
    if (!statKey) continue;
    const statDef = customStatById.get(statKey);
    const ownerKey = statDef?.globalScope ? GLOBAL_TRACKER_KEY : character;
    if (rawValue == null) {
      if ((statDef?.kind ?? "text_short") === "array") {
        if (!customNonNumeric[statKey]) customNonNumeric[statKey] = {};
        // Keep an explicit empty array so fallback logic does not revive stale items.
        customNonNumeric[statKey][ownerKey] = [];
        clearClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
        continue;
      }
      if (customNonNumeric[statKey]) {
        delete customNonNumeric[statKey][ownerKey];
        if (Object.keys(customNonNumeric[statKey]).length === 0) {
          delete customNonNumeric[statKey];
        }
      }
      markClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
      continue;
    }
    if (!customNonNumeric[statKey]) customNonNumeric[statKey] = {};
    if (typeof rawValue === "boolean") {
      customNonNumeric[statKey][ownerKey] = rawValue;
      clearClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
      continue;
    }
    if (Array.isArray(rawValue)) {
      customNonNumeric[statKey][ownerKey] = normalizeNonNumericArrayItems(rawValue, 200);
      clearClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
      continue;
    }
    if ((statDef?.kind ?? "text_short") === "date_time") {
      const normalized = normalizeDateTimeWithMode(rawValue, statDef?.dateTimeMode ?? "timestamp");
      if (!normalized) continue;
      customNonNumeric[statKey][ownerKey] = normalized;
      clearClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
      continue;
    }
    const text = String(rawValue).trim().replace(/\s+/g, " ");
    customNonNumeric[statKey][ownerKey] = text.slice(0, 200);
    clearClearedBucketOwner(clearedCustomNonNumeric, statKey, ownerKey);
  }

  if (payload.mood !== undefined) {
    const moodValue = normalizeEditMood(payload.mood);
    if (!moodValue) {
      delete stats.mood[character];
      markClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, "mood", character);
    } else {
      stats.mood[character] = moodValue;
      clearClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, "mood", character);
    }
  }

  if (payload.lastThought !== undefined) {
    const thought = String(payload.lastThought ?? "").trim();
    if (!thought) {
      delete stats.lastThought[character];
      markClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, "lastThought", character);
    } else {
      stats.lastThought[character] = thought.slice(0, 600);
      clearClearedBucketOwner(clearedStatistics as Record<string, Record<string, true>>, "lastThought", character);
    }
  }

  const next: TrackerData = buildEditedTrackerDataSnapshot({
    current,
    timestamp: Date.now(),
    activeCharacters: Array.isArray(current.activeCharacters) ? [...current.activeCharacters] : [],
    statistics: stats,
    customStatistics: Object.keys(custom).length ? custom : undefined,
    customNonNumericStatistics: Object.keys(customNonNumeric).length ? customNonNumeric : undefined,
    clearedStatistics: Object.keys(clearedStatistics).length ? clearedStatistics : undefined,
    clearedCustomStatistics: Object.keys(clearedCustom).length ? clearedCustom : undefined,
    clearedCustomNonNumericStatistics: Object.keys(clearedCustomNonNumeric).length ? clearedCustomNonNumeric : undefined,
  });

  if (payload.active !== undefined && character !== USER_TRACKER_KEY) {
    const updated = applyEditedTrackerActiveState(next, character, payload.active);
    next.activeCharacters = updated.activeCharacters;
    next.entityResolution = updated.entityResolution;
    setManualInactiveCharacter(context, character, !payload.active);
  }

  const entitySynced = syncEditedTrackerEntityState(next, character, {
    context,
    entityTrackingMode: resolveEntityTrackingMode(settings!),
  });
  next.statisticsByEntityId = entitySynced.statisticsByEntityId;
  next.customStatisticsByEntityId = entitySynced.customStatisticsByEntityId;
  next.customNonNumericStatisticsByEntityId = entitySynced.customNonNumericStatisticsByEntityId;

  writeTrackerDataToMessage(context, next, messageIndex, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex,
    data: next,
    settings: settings!,
    allKnownCharacters: allCharacterNames.filter(name => isTrackerEnabledForOwner(context, settings!, name)),
  });
  void persistChatNowBestEffort(context);
  pushTrace("tracker.edit", { messageIndex, character, active: payload.active ?? null });
  refreshFromStoredData({
    allowBootstrapScheduling: false,
    syncSettingsPanel: false,
  });
}

function summarizeGraphSeries(context: STContext, history: TrackerData[], target: TrackerGraphTarget): {
  snapshots: number;
  fromTs: number | null;
  toTs: number | null;
  latest: { affection: number; trust: number; desire: number; connection: number } | null;
  series: { affection: number[]; trust: number[]; desire: number[]; connection: number[] };
  customLatest: Record<string, number>;
  customSeries: Record<string, number[]>;
} {
  const allNumericDefs = settings ? getAllNumericStatDefinitions(settings) : [];
  const customNumericGlobalScopeById = new Map<string, boolean>(
    (settings?.customStats ?? [])
      .filter(def => (def.kind ?? "numeric") === "numeric")
      .map(def => [String(def.id ?? "").trim(), Boolean(def.globalScope)] as const),
  );
  const builtInKeys = new Set(["affection", "trust", "desire", "connection"]);
  const numericDefs = allNumericDefs.map(def => ({
    key: def.id,
    defaultValue: def.defaultValue,
    globalScope: def.builtIn ? false : Boolean(customNumericGlobalScopeById.get(def.id)),
  }));
  const sorted = selectGraphTimelineEntries(history, target, numericDefs);
  const build = (key: string, defaultValue = 50, globalScope = false): number[] => {
    return buildStatSeries(
      sorted,
      target,
      { key, defaultValue, globalScope },
    );
  };
  const affection = build("affection");
  const trust = build("trust");
  const desire = build("desire");
  const connection = build("connection");
  const snapshots = sorted.length;
  const customDefs = allNumericDefs.filter(def => !builtInKeys.has(def.id));
  const customSeries: Record<string, number[]> = {};
  const customLatest: Record<string, number> = {};
  for (const def of customDefs) {
    const seriesValues = build(def.id, def.defaultValue, Boolean(customNumericGlobalScopeById.get(def.id)));
    customSeries[def.id] = seriesValues;
    customLatest[def.id] = seriesValues.length ? seriesValues[seriesValues.length - 1] : Math.max(0, Math.min(100, Math.round(def.defaultValue)));
  }
  return {
    snapshots,
    fromTs: snapshots ? sorted[0].timestamp : null,
    toTs: snapshots ? sorted[snapshots - 1].timestamp : null,
    latest: snapshots
      ? {
          affection: affection[snapshots - 1],
          trust: trust[snapshots - 1],
          desire: desire[snapshots - 1],
          connection: connection[snapshots - 1],
        }
      : null,
    series: { affection, trust, desire, connection },
    customLatest,
    customSeries,
  };
}

async function sendTrackerSummaryToChat(messageIndex: number): Promise<void> {
  const context = getSafeContext();
  if (!context || !settings) return;
  if (!Number.isInteger(messageIndex) || messageIndex < 0 || messageIndex >= context.chat.length) return;
  if (activeSummaryRuns.has(messageIndex)) {
    pushTrace("summary.skip", { reason: "already_running", messageIndex });
    return;
  }

  const message = context.chat[messageIndex];
  const messageData = getTrackerDataFromMessage(message);
  const data = messageData ?? (latestDataMessageIndex === messageIndex ? latestData : null);
  if (!data) {
    pushTrace("summary.skip", { reason: "no_tracker_data", messageIndex });
    return;
  }
  pushTrace("summary.start", { messageIndex });
  activeSummaryRuns.add(messageIndex);
  queueRender();
  try {
    let summaryBody = "";
    let aiProfileId: string | null = null;
    let usedFallback = false;

    try {
      const generated = await generateTrackerSummaryProse({
        context,
        settings,
        data,
        messageIndex,
      });
      summaryBody = generated.text;
      aiProfileId = generated.profileId;
    } catch (error) {
      usedFallback = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushTrace("summary.ai.error", {
        messageIndex,
        error: errorMessage,
      });
      summaryBody = buildFallbackSummaryProse(context, data, settings);
    }

    const normalizedBody = normalizeSummaryProse(summaryBody) || "The current relationship state remains steady with no major shifts to report.";
    const summaryText = wrapAsSystemNarrativeText(normalizedBody);
    const delivery = await sendSummaryAsSystemMessage(context, summaryText, settings.summarizationNoteVisibleForAI);
    await persistChatNow(context);
    pushTrace("summary.sent", {
      messageIndex,
      activeCharacters: data.activeCharacters.length,
      charCount: collectSummaryCharacters(context, data).length,
      textChars: summaryText.length,
      delivery,
      aiProfileId,
      usedFallback,
    });
  } finally {
    activeSummaryRuns.delete(messageIndex);
    queueRender();
  }
}

async function runExtraction(reason: string, targetMessageIndex?: number): Promise<void> {
  const context = getSafeContext();
  if (!context) return;
  const targetMessage =
    typeof targetMessageIndex === "number" && targetMessageIndex >= 0 && targetMessageIndex < context.chat.length
      ? context.chat[targetMessageIndex]
      : null;
  const userExtraction = isUserExtractionReason(reason) || Boolean(targetMessage?.is_user);
  const clearGeneratingUiIfStale = (skipReason: string): void => {
    if (trackerUiState.phase !== "generating") return;
    if (chatGenerationInFlight) return;
    pushTrace("ui.generating.clear", {
      reason: skipReason,
      trigger: reason,
      messageIndex: latestDataMessageIndex,
    });
    setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
    queueRender();
  };
  if (!settings?.enabled) return;
  const activeSettings = settings;
  if (!activeSettings.autoGenerateTracker && !isManualExtractionReason(reason)) {
    pushTrace("extract.skip", { reason: "auto_generate_disabled", trigger: reason });
    clearGeneratingUiIfStale("auto_generate_disabled");
    return;
  }
  if (context.chat.length === 0) return;
  if (isExtracting) {
    pushTrace("extract.skip", { reason: "already_extracting", trigger: reason });
    clearGeneratingUiIfStale("already_extracting");
    return;
  }

  if (userExtraction && !hasUserTrackingEnabledForExtraction(activeSettings)) {
    pushTrace("extract.skip", { reason: "user_tracking_disabled", trigger: reason });
    return;
  }

  let lastIndex: number | null = null;
  if (typeof targetMessageIndex === "number" && targetMessageIndex >= 0 && targetMessageIndex < context.chat.length) {
    const target = context.chat[targetMessageIndex];
    if ((userExtraction && isTrackableUserMessage(target)) || (!userExtraction && isTrackableAiMessage(target))) {
      lastIndex = targetMessageIndex;
    } else if (userExtraction) {
      const skipReason = "target_user_message_not_trackable";
      pushTrace("extract.skip", { reason: skipReason, trigger: reason, messageIndex: targetMessageIndex });
      clearGeneratingUiIfStale(skipReason);
      return;
    }
  }
  if (lastIndex == null) {
    lastIndex = userExtraction ? getLastMessageIndexIfUser(context) : getLastMessageIndexIfAi(context);
  }
  if (lastIndex == null) {
    const skipReason = userExtraction ? "no_user_message" : "no_ai_message";
    pushTrace("extract.skip", { reason: skipReason, trigger: reason });
    clearGeneratingUiIfStale(skipReason);
    return;
  }
  const lastMessage = context.chat[lastIndex];
  const existingTrackerData = getTrackerDataFromMessage(lastMessage);
  const hadTrackerAtStart = Boolean(existingTrackerData);
  clearTrackerRecovery(lastIndex);
  const isManualRefreshReason = reason === "manual_refresh" || reason === "manual_refresh_retry";
  const isBootstrapContinueReason = reason === BOOTSTRAP_CONTINUE_REASON;
  const forceRetrack =
    isManualRefreshReason ||
    isBootstrapContinueReason ||
      reason === "SWIPE_GENERATION_ENDED" ||
      reason === "USER_MESSAGE_RENDERED" ||
      reason === "USER_MESSAGE_EDITED" ||
      (reason === "MESSAGE_EDITED" && typeof targetMessageIndex === "number");
  if (!forceRetrack && existingTrackerData) {
    pushTrace("extract.skip", { reason: "tracker_already_present", trigger: reason, messageIndex: lastIndex });
    clearGeneratingUiIfStale("tracker_already_present");
    return;
  }

  isExtracting = true;
  const runId = ++runSequence;
  let retryScheduled = false;
  let extractionSucceeded = false;
  activeExtractionRunId = runId;
  cancelledExtractionRuns.delete(runId);
  pushTrace("extract.start", {
    runId,
    reason,
    targetMessageIndex: targetMessageIndex ?? null,
    resolvedMessageIndex: lastIndex
  });
  setTrackerUi(context, {
    phase: "extracting",
    done: 0,
    total: 0,
    messageIndex: lastIndex,
    stepLabel: buildProgressResolveActive(
      resolveEntityTrackingMode(activeSettings),
    ),
  });
  queueRender();

  try {
    const activity = resolveActiveCharacterAnalysis(context, activeSettings, {
      targetMessageIndex: lastIndex,
    });
    lastActivityAnalysis = activity;
    allCharacterNames = getAllTrackedCharacterNames(context, activeSettings).filter(name =>
      isTrackerEnabledForOwner(context, activeSettings, name),
    );
    if (activeSettings.enableUserTracking && !allCharacterNames.includes(USER_TRACKER_KEY)) {
      if (isTrackerEnabledForOwner(context, activeSettings, USER_TRACKER_KEY)) {
        allCharacterNames = [...allCharacterNames, USER_TRACKER_KEY];
      }
    }
    const previousMessage = !userExtraction && lastIndex > 0
      ? context.chat[lastIndex - 1]
      : null;
    const previousMessageTrackerData = previousMessage
      ? getTrackerDataFromMessage(previousMessage)
      : null;
    let resolvedOwnerScopes:
      | {
          sceneActiveCharacters: string[];
          requestCharacters: string[];
          source: "model" | "fallback";
        }
      | null = null;
    let resolvedEntityResolution: NonNullable<TrackerData["entityResolution"]> | null = null;
    if (resolveEntityTrackingMode(activeSettings) !== "standard" && lastMessage && !lastMessage.is_system) {
      const candidateOwners = resolveEntityResolverCandidateOwners(
        context,
        allCharacterNames.filter(name => name !== USER_TRACKER_KEY),
        lastMessage,
        activeSettings,
        { previousTrackerData: previousMessageTrackerData },
      );
      if (candidateOwners.length) {
        try {
          const candidateEntities = candidateOwners.map((ownerName, index) => {
            const registryEntry = getEntityRegistryEntryForMessage(context, ownerName, lastIndex)
              ?? getEntityRegistryEntryByOwnerName(context, ownerName);
            return {
              entityRef: `ent${index + 1}`,
              ownerName,
              kind: registryEntry?.kind === "narrative-entity"
                ? "narrative-entity" as const
                : "st-character" as const,
              entityId: registryEntry?.id
                || resolveStableEntityIdForOwner(context, ownerName, resolveEntityTrackingMode(activeSettings))
                || null,
              aliases: (() => {
                const aliases = Array.from(new Set(
                  [ownerName, ...(registryEntry?.aliases ?? [])]
                    .map(value => String(value ?? "").trim())
                    .filter(Boolean),
                ));
                return aliases;
              })(),
              lifecycle: registryEntry
                ? {
                    state: registryEntry.lifecycleState,
                    lastSeenMessageIndex: registryEntry.lastSeenMessageIndex,
                    lastActiveMessageIndex: registryEntry.lastActiveMessageIndex,
                  }
                : undefined,
            };
          });
          const recentTrackerHistory = selectResolverContinuityHistoryEntries(
            getRecentTrackerHistoryEntries(context, Math.max(8, lastIndex + 4)),
            lastIndex,
            4,
          );
          const resolverContextText = buildResolverContextUpToMessageIndex(context, lastIndex);
          const resolverPrompt = buildMultiCharacterResolverPrompt({
            candidateEntities,
            contextText: resolverContextText,
            message: lastMessage,
            previousMessage,
            allowNarrativeEntityCreation: activeSettings.entityTrackingMode === "dynamic_characters",
            continuitySnapshot: buildEntityResolverContinuitySnapshot({
              previousTrackerData: previousMessageTrackerData,
              recentTrackerHistory,
            }),
          });
          const resolverResponse = await generateJson(resolverPrompt, activeSettings);
          const parsedResolver = parseMultiCharacterResolverResponse(resolverResponse.text, candidateEntities);
          const materializedResolution = parsedResolver
            ? materializeNarrativeEntityCreations({
                context,
                settings: activeSettings,
                candidateEntities,
                resolvedEntities: parsedResolver.resolvedEntities,
                createdEntities: parsedResolver.createdEntities,
                unresolvedMentions: parsedResolver.unresolvedMentions,
              })
            : null;
          const finalResolvedEntities = materializedResolution?.resolvedEntities ?? (parsedResolver?.resolvedEntities ?? []);
          const parsedSceneOwners = parsedResolver
            ? resolveSceneOwnersFromResolvedEntities(finalResolvedEntities)
            : [];
          const parsedMessageOwners = parsedResolver
            ? resolveMessageOwnersFromResolvedEntities(finalResolvedEntities)
            : [];
          const parsedSceneEntityIds = parsedResolver
            ? resolveSceneEntityIdsFromResolvedEntities(finalResolvedEntities)
            : [];
          const parsedMessageEntityIds = parsedResolver
            ? resolveMessageEntityIdsFromResolvedEntities(finalResolvedEntities)
            : [];
          if (parsedResolver) {
            const modelOwnerScopes = resolveModelExtractionOwnerScopes({
              context,
              message: lastMessage,
              settings: activeSettings,
              previousTrackerData: previousMessageTrackerData,
              recentTrackerHistory,
              resolvedSceneActiveCharacters: parsedSceneOwners,
              resolvedRequestCharacters: parsedMessageOwners.length
                ? parsedMessageOwners
                : parsedSceneOwners,
            });
            resolvedOwnerScopes = {
              sceneActiveCharacters: modelOwnerScopes.sceneActiveCharacters,
              requestCharacters: modelOwnerScopes.requestCharacters,
              source: "model",
            };
            const nextResolvedEntityResolution: NonNullable<TrackerData["entityResolution"]> = {
              resolvedEntities: finalResolvedEntities.map(entity => ({
                ...entity,
                aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
                created: Boolean(entity.created),
              })),
              source: "model",
            };
            if (materializedResolution?.unresolvedMentions.length) {
              nextResolvedEntityResolution.unresolvedMentions = [...materializedResolution.unresolvedMentions];
            }
            resolvedEntityResolution = nextResolvedEntityResolution;
            pushTrace("entity.resolve", {
              source: "model",
              sceneActiveCharacters: resolvedOwnerScopes.sceneActiveCharacters,
              requestCharacters: resolvedOwnerScopes.requestCharacters,
              sceneEntityIds: parsedSceneEntityIds,
              messageEntityIds: parsedMessageEntityIds.length
                ? parsedMessageEntityIds
                : parsedSceneEntityIds,
              createdEntities: finalResolvedEntities.filter(entity => entity.kind === "narrative-entity" && entity.created).map(entity => entity.name),
            });
          }
        } catch (error) {
          pushTrace("entity.resolve", {
            source: "model_error",
            error: error instanceof Error ? error.message : String(error ?? "unknown"),
          });
        }
      }
    }
    const fallbackInitialActiveCharacters = resolveInitialExtractionOwners({
          context,
          userExtraction,
          forceRetrack,
          preferExistingOwnersOnRetrack: reason !== "SWIPE_GENERATION_ENDED",
          detectedActiveCharacters: activity.activeCharacters,
          existingTrackerData,
          existingActiveCharacters: existingTrackerData?.activeCharacters ?? null,
        }).filter(name =>
          isTrackerEnabledForOwner(context, activeSettings, name),
        );
    const initialActiveCharacters = !userExtraction && resolvedOwnerScopes?.sceneActiveCharacters.length
      ? resolvedOwnerScopes.sceneActiveCharacters
      : fallbackInitialActiveCharacters;
    const baseOwnerScopes = userExtraction
      ? resolveUserExtractionOwnerScopes({
          context,
          detectedActiveCharacters: activity.activeCharacters,
          message: lastMessage,
          settings: activeSettings,
          resolvedSceneActiveCharacters: resolvedOwnerScopes?.sceneActiveCharacters ?? null,
          previousTrackerData: previousMessageTrackerData,
        })
      : (resolvedOwnerScopes ?? {
          ...resolveExtractionOwnerScopes(context, initialActiveCharacters, lastMessage, activeSettings),
          source: "fallback" as const,
        });
    const constrainedResolvedOwnerScopes = resolvedOwnerScopes
      ? constrainResolvedOwnerScopesToPreviousUserScene({
          userExtraction,
          settings: activeSettings,
          previousMessage,
          previousTrackerData: previousMessageTrackerData,
          resolvedSceneActiveCharacters: resolvedOwnerScopes.sceneActiveCharacters,
          resolvedRequestCharacters: resolvedOwnerScopes.requestCharacters,
        })
      : null;
    if (constrainedResolvedOwnerScopes && resolvedOwnerScopes && resolvedEntityResolution) {
      resolvedOwnerScopes = {
        ...resolvedOwnerScopes,
        sceneActiveCharacters: constrainedResolvedOwnerScopes.sceneActiveCharacters,
        requestCharacters: constrainedResolvedOwnerScopes.requestCharacters,
      };
      const constrainedSceneEntityIds = new Set(
        resolveTrackerEntityIdsForOwners(context, constrainedResolvedOwnerScopes.sceneActiveCharacters),
      );
      const constrainedMessageEntityIds = new Set(
        resolveTrackerEntityIdsForOwners(context, constrainedResolvedOwnerScopes.requestCharacters),
      );
      resolvedEntityResolution = {
        ...resolvedEntityResolution,
        resolvedEntities: (resolvedEntityResolution.resolvedEntities ?? [])
          .map(entity => ({
            ...entity,
            inScene: constrainedSceneEntityIds.has(entity.entityId),
            inMessage: constrainedMessageEntityIds.has(entity.entityId),
            aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
          }))
          .filter(entity => entity.inScene || entity.inMessage),
      };
    }
    const constrainedFallbackOwnerScopes = !resolvedOwnerScopes
      ? constrainFallbackOwnerScopesToPreviousUserScene({
          userExtraction,
          settings: activeSettings,
          previousMessage,
          previousTrackerData: previousMessageTrackerData,
          fallbackSceneActiveCharacters: baseOwnerScopes.sceneActiveCharacters,
          fallbackRequestCharacters: baseOwnerScopes.requestCharacters,
        })
      : null;
    const ownerScopes = constrainedFallbackOwnerScopes
      ? {
          ...constrainedFallbackOwnerScopes,
          source: "fallback" as const,
        }
      : baseOwnerScopes;
    const sceneActiveCharacters = ownerScopes.sceneActiveCharacters.filter(name =>
      isTrackerEnabledForOwner(context, activeSettings, name),
    );
    const requestCharacters = ownerScopes.requestCharacters.filter(name =>
      isTrackerEnabledForOwner(context, activeSettings, name),
    );
    const sceneActiveEntityIds = resolvedEntityResolution?.resolvedEntities?.length
      ? resolveSceneEntityIdsFromResolvedEntities(resolvedEntityResolution.resolvedEntities)
      : resolveTrackerEntityIdsForOwners(context, sceneActiveCharacters);
    const requestEntityIds = resolvedEntityResolution?.resolvedEntities?.length
      ? resolveMessageEntityIdsFromResolvedEntities(resolvedEntityResolution.resolvedEntities)
      : resolveTrackerEntityIdsForOwners(context, requestCharacters);
    const activeCharacters = [...requestCharacters];
    const activeEntityIds = [...requestEntityIds];
    pushTrace("activity.resolve", {
      allCharacterNames,
      activeCharacters,
      requestCharacters,
      sceneActiveCharacters,
      activeEntityIds,
      requestEntityIds,
      sceneActiveEntityIds,
      entityResolverUsed: Boolean(resolvedOwnerScopes),
      lookback: activity.lookback,
      autoDetectActive: settings.autoDetectActive,
      reasons: activity.reasons
    });
    if (!activeCharacters.length) {
      pushTrace("extract.skip", { reason: "no_active_characters", runId });
      const priorContinuityCandidates = getRecentTrackerHistoryEntries(
        context,
        Math.max(120, lastIndex + 8),
      )
        .filter(entry => entry.messageIndex < lastIndex)
        .map(entry => ({ data: entry.data, messageIndex: entry.messageIndex }));
      const priorContinuityEntry = selectNoActiveContinuityTrackerEntry({
        context,
        entries: priorContinuityCandidates,
        userExtraction,
      }) ?? getLatestTrackerDataWithIndexBefore(context, lastIndex);
      const continuitySnapshot = buildNoActiveContinuityTrackerData({
        previousTrackerData: priorContinuityEntry?.data ?? null,
        latestSceneTrackerData: previousMessageTrackerData,
        source: resolvedEntityResolution?.source ?? priorContinuityEntry?.data?.entityResolution?.source ?? "fallback",
      });
      if (continuitySnapshot) {
        clearTrackerRecovery(lastIndex);
        latestData = continuitySnapshot;
        latestDataMessageIndex = lastIndex;
        writeTrackerDataToMessage(context, continuitySnapshot, lastIndex);
        syncEntityRegistryFromTrackerData({
          context,
          messageIndex: lastIndex,
          data: continuitySnapshot,
          settings: activeSettings,
          allKnownCharacters: allCharacterNames.filter(name => isTrackerEnabledForOwner(context, activeSettings, name)),
        });
        refreshPromptMacroData(context);
        queuePromptSync(context);
        queueRender();
        await persistChatNow(context);
      } else if (hadTrackerAtStart) {
        clearTrackerDataForMessage(context, lastIndex);
        const resolved = resolveLatestStoredTrackerData(context, lastIndex);
        latestData = resolved.data;
        latestDataMessageIndex = resolved.messageIndex;
        refreshPromptMacroData(context);
        queuePromptSync(context);
        queueRender();
        await persistChatNow(context);
      }
      if (!continuitySnapshot && !hadTrackerAtStart) {
        setTrackerRecovery(lastIndex, {
          kind: "error",
          title: "Tracker generation skipped",
          detail: "No active characters were detected for this message.",
          actionLabel: "Retry Tracker",
        });
      }
      return;
    }
    const scopedCustomStats = (activeSettings.customStats ?? []).map(stat => {
      const baseTracked = Boolean(stat.track);
      const trackCharacters = baseTracked && Boolean(stat.trackCharacters ?? stat.track);
      const trackUser = baseTracked && Boolean(stat.trackUser ?? stat.track);
      return {
        ...stat,
        trackCharacters,
        trackUser,
        track: userExtraction ? trackUser : trackCharacters,
      };
    });

    const runScopedSettings: BetterSimTrackerSettings = userExtraction
      ? {
          ...activeSettings,
          trackAffection: false,
          trackTrust: false,
          trackDesire: false,
          trackConnection: false,
          trackMood: activeSettings.userTrackMood,
          trackLastThought: activeSettings.userTrackLastThought,
          customStats: scopedCustomStats,
        }
      : {
          ...activeSettings,
          customStats: scopedCustomStats,
        };
    const userScopedBaselineSettings: BetterSimTrackerSettings = {
      ...activeSettings,
      trackAffection: false,
      trackTrust: false,
      trackDesire: false,
      trackConnection: false,
      trackMood: activeSettings.userTrackMood,
      trackLastThought: activeSettings.userTrackLastThought,
      customStats: scopedCustomStats.map(stat => ({
        ...stat,
        track: Boolean(stat.trackUser ?? stat.track),
      })),
    };

    const baselineBeforeIndex = resolveBaselineBeforeIndex({
      targetMessageIndex,
      lastIndex,
    });
    const previousEntry = userExtraction
      ? getLatestCharacterOwnedUserTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          activeCharacters,
          activeEntityIds,
          runScopedSettings,
        )
      : (getLatestCharacterOwnedTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          activeCharacters,
          activeEntityIds,
          runScopedSettings,
        ) ?? getLatestRelevantTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          activeCharacters,
          activeEntityIds,
          runScopedSettings,
        ));
    const previousGlobalEntry = userExtraction
      ? getLatestRelevantTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          activeCharacters,
          activeEntityIds,
          runScopedSettings,
        )
      : getLatestRelevantTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          activeCharacters,
          activeEntityIds,
          runScopedSettings,
        );
    let previous = previousEntry?.data ?? null;
    if (previous) {
      previous = overlayLatestGlobalCustomStats(previous, previousGlobalEntry?.data ?? null, runScopedSettings);
    }
    const latestUserScopedEntry = !userExtraction
      ? getLatestCharacterOwnedUserTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          [USER_TRACKER_KEY],
          [],
          userScopedBaselineSettings,
        )
      : null;
    lastExtractionBaselineDebugMeta = {
      reason,
      userExtraction,
      targetMessageIndex: targetMessageIndex ?? null,
      resolvedMessageIndex: lastIndex,
      baselineBeforeIndex,
      previousEntryMessageIndex: previousEntry?.messageIndex ?? null,
      previousGlobalEntryMessageIndex: previousGlobalEntry?.messageIndex ?? null,
      usedDefaultBaseline: !previousEntry?.data,
      currentMessageWasUsedAsBaseline: Boolean(previousEntry && previousEntry.messageIndex === lastIndex),
    };
    pushTrace("extract.baseline.source", lastExtractionBaselineDebugMeta);
    if (!previous) {
      previous = buildBaselineData(activeCharacters, activeEntityIds, runScopedSettings);
      pushTrace("extract.baseline", { runId, forMessageIndex: lastIndex, activeCharacters: activeCharacters.length });
    }
    if (!userExtraction && latestUserScopedEntry?.data) {
      previous = overlayLatestOwnerScopedContinuity(previous, latestUserScopedEntry.data, [USER_TRACKER_KEY]);
    }
    const hasPriorUserMessage = hasTrackableUserMessageBeforeIndex(context, lastIndex);
    const isGreetingAiBootstrap = Boolean(
      !userExtraction &&
      isTrackableAiMessage(lastMessage) &&
      !hasPriorUserMessage,
    );

    if (isGreetingAiBootstrap && !activeSettings.generateOnGreetingMessages) {
      pushTrace("extract.skip", {
        reason: "greeting_generation_disabled",
        trigger: reason,
        messageIndex: lastIndex,
      });
      clearGeneratingUiIfStale("greeting_generation_disabled");
      return;
    }

    const shouldSeedDefaultsForGreetingBootstrap = Boolean(
      !userExtraction &&
      reason === "AUTO_BOOTSTRAP_MISSING_TRACKER" &&
      isTrackableAiMessage(lastMessage) &&
      !previousEntry?.data &&
      !hasPriorUserMessage,
    );
    if (shouldSeedDefaultsForGreetingBootstrap) {
      latestData = {
        timestamp: Date.now(),
        activeCharacters,
        statistics: previous.statistics,
        statisticsByEntityId: previous.statisticsByEntityId,
        customStatistics: previous.customStatistics,
        customStatisticsByEntityId: previous.customStatisticsByEntityId,
        customNonNumericStatistics: previous.customNonNumericStatistics,
        customNonNumericStatisticsByEntityId: previous.customNonNumericStatisticsByEntityId,
      };
      latestDataMessageIndex = lastIndex;
      refreshPromptMacroData(context);
      writeTrackerDataToMessage(context, latestData, lastIndex);
      await persistChatNow(context);
      queuePromptSync(context);
      queueRender();
      pushTrace("extract.bootstrap.defaults", {
        runId,
        reason,
        savedMessageIndex: lastIndex,
        activeCharacters: activeCharacters.length,
      });
      // Keep default-first greeting behavior, then immediately run one real extraction pass
      // so first message custom stats do not stay at defaults until manual retry.
      scheduleExtraction(BOOTSTRAP_CONTINUE_REASON, lastIndex, 120);
      logDebug(activeSettings, "extraction", `Bootstrap defaults seeded (${reason})`);
      return;
    }

    const userName = context.name1 ?? "User";
    const preferredCharacterName = (() => {
      if (!userExtraction) {
        return String(lastMessage?.name ?? "").trim() || undefined;
      }
      const preferredActive = activeCharacters.find(name =>
        typeof name === "string" &&
        name.trim() &&
        name !== USER_TRACKER_KEY &&
        name !== GLOBAL_TRACKER_KEY,
      );
      if (preferredActive?.trim()) return preferredActive.trim();
      const currentCharacterName = String(context.name2 ?? "").trim();
      return currentCharacterName || undefined;
    })();
    if (activeSettings.includeLorebookInExtraction && userExtraction) {
      if (activeSettings.useInternalLorebookScanFallback) {
        await refreshLorebookEntriesFromWorldInfoScan(context, runId, reason);
      } else {
        pushTrace("lorebook.scan.skip", { runId, reason, detail: "internal_fallback_disabled" });
      }
    }
    let contextText = buildRecentContext(context, settings.contextMessages, lastIndex);
    if (activeSettings.includeCharacterCardsInPrompt) {
      const sceneEntityIdsForCardContext = resolvedEntityResolution?.resolvedEntities?.length
        ? resolveSceneEntityIdsFromResolvedEntities(resolvedEntityResolution.resolvedEntities)
        : resolveTrackerEntityIdsForOwners(context, sceneActiveCharacters);
      const preferredCharacterNameForCardContext = userExtraction ? undefined : preferredCharacterName;
      contextText = `${contextText}${getCachedCharacterCardsContext(context, {
        activeCharacters,
        activeEntityIds: sceneEntityIdsForCardContext,
        entityTrackingMode: resolveEntityTrackingMode(runScopedSettings),
        preferredCharacterName: preferredCharacterNameForCardContext,
        build: () => buildCharacterCardsContext(
          context,
          activeCharacters,
          sceneEntityIdsForCardContext,
          resolveEntityTrackingMode(runScopedSettings),
          preferredCharacterNameForCardContext,
        ),
      })}`.trim();
    }
    if (activeSettings.includeLorebookInExtraction) {
      contextText = `${contextText}${buildLorebookExtractionContext(context, activeSettings.lorebookExtractionMaxChars)}`.trim();
    }
    const previousSeededStatistics = buildSeededStatisticsForActiveCharacters(
      previous?.statistics ?? null,
      activeCharacters,
      activeEntityIds,
      runScopedSettings,
      context,
    );
    const previousSeededCustomStatistics = buildSeededCustomStatisticsForActiveCharacters(
      previous?.customStatistics ?? null,
      activeCharacters,
      activeEntityIds,
      runScopedSettings,
      context,
    );
    const previousSeededCustomNonNumericStatistics = buildSeededCustomNonNumericStatisticsForActiveCharacters(
      previous?.customNonNumericStatistics ?? null,
      activeCharacters,
      activeEntityIds,
      runScopedSettings,
      context,
    );
    const rawHistoryEntries = getRecentTrackerHistoryEntries(context, 6);
    const boundedHistoryEntries = rawHistoryEntries
      .filter(entry => entry.messageIndex < baselineBeforeIndex)
      .map(entry => ({
        ...entry,
        data: getMessageScopedTrackerData(context, entry.messageIndex, entry.data, runScopedSettings, {
          projectOwnerScopedCustomNonNumeric: false,
        }),
      }));
    const relevantHistory = boundedHistoryEntries
      .filter(entry => activeCharacters.some(name => (
        userExtraction
          ? hasTrackedValueForOwner(entry.data, name, runScopedSettings, context)
          : hasCharacterOwnedTrackedValueForCharacter(entry.data, name, runScopedSettings, context)
      )))
      .map(entry => entry.data);
    if (relevantHistory.length !== rawHistoryEntries.length) {
      pushTrace("extract.history_filter", {
        runId,
        before: rawHistoryEntries.length,
        afterIndexBound: boundedHistoryEntries.length,
        after: relevantHistory.length,
        baselineBeforeIndex,
      });
    }
    const seededHistory = seedHistoryForActiveCharacters(
      relevantHistory,
      activeCharacters,
      activeEntityIds,
      runScopedSettings,
      context,
    );

    logDebug(activeSettings, "extraction", `Extraction started (${reason})`, {
      activeCharacters,
      allCharacterNames,
      runId
    });

    const shouldForceSingleRequestAtStart =
      !userExtraction &&
      reason === "GENERATION_ENDED" &&
      !previousEntry?.data &&
      activeSettings.sequentialExtraction &&
      (activeSettings.maxConcurrentCalls ?? 1) > 1;
    const extractionSettings: BetterSimTrackerSettings = shouldForceSingleRequestAtStart
      ? { ...runScopedSettings, maxConcurrentCalls: 1 }
      : runScopedSettings;
    const hasEnabledStatsForRun =
      extractionSettings.trackAffection ||
      extractionSettings.trackTrust ||
      extractionSettings.trackDesire ||
      extractionSettings.trackConnection ||
      extractionSettings.trackMood ||
      extractionSettings.trackLastThought ||
      (extractionSettings.customStats ?? []).some(stat => Boolean(stat.track));
    if (!hasEnabledStatsForRun) {
      pushTrace("extract.skip", { reason: "no_enabled_stats", trigger: reason, runId });
      if (!hadTrackerAtStart) {
        setTrackerRecovery(lastIndex, {
          kind: "error",
          title: "Tracker generation skipped",
          detail: "No stats are enabled for this extraction scope.",
          actionLabel: "Retry Tracker",
        });
      }
      return;
    }
    if (shouldForceSingleRequestAtStart) {
      pushTrace("extract.force_single_request_start", {
        runId,
        reason,
        messageIndex: lastIndex,
        maxConcurrentCalls: activeSettings.maxConcurrentCalls
      });
    }

      const extractedResult = await extractStatisticsParallel({
      context,
      settings: extractionSettings,
      userName,
      activeCharacters,
      entityResolution: resolvedEntityResolution,
      preferredCharacterName,
      contextText,
      previousTrackerData: previousEntry?.data ?? null,
      previousStatistics: previousSeededStatistics,
      previousCustomStatistics: previousSeededCustomStatistics,
      previousCustomStatisticsRaw: previousEntry?.data?.customStatistics ?? null,
      previousCustomNonNumericStatistics: previousSeededCustomNonNumericStatistics,
      hasPriorTrackerData: Boolean(previousEntry?.data),
      history: seededHistory,
      bypassConfidenceControls: shouldBypassConfidenceControls(reason),
      isOwnerStatEnabled: (ownerName, statId) => isOwnerStatEnabled(context, runScopedSettings, ownerName, statId),
      isCancelled: () => cancelledExtractionRuns.has(runId),
      onProgress: (done, total, label) => {
        if (!isExtracting || activeExtractionRunId !== runId) {
          return;
        }
        pushTrace("extract.progress", { runId, done, total, label: label ?? null });
        setTrackerUi(context, { phase: "extracting", done, total, messageIndex: lastIndex, stepLabel: label ?? null });
        if (!rerenderExtractionLoadingInPlace(lastIndex, trackerUiState)) {
          queueRender();
        }
      }
      });
      const extracted = extractedResult.statistics;
      const extractedCustom = extractedResult.customStatistics;
      const extractedCustomNonNumeric = extractedResult.customNonNumericStatistics;
      lastDebugRecord = extractedResult.debug;
      if (lastDebugRecord?.meta) {
        const jsonShadowExpectedTrackerData = buildJsonExtractionShadowExpectedTrackerData({
          activeCharacters,
          entityResolution: resolvedEntityResolution,
          statistics: extracted,
          customStatistics: extractedCustom,
          customNonNumericStatistics: extractedCustomNonNumeric,
        });
        let jsonShadowDebug = buildJsonExtractionShadowDebug({
          context,
          reason,
          messageIndex: lastIndex,
          settings: extractionSettings,
          activeCharacters,
          entityResolution: resolvedEntityResolution,
          previousTrackerData: previousEntry?.data ?? null,
          previousStatistics: previousSeededStatistics,
          previousCustomStatistics: previousSeededCustomStatistics,
          previousCustomNonNumericStatistics: previousSeededCustomNonNumericStatistics,
          expectedTrackerData: jsonShadowExpectedTrackerData,
        });
        if (activeSettings.debug) {
          try {
            const shadowTransport = await runJsonExtractionProtocolShadowTransport({
              context,
              reason,
              messageIndex: lastIndex,
              settings: extractionSettings,
              activeCharacters,
              entityResolution: resolvedEntityResolution,
              previousTrackerData: previousEntry?.data ?? null,
              previousStatistics: previousSeededStatistics,
              previousCustomStatistics: previousSeededCustomStatistics,
              previousCustomNonNumericStatistics: previousSeededCustomNonNumericStatistics,
              expectedTrackerData: jsonShadowExpectedTrackerData,
            });
            jsonShadowDebug = buildJsonExtractionShadowDebug({
              context,
              reason,
              messageIndex: lastIndex,
              settings: extractionSettings,
              activeCharacters,
              entityResolution: resolvedEntityResolution,
              previousTrackerData: previousEntry?.data ?? null,
              previousStatistics: previousSeededStatistics,
              previousCustomStatistics: previousSeededCustomStatistics,
              previousCustomNonNumericStatistics: previousSeededCustomNonNumericStatistics,
              expectedTrackerData: jsonShadowExpectedTrackerData,
              requestTextOverride: shadowTransport.requestText,
              rawJsonResponse: shadowTransport.responseText,
              responseMeta: shadowTransport.responseMeta,
            });
          } catch (error) {
            pushTrace("json_shadow.transport_error", {
              runId,
              messageIndex: lastIndex,
              error: error instanceof Error ? error.message : String(error),
            });
            jsonShadowDebug = buildJsonExtractionShadowDebug({
              context,
              reason,
              messageIndex: lastIndex,
              settings: extractionSettings,
              activeCharacters,
              entityResolution: resolvedEntityResolution,
              previousTrackerData: previousEntry?.data ?? null,
              previousStatistics: previousSeededStatistics,
              previousCustomStatistics: previousSeededCustomStatistics,
              previousCustomNonNumericStatistics: previousSeededCustomNonNumericStatistics,
              expectedTrackerData: jsonShadowExpectedTrackerData,
              transportError: error,
            });
          }
        }
        lastDebugRecord.meta.jsonShadow = jsonShadowDebug;
        if (activeSettings.debug && jsonShadowDebug.status !== "request_built") {
          pushTrace("json_shadow.result", {
            runId,
            messageIndex: lastIndex,
            status: jsonShadowDebug.status,
            mismatchPaths: jsonShadowDebug.parityMismatchPaths ?? [],
            validationErrors: jsonShadowDebug.validationErrors?.length ?? 0,
            responseChars: jsonShadowDebug.responseText?.length ?? 0,
            profileId: jsonShadowDebug.responseMeta?.profileId ?? null,
          });
        }
      }
      if (lastDebugRecord) {
        const persistedTail = readTraceLines(context).slice(-200);
        lastDebugRecord.trace = persistedTail.length ? persistedTail : [...debugTrace];
      }
    saveDebugRecord(context, lastDebugRecord);

    if (runId !== runSequence) {
      pushTrace("extract.skip", { reason: "stale_run", runId, currentRunId: runSequence });
      return;
    }

    const mergeSettings: BetterSimTrackerSettings = {
      ...activeSettings,
      trackMood: activeSettings.trackMood || (activeSettings.enableUserTracking && activeSettings.userTrackMood),
      trackLastThought: activeSettings.trackLastThought || (activeSettings.enableUserTracking && activeSettings.userTrackLastThought),
    };
    let merged = mergeStatisticsWithFallback(extracted, previous?.statistics ?? null, mergeSettings);
    let mergedCustom = mergeCustomStatisticsWithFallback(extractedCustom, previous?.customStatistics ?? null);
    let mergedCustomNonNumeric = mergeCustomNonNumericStatisticsWithFallback(
      extractedCustomNonNumeric,
      previous?.customNonNumericStatistics ?? null,
    );
    const globalNumericStatIds = new Set(
      (activeSettings.customStats ?? [])
        .filter(def => (def.kind ?? "numeric") === "numeric" && Boolean(def.globalScope))
        .map(def => String(def.id ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    const globalNonNumericStatIds = new Set(
      (activeSettings.customStats ?? [])
        .filter(def => (def.kind ?? "numeric") !== "numeric" && Boolean(def.globalScope))
        .map(def => String(def.id ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    if (userExtraction) {
      merged = filterStatisticsToCharacters(merged, [USER_TRACKER_KEY]);
      mergedCustom = filterCustomStatisticsToCharacters(mergedCustom, [USER_TRACKER_KEY], globalNumericStatIds);
      mergedCustomNonNumeric = filterCustomNonNumericStatisticsToCharacters(mergedCustomNonNumeric, [USER_TRACKER_KEY], globalNonNumericStatIds);
    } else {
      const sceneOnlyCharacters = sceneActiveCharacters.filter(ownerName =>
        !requestCharacters.some(requestOwner => String(requestOwner).trim().toLowerCase() === String(ownerName).trim().toLowerCase()),
      );
      const requestEntityIdSet = new Set(requestEntityIds);
      const sceneOnlyEntityIds = sceneActiveEntityIds.filter(entityId => !requestEntityIdSet.has(entityId));
      if (sceneOnlyCharacters.length) {
        const latestSceneScopedEntry = getLatestCharacterOwnedTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          sceneOnlyCharacters,
          sceneOnlyEntityIds,
          runScopedSettings,
        ) ?? getLatestRelevantTrackerDataWithIndexBefore(
          context,
          baselineBeforeIndex,
          sceneOnlyCharacters,
          sceneOnlyEntityIds,
          runScopedSettings,
        );
        if (latestSceneScopedEntry?.data) {
          const continuityOverlay = overlayLatestOwnerScopedContinuity({
            timestamp: Date.now(),
            activeCharacters: sceneOnlyCharacters,
            statistics: merged,
            customStatistics: mergedCustom,
            customNonNumericStatistics: mergedCustomNonNumeric,
          } as TrackerData, latestSceneScopedEntry.data, sceneOnlyCharacters);
          merged = continuityOverlay.statistics;
          mergedCustom = continuityOverlay.customStatistics ?? {};
          mergedCustomNonNumeric = continuityOverlay.customNonNumericStatistics ?? {};
        }
      }
    }

    const persistedSceneActiveCharacters = resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters,
      requestCharacters: activeCharacters,
      userExtraction,
    }).filter(name => isTrackerEnabledForOwner(context, activeSettings, name));
    const persistedSceneActiveEntityIds = resolvePersistedSnapshotActiveEntityIds({
      sceneActiveEntityIds,
      requestEntityIds,
      userExtraction,
    });
    const persistedResolvedEntities = resolvePersistedSnapshotResolvedEntities({
      context,
      sceneActiveCharacters,
      requestCharacters: activeCharacters,
      resolvedEntities: resolvedEntityResolution?.resolvedEntities ?? [],
      userExtraction,
      entityTrackingMode: resolveEntityTrackingMode(activeSettings),
    });
    const persistedResolvedEntityOwners = resolvePersistedSnapshotEntityOwners({
      sceneActiveCharacters,
      requestCharacters: activeCharacters,
    }).filter(name => isTrackerEnabledForOwner(context, activeSettings, name));
    const filteredPersistedResolvedEntities = filterResolvedEntitiesToTrackedOwners({
      context,
      trackedOwners: persistedResolvedEntityOwners,
      resolvedEntities: persistedResolvedEntities,
    });
    const persistedExplicitTargetToEntity = userExtraction
      ? { [USER_TRACKER_KEY]: resolveStableEntityIdForOwner(context, USER_TRACKER_KEY, resolveEntityTrackingMode(activeSettings)) }
      : undefined;

    latestData = buildPersistedTrackerSnapshot({
      context,
      activeCharacters: persistedSceneActiveCharacters,
      activeEntityIds: persistedSceneActiveEntityIds,
      explicitTargetToEntity: persistedExplicitTargetToEntity,
      entityTrackingMode: resolveEntityTrackingMode(activeSettings),
      resolvedEntities: filteredPersistedResolvedEntities,
      source: resolvedEntityResolution?.source ?? ownerScopes.source,
      unresolvedMentions: resolvedEntityResolution?.unresolvedMentions,
      statistics: merged,
      customStatistics: mergedCustom,
      customNonNumericStatistics: mergedCustomNonNumeric,
      globalCustomStatisticIds: globalNumericStatIds,
      globalCustomNonNumericStatisticIds: globalNonNumericStatIds,
    });
    latestDataMessageIndex = lastIndex;
    refreshPromptMacroData(context);

    writeTrackerDataToMessage(context, latestData, lastIndex);
    syncEntityRegistryFromTrackerData({
      context,
      messageIndex: lastIndex,
      data: latestData,
      settings: activeSettings,
      allKnownCharacters: allCharacterNames.filter(name => isTrackerEnabledForOwner(context, activeSettings, name)),
    });
    clearTrackerRecovery(lastIndex);
    await persistChatNow(context);

    queuePromptSync(context);
    queueRender();
    extractionSucceeded = true;
    pushTrace("extract.finish", {
      runId,
      reason,
      savedMessageIndex: lastIndex,
      activeCharacters: activeCharacters.length
    });
    logDebug(activeSettings, "extraction", `Extraction finished (${reason})`);
  } catch (error) {
    const isAbortError = error instanceof DOMException && error.name === "AbortError";
    if (isAbortError) {
      pushTrace("extract.cancelled", { reason });
      if (!hadTrackerAtStart) {
        setTrackerRecovery(lastIndex, {
          kind: "stopped",
          title: "Tracker generation stopped",
          detail: "No tracker was saved for this message.",
          actionLabel: "Generate Tracker",
        });
      }
      return;
    }
    const message = getErrorMessage(error);
    const failurePolicy = resolveExtractionFailurePolicy({
      reason,
      message,
      hadTrackerAtStart,
      isUserExtraction: userExtraction,
    });
    if (failurePolicy.shouldRetry && failurePolicy.retryReason) {
      pushTrace("extract.retry", {
        reason,
        retryReason: failurePolicy.retryKind,
        targetMessageIndex: targetMessageIndex ?? null,
      });
      scheduleExtraction(failurePolicy.retryReason, targetMessageIndex, 180);
      retryScheduled = true;
    }
    pushTrace("extract.error", {
      reason,
      message
    });
    if (failurePolicy.shouldSetRecovery && !retryScheduled) {
      setTrackerRecovery(lastIndex, {
        kind: "error",
        title: "Tracker generation failed",
        detail: sanitizeTrackerRecoveryDetail(message),
        actionLabel: "Retry Tracker",
      });
    }
    if (failurePolicy.shouldResetUserTurnGate && !retryScheduled) {
      resetUserTurnGate("tracker_generation_failed");
    }
    console.error("[BetterSimTracker] Extraction failed:", error);
  } finally {
    cancelledExtractionRuns.delete(runId);
    if (activeExtractionRunId === runId) {
      activeExtractionRunId = null;
    }
    isExtracting = false;
    setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
    queueRender();
    if (shouldReplayUserTurnAfterExtraction({
      userExtraction,
      retryScheduled,
      userTurnGateActive,
      extractionSucceeded,
    })) {
      finalizeUserTurnGateReplay(reason);
    }
  }
}

function refreshFromStoredData(options: RefreshFromStoredDataOptions = {}): void {
  const context = getSafeContext();
  if (!context || !settings) return;
  const {
    allowBootstrapScheduling = true,
    syncDynamicCharactersPanel = true,
    syncSettingsPanel = true,
  } = options;
  const activeSettings = settings;
  readPersistedTrackerRecoveries(context);

  allCharacterNames = getAllTrackedCharacterNames(context, activeSettings).filter(name =>
    isTrackerEnabledForOwner(context, activeSettings, name),
  );
  if (activeSettings.enableUserTracking && !allCharacterNames.includes(USER_TRACKER_KEY)) {
    if (isTrackerEnabledForOwner(context, activeSettings, USER_TRACKER_KEY)) {
      allCharacterNames = [...allCharacterNames, USER_TRACKER_KEY];
    }
  }
  const lastTrackableIndex = getLastTrackableMessageIndex(context);

  if (!lastDebugRecord) {
    lastDebugRecord = loadDebugRecord(context);
    if (lastDebugRecord && settings.debug) {
      lastDebugRecord.trace = readTraceLines(context).slice(-200);
    }
  }
  const { source, data, messageIndex } = resolveLatestStoredTrackerData(context, lastTrackableIndex);
  latestData = data;
  latestDataMessageIndex = messageIndex;

  refreshPromptMacroData(context);

  if (!latestData) {
    latestDataMessageIndex = null;
  } else if (latestData && lastTrackableIndex == null) {
    scheduleRefresh(300);
  }
  if (allowBootstrapScheduling) {
    const bootstrapDecision = resolveAutoBootstrapTarget({
      enabled: settings.enabled,
      isExtracting,
      chatGenerationInFlight,
      pendingLateRenderExtraction,
      latestTrackableIndex: lastTrackableIndex,
      latestDataMessageIndex,
      highestStoredMessageIndex: resolveHighestStoredTrackerMessageIndex(context),
      generateOnGreetingMessages: settings.generateOnGreetingMessages,
      chatLength: context.chat.length,
      isTrackableAiAt: index => (
        index >= 0 &&
        index < context.chat.length &&
        isTrackableAiMessage(context.chat[index])
      ),
      hasTrackerAt: index => (
        index >= 0 &&
        index < context.chat.length &&
        Boolean(getTrackerDataFromMessage(context.chat[index]))
      ),
      hasPriorTrackableUserAt: index => hasTrackableUserMessageBeforeIndex(context, index),
    });
    if (bootstrapDecision.skippedGreetingBootstrap && lastTrackableIndex != null) {
      pushTrace("extract.bootstrap.skip", {
        reason: "greeting_generation_disabled",
        targetMessageIndex: lastTrackableIndex,
      });
    }
    bootstrapScheduler.applyDecision(bootstrapDecision);
  } else {
    pushTrace("extract.bootstrap.skip", { reason: "refresh_options_disabled" });
  }
  if (trackerUiState.phase === "idle") {
    trackerUiState = { ...trackerUiState, messageIndex: latestDataMessageIndex };
  } else if (trackerUiState.phase === "generating" && !chatGenerationInFlight && !isExtracting) {
    setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
  }
  pushTrace("refresh.resolve", {
    source,
    lastAiIndex: getLastAiMessageIndex(context),
    latestDataMessageIndex,
    hasLatestData: Boolean(latestData)
  });
  syncBstMacros({
    context,
    settings,
    allCharacterNames,
    getLatestPromptMacroData: () => latestPromptMacroData,
    getLastInjectedPrompt,
  });
  queuePromptSync(context);
  const recoveryKey = [...trackerRecoveryByMessage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([messageIndex, recovery]) => `${messageIndex}:${recovery.kind}:${recovery.title}:${recovery.detail}:${recovery.actionLabel}`)
    .join("|#|");
  const nextRefreshRenderSnapshot: RefreshRenderSnapshot = {
    settingsRef: settings as object | null,
    latestDataRef: latestData as object | null,
    latestDataMessageIndex,
    lastTrackableIndex,
    source,
    recoveryKey,
    uiPhase: trackerUiState.phase,
    uiMessageIndex: trackerUiState.messageIndex,
    allCharactersKey: allCharacterNames.join("|"),
    chatLength: context.chat.length,
    groupId: context.groupId != null ? String(context.groupId) : null,
    characterId: context.characterId != null ? String(context.characterId) : null,
  };
  if (shouldQueueRenderAfterRefresh(previousRefreshRenderSnapshot, nextRefreshRenderSnapshot)) {
    queueRender();
  } else {
    pushTrace("render.queue.skip", { reason: "refresh_signature_unchanged" });
  }
  previousRefreshRenderSnapshot = nextRefreshRenderSnapshot;
  if (syncDynamicCharactersPanel) {
    dynamicCharactersPanelController?.sync();
  }
  if (syncSettingsPanel) {
    upsertSettingsPanel({
      settings,
      onSave: patch => {
        if (!settings || !context) return;
        settings = { ...settings, ...patch };
        saveSettings(context, settings);
        refreshFromStoredData({ allowBootstrapScheduling: false });
      },
      onOpenModal: () => openSettings()
    });
  }
}

function registerEvents(context: STContext): void {
  const events = context.event_types ?? {};
  const source = context.eventSource;
  if (!source) {
    pushTrace("event.register.skip", { reason: "missing_event_source" });
    return;
  }
  const sourceRef = source as unknown as object;
  if (registeredEventSources.has(sourceRef)) {
    pushTrace("event.register.skip", { reason: "already_registered" });
    return;
  }
  registeredEventSources.add(sourceRef);

  if (events.GENERATION_STARTED) {
    source.on(events.GENERATION_STARTED, (generationType: unknown, options: unknown, isDryRun: unknown) => {
      const type = String(generationType ?? "");
      const dryRun = Boolean(isDryRun);
      const intent = buildCapturedGenerationIntent(type, options, dryRun);
      if (dryRun || type === "quiet") {
        pendingGenerationInjectionSnapshot = null;
        chatGenerationIntent = null;
        pushTrace("event.generation_started_ignored", { reason: dryRun ? "dry_run" : "quiet_generation", type, dryRun });
        return;
      }
      if (isExtracting && !userTurnGateActive) {
        pendingGenerationInjectionSnapshot = null;
        chatGenerationIntent = null;
        pushTrace("event.generation_started_ignored", { reason: "tracker_extraction_in_progress", type });
        return;
      }
      swipeGenerationActive = type === "swipe";
      chatGenerationInFlight = true;
      chatGenerationIntent = intent;
      chatGenerationSawCharacterRender = false;
      pendingLateRenderExtraction = false;
      pendingLateRenderStartLastAiIndex = null;
      lateRenderRecovery.clear();
      chatGenerationStartLastAiIndex = getLastAiMessageIndex(context);
      const baseTargetIndex = getGenerationTargetMessageIndex(context);
      const targetIndex = type === "swipe"
        ? (getLastAiMessageIndex(context) ?? baseTargetIndex)
        : baseTargetIndex;
      snapshotInjectionForGeneration(targetIndex, type);
      if (userTurnGateActive && intent) {
        userTurnGatePendingIntent = cloneCapturedGenerationIntent(intent);
        userTurnGateReplayAttempts = 0;
        pushTrace("user_gate.capture_generation", {
          type,
          dryRun,
          startLastAiIndex: chatGenerationStartLastAiIndex,
          messageIndex: userTurnGateMessageIndex,
          optionKeys: Object.keys(userTurnGatePendingIntent.options),
          targetIndex,
        });
        requestUserTurnGateStop(context, type);
        if (trackerUiState.phase !== "extracting") {
          setTrackerUi(context, { phase: "generating", done: 0, total: 0, messageIndex: targetIndex, stepLabel: "Generating AI response" });
          queueRender();
        }
        queuePromptSync(context, { force: type === "swipe" });
        return;
      }
      if (isExtracting) {
        pendingGenerationInjectionSnapshot = null;
        pushTrace("event.generation_started_ignored", { reason: "tracker_extraction_in_progress", type });
        return;
      }
      pushTrace("event.generation_started", { targetIndex, type, startLastAiIndex: chatGenerationStartLastAiIndex });
      setTrackerUi(context, { phase: "generating", done: 0, total: 0, messageIndex: targetIndex, stepLabel: "Generating AI response" });
      queueRender();
      queuePromptSync(context, { force: type === "swipe" });
    });
  }

  source.on(events.GENERATION_ENDED, () => {
    if (isExtracting) {
      if (userTurnGateActive && chatGenerationInFlight) {
        chatGenerationInFlight = false;
        chatGenerationIntent = null;
        chatGenerationSawCharacterRender = false;
        chatGenerationStartLastAiIndex = null;
        swipeGenerationActive = false;
        pendingLateRenderExtraction = false;
        pendingLateRenderStartLastAiIndex = null;
        lateRenderRecovery.clear();
        pendingGenerationInjectionSnapshot = null;
        pushTrace("event.generation_ended_user_gate", { reason: "tracker_extraction_in_progress" });
        return;
      }
      pendingGenerationInjectionSnapshot = null;
      pushTrace("event.generation_ended_ignored", { reason: "tracker_extraction_in_progress" });
      return;
    }
    if (!chatGenerationInFlight) {
      chatGenerationIntent = null;
      if (pendingLateRenderExtraction) {
        pendingLateRenderExtraction = false;
        pendingLateRenderStartLastAiIndex = null;
        lateRenderRecovery.clear();
      }
      pendingGenerationInjectionSnapshot = null;
      pushTrace("event.generation_ended_ignored", { reason: "non_chat_or_quiet_generation" });
      if (trackerUiState.phase === "generating") {
        pushTrace("ui.generating.clear", {
          reason: "generation_ended_without_inflight",
          trigger: "GENERATION_ENDED",
          messageIndex: latestDataMessageIndex,
        });
        setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
        queueRender();
      }
      return;
    }
    if (!chatGenerationSawCharacterRender) {
      chatGenerationInFlight = false;
      chatGenerationIntent = null;
      pendingGenerationInjectionSnapshot = null;
      if (userTurnGateActive) {
        pendingLateRenderExtraction = false;
        pendingLateRenderStartLastAiIndex = null;
        lateRenderRecovery.clear();
        chatGenerationStartLastAiIndex = null;
        pushTrace("event.generation_ended_ignored", { reason: "user_gate_no_ai_render" });
      } else {
        pendingLateRenderExtraction = true;
        pendingLateRenderStartLastAiIndex = chatGenerationStartLastAiIndex;
        lateRenderRecovery.begin(chatGenerationStartLastAiIndex);
        chatGenerationStartLastAiIndex = null;
        pushTrace("event.generation_ended_ignored", { reason: "no_new_ai_message_rendered" });
      }
      setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
      queueRender();
      return;
    }
    chatGenerationInFlight = false;
    chatGenerationIntent = null;
    chatGenerationStartLastAiIndex = null;
    pendingLateRenderExtraction = false;
    pendingLateRenderStartLastAiIndex = null;
    lateRenderRecovery.clear();
    bindInjectionSnapshotToLatestAiMessage(context);
    pushTrace("event.generation_ended");
    if (swipeGenerationActive) {
      swipeGenerationActive = false;
      if (pendingSwipeExtraction?.waitForGenerationEnd) {
        pendingSwipeExtraction = null;
        if (swipeExtractionTimer !== null) {
          window.clearTimeout(swipeExtractionTimer);
          swipeExtractionTimer = null;
        }
      }
      scheduleExtraction("SWIPE_GENERATION_ENDED", undefined, 2000);
      return;
    }
    swipeGenerationActive = false;
    if (pendingSwipeExtraction?.waitForGenerationEnd) {
      pendingSwipeExtraction = null;
      if (swipeExtractionTimer !== null) {
        window.clearTimeout(swipeExtractionTimer);
        swipeExtractionTimer = null;
      }
    }
    scheduleExtraction("GENERATION_ENDED", undefined, 2000);
  });

  source.on(events.CHAT_CHANGED, () => {
    chatGenerationInFlight = false;
    chatGenerationIntent = null;
    chatGenerationSawCharacterRender = false;
    chatGenerationStartLastAiIndex = null;
    swipeGenerationActive = false;
    pendingLateRenderExtraction = false;
    pendingLateRenderStartLastAiIndex = null;
    lateRenderRecovery.clear();
    pendingGenerationInjectionSnapshot = null;
    lastMessageInjectionSnapshot = null;
    bootstrapScheduler.reset();
    resetUserTurnGate("chat_changed");
    lastActivatedLorebookEntries = [];
    clearPendingSwipeExtraction();
    pushTrace("event.chat_changed");
    scheduleRefresh();
  });

  if (events.GROUP_CHAT_UPDATED) {
    source.on(events.GROUP_CHAT_UPDATED, () => {
      pushTrace("event.group_chat_updated");
      scheduleRefresh();
    });
  }

  if (events.CHARACTER_MESSAGE_RENDERED) {
    source.on(events.CHARACTER_MESSAGE_RENDERED, () => {
      pushTrace("event.character_message_rendered");
      if (chatGenerationInFlight) {
        if (swipeGenerationActive) {
          chatGenerationSawCharacterRender = true;
        }
        const currentLastAi = getLastAiMessageIndex(context);
        if (
          currentLastAi != null &&
          (chatGenerationStartLastAiIndex == null || currentLastAi > chatGenerationStartLastAiIndex)
        ) {
          chatGenerationSawCharacterRender = true;
          bindInjectionSnapshotToLatestAiMessage(context);
          pushTrace("event.character_message_rendered_marked_new_ai", {
            currentLastAi,
            startLastAiIndex: chatGenerationStartLastAiIndex
          });
        }
      }
      if (pendingSwipeExtraction && !pendingSwipeExtraction.waitForGenerationEnd) {
        const pending = pendingSwipeExtraction;
        pendingSwipeExtraction = null;
        if (swipeExtractionTimer !== null) {
          window.clearTimeout(swipeExtractionTimer);
          swipeExtractionTimer = null;
        }
        pushTrace("extract.swipe.rendered", { reason: pending.reason, targetMessageIndex: pending.messageIndex ?? null });
        scheduleExtraction(pending.reason, pending.messageIndex);
      }
      if (pendingLateRenderExtraction && !chatGenerationInFlight) {
        lateRenderRecovery.handleCharacterMessageRendered();
      }
      if (trackerUiState.phase === "generating") {
        const currentLastAi = getLastAiMessageIndex(context);
        setTrackerUi(context, { ...trackerUiState, messageIndex: currentLastAi });
      }
      scheduleRefresh(120);
    });
  }

  if (events.USER_MESSAGE_RENDERED) {
    source.on(events.USER_MESSAGE_RENDERED, (payload: unknown) => {
      const messageIndex = getEventMessageIndex(payload);
      pushTrace("event.user_message_rendered", { messageIndex: messageIndex ?? null });
      scheduleRefresh(120);
      if (settings && !settings.autoGenerateTracker) {
        resetUserTurnGate("auto_generate_disabled");
        pushTrace("extract.skip", { reason: "auto_generate_disabled", trigger: "USER_MESSAGE_RENDERED" });
        return;
      }
      if (!settings || !hasUserTrackingEnabledForExtraction(settings)) {
        resetUserTurnGate("user_tracking_disabled");
        pushTrace("extract.skip", { reason: "user_tracking_disabled", trigger: "USER_MESSAGE_RENDERED" });
        return;
      }
      if (messageIndex == null) {
        resetUserTurnGate("rendered_user_message_index_unknown");
        pushTrace("extract.skip", {
          reason: "rendered_user_message_index_unknown",
          trigger: "USER_MESSAGE_RENDERED",
          messageIndex: null,
        });
        return;
      }
      if (messageIndex < 0 || messageIndex >= context.chat.length || !isTrackableUserMessage(context.chat[messageIndex])) {
        resetUserTurnGate("rendered_user_message_not_trackable");
        pushTrace("extract.skip", {
          reason: "rendered_user_message_not_trackable",
          trigger: "USER_MESSAGE_RENDERED",
          messageIndex,
        });
        return;
      }
      startUserTurnGate(context, messageIndex);
      scheduleExtraction("USER_MESSAGE_RENDERED", messageIndex ?? undefined, 0);
    });
  }

  if (events.CHAT_LOADED) {
    source.on(events.CHAT_LOADED, () => {
      chatGenerationInFlight = false;
      chatGenerationIntent = null;
      chatGenerationSawCharacterRender = false;
      chatGenerationStartLastAiIndex = null;
      swipeGenerationActive = false;
      pendingLateRenderExtraction = false;
      pendingLateRenderStartLastAiIndex = null;
      lateRenderRecovery.clear();
      pendingGenerationInjectionSnapshot = null;
      lastMessageInjectionSnapshot = null;
      bootstrapScheduler.reset();
      resetUserTurnGate("chat_loaded");
      lastActivatedLorebookEntries = [];
      clearPendingSwipeExtraction();
      pushTrace("event.chat_loaded");
      scheduleRefresh();
    });
  }

  if (events.APP_READY) {
    source.on(events.APP_READY, () => {
      pushTrace("event.app_ready");
      scheduleRefresh();
      ensureSlashCommandsRegistered();
    });
  }

  if (events.WORLD_INFO_ACTIVATED) {
    source.on(events.WORLD_INFO_ACTIVATED, (payload: unknown) => {
      const acceptedCount = cacheLorebookActivatedEntries(context, payload);
      const activatedCount = Array.isArray(payload) ? payload.length : undefined;
      pushTrace("event.world_info_activated", {
        activatedCount: activatedCount ?? null,
        acceptedCount,
        payload: describeLorebookPayload(payload),
      });
      queuePromptSync(context);
    });
  }

  if (events.MESSAGE_DELETED) {
    source.on(events.MESSAGE_DELETED, () => {
      chatGenerationInFlight = false;
      chatGenerationIntent = null;
      chatGenerationSawCharacterRender = false;
      chatGenerationStartLastAiIndex = null;
      swipeGenerationActive = false;
      pendingLateRenderExtraction = false;
      pendingLateRenderStartLastAiIndex = null;
      lateRenderRecovery.clear();
      pendingGenerationInjectionSnapshot = null;
      resetUserTurnGate("message_deleted");
      clearPendingSwipeExtraction();
      pushTrace("event.message_deleted");
      scheduleRefresh(60);
    });
  }

  if (events.CHAT_DELETED) {
    source.on(events.CHAT_DELETED, () => {
      chatGenerationInFlight = false;
      chatGenerationIntent = null;
      chatGenerationSawCharacterRender = false;
      chatGenerationStartLastAiIndex = null;
      swipeGenerationActive = false;
      pendingLateRenderExtraction = false;
      pendingLateRenderStartLastAiIndex = null;
      lateRenderRecovery.clear();
      pendingGenerationInjectionSnapshot = null;
      lastMessageInjectionSnapshot = null;
      bootstrapScheduler.reset();
      resetUserTurnGate("chat_deleted");
      lastActivatedLorebookEntries = [];
      clearPendingSwipeExtraction();
      pushTrace("event.chat_deleted");
      scheduleRefresh(60);
    });
  }

  if (events.MESSAGE_EDITED) {
    source.on(events.MESSAGE_EDITED, (payload: unknown) => {
      const messageIndex = getEventMessageIndex(payload);
      pushTrace("event.message_edited", { messageIndex });
      scheduleRefresh();
      if (messageIndex == null || messageIndex < 0 || messageIndex >= context.chat.length) {
        pushTrace("extract.skip", {
          reason: "edited_message_index_unknown",
          trigger: "MESSAGE_EDITED",
          messageIndex: messageIndex ?? null,
        });
        return;
      }
      const editedMessage = context.chat[messageIndex];
      const editedIsAi = isTrackableAiMessage(editedMessage);
      const editedIsUser = isTrackableUserMessage(editedMessage);
      if (!editedIsAi && !editedIsUser) {
        pushTrace("extract.skip", {
          reason: "edited_message_not_trackable",
          trigger: "MESSAGE_EDITED",
          messageIndex,
        });
        return;
      }
      if (editedIsUser && settings && !hasUserTrackingEnabledForExtraction(settings)) {
        pushTrace("extract.skip", {
          reason: "user_tracking_disabled",
          trigger: "MESSAGE_EDITED",
          messageIndex,
        });
        return;
      }
      if (settings && settings.regenerateOnMessageEdit === false) {
        pushTrace("extract.skip", {
          reason: "edited_regeneration_disabled",
          trigger: "MESSAGE_EDITED",
          messageIndex,
        });
        return;
      }
      if (!getTrackerDataFromMessage(editedMessage)) {
        pushTrace("extract.skip", {
          reason: "edited_message_has_no_tracker_data",
          trigger: "MESSAGE_EDITED",
          messageIndex,
        });
        return;
      }
      scheduleExtraction(editedIsUser ? "USER_MESSAGE_EDITED" : "MESSAGE_EDITED", messageIndex);
    });
  }

  const swipeEvents = ["MESSAGE_SWIPED", "SWIPE_CHANGED", "MESSAGE_SWIPE_CHANGED", "MESSAGE_SWIPE_DELETED"];
  for (const key of swipeEvents) {
    const eventName = events[key];
    if (!eventName) continue;
    source.on(eventName, (payload: unknown) => {
      const messageIndex = getEventMessageIndex(payload);
      pushTrace("event.swipe", { event: key, messageIndex });
      clearPendingSwipeExtraction();
      if (!chatGenerationInFlight) {
        chatGenerationIntent = null;
        chatGenerationSawCharacterRender = false;
        chatGenerationStartLastAiIndex = null;
        swipeGenerationActive = false;
        pendingLateRenderExtraction = false;
        pendingLateRenderStartLastAiIndex = null;
        lateRenderRecovery.clear();
        if (trackerUiState.phase === "generating") {
          pushTrace("ui.generating.clear", {
            reason: "swipe_event_force_idle",
            trigger: key,
            messageIndex: latestDataMessageIndex,
          });
          setTrackerUi(context, { phase: "idle", done: 0, total: 0, messageIndex: latestDataMessageIndex, stepLabel: null });
          queueRender();
        }
      }
      scheduleRefresh();
      pushTrace("extract.skip", {
        reason: "swipe_event_no_auto_retrack",
        trigger: key,
        messageIndex: messageIndex ?? null,
      });
    });
  }
}

async function openSettingsAsync(): Promise<void> {
  if (!settings) return;
  const context = getSafeContext();
  const previewCharacterCandidates = context && settings
    ? buildMacroPreviewCandidates({
      context,
      settings,
      data: latestPromptMacroData,
      allCharacterNames: allCharacterNames.filter(name => name !== USER_TRACKER_KEY && name !== GLOBAL_TRACKER_KEY),
    })
    : [];
  const settingsModal = await loadSettingsModalModule();
  settingsModal.openSettingsModal({
    settings,
    profileOptions: context ? discoverConnectionProfiles(context) : [],
    previewCharacterCandidates,
    debugRecord: lastDebugRecord,
    injectedPrompt: settings.debug ? getLastInjectedPrompt() : "",
    onSave: next => {
      const activeContext = getSafeContext();
      if (!activeContext) return;
      settings = next;
      saveSettings(activeContext, settings);
      refreshFromStoredData({ allowBootstrapScheduling: false });
    },
    onRetrack: () => {
      void runExtraction("manual_refresh");
    },
    onClearCurrentChat: () => clearCurrentChat(),
    onDumpDiagnostics: () => {
      const activeContext = getSafeContext();
      if (!activeContext || !settings) return;
      const currentSettings = settings;
      const graphPreferences = getGraphPreferences();
      const settingsProvenance = getSettingsProvenance(activeContext);
      const activeProfileId = getActiveConnectionProfileId(activeContext);
      const resolvedProfileId = resolveConnectionProfileId(currentSettings, activeContext);
      const historySample = buildHistorySample(getRecentTrackerHistoryEntries(activeContext, 10));
      const filteredLastDebugRecord = filterDebugRecordForDiagnostics(
        lastDebugRecord,
        currentSettings.includeGraphInDiagnostics,
      );
      const lastMessagePromptSnapshot =
        lastMessageInjectionSnapshot &&
        Number.isInteger(lastMessageInjectionSnapshot.messageIndex) &&
        lastMessageInjectionSnapshot.messageIndex >= 0 &&
        lastMessageInjectionSnapshot.messageIndex < activeContext.chat.length
          ? lastMessageInjectionSnapshot
          : null;
      const latestDataPrompt =
        lastMessagePromptSnapshot &&
        latestDataMessageIndex != null &&
        lastMessagePromptSnapshot.messageIndex === latestDataMessageIndex
          ? lastMessagePromptSnapshot.prompt
          : null;
      const debugDetails = buildDiagnosticsDebugDetails({
        debugEnabled: currentSettings.debug,
        includeGraphInDiagnostics: currentSettings.includeGraphInDiagnostics,
        currentPrompt: getLastInjectedPrompt(),
        lastMessageSnapshot: lastMessagePromptSnapshot,
        latestDataMessagePrompt: latestDataPrompt,
        promptInjectionDebugMeta: getLastInjectedPromptDebug(),
        macroDebugMeta: getBstMacroDebugSnapshot(),
        baselineDebugMeta: lastExtractionBaselineDebugMeta,
        debugTrace,
        readPersistedTrace: () => readTraceLines(activeContext),
      });
      const report = buildDiagnosticsReport({
        context: activeContext,
        settings: currentSettings,
        extensionVersion: getReportedExtensionVersion(),
        isExtracting,
        runSequence,
        trackerUiState,
        latestDataMessageIndex,
        latestDataTimestamp: latestData?.timestamp ?? null,
        allCharacterNames,
        settingsProvenance,
        graphPreferences,
        profileDebug: {
          selectedProfile: currentSettings.connectionProfile,
          resolvedProfileId: resolvedProfileId || null,
          activeProfileId,
        },
        historySample,
        activity: lastActivityAnalysis,
        latestData,
        latestPromptMacroData,
        promptInjectionPreview: debugDetails.promptInjectionPreview,
        promptInjectionCurrentPrompt: debugDetails.promptInjectionCurrentPrompt,
        promptInjectionLastMessage: debugDetails.promptInjectionLastMessage,
        promptInjectionPreviousMessage: debugDetails.promptInjectionPreviousMessage,
        promptInjectionLatestDataMessage: debugDetails.promptInjectionLatestDataMessage,
        promptInjectionDebugMeta: debugDetails.promptInjectionDebugMeta,
        macroDebugMeta: debugDetails.macroDebugMeta,
        baselineDebugMeta: debugDetails.baselineDebugMeta,
        traceTailMemory: debugDetails.traceTailMemory,
        traceTailPersisted: debugDetails.traceTailPersisted,
        debugRecord: filteredLastDebugRecord,
      });
      console.log("[BetterSimTracker] diagnostics-dump", report);
      const serial = JSON.stringify(report, null, 2);
      void navigator.clipboard?.writeText(serial).then(
        () => console.log("[BetterSimTracker] diagnostics copied to clipboard"),
        () => console.log("[BetterSimTracker] diagnostics clipboard copy failed")
      );
    },
    onClearDiagnostics: () => {
      const activeContext = getSafeContext();
      if (!activeContext) return;
      clearDebugRecord(activeContext);
      debugTrace = [];
      lastDebugRecord = null;
      pushTrace("diagnostics.cleared");
      refreshFromStoredData({
        allowBootstrapScheduling: false,
        syncDynamicCharactersPanel: false,
        syncSettingsPanel: false,
      });
    }
  });
}

function openSettings(): void {
  void openSettingsAsync();
}

async function closeSettings(): Promise<void> {
  if (!settingsModalModulePromise) return;
  const settingsModal = await loadSettingsModalModule();
  settingsModal.closeSettingsModal();
}

function applyLorebookCharLimit(text: string, maxChars: number, maxCap = 12000): string {
  const requested = Number(maxChars);
  const limit = Number.isNaN(requested)
    ? 1200
    : Math.max(0, Math.min(maxCap, Math.round(requested)));
  const normalized = String(text ?? "").trim();
  if (!normalized) return "";
  if (limit === 0) return normalized;
  return normalized.slice(0, limit).trim();
}

function buildLorebookExtractionContext(context: STContext, maxChars: number): string {
  let lorebookText = getCachedLorebookContext(context, {
    maxChars,
    maxCap: 12000,
    build: () => readLorebookContext(context, maxChars, 12000),
  });
  if (!lorebookText && settings?.useInternalLorebookScanFallback && lastActivatedLorebookEntries.length) {
    lorebookText = applyLorebookCharLimit(lastActivatedLorebookEntries.join("\n\n"), maxChars, 12000);
  }
  if (!lorebookText) return "";
  return `\n\nLorebook context (activated; use only to disambiguate if recent messages are unclear):\n${lorebookText}`;
}

function toggle(): boolean {
  const context = getSafeContext();
  if (!context || !settings) return false;
  settings.enabled = !settings.enabled;
  saveSettings(context, settings);
  if (!settings.enabled) {
    void clearPromptInjection();
    closeGraphModal();
    removeTrackerUI();
  } else {
    queuePromptSync(context);
    refreshFromStoredData();
  }
  return settings.enabled;
}

async function refresh(input?: RefreshTargetInput): Promise<void> {
  await runExtraction("manual_refresh", normalizeRefreshTargetMessageIndex(input));
}

function exposeWindowApi(): void {
  window.BetterSimTracker = {
    openSettings,
    closeSettings,
    toggle,
    refresh
  };
}

function clearCurrentChat(): void {
  const activeContext = getSafeContext();
  if (!activeContext) return;
  clearTrackerDataForCurrentChat(activeContext);
  trackerRecoveryByMessage.clear();
  persistTrackerRecoveries(activeContext);
  clearDebugRecord(activeContext);
  debugTrace = [];
  lastActivatedLorebookEntries = [];
  latestData = null;
  latestDataMessageIndex = null;
  latestPromptMacroData = null;
  lastDebugRecord = null;
  pendingGenerationInjectionSnapshot = null;
  lastMessageInjectionSnapshot = null;
  trackerUiState = { phase: "idle", done: 0, total: 0, messageIndex: null };
  void persistChatNowBestEffort(activeContext);
  refreshFromStoredData();
}

function ensureSlashCommandsRegistered(): void {
  if (slashCommandsRegistered) return;
  slashCommandsRegistered = true;
  registerSlashCommands({
    getContext: () => getSafeContext(),
    getSettings: () => settings,
    setSettings: next => { settings = next; },
    getLatestMessageIndex: () => latestDataMessageIndex,
    isExtracting: () => isExtracting,
    runExtraction: (reason, messageIndex) => runExtraction(reason, messageIndex),
    refreshFromStoredData,
    clearCurrentChat,
    queuePromptSync,
    saveSettings: (context, next) => saveSettings(context, next),
    pushTrace
  });
}

async function init(): Promise<void> {
  const context = getSafeContext();
  if (!context) {
    console.warn("[BetterSimTracker] SillyTavern context not available.");
    return;
  }
  promptRefreshController = createPromptRefreshController({
    getSettings: () => settings,
    getLatestData: () => latestData,
    getLatestPromptMacroData: () => latestPromptMacroData,
    pushTrace,
    refreshFromStoredData,
  });
  void hydrateRuntimeManifestVersion();

  settings = loadSettings(context);
  if (settings.debug) {
    pushTrace("init", {
      groupId: context.groupId ?? null,
      characterId: context.characterId ?? null,
      chatLength: context.chat.length
    });
  }
  registerEvents(context);
  refreshFromStoredData();
  scheduleDeferredInitRefresh(500);
  scheduleDeferredInitRefresh(1500);
  scheduleDeferredInitRefresh(3000);
  scheduleDeferredInitRefresh(6000);
  initCharacterPanel({
    getContext: () => getSafeContext(),
    getSettings: () => settings,
    setSettings: next => { settings = next; },
    saveSettings: (ctx, next) => saveSettings(ctx, next),
    onSettingsUpdated: () => refreshFromStoredData({
      allowBootstrapScheduling: false,
      syncDynamicCharactersPanel: false,
      syncSettingsPanel: false,
    })
  });
  initPersonaPanel({
    getContext: () => getSafeContext(),
    getSettings: () => settings,
    setSettings: next => { settings = next; },
    saveSettings: (ctx, next) => saveSettings(ctx, next),
    onSettingsUpdated: () => refreshFromStoredData({
      allowBootstrapScheduling: false,
      syncDynamicCharactersPanel: false,
      syncSettingsPanel: false,
    }),
  });
  dynamicCharactersPanelController = initDynamicCharactersPanel({
    getContext: () => getSafeContext(),
    getSettings: () => settings,
    onStateChanged: () => refreshFromStoredData({
      allowBootstrapScheduling: false,
      syncDynamicCharactersPanel: false,
      syncSettingsPanel: false,
    }),
  });
  dynamicCharactersPanelController.sync();
  exposeWindowApi();
  ensureSlashCommandsRegistered();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
} else {
  void init();
}

