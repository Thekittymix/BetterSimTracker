import test from "node:test";
import assert from "node:assert/strict";

import { USER_TRACKER_KEY } from "../src/constants";
import { defaultSettings } from "../src/settings";
import { writeTrackerDataToMessage } from "../src/storage";
import {
  buildJsonExtractionShadowRequestFromContext,
  runJsonExtractionShadowParity,
} from "../src/jsonExtractionProtocolShadow";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

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

const previousLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;
const localStorageMock = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;

const broadSceneOwners = ["Marylyn", "Serena", "Lisa", "Candy"];

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    includeCharacterCardsInPrompt: true,
    entityTrackingMode: "dynamic_characters",
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
  };
}

function makeContext(): STContext {
  return {
    name1: "Kuba",
    name2: "Your Family",
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_narrative:candy": {
            id: "bst_narrative:candy",
            ownerName: "Candy",
            canonicalName: "Candy",
            aliases: [],
            sourceName: "Your Family",
            sourceAvatar: "your family.png",
            sourceKey: "your family.png|your family",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 4,
            lastActiveMessageIndex: 4,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          candy: "bst_narrative:candy",
        },
      },
    },
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
        mes: "Candy, stay seated and keep your shirt down. I'm talking to you, not the others.",
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
    customStatistics: overrides.customStatistics ?? {},
    customNonNumericStatistics: overrides.customNonNumericStatistics ?? {},
    entityOwnerMap: overrides.entityOwnerMap,
  };
}

function makeBroadSceneTracker(timestamp: number): TrackerData {
  return makeTracker({
    timestamp,
    activeCharacters: broadSceneOwners,
    entityResolution: {
      source: "model",
      resolvedEntities: broadSceneOwners.map(ownerName => ({
        entityId: `bst_narrative:${ownerName.toLowerCase()}`,
        kind: "narrative-entity" as const,
        name: ownerName,
        aliases: [],
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: ownerName === "Candy",
        created: true,
      })),
    },
    statistics: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customNonNumericStatistics: {
      clothes: { Candy: ["t-shirt", "panties"] },
    },
  });
}

test.afterEach(() => {
  localStorageMock.clear();
});

test.after(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = previousLocalStorage;
});

test("buildJsonExtractionShadowRequestFromContext preserves real retrack history shape for a focused later AI row", () => {
  const context = makeContext();
  const openingTracker = makeBroadSceneTracker(1000);
  const userBridgeTracker = makeTracker({
    timestamp: 1001,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_owner:your family.png|your family",
          kind: "st-character",
          name: "Your Family",
          aliases: ["Your Family"],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Neutral" },
      lastThought: { [USER_TRACKER_KEY]: "Keep everyone normal until dinner." },
    },
  });
  const row2Tracker = makeTracker({
    timestamp: 1002,
    activeCharacters: ["Candy", "Your Family"],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: true,
        },
        {
          entityId: "bst_owner:your family.png|your family",
          kind: "st-character",
          name: "Your Family",
          aliases: ["Your Family"],
          inScene: true,
          inMessage: false,
        },
      ],
    },
  });
  const focusedUserBridgeTracker = makeTracker({
    timestamp: 1003,
    activeCharacters: [USER_TRACKER_KEY],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          sourceKey: "your family.png|your family",
          inScene: true,
          inMessage: false,
        },
      ],
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Cautious" },
      lastThought: { [USER_TRACKER_KEY]: "The rest of them need to stay quiet." },
    },
  });
  writeTrackerDataToMessage(context, openingTracker, 0);
  writeTrackerDataToMessage(context, userBridgeTracker, 1);
  writeTrackerDataToMessage(context, row2Tracker, 2);
  writeTrackerDataToMessage(context, focusedUserBridgeTracker, 3);

  const request = buildJsonExtractionShadowRequestFromContext({
    context,
    messageIndex: 4,
    settings: makeSettings(),
    task: {
      mode: "ai_turn",
      messageIndex: 4,
      retrack: true,
      swipeRetrack: false,
      entityTrackingMode: "dynamic_characters",
      includeCharacterCards: true,
      includeActivatedLorebook: false,
    },
    activeCharacters: broadSceneOwners,
    entityResolution: makeBroadSceneTracker(1004).entityResolution,
    previousTrackerData: focusedUserBridgeTracker,
    previousStatistics: focusedUserBridgeTracker.statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: {},
    historyLimit: 6,
  });

  assert.deepEqual(request.recentHistory.map(entry => entry.messageIndex), [3, 2, 1, 0]);
  assert.deepEqual(request.recentHistory[0]?.trackerSnapshot?.sceneOwners, ["Candy"]);
  assert.deepEqual(request.recentHistory[1]?.trackerSnapshot?.sceneOwners, ["Candy", "Your Family"]);
  assert.deepEqual(
    (request.currentState.latestRelevantSnapshot as { activeCharacters?: string[] }).activeCharacters,
    broadSceneOwners,
  );
  assert.deepEqual(request.task.messageIndex, 4);
  assert.equal(request.message.text, context.chat[4]?.mes);
});

test("runJsonExtractionShadowParity catches the real generic-source continuity leak shape", () => {
  const expected = makeBroadSceneTracker(123);
  const rawResponse = JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: { status: "ok" },
    entityResolution: {
      sceneOwners: ["Candy", "Your Family"],
      messageOwners: ["Candy"],
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
          inScene: true,
          inMessage: true,
        },
        {
          entityId: "bst_owner:your family.png|your family",
          ownerName: "Your Family",
          kind: "st-character",
          aliases: ["Your Family"],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    builtInStats: expected.statistics,
    customStats: {},
    customNonNumericStats: expected.customNonNumericStatistics,
  });

  const result = runJsonExtractionShadowParity({
    settings: makeSettings(),
    rawResponse,
    expectedTrackerData: expected,
    timestamp: 123,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parity.ok, false);
  assert.ok(result.parity.mismatches.some(mismatch => mismatch.path === "activeCharacters"));
  assert.ok(result.parity.mismatches.some(mismatch => mismatch.path === "entityResolution.resolvedEntities"));
});
