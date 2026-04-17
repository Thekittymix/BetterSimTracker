import test from "node:test";
import assert from "node:assert/strict";

import { defaultSettings } from "../src/settings";
import { writeTrackerDataToMessage } from "../src/storage";
import { buildJsonExtractionShadowRequest, buildJsonExtractionShadowRequestFromContext, runJsonExtractionShadowParity } from "../src/jsonExtractionProtocolShadow";
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
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: [],
        textMaxLength: 120,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
  };
}

function makeExpectedTracker(): TrackerData {
  return {
    timestamp: 123,
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          inScene: true,
          inMessage: true,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    statistics: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Candy: ["t-shirt", "panties"],
      },
    },
  };
}

function makeContext(): STContext {
  return {
    name1: "Kuba",
    name2: "Your Family",
    chat: [
      {
        name: "Your Family",
        is_user: false,
        is_system: false,
        mes: "Candy sits on the bed while Lisa, Marylyn, and Serena watch.",
        extra: {},
      },
      {
        is_user: true,
        is_system: false,
        mes: "Candy, answer first. The others stay here.",
        extra: {},
      },
      {
        name: "Your Family",
        is_user: false,
        is_system: false,
        mes: "Candy replies while the others watch.",
        extra: {},
      },
    ],
  };
}

test.afterEach(() => {
  localStorageMock.clear();
});

test.after(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = previousLocalStorage;
});

test("buildJsonExtractionShadowRequest builds a real extractor-shaped request with current state and recent history", () => {
  const request = buildJsonExtractionShadowRequest({
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
    message: {
      speaker: "Your Family",
      isUser: false,
      isSystem: false,
      text: "Candy replies while the others watch.",
    },
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    entityResolution: {
      source: "model",
      resolvedEntities: [],
    },
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    recentHistory: [
      {
        messageIndex: 3,
        speaker: "Kuba",
        isUser: true,
        isSystem: false,
        text: "Candy, answer first. The others stay here.",
        trackerSnapshot: {
          activeOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          messageOwners: [],
          entityResolution: {},
        },
      },
    ],
    entityContext: {
      candidateOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
      candidateEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
        },
      ],
      currentEntityOwnerMap: {},
    },
  });

  assert.equal(request.task.retrack, true);
  assert.equal(request.recentHistory[0]?.messageIndex, 3);
  assert.deepEqual(request.currentState.customNonNumericStats, makeExpectedTracker().customNonNumericStatistics);
});

test("buildJsonExtractionShadowRequestFromContext builds message and history from real ST context rows", () => {
  const context = makeContext();
  writeTrackerDataToMessage(context, makeExpectedTracker(), 0);
  writeTrackerDataToMessage(context, {
    ...makeExpectedTracker(),
    timestamp: 222,
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
      ],
    },
  }, 1);

  const request = buildJsonExtractionShadowRequestFromContext({
    context,
    messageIndex: 2,
    settings: makeSettings(),
    task: {
      mode: "ai_turn",
      messageIndex: 2,
      retrack: false,
      swipeRetrack: false,
      entityTrackingMode: "dynamic_characters",
      includeCharacterCards: true,
      includeActivatedLorebook: false,
    },
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    entityResolution: makeExpectedTracker().entityResolution,
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    entityContext: {
      candidateOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
      candidateEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
        },
      ],
      currentEntityOwnerMap: {},
    },
    historyLimit: 4,
  });

  assert.equal(request.message.speaker, "Your Family");
  assert.equal(request.message.text, "Candy replies while the others watch.");
  assert.deepEqual(request.recentHistory.map(entry => entry.messageIndex), [1, 0]);
  assert.equal(request.recentHistory[0]?.speaker, "Kuba");
  assert.deepEqual(request.recentHistory[0]?.trackerSnapshot?.sceneOwners, ["Candy", "Lisa"]);
});

test("runJsonExtractionShadowParity reports parity success for equivalent expected and JSON-derived tracker outputs", () => {
  const expected = makeExpectedTracker();
  const rawResponse = JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: { status: "ok" },
    entityResolution: {
      sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
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
          entityId: "bst_narrative:lisa",
          ownerName: "Lisa",
          kind: "narrative-entity",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    builtInStats: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customStats: {},
    customNonNumericStats: {
      clothes: { Candy: ["t-shirt", "panties"] },
    },
  });

  const result = runJsonExtractionShadowParity({
    settings: makeSettings(),
    rawResponse,
    expectedTrackerData: expected,
    timestamp: 123,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parity.ok, true);
});

test("runJsonExtractionShadowParity reports mismatch when the JSON path collapses broad scene continuity", () => {
  const expected = makeExpectedTracker();
  const rawResponse = JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: { status: "ok" },
    entityResolution: {
      sceneOwners: ["Candy"],
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
      ],
    },
    builtInStats: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customStats: {},
    customNonNumericStats: {
      clothes: { Candy: ["t-shirt", "panties"] },
    },
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
  assert.equal(result.parity.mismatches[0]?.path, "activeCharacters");
});
