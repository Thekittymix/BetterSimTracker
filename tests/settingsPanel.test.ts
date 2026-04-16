import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("settings panel skips full innerHTML rebuild when the visible panel signature is unchanged", () => {
  const source = fs.readFileSync(path.resolve("src/settingsPanel.ts"), "utf8");
  assert.match(source, /function buildPanelSignature\(settings: BetterSimTrackerSettings\): string/);
  assert.match(source, /const signature = buildPanelSignature\(input\.settings\);/);
  assert.match(source, /if \(panel\.dataset\.bstSignature === signature\) \{\s*return;\s*\}/);
  assert.match(source, /panel\.dataset\.bstSignature = signature;/);
});

