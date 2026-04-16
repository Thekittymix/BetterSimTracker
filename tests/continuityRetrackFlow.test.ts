import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { resolveModelExtractionOwnerScopes, resolvePersistedSnapshotResolvedEntities, resolveUserExtractionOwnerScopes, selectResolverContinuityHistoryEntries } from "../src/entityResolution";
import { getTrackerDataFromMessage, getRecentTrackerHistoryEntries, writeTrackerDataToMessage } from "../src/storage";
import type { STContext, TrackerData, TrackerResolvedEntity } from "../src/types";

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

afterEach(() => {
  localStorageMock.clear();
});

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
