import test from "node:test";
import assert from "node:assert/strict";

import { applySettingsRuntimeTransition } from "../src/settingsRuntimeTransition";

test("applySettingsRuntimeTransition routes disable transitions to the disable branch", () => {
  const calls: string[] = [];

  applySettingsRuntimeTransition({
    previousEnabled: true,
    nextEnabled: false,
    onDisable: () => calls.push("disable"),
    onEnable: () => calls.push("enable"),
    onUnchanged: () => calls.push("unchanged"),
  });

  assert.deepEqual(calls, ["disable"]);
});

test("applySettingsRuntimeTransition routes enable transitions to the enable branch", () => {
  const calls: string[] = [];

  applySettingsRuntimeTransition({
    previousEnabled: false,
    nextEnabled: true,
    onDisable: () => calls.push("disable"),
    onEnable: () => calls.push("enable"),
    onUnchanged: () => calls.push("unchanged"),
  });

  assert.deepEqual(calls, ["enable"]);
});

test("applySettingsRuntimeTransition keeps unchanged enabled state on the unchanged branch", () => {
  const calls: string[] = [];

  applySettingsRuntimeTransition({
    previousEnabled: true,
    nextEnabled: true,
    onDisable: () => calls.push("disable"),
    onEnable: () => calls.push("enable"),
    onUnchanged: () => calls.push("unchanged"),
  });

  assert.deepEqual(calls, ["unchanged"]);
});
