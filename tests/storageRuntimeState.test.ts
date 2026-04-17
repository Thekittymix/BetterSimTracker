import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { EXTENSION_KEY } from "../src/constants";
import { isTrackableMessage } from "../src/messageFilter";
import {
  buildMergedPromptMacroData,
  resolveHighestStoredTrackerMessageIndex,
  resolveLatestStoredTrackerData,
  resolveLatestStoredTrackerDataBefore,
} from "../src/runtimeState";
import { resolveTrackerEntityIdsForOwners, syncEntityRegistryFromRender } from "../src/entityRegistry";
import {
  clearTrackerDataForMessage,
  clearTrackerDataForCurrentChat,
  getLocalLatestTrackerData,
  getRecentTrackerHistoryEntries,
  getTrackerDataFromMessage,
  mergeTrackerDataChronologically,
  saveTrackerSnapshot,
  writeTrackerDataToMessage,
} from "../src/storage";
import type { STContext, TrackerData } from "../src/types";

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

test("writeTrackerDataToMessage can preserve explicit scene-active owners during manual tracker edit saves", () => {
  const context = makeContext();
  const tracker = makeTracker(1002, {
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
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
          created: false,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        },
        {
          entityId: "bst_narrative:marylyn",
          kind: "narrative-entity",
          name: "Marylyn",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        },
        {
          entityId: "bst_narrative:serena",
          kind: "narrative-entity",
          name: "Serena",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        },
      ],
    }),
  });

  writeTrackerDataToMessage(context, tracker, 2, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });

  const stored = getTrackerDataFromMessage(context.chat[2]);
  assert.deepEqual(stored?.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);
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
  assert.ok(parsed.history.length <= 16);
  assert.ok(raw!.length <= 12_000);

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
  assert.ok(keys.length <= 6);
  assert.ok(keys.includes("scope-19|char:1"));
  assert.ok(raw!.length <= 24_000);
});

test("saveTrackerSnapshot prunes old localStorage history scopes globally", () => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;
  localStorageMock.clear();

  for (let index = 0; index < 14; index += 1) {
    const context = makeContext() as STContext & { chatId: string };
    context.chatId = `history-scope-${index}`;
    for (let entry = 0; entry < 6; entry += 1) {
      saveTrackerSnapshot(context, makeTracker(30_000 + (index * 10) + entry, {
        activeCharacters: ["Seraphina"],
        statistics: {
          affection: { Seraphina: 60 + entry },
          trust: {},
          desire: {},
          connection: {},
          mood: {},
          lastThought: { Seraphina: `history-thought-${index}-${entry}-${"h".repeat(180)}` },
        },
        customNonNumericStatistics: {
          pose: { Seraphina: `history-pose-${index}-${entry}-${"p".repeat(180)}` },
        },
      }), entry + 1);
    }
  }

  const keys = Array.from({ length: localStorageMock.length }, (_, index) => localStorageMock.key(index))
    .filter((key): key is string => Boolean(key))
    .filter(key => key.startsWith(`${EXTENSION_KEY}:history:`));
  const totalChars = keys.reduce((sum, key) => sum + (localStorageMock.getItem(key)?.length ?? 0), 0);

  assert.ok(keys.length <= 6);
  assert.ok(totalChars <= 72_000);
  assert.ok(keys.some(key => key.includes("history-scope-13|char:1")));
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

test("writeTrackerDataToMessage does not persist scene-only resolved owners into a user-only payload entityOwnerMap", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {},
      ownerToEntityId: {},
    },
  };
  const registry = context.chatMetadata?.bstEntityRegistry as {
    entities: Record<string, unknown>;
    ownerToEntityId: Record<string, string>;
  } | undefined;
  assert.ok(registry);
  const garretEntityId = "bst_test:garret";
  registry.entities[garretEntityId] = {
    id: garretEntityId,
    ownerName: "Garret",
    canonicalName: "Garret",
    aliases: ["Garret"],
    sourceName: "Garret",
    sourceAvatar: null,
    sourceKey: "test:garret",
    kind: "multi_character_alias",
    introducedAtMessageIndex: 1,
    lastSeenMessageIndex: 1,
    lastActiveMessageIndex: 1,
    lifecycleState: "active",
    archivedAtMessageIndex: null,
  };
  registry.ownerToEntityId.garret = garretEntityId;
  registry.entities["bst_narrative:elias-mercer"] = {
    id: "bst_narrative:elias-mercer",
    ownerName: "Elias Mercer",
    canonicalName: "Elias Mercer",
    aliases: ["Elias", "Mercer"],
    sourceName: "Elias Mercer",
    sourceAvatar: null,
    sourceKey: "narrative:bst_narrative:elias-mercer",
    kind: "narrative-entity",
    introducedAtMessageIndex: 1,
    lastSeenMessageIndex: 1,
    lastActiveMessageIndex: 1,
    lifecycleState: "active",
    archivedAtMessageIndex: null,
  };
  registry.ownerToEntityId["elias mercer"] = "bst_narrative:elias-mercer";
  registry.ownerToEntityId.elias = "bst_narrative:elias-mercer";
  registry.ownerToEntityId.mercer = "bst_narrative:elias-mercer";

  const tracker = makeTracker(1002, {
    activeCharacters: ["__bst_user__"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: garretEntityId,
          kind: "st-character",
          name: "Garret",
          aliases: ["Garret"],
          avatar: null,
          inScene: true,
          inMessage: false,
          created: false,
        },
        {
          entityId: "bst_narrative:elias-mercer",
          kind: "narrative-entity",
          name: "Elias Mercer",
          aliases: ["Elias", "Mercer"],
          avatar: null,
          inScene: true,
          inMessage: false,
          created: false,
        },
      ],
    }),
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { __bst_user__: "Neutral" },
      lastThought: { __bst_user__: "I need the real story before I decide who to trust here." },
    },
    customNonNumericStatistics: {
      clothes: { __bst_user__: ["t-shirt", "jeans"] },
      pose: { __bst_user__: "standing still, watching the others carefully" },
      scene_date_time: { __bst_global__: "2026-03-04 20:20" },
    },
  });

  writeTrackerDataToMessage(context, tracker, 1);
  const stored = getTrackerDataFromMessage(context.chat[1]);
  assert.equal(stored?.entityOwnerMap, undefined);
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
      resolvedEntities: [
        {
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
          kind: "st-character",
          name: "Blake",
          avatar: null,
          inScene: true,
          inMessage: true,
          sceneEvidence: ["resolver_entity_ref"],
          messageEvidence: ["resolver_entity_ref"],
          sceneConfidence: 1,
          messageConfidence: 1,
          created: false,
        },
      ],
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
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_entity_ref"],
        messageEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
        messageConfidence: 1,
        created: false,
      },
    ],
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

test("buildMergedPromptMacroData keeps later-message state over a later-written manual edit on an older message", () => {
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
    [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
    Seraphina: ["black sundress"],
  });
});

test("buildMergedPromptMacroData keeps later-message user clothes over a later-written older nude edit", () => {
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
    [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
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

test("mergeTrackerDataChronologically keeps later message continuity over a later-written older manual edit", () => {
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
  assert.equal(merged?.customNonNumericStatistics?.physicality?.Seraphina, "Older physicality");
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

test("resolveLatestStoredTrackerDataBefore excludes the current swipe target message and returns the previous AI snapshot", () => {
  const context = makeContext();
  context.chat.push({ mes: "Latest swipe target", name: "Seraphina", is_user: false, is_system: false, extra: {} } as any);
  const previousAi = makeTracker(1000, {
    customNonNumericStatistics: {
      clothes: {
        Seraphina: ["worn hoodie"],
      },
    },
  });
  const currentSwipe = makeTracker(2000, {
    customNonNumericStatistics: {
      clothes: {
        Seraphina: ["formal blazer"],
      },
    },
  });

  writeTrackerDataToMessage(context, previousAi, 2);
  writeTrackerDataToMessage(context, currentSwipe, 3);

  const resolved = resolveLatestStoredTrackerDataBefore(context, 3);
  assert.equal(resolved.source, "message");
  assert.equal(resolved.messageIndex, 2);
  assert.deepEqual(resolved.data?.customNonNumericStatistics?.clothes?.Seraphina, ["worn hoodie"]);
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

test("buildMergedPromptMacroData can exclude the current swipe target message from merged prompt state", () => {
  const context = makeContext();
  context.chat.push({ mes: "Latest swipe target", name: "Seraphina", is_user: false, is_system: false, extra: {} } as any);
  const previousAi = makeTracker(1000, {
    customNonNumericStatistics: {
      clothes: {
        Seraphina: ["worn hoodie"],
      },
    },
  });
  const currentSwipe = makeTracker(2000, {
    customNonNumericStatistics: {
      clothes: {
        Seraphina: ["formal blazer"],
      },
    },
  });

  writeTrackerDataToMessage(context, previousAi, 2);
  writeTrackerDataToMessage(context, currentSwipe, 3);

  const merged = buildMergedPromptMacroData(context, previousAi, { beforeMessageIndexExclusive: 3 });
  assert.deepEqual(merged?.customNonNumericStatistics?.clothes?.Seraphina, ["worn hoodie"]);
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

test("clearTrackerDataForCurrentChat resets persisted scope state before a fresh snapshot is saved again", () => {
  const context = makeContext();
  const first = makeTracker(1000, { activeCharacters: ["Ashley"] });
  const second = makeTracker(2000, { activeCharacters: ["Blake"] });

  writeTrackerDataToMessage(context, first, 2);
  clearTrackerDataForCurrentChat(context);
  saveTrackerSnapshot(context, second, 2);

  const latest = resolveLatestStoredTrackerData(context, 2);
  assert.equal(latest.source, "chatState");
  assert.ok(latest.data);
  assert.deepEqual(latest.data.activeCharacters, ["Blake"]);
  assert.deepEqual(getRecentTrackerHistoryEntries(context, 10).map(entry => entry.data.activeCharacters), [["Blake"]]);
});

test("clearTrackerDataForCurrentChat removes only the current scope and preserves other persisted scopes", () => {
  const firstContext = makeContext() as STContext & { chatId: string };
  firstContext.chatId = "scope-a";
  const secondContext = makeContext() as STContext & { chatId: string };
  secondContext.chatId = "scope-b";

  saveTrackerSnapshot(firstContext, makeTracker(1000, { activeCharacters: ["Ashley"] }), 2);
  saveTrackerSnapshot(secondContext, makeTracker(2000, { activeCharacters: ["Blake"] }), 2);

  clearTrackerDataForCurrentChat(firstContext);

  const latestFirst = resolveLatestStoredTrackerData(firstContext, 2);
  assert.equal(latestFirst.data, null);
  assert.equal(latestFirst.source, "none");

  const latestSecond = resolveLatestStoredTrackerData(secondContext, 2);
  assert.equal(latestSecond.source, "chatState");
  assert.ok(latestSecond.data);
  assert.deepEqual(latestSecond.data.activeCharacters, ["Blake"]);
});

test("resolveLatestStoredTrackerData recovers after a corrupted latestByScope payload is replaced by a valid snapshot", () => {
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "corrupted-scope";

  localStorageMock.setItem(`${EXTENSION_KEY}:latestByScope`, "{not-json");
  const before = resolveLatestStoredTrackerData(context, 2);
  assert.equal(before.data, null);
  assert.equal(before.source, "none");

  saveTrackerSnapshot(context, makeTracker(3000, { activeCharacters: ["Seraphina"] }), 2);

  const after = resolveLatestStoredTrackerData(context, 2);
  assert.equal(after.source, "chatState");
  assert.ok(after.data);
  assert.deepEqual(after.data.activeCharacters, ["Seraphina"]);
});

test("resolveHighestStoredTrackerMessageIndex keeps the furthest persisted snapshot during partial hydration", () => {
  const fullContext = makeContext() as STContext & { chatId: string };
  fullContext.chatId = "hydration-scope";
  fullContext.chat = [
    { mes: "Greeting", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 1", is_user: true, is_system: false, extra: {} },
    { mes: "AI 1", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 2", is_user: true, is_system: false, extra: {} },
    { mes: "AI 2", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 3", is_user: true, is_system: false, extra: {} },
    { mes: "AI 3", name: "Family", is_user: false, is_system: false, extra: {} },
  ];

  saveTrackerSnapshot(fullContext, makeTracker(5000, { activeCharacters: ["Kuba"] }), 5);
  saveTrackerSnapshot(fullContext, makeTracker(6000, { activeCharacters: ["Candy"] }), 6);

  const partialContext = makeContext() as STContext & { chatId: string };
  partialContext.chatId = "hydration-scope";
  partialContext.chat = [
    { mes: "Greeting", name: "Family", is_user: false, is_system: false, extra: {} },
  ];

  assert.equal(resolveLatestStoredTrackerData(partialContext, 0).source, "none");
  assert.equal(resolveHighestStoredTrackerMessageIndex(partialContext), 6);
});

test("saveTrackerSnapshot keeps a newer message as latest when an older message is written later", () => {
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "historical-bootstrap";
  context.chat = [
    { mes: "Greeting", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 1", is_user: true, is_system: false, extra: {} },
    { mes: "AI 1", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 2", is_user: true, is_system: false, extra: {} },
    { mes: "AI 2", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 3", is_user: true, is_system: false, extra: {} },
    { mes: "AI 3", name: "Family", is_user: false, is_system: false, extra: {} },
    { mes: "User 4", is_user: true, is_system: false, extra: {} },
    { mes: "AI 4", name: "Family", is_user: false, is_system: false, extra: {} },
  ];

  saveTrackerSnapshot(context, makeTracker(7000, { activeCharacters: ["Kuba"] }), 7);
  saveTrackerSnapshot(context, makeTracker(8000, { activeCharacters: ["Candy"] }), 8);
  saveTrackerSnapshot(context, makeTracker(1000, { activeCharacters: ["Candy", "Lisa"] }), 0);

  const latest = resolveLatestStoredTrackerData(context, 8);
  assert.equal(latest.source, "chatState");
  assert.ok(latest.data);
  assert.equal(latest.messageIndex, 8);
  assert.deepEqual(latest.data.activeCharacters, ["Candy"]);

  const localLatest = getLocalLatestTrackerData(context);
  assert.ok(localLatest);
  assert.equal(localLatest.messageIndex, 8);
  assert.deepEqual(localLatest.data.activeCharacters, ["Candy"]);

  const historyEntries = getRecentTrackerHistoryEntries(context, 10);
  assert.deepEqual(historyEntries.slice(0, 3).map(entry => entry.messageIndex), [8, 7, 0]);
});

test("getLocalLatestTrackerData detects an externally replaced scope store after the cache was warmed", () => {
  const previousStorage = (globalThis as unknown as { localStorage: unknown }).localStorage;
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;
  try {
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "store-cache-replace";

  const initialTracker = makeTracker(50_001, { activeCharacters: ["Seraphina"] });
  saveTrackerSnapshot(context, initialTracker, 2);

  const initial = getLocalLatestTrackerData(context);
  assert.equal(initial?.data.timestamp, 50_001);

  const replacementTracker = makeTracker(50_999, {
    activeCharacters: ["Seraphina"],
    statistics: {
      affection: { Seraphina: 77 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });
  localStorageMock.setItem(getLocalStoreKey("store-cache-replace"), JSON.stringify({
    latest: {
      data: replacementTracker,
      messageIndex: 2,
      timestamp: replacementTracker.timestamp,
    },
    history: [{
      data: replacementTracker,
      messageIndex: 2,
      timestamp: replacementTracker.timestamp,
    }],
  }));

  const refreshed = getLocalLatestTrackerData(context);
  assert.equal(refreshed?.data.timestamp, 50_999);
  assert.deepEqual(refreshed?.data.statistics.affection, { Seraphina: 77 });
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = previousStorage;
  }
});

test("getLocalLatestTrackerData resets the warmed scope-store cache after clear and fresh save", () => {
  const previousStorage = (globalThis as unknown as { localStorage: unknown }).localStorage;
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;
  try {
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "store-cache-clear";

  saveTrackerSnapshot(context, makeTracker(60_001, { activeCharacters: ["Seraphina"] }), 2);
  assert.equal(getLocalLatestTrackerData(context)?.data.timestamp, 60_001);

  clearTrackerDataForCurrentChat(context);
  assert.equal(getLocalLatestTrackerData(context), null);

  saveTrackerSnapshot(context, makeTracker(60_777, { activeCharacters: ["Seraphina"] }), 2);
  const resolved = getLocalLatestTrackerData(context);
  assert.equal(resolved?.data.timestamp, 60_777);
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = previousStorage;
  }
});
