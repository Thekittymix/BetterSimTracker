import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { __testables as editModalTestables } from "../src/editStatsModal";
import { readEntityRegistry } from "../src/entityRegistry";
import { syncEntityRegistryFromTrackerData } from "../src/entityRegistrySync";
import { hasCharacterOwnedTrackedValueForSelection, overlayLatestOwnerScopedContinuity } from "../src/extractionBaselineHelpers";
import { writeTrackerDataToMessage, getTrackerDataFromMessage } from "../src/storage";
import { buildEditedTrackerDataSnapshot, applyEditedTrackerActiveState, syncEditedTrackerEntityState } from "../src/trackerEditState";
import {
  collectCharacterNamesFromTrackerData,
  filterRenderTargetsForTrackingMode,
  mergeRegistryRenderTargets,
  resolveCurrentLifecycleOwnersForTrackerData,
  selectDisplayPoolTargetsWithRegistry,
} from "../src/ui";
import type { BetterSimTrackerSettings, STContext, TrackerData, TrackerEntityRegistryEntry } from "../src/types";

function assertSameMembers(actual: string[], expected: string[]): void {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const localStorageMock = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

let contextCounter = 0;

function makeContext(): STContext {
  contextCounter += 1;
  return {
    chat: [
      {
        mes: "Candy is still in Kuba's lap while the others crowd around the bed.",
        name: "Your Family",
        is_user: false,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
    ],
    chatMetadata: {},
    characters: [
      {
        name: "Your Family",
        avatar: "your-family.png",
      },
    ],
    chatId: `manual-tracker-edit-${contextCounter}`,
    groupId: null,
    characterId: 0,
    onlineStatus: "connected",
  } as unknown as STContext;
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    entityTrackingMode: "dynamic_characters",
    showInactive: true,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    customStats: [],
  } as unknown as BetterSimTrackerSettings;
}

afterEach(() => {
  localStorageMock.clear();
});

function makeCurrentTracker(): TrackerData {
  return {
    timestamp: 1000,
    activeCharacters: ["Lisa", "Marylyn", "Serena"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          inScene: true,
          inMessage: false,
          created: true,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:marylyn",
          kind: "narrative-entity",
          name: "Marylyn",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:serena",
          kind: "narrative-entity",
          name: "Serena",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
      ],
    }),
    statistics: {
      affection: { Candy: 50, Lisa: 50, Marylyn: 50, Serena: 50 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Excited" },
      lastThought: { Candy: "Games are more fun when everyone stays together." },
    },
    statisticsByEntityId: {
      affection: { "bst_narrative:candy": 50 },
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_narrative:candy": "Excited" },
      lastThought: { "bst_narrative:candy": "Games are more fun when everyone stays together." },
    },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {
      clothes: {
        Candy: ["too-small t-shirt", "panties"],
      },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "bst_narrative:candy": ["too-small t-shirt", "panties"],
      },
    },
    entityOwnerMap: {
      Candy: {
        entityId: "bst_narrative:candy",
        ownerName: "Candy",
        canonicalName: "Candy",
        aliases: [],
        sourceKey: "narrative:bst_narrative:candy",
        kind: "narrative-entity",
      },
      Lisa: {
        entityId: "bst_narrative:lisa",
        ownerName: "Lisa",
        canonicalName: "Lisa",
        aliases: [],
        sourceKey: "narrative:bst_narrative:lisa",
        kind: "narrative-entity",
      },
      Marylyn: {
        entityId: "bst_narrative:marylyn",
        ownerName: "Marylyn",
        canonicalName: "Marylyn",
        aliases: [],
        sourceKey: "narrative:bst_narrative:marylyn",
        kind: "narrative-entity",
      },
      Serena: {
        entityId: "bst_narrative:serena",
        ownerName: "Serena",
        canonicalName: "Serena",
        aliases: [],
        sourceKey: "narrative:bst_narrative:serena",
        kind: "narrative-entity",
      },
    },
  };
}

test("manual tracker edit save keeps an in-scene narrative entity active through write, reread, and registry sync", () => {
  const context = makeContext();
  const settings = makeSettings();
  const current = makeCurrentTracker();
  const ownerKeys = editModalTestables.uniqueOwnerKeys("Candy", "Candy");

  assert.equal(editModalTestables.resolveEditIsCurrentlyActive(current, "Candy", ownerKeys), true);

  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 1001,
    activeCharacters: [...current.activeCharacters],
    statistics: structuredClone(current.statistics),
    customStatistics: structuredClone(current.customStatistics ?? {}),
    customNonNumericStatistics: structuredClone(current.customNonNumericStatistics ?? {}),
    clearedStatistics: current.clearedStatistics ? structuredClone(current.clearedStatistics) : undefined,
    clearedCustomStatistics: current.clearedCustomStatistics ? structuredClone(current.clearedCustomStatistics) : undefined,
    clearedCustomNonNumericStatistics: current.clearedCustomNonNumericStatistics
      ? structuredClone(current.clearedCustomNonNumericStatistics)
      : undefined,
  });

  assertSameMembers(edited.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);

  const withActive = applyEditedTrackerActiveState(edited, "Candy", true);
  const entitySynced = syncEditedTrackerEntityState(withActive, "Candy");

  writeTrackerDataToMessage(context, entitySynced, 0, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });

  const reread = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(reread);
  assertSameMembers(reread.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);
  assertSameMembers(resolveCurrentLifecycleOwnersForTrackerData(reread), ["Candy", "Lisa", "Marylyn", "Serena"]);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 0,
    data: reread,
    settings,
    allKnownCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
  });

  assert.equal(changed, true);
  const registry = readEntityRegistry(context);
  assert.equal(registry.ownerToEntityId.candy, "bst_narrative:candy");
  assert.equal(registry.entities["bst_narrative:candy"]?.lifecycleState, "active");
});

test("manual tracker edit save keeps inactive narrative entity continuity available through reread and later owner-scoped overlay", () => {
  const context = makeContext();
  const settings = makeSettings();
  const current = makeCurrentTracker();

  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 1001,
    activeCharacters: [...current.activeCharacters],
    statistics: {
      ...structuredClone(current.statistics),
      affection: { ...structuredClone(current.statistics.affection), Candy: 61 },
      trust: { ...structuredClone(current.statistics.trust), Candy: 62 },
      desire: { ...structuredClone(current.statistics.desire), Candy: 63 },
      connection: { ...structuredClone(current.statistics.connection), Candy: 64 },
    },
    customStatistics: structuredClone(current.customStatistics ?? {}),
    customNonNumericStatistics: {
      ...structuredClone(current.customNonNumericStatistics ?? {}),
      physicality: {
        ...(structuredClone(current.customNonNumericStatistics?.physicality ?? {}) as Record<string, string>),
        Candy: "Warm and lively",
      },
    },
    clearedStatistics: current.clearedStatistics ? structuredClone(current.clearedStatistics) : undefined,
    clearedCustomStatistics: current.clearedCustomStatistics ? structuredClone(current.clearedCustomStatistics) : undefined,
    clearedCustomNonNumericStatistics: current.clearedCustomNonNumericStatistics
      ? structuredClone(current.clearedCustomNonNumericStatistics)
      : undefined,
  });

  const withInactive = applyEditedTrackerActiveState(edited, "Candy", false);
  const entitySynced = syncEditedTrackerEntityState(withInactive, "Candy");

  writeTrackerDataToMessage(context, entitySynced, 0, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });

  const reread = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(reread);
  assertSameMembers(reread.activeCharacters, ["Lisa", "Marylyn", "Serena"]);
  assertSameMembers(resolveCurrentLifecycleOwnersForTrackerData(reread), ["Lisa", "Marylyn", "Serena"]);
  assert.equal(reread.entityOwnerMap?.Candy?.entityId, "bst_narrative:candy");
  assert.equal(reread.statistics.affection.Candy, 61);
  assert.equal(reread.statistics.trust.Candy, 62);
  assert.equal(reread.statistics.desire.Candy, 63);
  assert.equal(reread.statistics.connection.Candy, 64);
  assert.equal(reread.customNonNumericStatistics?.physicality?.Candy, "Warm and lively");
  assert.deepEqual(reread.customNonNumericStatistics?.clothes?.Candy, ["too-small t-shirt", "panties"]);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 0,
    data: reread,
    settings,
    allKnownCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
  });

  assert.equal(changed, true);
  const registry = readEntityRegistry(context);
  assert.equal(registry.ownerToEntityId.candy, "bst_narrative:candy");
  assert.equal(registry.entities["bst_narrative:candy"]?.lifecycleState, "inactive");

  const registryEntries = Object.values(registry.entities);
  const registryEntryByOwner = new Map(
    registryEntries.map(entry => [String(entry.ownerName ?? "").trim().toLowerCase(), entry] as const),
  );
  const mergedRenderTargets = mergeRegistryRenderTargets({
    targets: [
      ...collectCharacterNamesFromTrackerData(context, reread),
      ...resolveCurrentLifecycleOwnersForTrackerData(reread),
    ],
    registryEntries,
    resolveRegistryEntry: ownerName => registryEntryByOwner.get(ownerName.toLowerCase()) ?? null,
  });
  const displayPoolTargets = selectDisplayPoolTargetsWithRegistry({
    entityTrackingMode: settings.entityTrackingMode,
    includeAllTargets: settings.showInactive,
    activeCharacters: resolveCurrentLifecycleOwnersForTrackerData(reread),
    dataCharacterNames: collectCharacterNamesFromTrackerData(context, reread),
    mergedWithRegistryTargets: mergedRenderTargets,
    resolveTarget: ownerName => {
      const entry = registryEntryByOwner.get(ownerName.toLowerCase()) ?? null;
      return {
        ownerName,
        uiKey: entry?.id ?? ownerName,
        registryEntry: entry as TrackerEntityRegistryEntry | null,
      };
    },
    shouldKeepTarget: () => true,
  });
  const visibleTargets = filterRenderTargetsForTrackingMode({
    entityTrackingMode: settings.entityTrackingMode,
    targets: displayPoolTargets,
  });
  const candyTarget = visibleTargets.find(target => target.registryEntry?.id === "bst_narrative:candy");

  assert.ok(candyTarget);
  assert.equal(candyTarget.ownerName, "Candy");
  assert.equal(candyTarget.registryEntry?.lifecycleState, "inactive");

  assert.equal(
    hasCharacterOwnedTrackedValueForSelection(
      reread,
      {
        ownerNames: ["Candy"],
        entityIds: ["bst_narrative:candy"],
      },
      settings,
      context,
    ),
    true,
  );

  const continuityBase: TrackerData = {
    timestamp: 1002,
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    statistics: {
      affection: { Candy: 50 },
      trust: { Candy: 50 },
      desire: { Candy: 50 },
      connection: { Candy: 50 },
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Candy: [],
      },
      physicality: {
        Candy: "Unknown",
      },
      pose: {
        Candy: "Unknown",
      },
    },
  } as TrackerData;

  const overlay = overlayLatestOwnerScopedContinuity(continuityBase, reread, ["Candy"]);
  assert.equal(overlay.statistics.affection.Candy, 61);
  assert.equal(overlay.statistics.trust.Candy, 62);
  assert.equal(overlay.statistics.desire.Candy, 63);
  assert.equal(overlay.statistics.connection.Candy, 64);
  assert.equal(overlay.customNonNumericStatistics?.physicality?.Candy, "Warm and lively");
  assert.deepEqual(overlay.customNonNumericStatistics?.clothes?.Candy, ["too-small t-shirt", "panties"]);
});

test("manual tracker edit save keeps user owner and byEntityId buckets aligned through write and reread", () => {
  const context = makeContext();
  const current: TrackerData = {
    timestamp: 1000,
    activeCharacters: [USER_TRACKER_KEY],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Content" },
      lastThought: { [USER_TRACKER_KEY]: "Stay calm." },
    },
    statisticsByEntityId: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_owner:__bst_user__": "Neutral" },
      lastThought: { "bst_owner:__bst_user__": "Old thought." },
    },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["hoodie", "boots"] },
      pose: { [USER_TRACKER_KEY]: "Leaning forward." },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_owner:__bst_user__": ["t-shirt", "jeans"] },
      pose: { "bst_owner:__bst_user__": "Sitting back." },
    },
  };

  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 1001,
    activeCharacters: [USER_TRACKER_KEY],
    statistics: structuredClone(current.statistics),
    customStatistics: {},
    customNonNumericStatistics: structuredClone(current.customNonNumericStatistics),
  });

  const entitySynced = syncEditedTrackerEntityState(edited, USER_TRACKER_KEY, { context });
  writeTrackerDataToMessage(context, entitySynced, 0, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });

  const reread = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(reread);
  assert.equal(reread.statisticsByEntityId?.mood?.["bst_owner:__bst_user__"], "Content");
  assert.equal(reread.statisticsByEntityId?.lastThought?.["bst_owner:__bst_user__"], "Stay calm.");
  assert.deepEqual(reread.customNonNumericStatisticsByEntityId?.clothes?.["bst_owner:__bst_user__"], ["hoodie", "boots"]);
  assert.equal(reread.customNonNumericStatisticsByEntityId?.pose?.["bst_owner:__bst_user__"], "Leaning forward.");
});
