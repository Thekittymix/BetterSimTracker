import assert from "node:assert/strict";
import test from "node:test";

import {
  persistChatNow,
  persistChatNowBestEffort,
  persistMetadataAndChatNowBestEffort,
} from "../src/persistence";

test("persistChatNow prefers immediate save without queueing debounced fallback on success", async () => {
  let debouncedCalls = 0;
  let immediateCalls = 0;

  await persistChatNow({
    saveChatDebounced: () => {
      debouncedCalls += 1;
    },
    saveChat: async () => {
      immediateCalls += 1;
    },
  });

  assert.equal(immediateCalls, 1);
  assert.equal(debouncedCalls, 0);
});

test("persistChatNow queues debounced fallback and rethrows when immediate save fails", async () => {
  let debouncedCalls = 0;
  let immediateCalls = 0;
  const failure = new Error("save failed");

  await assert.rejects(
    () =>
      persistChatNow({
        saveChatDebounced: () => {
          debouncedCalls += 1;
        },
        saveChat: async () => {
          immediateCalls += 1;
          throw failure;
        },
      }),
    failure,
  );

  assert.equal(immediateCalls, 1);
  assert.equal(debouncedCalls, 1);
});

test("persistChatNow falls back to debounced save when immediate save is unavailable", async () => {
  let debouncedCalls = 0;

  await persistChatNow({
    saveChatDebounced: () => {
      debouncedCalls += 1;
    },
  });

  assert.equal(debouncedCalls, 1);
});

test("persistChatNowBestEffort swallows immediate save failures after queueing fallback", async () => {
  let debouncedCalls = 0;

  await persistChatNowBestEffort({
    saveChatDebounced: () => {
      debouncedCalls += 1;
    },
    saveChat: async () => {
      throw new Error("save failed");
    },
  });

  assert.equal(debouncedCalls, 1);
});

test("persistMetadataAndChatNowBestEffort preserves metadata queueing while using immediate chat save", async () => {
  let metadataCalls = 0;
  let debouncedCalls = 0;
  let immediateCalls = 0;

  await persistMetadataAndChatNowBestEffort({
    saveMetadataDebounced: () => {
      metadataCalls += 1;
    },
    saveChatDebounced: () => {
      debouncedCalls += 1;
    },
    saveChat: async () => {
      immediateCalls += 1;
    },
  });

  assert.equal(metadataCalls, 1);
  assert.equal(immediateCalls, 1);
  assert.equal(debouncedCalls, 0);
});
