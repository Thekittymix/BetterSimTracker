import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import {
  filterResolvedEntitiesToTrackedOwners,
  resolveModelExtractionOwnerScopes,
  resolvePersistedSnapshotActiveEntityIds,
  resolvePersistedSnapshotActiveOwners,
  resolvePersistedSnapshotEntityOwners,
  resolvePersistedSnapshotResolvedEntities,
  resolveStableEntityIdForOwner,
  resolveUserExtractionOwnerScopes,
  selectResolverContinuityHistoryEntries,
} from "../src/entityResolution";
import { resolveTrackerSceneOwners } from "../src/entityRegistry";
import { syncEntityRegistryFromTrackerData } from "../src/entityRegistrySync";
import { buildPersistedTrackerSnapshot } from "../src/persistedTrackerSnapshot";
import { getTrackerDataFromMessage, getRecentTrackerHistoryEntries, writeTrackerDataToMessage } from "../src/storage";
import type { BetterSimTrackerSettings, STContext, TrackerData, TrackerResolvedEntity } from "../src/types";

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

function makeContext(): STContext {
  return {
    chat: [
      {
        mes: "It was a clear sunny day as the summer vacation began. Marylyn, Serena, Lisa, and Candy were all in the house together as dinner approached.",
        name: "Your Family",
        is_user: false,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
      {
        mes: "Kuba rubs the back of his neck and says, \"Okay. One rule: nobody starts anything weird before dinner. Can we manage that for five minutes?\"",
        name: "Kuba",
        is_user: true,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
      {
        mes: "Candy bounces on the balls of her feet and beams at Kuba while she chatters about dinner and a timer.",
        name: "Your Family",
        is_user: false,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
      {
        mes: "Okay, timer is fine. And the rest of you, please stay normal for five minutes.",
        name: "Kuba",
        is_user: true,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
      {
        mes: "Candy grins and keeps talking while the family stays gathered nearby.",
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
        avatar: "your family.png",
      },
    ],
    characterId: 10,
    groupId: null,
  } as unknown as STContext;
}

function makeTracker(overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    timestamp: overrides.timestamp ?? Date.now(),
    activeCharacters: overrides.activeCharacters ?? [],
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
    entityOwnerMap: overrides.entityOwnerMap,
  };
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    entityTrackingMode: "dynamic_characters",
    showInactive: true,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  } as BetterSimTrackerSettings;
}

afterEach(() => {
  localStorageMock.clear();
});

function assertSameMembers(actual: string[], expected: string[]): void {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

test("continuity across a user turn keeps the prior broad family scene through persisted write/read and later AI scope resolution", () => {
  const context = makeContext();
  const broadSceneOwners = ["Marylyn", "Serena", "Lisa", "Candy"];
  const openingTracker = makeTracker({
    timestamp: 1000,
    activeCharacters: broadSceneOwners,
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:marylyn",
          kind: "narrative-entity",
          name: "Marylyn",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:serena",
          kind: "narrative-entity",
          name: "Serena",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
      ],
    }),
  });
  writeTrackerDataToMessage(context, openingTracker, 0);

  const row0 = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(row0);

  const row1Scopes = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Your Family"],
    message: context.chat[1],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    resolvedSceneActiveCharacters: ["Your Family"],
    previousTrackerData: row0,
  });

  assert.deepEqual(row1Scopes.sceneActiveCharacters, broadSceneOwners);
  assert.deepEqual(row1Scopes.requestCharacters, [USER_TRACKER_KEY]);

  const row1ResolvedEntities = resolvePersistedSnapshotResolvedEntities({
    context,
    sceneActiveCharacters: row1Scopes.sceneActiveCharacters,
    requestCharacters: row1Scopes.requestCharacters,
    resolvedEntities: [
      {
        entityId: "bst_owner:your family.png|your family",
        kind: "st-character",
        name: "Your Family",
        avatar: null,
        aliases: ["Your Family"],
        inScene: true,
        inMessage: false,
        created: false,
      } satisfies TrackerResolvedEntity,
    ],
    userExtraction: true,
    entityTrackingMode: "dynamic_characters",
  });

  const userTracker = makeTracker({
    timestamp: 1001,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: {
      resolvedEntities: row1ResolvedEntities,
      source: "model",
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Neutral" },
      lastThought: { [USER_TRACKER_KEY]: "I need to keep things calm for at least five minutes before dinner." },
    },
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
      pose: { [USER_TRACKER_KEY]: "rubs the back of his neck" },
    },
  });
  writeTrackerDataToMessage(context, userTracker, 1);

  const row1 = getTrackerDataFromMessage(context.chat[1]);
  assert.ok(row1);

  const recentTrackerHistory = selectResolverContinuityHistoryEntries(
    getRecentTrackerHistoryEntries(context, 10),
    2,
    4,
  );

  const row2Scopes = resolveModelExtractionOwnerScopes({
    context,
    message: context.chat[2],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    previousTrackerData: row1,
    recentTrackerHistory,
    resolvedSceneActiveCharacters: ["Candy"],
    resolvedRequestCharacters: ["Candy"],
  });

  assert.deepEqual(row2Scopes.sceneActiveCharacters, ["Candy", "Marylyn", "Serena", "Lisa"]);
  assert.deepEqual(row2Scopes.requestCharacters, ["Candy"]);
});

test("retracking an older AI row keeps concrete background participants even after later stale rows changed registry state", () => {
  const context = makeContext();
  const settings = makeSettings();
  const broadSceneOwners = ["Marylyn", "Serena", "Lisa", "Candy"];

  const openingTracker = makeTracker({
    timestamp: 1000,
    activeCharacters: broadSceneOwners,
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: broadSceneOwners.map(ownerName => ({
        entityId: `bst_narrative:${ownerName.toLowerCase()}`,
        kind: "narrative-entity" as const,
        name: ownerName,
        avatar: null,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      })),
    }),
  });
  writeTrackerDataToMessage(context, openingTracker, 0);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 0,
    data: openingTracker,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const row0 = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(row0);

  const row1Scopes = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Your Family"],
    message: context.chat[1],
    settings,
    resolvedSceneActiveCharacters: ["Your Family"],
    previousTrackerData: row0,
  });
  assert.deepEqual(row1Scopes.sceneActiveCharacters, broadSceneOwners);

  const row1ResolvedEntities = resolvePersistedSnapshotResolvedEntities({
    context,
    sceneActiveCharacters: row1Scopes.sceneActiveCharacters,
    requestCharacters: row1Scopes.requestCharacters,
    resolvedEntities: [
      {
        entityId: "bst_owner:your family.png|your family",
        kind: "st-character",
        name: "Your Family",
        avatar: null,
        aliases: ["Your Family"],
        inScene: true,
        inMessage: false,
        created: false,
      } satisfies TrackerResolvedEntity,
    ],
    userExtraction: true,
    entityTrackingMode: "dynamic_characters",
  });
  const row1FilteredResolvedEntities = filterResolvedEntitiesToTrackedOwners({
    context,
    trackedOwners: resolvePersistedSnapshotEntityOwners({
      sceneActiveCharacters: row1Scopes.sceneActiveCharacters,
      requestCharacters: row1Scopes.requestCharacters,
    }),
    resolvedEntities: row1ResolvedEntities,
  });
  const row1Tracker = buildPersistedTrackerSnapshot({
    context,
    timestamp: 1001,
    activeCharacters: resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters: row1Scopes.sceneActiveCharacters,
      requestCharacters: row1Scopes.requestCharacters,
      userExtraction: true,
    }),
    activeEntityIds: resolvePersistedSnapshotActiveEntityIds({
      sceneActiveEntityIds: [],
      requestEntityIds: [],
      userExtraction: true,
    }),
    explicitTargetToEntity: {
      [USER_TRACKER_KEY]: resolveStableEntityIdForOwner(context, USER_TRACKER_KEY, "dynamic_characters"),
    },
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: row1FilteredResolvedEntities,
    source: "model",
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Neutral" },
      lastThought: { [USER_TRACKER_KEY]: "I need the whole family to stay calm until dinner starts." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
      pose: { [USER_TRACKER_KEY]: "rubs the back of his neck" },
    },
  });
  writeTrackerDataToMessage(context, row1Tracker, 1);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: row1Tracker,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners, USER_TRACKER_KEY],
  });

  const row1 = getTrackerDataFromMessage(context.chat[1]);
  assert.ok(row1);
  assertSameMembers(resolveTrackerSceneOwners(null, row1), broadSceneOwners);

  const staleRow2 = makeTracker({
    timestamp: 1002,
    activeCharacters: ["Candy", "Your Family"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_owner:your family.png|your family",
          kind: "st-character",
          name: "Your Family",
          avatar: null,
          aliases: ["Your Family"],
          inScene: true,
          inMessage: false,
          created: false,
        },
      ],
    }),
  });
  writeTrackerDataToMessage(context, staleRow2, 2);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 2,
    data: staleRow2,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const row3Tracker = buildPersistedTrackerSnapshot({
    context,
    timestamp: 1003,
    activeCharacters: [USER_TRACKER_KEY],
    activeEntityIds: [],
    explicitTargetToEntity: {
      [USER_TRACKER_KEY]: resolveStableEntityIdForOwner(context, USER_TRACKER_KEY, "dynamic_characters"),
    },
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: row1FilteredResolvedEntities,
    source: "model",
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Cautious" },
      lastThought: { [USER_TRACKER_KEY]: "Keep the whole room steady." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
      pose: { [USER_TRACKER_KEY]: "points a warning finger toward the room" },
    },
  });
  writeTrackerDataToMessage(context, row3Tracker, 3);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 3,
    data: row3Tracker,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners, USER_TRACKER_KEY],
  });

  const staleRow4 = makeTracker({
    timestamp: 1004,
    activeCharacters: ["Candy"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
      ],
    }),
  });
  writeTrackerDataToMessage(context, staleRow4, 4);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 4,
    data: staleRow4,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const recentTrackerHistory = selectResolverContinuityHistoryEntries(
    getRecentTrackerHistoryEntries(context, 10),
    2,
    4,
  );
  const retrackedRow2Scopes = resolveModelExtractionOwnerScopes({
    context,
    message: context.chat[2],
    settings,
    previousTrackerData: row1,
    recentTrackerHistory,
    resolvedSceneActiveCharacters: ["Your Family", "Candy"],
    resolvedRequestCharacters: ["Candy"],
  });

  assertSameMembers(resolveTrackerSceneOwners(null, row1), broadSceneOwners);
  assertSameMembers(retrackedRow2Scopes.sceneActiveCharacters, broadSceneOwners);
  assert.deepEqual(retrackedRow2Scopes.requestCharacters, ["Candy"]);

  const retrackedResolvedEntities = resolvePersistedSnapshotResolvedEntities({
    context,
    sceneActiveCharacters: retrackedRow2Scopes.sceneActiveCharacters,
    requestCharacters: retrackedRow2Scopes.requestCharacters,
    resolvedEntities: [
      {
        entityId: "bst_narrative:candy",
        kind: "narrative-entity",
        name: "Candy",
        avatar: null,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      },
      {
        entityId: "bst_owner:your family.png|your family",
        kind: "st-character",
        name: "Your Family",
        avatar: null,
        aliases: ["Your Family"],
        inScene: true,
        inMessage: false,
        created: false,
      },
    ],
    userExtraction: false,
    entityTrackingMode: "dynamic_characters",
  });
  const retrackedFilteredResolvedEntities = filterResolvedEntitiesToTrackedOwners({
    context,
    trackedOwners: resolvePersistedSnapshotEntityOwners({
      sceneActiveCharacters: retrackedRow2Scopes.sceneActiveCharacters,
      requestCharacters: retrackedRow2Scopes.requestCharacters,
    }),
    resolvedEntities: retrackedResolvedEntities,
  });
  const retrackedRow2 = buildPersistedTrackerSnapshot({
    context,
    timestamp: 2002,
    activeCharacters: resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters: retrackedRow2Scopes.sceneActiveCharacters,
      requestCharacters: retrackedRow2Scopes.requestCharacters,
      userExtraction: false,
    }),
    activeEntityIds: resolvePersistedSnapshotActiveEntityIds({
      sceneActiveEntityIds: ["bst_owner:your family.png|your family", "bst_narrative:candy"],
      requestEntityIds: ["bst_narrative:candy"],
      userExtraction: false,
    }),
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: retrackedFilteredResolvedEntities,
    source: "model",
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Excited" },
      lastThought: { Candy: "Dinner is almost here." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      pose: { Candy: "bounces on the balls of her feet beside Kuba" },
    },
  });
  writeTrackerDataToMessage(context, retrackedRow2, 2);

  const rereadRow2 = getTrackerDataFromMessage(context.chat[2]);
  assert.ok(rereadRow2);
  assertSameMembers(resolveTrackerSceneOwners(null, rereadRow2), broadSceneOwners);
});

test("retracking an older AI row recovers broad continuity when intervening user rows stored only lossy generic or single-owner scenes", () => {
  const context = makeContext();
  const settings = makeSettings();
  const broadSceneOwners = ["Marylyn", "Serena", "Lisa", "Candy"];

  const openingTracker = makeTracker({
    timestamp: 1000,
    activeCharacters: broadSceneOwners,
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: broadSceneOwners.map(ownerName => ({
        entityId: `bst_narrative:${ownerName.toLowerCase()}`,
        kind: "narrative-entity" as const,
        name: ownerName,
        avatar: null,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      })),
    }),
  });
  writeTrackerDataToMessage(context, openingTracker, 0);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 0,
    data: openingTracker,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const row1RuntimeFact = makeTracker({
    timestamp: 1001,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_owner:your family.png|your family",
          kind: "st-character",
          name: "Your Family",
          avatar: null,
          aliases: ["Your Family"],
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
      mood: { [USER_TRACKER_KEY]: "Neutral" },
      lastThought: { [USER_TRACKER_KEY]: "Keep everyone normal until dinner." },
    },
    customNonNumericStatistics: {
      clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
      pose: { [USER_TRACKER_KEY]: "rubs the back of his neck" },
    },
  });
  writeTrackerDataToMessage(context, row1RuntimeFact, 1);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: row1RuntimeFact,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners, USER_TRACKER_KEY],
  });

  const row2RuntimeFact = makeTracker({
    timestamp: 1002,
    activeCharacters: ["Candy", "Your Family"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_owner:your family.png|your family",
          kind: "st-character",
          name: "Your Family",
          avatar: null,
          aliases: ["Your Family"],
          inScene: true,
          inMessage: false,
          created: false,
        },
      ],
    }),
  });
  writeTrackerDataToMessage(context, row2RuntimeFact, 2);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 2,
    data: row2RuntimeFact,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const row3RuntimeFact = makeTracker({
    timestamp: 1003,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
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
      mood: { [USER_TRACKER_KEY]: "Cautious" },
      lastThought: { [USER_TRACKER_KEY]: "The rest of them need to stay quiet." },
    },
  });
  writeTrackerDataToMessage(context, row3RuntimeFact, 3);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 3,
    data: row3RuntimeFact,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners, USER_TRACKER_KEY],
  });

  const row4RuntimeFact = makeTracker({
    timestamp: 1004,
    activeCharacters: ["Candy"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
          created: false,
        },
      ],
    }),
  });
  writeTrackerDataToMessage(context, row4RuntimeFact, 4);
  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 4,
    data: row4RuntimeFact,
    settings,
    allKnownCharacters: ["Your Family", ...broadSceneOwners],
  });

  const recentTrackerHistory = selectResolverContinuityHistoryEntries(
    getRecentTrackerHistoryEntries(context, 10),
    2,
    4,
  );
  const retrackedRow2Scopes = resolveModelExtractionOwnerScopes({
    context,
    message: context.chat[2],
    settings,
    previousTrackerData: getTrackerDataFromMessage(context.chat[1]),
    recentTrackerHistory,
    resolvedSceneActiveCharacters: ["Your Family", "Candy"],
    resolvedRequestCharacters: ["Candy"],
  });

  assertSameMembers(resolveTrackerSceneOwners(null, getTrackerDataFromMessage(context.chat[0])), broadSceneOwners);
  assert.deepEqual(resolveTrackerSceneOwners(null, getTrackerDataFromMessage(context.chat[1])), ["Your Family"]);
  assertSameMembers(retrackedRow2Scopes.sceneActiveCharacters, broadSceneOwners);
  assert.deepEqual(retrackedRow2Scopes.requestCharacters, ["Candy"]);

  const recentTrackerHistoryForRow4 = selectResolverContinuityHistoryEntries(
    getRecentTrackerHistoryEntries(context, 10),
    4,
    4,
  );
  const retrackedRow4Scopes = resolveModelExtractionOwnerScopes({
    context,
    message: context.chat[4],
    settings,
    previousTrackerData: getTrackerDataFromMessage(context.chat[3]),
    recentTrackerHistory: recentTrackerHistoryForRow4,
    resolvedSceneActiveCharacters: ["Candy"],
    resolvedRequestCharacters: ["Candy"],
  });

  assertSameMembers(retrackedRow4Scopes.sceneActiveCharacters, broadSceneOwners);
  assert.deepEqual(retrackedRow4Scopes.requestCharacters, ["Candy"]);
});
