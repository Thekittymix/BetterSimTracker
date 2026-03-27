import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { EXTENSION_KEY } from "../src/constants";
import { isTrackableMessage } from "../src/messageFilter";
import { buildMergedPromptMacroData, resolveLatestStoredTrackerData } from "../src/runtimeState";
import { resolveTrackerEntityIdsForOwners, syncEntityRegistryFromRender } from "../src/entityRegistry";
import {
  clearTrackerDataForMessage,
  clearTrackerDataForCurrentChat,
  getRecentTrackerHistoryEntries,
  getTrackerDataFromMessage,
  mergeTrackerDataChronologically,
  mergeCustomNonNumericStatisticsWithFallback,
  mergeCustomStatisticsWithFallback,
  mergeStatisticsWithFallback,
  resolveNormalizedTrackerActiveCharacters,
  saveTrackerSnapshot,
  writeTrackerDataToMessage,
} from "../src/storage";
import type { STContext, TrackerData } from "../src/types";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
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
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;

function makeTracker(timestamp: number, overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    timestamp,
    activeCharacters: overrides.activeCharacters ?? ["Seraphina"],
    entityResolution: overrides.entityResolution,
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
      ...overrides.statistics,
    },
    statisticsByEntityId: overrides.statisticsByEntityId,
    customStatistics: overrides.customStatistics ?? {},
    customStatisticsByEntityId: overrides.customStatisticsByEntityId,
    customNonNumericStatistics: overrides.customNonNumericStatistics ?? {},
    customNonNumericStatisticsByEntityId: overrides.customNonNumericStatisticsByEntityId,
    clearedStatistics: overrides.clearedStatistics,
    clearedCustomStatistics: overrides.clearedCustomStatistics,
    clearedCustomNonNumericStatistics: overrides.clearedCustomNonNumericStatistics,
    entityOwnerMap: overrides.entityOwnerMap,
  };
}

function makeContext(): STContext {
  return {
    chat: [
      { mes: "Greeting", name: "Seraphina", is_user: false, is_system: false, extra: {} },
      { mes: "Hi", is_user: true, is_system: false, extra: {} },
      { mes: "Reply", name: "Seraphina", is_user: false, is_system: false, extra: {} },
    ],
    characterId: 1,
    chatMetadata: {},
  };
}

function getLocalStoreKey(chatId: string): string {
  return `${EXTENSION_KEY}:history:${chatId}|char:1`;
}

afterEach(() => {
  localStorageMock.clear();
});

test("getTrackerDataFromMessage respects swipe-specific payloads", () => {
  const tracker = makeTracker(1000);
  const message = {
    mes: "Reply",
    name: "Seraphina",
    is_user: false,
    is_system: false,
    swipe_id: 2,
    extra: {
      [EXTENSION_KEY]: {
        "2": tracker,
      },
    },
  };
  const stored = getTrackerDataFromMessage(message);
  assert.equal(stored?.timestamp, tracker.timestamp);
  assert.deepEqual(stored?.activeCharacters, tracker.activeCharacters);
  assert.deepEqual(stored?.statistics, tracker.statistics);
  assert.deepEqual(stored?.customStatistics, tracker.customStatistics);
  assert.deepEqual(stored?.customNonNumericStatistics, tracker.customNonNumericStatistics);
});

test("writeTrackerDataToMessage stores per-message tracker data and snapshot history", () => {
  const context = makeContext();
  const tracker = makeTracker(1001, {
    statistics: {
      affection: { Seraphina: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });
  writeTrackerDataToMessage(context, tracker, 2);
  const stored = getTrackerDataFromMessage(context.chat[2]);
  assert.equal(stored?.timestamp, tracker.timestamp);
  assert.deepEqual(stored?.activeCharacters, tracker.activeCharacters);
  assert.deepEqual(stored?.statistics, tracker.statistics);
  assert.deepEqual(stored?.customStatistics, tracker.customStatistics);
  assert.deepEqual(stored?.customNonNumericStatistics, tracker.customNonNumericStatistics);
  const history = getRecentTrackerHistoryEntries(context, 10);
  assert.equal(history.length, 1);
  assert.equal(history[0].messageIndex, 2);
});

test("saveTrackerSnapshot compacts localStorage history copies without shrinking runtime history resolution", () => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;
  localStorageMock.clear();
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "storage-budget-chat";

  for (let index = 0; index < 40; index += 1) {
    saveTrackerSnapshot(context, makeTracker(10_000 + index, {
      activeCharacters: ["Seraphina"],
      statistics: {
        affection: { Seraphina: 50 + (index % 5) },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: { Seraphina: `thought-${index}-${"x".repeat(200)}` },
      },
      customNonNumericStatistics: {
        pose: { Seraphina: `pose-${index}-${"y".repeat(180)}` },
      },
    }), 2);
  }

  const raw = localStorageMock.getItem(getLocalStoreKey("storage-budget-chat"));
  assert.ok(raw);
  const parsed = JSON.parse(raw!) as { history: Array<unknown> };
  assert.ok(parsed.history.length <= 24);
  assert.ok(raw!.length <= 18_000);

  const metadataStore = context.chatMetadata?.[EXTENSION_KEY] as { history?: Array<unknown> } | undefined;
  assert.equal(metadataStore?.history?.length, 40);
});

test("saveTrackerSnapshot prunes latestByScope localStorage cache to recent scopes", () => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;
  localStorageMock.clear();
  for (let index = 0; index < 20; index += 1) {
    const context = makeContext() as STContext & { chatId: string };
    context.chatId = `scope-${index}`;
    saveTrackerSnapshot(context, makeTracker(20_000 + index, {
      activeCharacters: ["Seraphina"],
      statistics: {
        affection: { Seraphina: 60 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: { Seraphina: `scope-thought-${index}-${"q".repeat(160)}` },
      },
      customNonNumericStatistics: {
        pose: { Seraphina: `scope-pose-${index}-${"w".repeat(160)}` },
      },
    }), 2);
  }

  const raw = localStorageMock.getItem(`${EXTENSION_KEY}:latestByScope`);
  assert.ok(raw);
  const parsed = JSON.parse(raw!) as Record<string, unknown>;
  const keys = Object.keys(parsed);
  assert.ok(keys.length <= 12);
  assert.ok(keys.includes("scope-19|char:1"));
  assert.ok(raw!.length <= 48_000);
});

test("writeTrackerDataToMessage enriches tracker payloads with message-scoped entityOwnerMap from registry", () => {
  const context = makeContext();
  context.characters = [
    { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
  ];
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley": {
          id: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: [],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
          introducedAtMessageIndex: 2,
          lastSeenMessageIndex: 2,
          lastActiveMessageIndex: 2,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ashley: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
      },
    },
  };

  const tracker = makeTracker(1001, {
    activeCharacters: ["Ashley"],
    statistics: {
      affection: { Ashley: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });

  writeTrackerDataToMessage(context, tracker, 2);
  const stored = getTrackerDataFromMessage(context.chat[2]);
  assert.ok(stored?.entityOwnerMap?.Ashley);
  assert.equal(stored?.entityOwnerMap?.Ashley.entityId, "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley");
  assert.equal(stored?.entityOwnerMap?.Ashley.kind, "multi_character_alias");
  assert.deepEqual(stored?.statisticsByEntityId?.affection, {
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley": 55,
  });
});

test("getTrackerDataFromMessage materializes by-entity shadow projections from entityOwnerMap", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: ["Ashley"],
    statistics: {
      affection: { Ashley: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: { Ashley: ["hoodie"] },
    },
    entityOwnerMap: {
      Ashley: {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.statisticsByEntityId?.affection, {
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley": 55,
  });
  assert.deepEqual(stored?.customNonNumericStatisticsByEntityId?.clothes, {
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley": ["hoodie"],
  });
});

test("getTrackerDataFromMessage preserves narrative-entity owner maps with derived narrative source keys", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: ["Forest Spirit"],
    customNonNumericStatistics: {
      pose: { "Forest Spirit": "watching from the trees" },
    },
    entityOwnerMap: {
      "Forest Spirit": {
        entityId: "ent-forest-spirit",
        ownerName: "Forest Spirit",
        canonicalName: "Forest Spirit",
        aliases: ["Spirit"],
        sourceKey: "",
        kind: "narrative-entity",
      },
    },
  });
  const message = {
    mes: "Reply",
    name: "Narrator",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.equal(stored?.entityOwnerMap?.["Forest Spirit"]?.kind, "narrative-entity");
  assert.equal(stored?.entityOwnerMap?.["Forest Spirit"]?.sourceKey, "narrative:ent-forest-spirit");
  assert.deepEqual(stored?.customNonNumericStatisticsByEntityId?.pose, {
    "ent-forest-spirit": "watching from the trees",
  });
});

test("getTrackerDataFromMessage preserves explicit entity resolution payload", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model",
    }),
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };
  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    source: "model",
  }));
});

test("getTrackerDataFromMessage preserves explicit empty messageEntityIds when only sceneEntityIds exist", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: [USER_TRACKER_KEY],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: [],
      source: "model",
    }),
  });
  const message = {
    mes: "User reply",
    name: "Kuba",
    is_user: true,
    is_system: false,
    swipe_id: 0,
    extra: {
      [EXTENSION_KEY]: {
        "0": tracker,
      },
    },
  };
  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    sceneOwners: ["Blake"],
    messageOwners: [],
    sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    messageEntityIds: [],
    source: "model",
  }));
});

test("getTrackerDataFromMessage preserves explicit empty messageOwners when only sceneOwners exist", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: [],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: [],
      source: "model",
    }),
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };
  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    sceneOwners: ["Blake"],
    messageOwners: [],
    sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    messageEntityIds: [],
    source: "model",
  }));
});

test("getTrackerDataFromMessage preserves explicit activeCharacters instead of widening them to resolver scene owners", () => {
  const tracker = makeTracker(1002, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 0,
    extra: {
      [EXTENSION_KEY]: {
        "0": tracker,
      },
    },
  };
  const stored = getTrackerDataFromMessage(message as any);
  assert.deepEqual(stored?.activeCharacters, ["Blake"]);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
    messageEntityIds: ["ent-blake"],
    source: "model",
  }));
});

test("getTrackerDataFromMessage accepts resolver-backed payloads without raw activeCharacters", () => {
  const tracker = {
    timestamp: 1001,
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
    statistics: {
      affection: { Blake: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.equal(stored?.timestamp, 1001);
  assert.deepEqual(stored?.entityResolution, tracker.entityResolution);
  assert.deepEqual(stored?.activeCharacters, ["Blake"]);
});

test("getTrackerDataFromMessage prefers resolver-backed activeCharacters during entity normalization", () => {
  const tracker = makeTracker(1001, {
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model",
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Garret: {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:garret",
        ownerName: "Garret",
        canonicalName: "Garret",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.activeCharacters, ["Blake"]);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
    source: "model",
  }));
});

test("getTrackerDataFromMessage can recover resolver-backed activeCharacters from technical entity ids before owner-map hydration", () => {
  const blakeEntityId = "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake";
  const tracker = makeTracker(1001, {
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      resolvedEntities: [
        {
          entityId: blakeEntityId,
          kind: "st-character",
          name: blakeEntityId,
          avatar: null,
          inScene: true,
          inMessage: true,
        },
      ],
      source: "model",
    }),
    entityOwnerMap: undefined,
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.activeCharacters, ["blake"]);
});

test("getTrackerDataFromMessage prefers resolver-backed activeCharacters before stale explicit non-user arrays", () => {
  const blakeEntityId = "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake";
  const tracker = makeTracker(1001, {
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      resolvedEntities: [
        {
          entityId: blakeEntityId,
          kind: "st-character",
          name: "Blake",
          avatar: null,
          inScene: true,
          inMessage: true,
        },
      ],
      source: "model",
    }),
    entityOwnerMap: {
      Blake: {
        entityId: blakeEntityId,
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Garret: {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:garret",
        ownerName: "Garret",
        canonicalName: "Garret",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  });
  const message = {
    mes: "Reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 1,
    extra: {
      [EXTENSION_KEY]: {
        "1": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.activeCharacters, ["Blake"]);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    resolvedEntities: [
      {
        entityId: blakeEntityId,
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    source: "model",
  }));
});

test("mergeStatisticsWithFallback and custom merges preserve previous missing values", () => {
  const mergedStats = mergeStatisticsWithFallback(
    {
      affection: { Seraphina: 60 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    {
      affection: { Seraphina: 50 },
      trust: { Seraphina: 40 },
      desire: {},
      connection: {},
      mood: { Seraphina: "Neutral" },
      lastThought: {},
    },
  );
  assert.deepEqual(mergedStats.trust, { Seraphina: 40 });
  assert.deepEqual(mergedStats.affection, { Seraphina: 60 });

  assert.deepEqual(
    mergeCustomStatisticsWithFallback(
      { satisfaction: { Seraphina: 70 } },
      { satisfaction: { User: 55 }, affinity: { Seraphina: 10 } },
    ),
    {
      satisfaction: { User: 55, Seraphina: 70 },
      affinity: { Seraphina: 10 },
    },
  );

  assert.deepEqual(
    mergeCustomNonNumericStatisticsWithFallback(
      { clothes: { Seraphina: ["Hat"] } },
      { clothes: { User: ["Boots"] }, pose: { Seraphina: "Standing" } },
    ),
    {
      clothes: { User: ["Boots"], Seraphina: ["Hat"] },
      pose: { Seraphina: "Standing" },
    },
  );

  assert.deepEqual(
    mergeCustomNonNumericStatisticsWithFallback(
      { clothes: { Seraphina: [] } },
      { clothes: { Seraphina: ["Hat"] } },
    ),
    {
      clothes: { Seraphina: [] },
    },
  );
});

test("getTrackerDataFromMessage preserves explicit empty array values", () => {
  const message = {
    mes: "Reply",
    name: "Seraphina",
    is_user: false,
    is_system: false,
    extra: {
      [EXTENSION_KEY]: makeTracker(1234, {
        customNonNumericStatistics: {
          clothes: { Seraphina: [] },
        },
      }),
    },
  };
  const data = getTrackerDataFromMessage(message);
  assert.ok(data);
  assert.deepEqual(data?.customNonNumericStatistics?.clothes, { Seraphina: [] });
});

test("buildMergedPromptMacroData merges tracker history into one richer snapshot", () => {
  const context = makeContext();
  const first = makeTracker(1000, {
    statistics: {
      affection: { Seraphina: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: { Seraphina: ["Hat"] },
    },
  });
  const second = makeTracker(2000, {
    statistics: {
      affection: {},
      trust: { Seraphina: 44 },
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
    customNonNumericStatistics: {
      pose: { Seraphina: "Standing" },
    },
  });

  saveTrackerSnapshot(context, first, 0);
  saveTrackerSnapshot(context, second, 2);

  const merged = buildMergedPromptMacroData(context, second);
  assert.ok(merged);
  assert.deepEqual(merged?.statistics.affection, { Seraphina: 55 });
  assert.deepEqual(merged?.statistics.trust, { Seraphina: 44 });
  assert.deepEqual(merged?.statistics.mood, { Seraphina: "Hopeful" });
  assert.deepEqual(merged?.customNonNumericStatistics?.clothes, { Seraphina: ["Hat"] });
  assert.deepEqual(merged?.customNonNumericStatistics?.pose, { Seraphina: "Standing" });
});

test("buildMergedPromptMacroData prefers the latest owner array value over older history", () => {
  const context = makeContext();
  const olderUser = makeTracker(1000, {
    activeCharacters: [USER_TRACKER_KEY],
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
    },
  });
  const newerUser = makeTracker(2000, {
    activeCharacters: [USER_TRACKER_KEY],
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["jeans"] },
    },
  });

  saveTrackerSnapshot(context, olderUser, 1);
  saveTrackerSnapshot(context, newerUser, 3);

  const merged = buildMergedPromptMacroData(context, newerUser);
  assert.ok(merged);
  assert.deepEqual(merged?.customNonNumericStatistics?.clothes, { [USER_TRACKER_KEY]: ["jeans"] });
});

test("resolveNormalizedTrackerActiveCharacters prefers resolver owners over explicit non-user active owners", () => {
  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      { activeCharacters: [USER_TRACKER_KEY] } as TrackerData,
      ["Blake"],
    ),
    [USER_TRACKER_KEY],
  );

  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      { activeCharacters: ["Garret", "Raleigh"] } as TrackerData,
      ["Blake"],
      ["Ashley"],
    ),
    ["Ashley"],
  );

  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      { activeCharacters: ["Garret", "Raleigh"] } as TrackerData,
      ["Blake"],
    ),
    ["Blake"],
  );

  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      { activeCharacters: [] } as unknown as TrackerData,
      ["Blake"],
    ),
    ["Blake"],
  );

  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      {} as TrackerData,
      ["Blake"],
      ["Ashley"],
    ),
    ["Ashley"],
  );

  assert.deepEqual(
    resolveNormalizedTrackerActiveCharacters(
      {} as TrackerData,
      ["Blake"],
    ),
    ["Blake"],
  );
});

test("buildMergedPromptMacroData falls back to resolver message owners before scene owners when activeCharacters are missing", () => {
  const context = makeContext();
  const entry = {
    timestamp: 2000,
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    statistics: {
      affection: { Blake: 49 },
      trust: { Blake: 49 },
      desire: { Blake: 48 },
      connection: { Blake: 49 },
      mood: { Blake: "Serious" },
      lastThought: { Blake: "Focused." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      pose: { Blake: "Standing a few feet away." },
    },
  } as unknown as TrackerData;

  saveTrackerSnapshot(context, entry, 2);

  const merged = buildMergedPromptMacroData(context, entry);
  assert.ok(merged);
  assert.deepEqual(merged?.activeCharacters, ["Blake"]);
  assert.deepEqual(
    merged?.entityResolution?.resolvedEntities?.filter(entity => entity.inScene).map(entity => entity.name),
    ["Ashley", "Blake", "Garret", "Raleigh"],
  );
  assert.deepEqual(
    merged?.entityResolution?.resolvedEntities?.filter(entity => entity.inMessage).map(entity => entity.name),
    ["Blake"],
  );
});

test("buildMergedPromptMacroData keeps user-only activeCharacters even when resolver scene owners point at a character", () => {
  const context = makeContext();
  const preferred: TrackerData = {
    timestamp: 2000,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt"] },
    },
  };

  saveTrackerSnapshot(context, preferred, 1);
  const merged = buildMergedPromptMacroData(context, preferred);
  assert.ok(merged);
  assert.deepEqual(merged.activeCharacters, [USER_TRACKER_KEY]);
  assert.deepEqual(merged.entityResolution, preferred.entityResolution);
});

test("writeTrackerDataToMessage preserves user-only activeCharacters when entity buckets are normalized", () => {
  const context = makeContext();
  context.chat.push({ mes: "User turn", is_user: true, is_system: false, extra: {} } as any);

  const data: TrackerData = {
    timestamp: 2000,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Neutral" },
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Blake"],
        sourceKey: "camp-source",
        kind: "multi_character_alias",
      },
    },
  };

  writeTrackerDataToMessage(context, data, 1);
  const stored = getTrackerDataFromMessage(context.chat[1]);
  assert.ok(stored);
  assert.deepEqual(stored?.activeCharacters, [USER_TRACKER_KEY]);
  assert.deepEqual(stored?.entityResolution, data.entityResolution);
});

test("buildMergedPromptMacroData prefers a newer manual edit on an older message over a stale later snapshot", () => {
  const context = makeContext();
  context.chat.push(
    { mes: "User edited later", is_user: true, is_system: false, extra: {} },
    { mes: "AI snapshot became stale", name: "Seraphina", is_user: false, is_system: false, extra: {} },
  );
  const editedUserSnapshot = makeTracker(3000, {
    activeCharacters: [USER_TRACKER_KEY],
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["jeans"] },
      pose: { [USER_TRACKER_KEY]: "Standing in place" },
    },
  });
  const staleLaterAiSnapshot = makeTracker(2000, {
    activeCharacters: ["Seraphina"],
    statistics: {
      affection: { Seraphina: 4 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Playful" },
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: {
        [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
        Seraphina: ["black sundress"],
      },
    },
  });

  saveTrackerSnapshot(context, editedUserSnapshot, 3);
  saveTrackerSnapshot(context, staleLaterAiSnapshot, 4);

  const merged = buildMergedPromptMacroData(context, staleLaterAiSnapshot);
  assert.ok(merged);
  assert.deepEqual(merged?.customNonNumericStatistics?.clothes, {
    [USER_TRACKER_KEY]: ["jeans"],
    Seraphina: ["black sundress"],
  });
});

test("buildMergedPromptMacroData preserves a newer explicit nude user clothes edit over a later stale AI snapshot", () => {
  const context = makeContext();
  context.chat.push(
    { mes: "User manual edit", is_user: true, is_system: false, extra: {} },
    { mes: "AI response with stale user state", name: "Seraphina", is_user: false, is_system: false, extra: {} },
  );
  const editedUserSnapshot = makeTracker(4000, {
    activeCharacters: [USER_TRACKER_KEY],
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["nude"] },
    },
  });
  const staleLaterAiSnapshot = makeTracker(3000, {
    activeCharacters: ["Seraphina"],
    customNonNumericStatistics: {
      clothes: {
        [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
        Seraphina: ["black sundress"],
      },
    },
  });

  saveTrackerSnapshot(context, editedUserSnapshot, 3);
  saveTrackerSnapshot(context, staleLaterAiSnapshot, 4);

  const merged = buildMergedPromptMacroData(context, staleLaterAiSnapshot);
  assert.ok(merged);
  assert.deepEqual(merged?.customNonNumericStatistics?.clothes, {
    [USER_TRACKER_KEY]: ["nude"],
    Seraphina: ["black sundress"],
  });
});

test("buildMergedPromptMacroData preserves explicit clears over older history", () => {
  const context = makeContext();
  const older = makeTracker(1000, {
    activeCharacters: ["Seraphina"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Playful" },
      lastThought: { Seraphina: "Older thought" },
    },
    customNonNumericStatistics: {
      physicality: { Seraphina: "Flawless pale skin" },
    },
  });
  const cleared = makeTracker(2000, {
    activeCharacters: ["Seraphina"],
    clearedStatistics: {
      mood: { Seraphina: true },
      lastThought: { Seraphina: true },
    },
    clearedCustomNonNumericStatistics: {
      physicality: { Seraphina: true },
    },
  });
  saveTrackerSnapshot(context, older, 1);
  saveTrackerSnapshot(context, cleared, 2);
  const merged = buildMergedPromptMacroData(context, cleared);
  assert.ok(merged);
  assert.equal(merged?.statistics.mood?.Seraphina, undefined);
  assert.equal(merged?.statistics.lastThought?.Seraphina, undefined);
  assert.equal(merged?.customNonNumericStatistics?.physicality?.Seraphina, undefined);
  assert.equal(merged?.clearedCustomNonNumericStatistics?.physicality?.Seraphina, true);
});

test("mergeTrackerDataChronologically preserves newer character manual edit over stale later snapshot", () => {
  const editedCharacter = makeTracker(3000, {
    activeCharacters: ["Seraphina"],
    customNonNumericStatistics: {
      physicality: { Seraphina: "Edited physicality" },
    },
  });
  const staleLaterUserSnapshot = makeTracker(2000, {
    activeCharacters: [USER_TRACKER_KEY],
    customNonNumericStatistics: {
      physicality: { Seraphina: "Older physicality" },
    },
  });
  const merged = mergeTrackerDataChronologically([editedCharacter, staleLaterUserSnapshot]);
  assert.ok(merged);
  assert.equal(merged?.customNonNumericStatistics?.physicality?.Seraphina, "Edited physicality");
});

test("mergeTrackerDataChronologically canonicalizes alias-owner buckets by entity identity across snapshots", () => {
  const olderAliasSnapshot = makeTracker(1000, {
    statistics: {
      affection: { Ash: 58 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Ash: "Hopeful" },
      lastThought: {},
    },
    entityOwnerMap: {
      Ash: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines",
        kind: "multi_character_alias",
      },
    },
  });
  olderAliasSnapshot.activeCharacters = ["Ash"];
  const newerCanonicalSnapshot = makeTracker(2000, {
    statistics: {
      affection: {},
      trust: { Ashley: 61 },
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    entityOwnerMap: {
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines",
        kind: "multi_character_alias",
      },
    },
  });
  newerCanonicalSnapshot.activeCharacters = ["Ashley"];

  const merged = mergeTrackerDataChronologically([olderAliasSnapshot, newerCanonicalSnapshot]);
  assert.ok(merged);
  assert.deepEqual(merged?.activeCharacters, ["Ashley"]);
  assert.equal(merged?.statistics.affection.Ashley, 58);
  assert.equal(merged?.statistics.affection.Ash, undefined);
  assert.equal(merged?.statistics.trust.Ashley, 61);
  assert.equal(merged?.statistics.mood.Ashley, "Hopeful");
  assert.equal(merged?.statisticsByEntityId?.affection?.["bst_mc_alias:test:ashley"], 58);
  assert.equal(merged?.statisticsByEntityId?.trust?.["bst_mc_alias:test:ashley"], 61);
  assert.equal(merged?.statisticsByEntityId?.mood?.["bst_mc_alias:test:ashley"], "Hopeful");
  assert.ok(merged?.entityOwnerMap?.Ashley);
  assert.equal(merged?.entityOwnerMap?.Ash, undefined);
  assert.deepEqual(merged?.entityOwnerMap?.Ashley.aliases, ["Ash"]);
});

test("mergeTrackerDataChronologically remaps technical resolver entity names through entityOwnerMap", () => {
  const entityId = "bst_mc_alias:test:ashley";
  const merged = mergeTrackerDataChronologically([
    makeTracker(1000, {
      activeCharacters: ["Ash"],
      entityResolution: buildEntityResolution({
        source: "model",
        resolvedEntities: [
          {
            entityId,
            kind: "st-character",
            name: entityId,
            avatar: null,
            inScene: true,
            inMessage: true,
          },
        ],
      }),
      entityOwnerMap: {
        Ash: {
          entityId,
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "camp.png|camp whispering pines",
          kind: "multi_character_alias",
        },
      },
    }),
  ]);

  assert.deepEqual(merged?.activeCharacters, ["Ashley"]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId,
        kind: "st-character",
        name: "Ashley",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
  }));
});

test("mergeTrackerDataChronologically preserves the latest entityResolution payload and explicit active owners", () => {
  const older = makeTracker(1000, {
    activeCharacters: ["Ashley", "Blake"],
    entityResolution: buildEntityResolution({
      source: "fallback",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Ashley", "Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-ashley", "ent-blake"],
    }),
  });
  const newer = makeTracker(1100, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
  });

  const merged = mergeTrackerDataChronologically([older, newer]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    sceneOwners: ["Ashley", "Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-ashley", "ent-blake"],
    messageEntityIds: ["ent-blake"],
  }));
  assert.deepEqual(merged?.activeCharacters, ["Blake"]);
});

test("mergeTrackerDataChronologically prefers resolver-derived activeCharacters over stale non-user explicit arrays", () => {
  const merged = mergeTrackerDataChronologically([
    makeTracker(1000, {
      activeCharacters: ["Garret", "Raleigh"],
      entityResolution: buildEntityResolution({
        source: "model",
        sceneOwners: ["Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-blake"],
        messageEntityIds: ["ent-blake"],
      }),
    }),
  ]);

  assert.deepEqual(merged?.activeCharacters, ["Blake"]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-blake"],
    messageEntityIds: ["ent-blake"],
  }));
});

test("mergeTrackerDataChronologically preserves explicit user activeCharacters before entity-derived fallback owners", () => {
  const blakeEntityId = "bst_mc_alias:test:blake";
  const merged = mergeTrackerDataChronologically([
    makeTracker(1000, {
      activeCharacters: [USER_TRACKER_KEY],
      entityResolution: buildEntityResolution({
        source: "model",
        resolvedEntities: [
          {
            entityId: blakeEntityId,
            kind: "st-character",
            name: "Blake",
            avatar: null,
            inScene: true,
            inMessage: true,
          },
        ],
      }),
      entityOwnerMap: {
        Blake: {
          entityId: blakeEntityId,
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: [],
          sourceKey: "camp.png|camp whispering pines",
          kind: "multi_character_alias",
        },
        Garret: {
          entityId: "bst_mc_alias:test:garret",
          ownerName: "Garret",
          canonicalName: "Garret",
          aliases: [],
          sourceKey: "camp.png|camp whispering pines",
          kind: "multi_character_alias",
        },
      },
    }),
  ]);

  assert.deepEqual(merged?.activeCharacters, [USER_TRACKER_KEY]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId: blakeEntityId,
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
  }));
});

test("getTrackerDataFromMessage preserves explicit empty entityResolution state", () => {
  const tracker = makeTracker(1000, {
    activeCharacters: [],
    entityResolution: buildEntityResolution({
      source: "fallback",
      sceneOwners: [],
      messageOwners: [],
      sceneEntityIds: [],
      messageEntityIds: [],
    }),
  });
  const message = {
    mes: "Ambient reply",
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    is_user: false,
    is_system: false,
    swipe_id: 0,
    extra: {
      [EXTENSION_KEY]: {
        "0": tracker,
      },
    },
  };

  const stored = getTrackerDataFromMessage(message);
  assert.deepEqual(stored?.activeCharacters, []);
  assert.deepEqual(stored?.entityResolution, buildEntityResolution({
    source: "fallback",
    sceneOwners: [],
    messageOwners: [],
    sceneEntityIds: [],
    messageEntityIds: [],
  }));
});

test("mergeTrackerDataChronologically preserves explicit by-entity buckets when owner buckets are absent", () => {
  const entityOnlySnapshot = makeTracker(1000, {
    activeCharacters: ["Ashley"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley"],
      messageOwners: ["Ashley"],
      sceneEntityIds: ["bst_mc_alias:test:ashley"],
      messageEntityIds: ["bst_mc_alias:test:ashley"],
    }),
    entityOwnerMap: {
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: {},
      trust: { Ashley: 61 },
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customNonNumericStatistics: {},
  });
  entityOnlySnapshot.statisticsByEntityId = {
    affection: { "bst_mc_alias:test:ashley": 58 },
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };
  entityOnlySnapshot.customNonNumericStatisticsByEntityId = {
    pose: { "bst_mc_alias:test:ashley": "Leaning on the wall." },
  };

  const merged = mergeTrackerDataChronologically([entityOnlySnapshot]);
  assert.ok(merged);
  assert.equal(merged?.statisticsByEntityId?.affection?.["bst_mc_alias:test:ashley"], 58);
  assert.equal(merged?.statisticsByEntityId?.trust?.["bst_mc_alias:test:ashley"], 61);
  assert.equal(
    merged?.customNonNumericStatisticsByEntityId?.pose?.["bst_mc_alias:test:ashley"],
    "Leaning on the wall.",
  );
});

test("buildMergedPromptMacroData preserves the latest entityResolution for merged prompt/runtime reads", () => {
  const context = makeContext();
  const older = makeTracker(1000, {
    activeCharacters: ["Ashley", "Blake"],
    entityResolution: buildEntityResolution({
      source: "fallback",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Ashley", "Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-ashley", "ent-blake"],
    }),
  });
  const newer = makeTracker(1100, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
  });

  writeTrackerDataToMessage(context, older, 0);
  writeTrackerDataToMessage(context, newer, 2);

  const merged = buildMergedPromptMacroData(context, newer);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    sceneOwners: ["Ashley", "Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-ashley", "ent-blake"],
    messageEntityIds: ["ent-blake"],
  }));
});

test("buildMergedPromptMacroData prefers resolver-backed activeCharacters over stale preferred non-user arrays", () => {
  const context = makeContext();
  const older = makeTracker(1000, {
    activeCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "fallback",
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
    }),
  });
  const preferred = makeTracker(1100, {
    activeCharacters: ["Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
  });

  writeTrackerDataToMessage(context, older, 0);

  const merged = buildMergedPromptMacroData(context, preferred);
  assert.deepEqual(merged?.activeCharacters, ["Blake"]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-blake"],
    messageEntityIds: ["ent-blake"],
  }));
});

test("buildMergedPromptMacroData prefers resolver-backed activeCharacters even when entity ids resolve a different scene owner", () => {
  const context = {
    ...makeContext(),
    groupId: "group-1",
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
        description: "Camp card.",
      },
    ],
  } as STContext;
  syncEntityRegistryFromRender({
    context,
    mode: "dynamic_characters",
    owners: ["Ashley", "Blake"],
    messageIndex: 2,
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });
  const blakeEntityId = resolveTrackerEntityIdsForOwners(context, ["Blake"])[0];
  assert.equal(typeof blakeEntityId, "string");
  assert.ok(blakeEntityId);

  const preferred = makeTracker(1100, {
    activeCharacters: ["Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: blakeEntityId,
          kind: "st-character",
          name: "Blake",
          avatar: null,
          inScene: true,
          inMessage: true,
        },
      ],
    }),
  });

  const merged = buildMergedPromptMacroData(context, preferred);
  assert.deepEqual(merged?.activeCharacters, ["Blake"]);
  assert.deepEqual(merged?.entityResolution, buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId: blakeEntityId,
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
  }));
});

test("resolveLatestStoredTrackerData prefers latest safe message snapshot", () => {
  const context = makeContext();
  const chatStateTracker = makeTracker(1000);
  const messageTracker = makeTracker(2000);

  saveTrackerSnapshot(context, chatStateTracker, 0);
  writeTrackerDataToMessage(context, messageTracker, 2);

  const resolved = resolveLatestStoredTrackerData(context, 2);
  assert.equal(resolved.source, "message");
  assert.equal(resolved.messageIndex, 2);
  assert.ok(resolved.data);
  assert.equal(resolved.data.timestamp, messageTracker.timestamp);
  assert.deepEqual(resolved.data.activeCharacters, messageTracker.activeCharacters);
  assert.deepEqual(resolved.data.statistics, messageTracker.statistics);
  assert.deepEqual(resolved.data.customStatistics, messageTracker.customStatistics);
  assert.deepEqual(resolved.data.customNonNumericStatistics, messageTracker.customNonNumericStatistics);
});

test("resolveLatestStoredTrackerData prefers resolver-backed activeCharacters on input", () => {
  const context = makeContext();
  const messageTracker = makeTracker(2000, {
    activeCharacters: ["Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
  });

  writeTrackerDataToMessage(context, messageTracker, 2);

  const resolved = resolveLatestStoredTrackerData(context, 2);
  assert.equal(resolved.source, "message");
  assert.ok(resolved.data);
  assert.deepEqual(resolved.data.activeCharacters, ["Blake"]);
  assert.deepEqual(resolved.data.entityResolution, buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId: "ent-blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
  }));
});

test("clearTrackerDataForMessage removes the current message tracker and rebuilds persisted latest state from earlier messages", () => {
  const context = makeContext();
  context.chat.push({ mes: "Later reply", name: "Seraphina", is_user: false, is_system: false, extra: {} } as any);
  const earlier = makeTracker(1000, {
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
  });
  const staleLatest = makeTracker(2000, {
    activeCharacters: ["Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "fallback",
      sceneOwners: ["Garret", "Raleigh"],
      messageOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      sceneEntityIds: ["ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
    }),
  });

  writeTrackerDataToMessage(context, earlier, 2);
  writeTrackerDataToMessage(context, staleLatest, 3);

  clearTrackerDataForMessage(context, 3);

  assert.equal(getTrackerDataFromMessage(context.chat[3]), null);
  const resolved = resolveLatestStoredTrackerData(context, 3);
  assert.equal(resolved.source, "message");
  assert.equal(resolved.messageIndex, 2);
  assert.ok(resolved.data);
  assert.equal(resolved.data.timestamp, earlier.timestamp);
  assert.deepEqual(resolved.data.activeCharacters, ["Blake"]);
  assert.deepEqual(resolved.data.entityResolution, buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId: "ent-blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
  }));
});

test("clearTrackerDataForCurrentChat removes persisted tracker data", () => {
  const context = makeContext();
  const tracker = makeTracker(1000);
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        e1: {
          id: "e1",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Camp",
          sourceAvatar: "camp.png",
          sourceKey: "camp.png|camp",
          kind: "multi_character_alias",
          introducedAtMessageIndex: 2,
          lastSeenMessageIndex: 2,
          lastActiveMessageIndex: 2,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 2, state: "active" }],
        },
      },
      ownerToEntityId: {
        ashley: "e1",
        ash: "e1",
      },
    },
    bstManualInactiveCharacters: {
      Ashley: 2,
    },
  } as typeof context.chatMetadata;
  writeTrackerDataToMessage(context, tracker, 2);
  assert.equal(isTrackableMessage(context.chat[2]), true);
  clearTrackerDataForCurrentChat(context);
  assert.equal(getTrackerDataFromMessage(context.chat[2]), null);
  assert.deepEqual(getRecentTrackerHistoryEntries(context, 10), []);
  assert.equal(context.chatMetadata?.bstEntityRegistry, undefined);
  assert.equal(context.chatMetadata?.bstManualInactiveCharacters, undefined);
});
