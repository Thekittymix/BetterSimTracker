import test from "node:test";
import assert from "node:assert/strict";

import {
  readManualInactiveCharacters,
  resolveActiveCharacterAnalysis,
  setManualInactiveCharacter,
} from "../src/activity";
import { defaultSettings } from "../src/settings";
import type { STContext } from "../src/types";

function makeContext(): STContext {
  return {
    groupId: "group-1",
    groups: [{ id: "group-1", members: ["alice.png", "billie.png"] }],
    characters: [
      { name: "Alice", avatar: "alice.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
    chatMetadata: {},
    chat: [
      { name: "Alice", mes: "Alice opens the scene.", is_user: false, is_system: false },
      { name: "User", mes: "Okay.", is_user: true, is_system: false },
      { name: "Billie", mes: "Billie talks.", is_user: false, is_system: false },
      { name: "User", mes: "Go on.", is_user: true, is_system: false },
      { name: "Billie", mes: "Billie keeps talking.", is_user: false, is_system: false },
      { name: "User", mes: "Continue.", is_user: true, is_system: false },
      { name: "Billie", mes: "Still Billie.", is_user: false, is_system: false },
      { name: "User", mes: "Sure.", is_user: true, is_system: false },
      { name: "Billie", mes: "Latest Billie turn.", is_user: false, is_system: false },
    ],
  };
}

test("activity analysis does not keep stale speakers active for the old long persistence window", () => {
  const context = makeContext();
  const result = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });

  assert.deepEqual(result.activeCharacters, ["Billie"]);
  assert.match(result.reasons.Alice, /not seen in recent activity window/i);
});

test("manual inactive override persists across activity resolution and can be cleared", () => {
  const context = makeContext();

  const inactive = setManualInactiveCharacter(context, "Billie", true);
  assert.deepEqual(inactive, ["Billie"]);
  assert.deepEqual(readManualInactiveCharacters(context), ["Billie"]);

  const inactiveResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });
  assert.deepEqual(inactiveResult.activeCharacters, []);
  assert.equal(inactiveResult.reasons.Billie, "manual inactive override");
  assert.deepEqual(inactiveResult.manualInactiveCharacters, ["Billie"]);

  const cleared = setManualInactiveCharacter(context, "Billie", false);
  assert.deepEqual(cleared, []);
  assert.deepEqual(readManualInactiveCharacters(context), []);

  const clearedResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });
  assert.deepEqual(clearedResult.activeCharacters, ["Billie"]);
});
