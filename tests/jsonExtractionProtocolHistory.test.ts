import test from "node:test";
import assert from "node:assert/strict";

import { buildJsonExtractionRecentHistoryEntries } from "../src/jsonExtractionProtocolHistory";
import { saveTrackerSnapshot, writeTrackerDataToMessage } from "../src/storage";
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

const previousLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;
const localStorageMock = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = localStorageMock;

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
        name: "SillyTavern System",
        is_user: false,
        is_system: false,
        mes: "utility row",
        extra: {
          type: "assistant_message",
        },
      },
      {
        name: "Your Family",
        is_user: false,
        is_system: false,
        mes: "Candy replies while the others stay quiet and watch.",
        extra: {},
      },
      {
        is_user: true,
        is_system: false,
        mes: "Current target row",
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

function broadSceneTracker(timestamp: number): TrackerData {
  return {
    timestamp,
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        { entityId: "bst_narrative:candy", kind: "narrative-entity", name: "Candy", aliases: [], inScene: true, inMessage: true },
        { entityId: "bst_narrative:lisa", kind: "narrative-entity", name: "Lisa", aliases: [], inScene: true, inMessage: false },
        { entityId: "bst_narrative:marylyn", kind: "narrative-entity", name: "Marylyn", aliases: [], inScene: true, inMessage: false },
        { entityId: "bst_narrative:serena", kind: "narrative-entity", name: "Serena", aliases: [], inScene: true, inMessage: false },
      ],
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
}

test("buildJsonExtractionRecentHistoryEntries builds history from real ST chat rows and tracker snapshots", () => {
  const context = makeContext();
  writeTrackerDataToMessage(context, broadSceneTracker(100), 0);
  writeTrackerDataToMessage(context, {
    ...broadSceneTracker(200),
    entityResolution: {
      source: "model",
      resolvedEntities: [
        { entityId: "bst_narrative:candy", kind: "narrative-entity", name: "Candy", aliases: [], inScene: true, inMessage: false },
        { entityId: "bst_narrative:lisa", kind: "narrative-entity", name: "Lisa", aliases: [], inScene: true, inMessage: false },
        { entityId: "bst_narrative:marylyn", kind: "narrative-entity", name: "Marylyn", aliases: [], inScene: true, inMessage: false },
        { entityId: "bst_narrative:serena", kind: "narrative-entity", name: "Serena", aliases: [], inScene: true, inMessage: false },
      ],
    },
  }, 1);

  const history = buildJsonExtractionRecentHistoryEntries({
    context,
    beforeMessageIndex: 4,
    limit: 4,
  });

  assert.deepEqual(history.map(entry => entry.messageIndex), [3, 1, 0]);
  assert.equal(history[0]?.speaker, "Your Family");
  assert.equal(history[0]?.trackerSnapshot, null);
  assert.equal(history[1]?.speaker, "Kuba");
  assert.deepEqual(history[1]?.trackerSnapshot?.sceneOwners, ["Candy", "Lisa", "Marylyn", "Serena"]);
  assert.deepEqual(history[1]?.trackerSnapshot?.messageOwners, ["Candy", "Lisa", "Marylyn", "Serena"]);
  assert.deepEqual(history[0]?.text, "Candy replies while the others stay quiet and watch.");
});

test("buildJsonExtractionRecentHistoryEntries excludes target row and skips non-trackable utility rows", () => {
  const context = makeContext();
  writeTrackerDataToMessage(context, broadSceneTracker(100), 3);

  const history = buildJsonExtractionRecentHistoryEntries({
    context,
    beforeMessageIndex: 3,
    limit: 4,
  });

  assert.deepEqual(history.map(entry => entry.messageIndex), [1, 0]);
  assert.ok(history.every(entry => entry.messageIndex < 3));
  assert.ok(history.every(entry => entry.messageIndex !== 2));
});

test("buildJsonExtractionRecentHistoryEntries can recover tracker snapshots from persisted history when the message row has no inline tracker payload", () => {
  const context = makeContext() as STContext & { chatId: string };
  context.chatId = "json-history-shadow";
  saveTrackerSnapshot(context, broadSceneTracker(333), 0);

  const history = buildJsonExtractionRecentHistoryEntries({
    context,
    beforeMessageIndex: 2,
    limit: 4,
  });

  assert.deepEqual(history.map(entry => entry.messageIndex), [1, 0]);
  assert.equal(history[1]?.trackerSnapshot?.entityResolution !== null, true);
  assert.deepEqual(history[1]?.trackerSnapshot?.sceneOwners, ["Candy", "Lisa", "Marylyn", "Serena"]);
});
