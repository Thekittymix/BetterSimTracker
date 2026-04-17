import test from "node:test";
import assert from "node:assert/strict";

import {
  enforceDebugStorageBudget,
  persistDebugStorageValue,
  trimDebugRecordForStorage,
  trimTraceLinesForStorage,
} from "../src/debugStorage";
import type { DeltaDebugRecord } from "../src/types";

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
}

function makeDebugRecord(): DeltaDebugRecord {
  return {
    rawModelOutput: "A".repeat(12_000),
    promptText: "B".repeat(11_000),
    contextText: "C".repeat(10_000),
    parsed: {
      confidence: {},
      deltas: { affection: {}, trust: {}, desire: {}, connection: {}, custom: {}, customNonNumeric: {} },
      mood: {},
      lastThought: {},
    },
    applied: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    meta: {
      promptChars: 0,
      contextChars: 0,
      historySnapshots: 0,
      activeCharacters: [],
      statsRequested: [],
      attempts: 1,
      extractionMode: "unified",
      retryUsed: false,
      firstParseHadValues: false,
      rawLength: 0,
      parsedCounts: {
        confidence: 0,
        affection: 0,
        trust: 0,
        desire: 0,
        connection: 0,
        mood: 0,
        lastThought: 0,
      },
      appliedCounts: {
        affection: 0,
        trust: 0,
        desire: 0,
        connection: 0,
        mood: 0,
        lastThought: 0,
      },
      jsonShadow: {
        status: "request_built",
        protocolVersion: "bst.extract.v1",
        requestText: "Q".repeat(12_000),
        task: {
          mode: "ai_turn",
          messageIndex: 4,
          retrack: true,
          swipeRetrack: false,
        },
      },
    },
    trace: Array.from({ length: 220 }, (_, index) => `trace-${index}-${"x".repeat(400)}`),
  };
}

test("trimDebugRecordForStorage caps bulky debug text fields and trace payload", () => {
  const trimmed = trimDebugRecordForStorage(makeDebugRecord());

  assert.ok(trimmed.rawModelOutput.length < 3_200);
  assert.ok(trimmed.promptText && trimmed.promptText.length < 3_200);
  assert.ok(trimmed.contextText && trimmed.contextText.length < 3_200);
  assert.ok((trimmed.meta?.jsonShadow?.requestText?.length ?? 0) < 3_200);
  assert.equal(trimmed.trace?.length, 80);
  assert.ok((trimmed.trace ?? [])[0].length <= 220);
});

test("trimTraceLinesForStorage keeps only recent compacted trace lines", () => {
  const trimmed = trimTraceLinesForStorage(Array.from({ length: 170 }, (_, index) => `line-${index}-${"z".repeat(350)}`));

  assert.equal(trimmed.length, 80);
  assert.ok(trimmed[0].startsWith("line-90-"));
  assert.ok(trimmed[trimmed.length - 1].startsWith("line-169-"));
  assert.ok(trimmed.every(line => line.length <= 220));
});

test("enforceDebugStorageBudget evicts the oldest debug scopes but preserves the current scope", () => {
  const storage = new MemoryStorage();
  const scopes = [
    "bst-debug:chat-1|char:1",
    "bst-debug:chat-2|char:1",
    "bst-debug:chat-3|char:1",
    "bst-debug:chat-4|char:1",
    "bst-debug:chat-5|char:1",
  ];

  scopes.forEach((scopeKey, index) => {
    persistDebugStorageValue(storage, scopeKey, JSON.stringify({ savedAt: index + 1, record: { rawModelOutput: "X".repeat(40_000) } }));
    persistDebugStorageValue(storage, `${scopeKey}:trace`, JSON.stringify({ savedAt: index + 1, lines: ["t".repeat(10_000)] }));
  });

  enforceDebugStorageBudget(storage, "bst-debug:chat-5|char:1");

  assert.equal(storage.getItem("bst-debug:chat-1|char:1"), null);
  assert.equal(storage.getItem("bst-debug:chat-1|char:1:trace"), null);
  assert.ok(storage.getItem("bst-debug:chat-5|char:1"));
  assert.ok(storage.getItem("bst-debug:chat-5|char:1:trace"));
});
