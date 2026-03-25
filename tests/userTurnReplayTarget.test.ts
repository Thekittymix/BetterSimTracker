import test from "node:test";
import assert from "node:assert/strict";

import { resolveGroupReplayTarget } from "../src/userTurnReplayTarget";

test("resolveGroupReplayTarget skips replay when resolver explicitly says scene is empty", () => {
  assert.deepEqual(
    resolveGroupReplayTarget({
      currentForcedChar: null,
      enabledIndices: [0, 1, 2],
      resolvedSceneOwnerIndices: [],
      lastAiCharacterIndex: 1,
      currentCharacterId: 1,
    }),
    {
      forceChid: null,
      skipReplay: true,
      skipReason: "group_replay_no_scene_owner",
      source: "resolved_scene_empty",
    },
  );
});

test("resolveGroupReplayTarget forces the single resolver-backed owner", () => {
  assert.deepEqual(
    resolveGroupReplayTarget({
      currentForcedChar: null,
      enabledIndices: [0, 1, 2],
      resolvedSceneOwnerIndices: [2],
      lastAiCharacterIndex: 1,
      currentCharacterId: 1,
    }),
    {
      forceChid: 2,
      skipReplay: false,
      skipReason: null,
      source: "resolved_scene_single",
    },
  );
});

test("resolveGroupReplayTarget keeps a valid current forced character when it matches resolver scene", () => {
  assert.deepEqual(
    resolveGroupReplayTarget({
      currentForcedChar: 1,
      enabledIndices: [0, 1, 2],
      resolvedSceneOwnerIndices: [1, 2],
      lastAiCharacterIndex: 2,
      currentCharacterId: 0,
    }),
    {
      forceChid: 1,
      skipReplay: false,
      skipReason: null,
      source: "resolved_scene_current_forced",
    },
  );
});

test("resolveGroupReplayTarget leaves multi-owner resolver scenes unforced", () => {
  assert.deepEqual(
    resolveGroupReplayTarget({
      currentForcedChar: null,
      enabledIndices: [0, 1, 2],
      resolvedSceneOwnerIndices: [1, 2],
      lastAiCharacterIndex: 2,
      currentCharacterId: 0,
    }),
    {
      forceChid: null,
      skipReplay: false,
      skipReason: null,
      source: "resolved_scene_multi",
    },
  );
});

test("resolveGroupReplayTarget falls back to the last AI speaker when no resolver scene exists", () => {
  assert.deepEqual(
    resolveGroupReplayTarget({
      currentForcedChar: null,
      enabledIndices: [0, 1, 2],
      resolvedSceneOwnerIndices: null,
      lastAiCharacterIndex: 2,
      currentCharacterId: 0,
    }),
    {
      forceChid: 2,
      skipReplay: false,
      skipReason: null,
      source: "last_ai",
    },
  );
});
