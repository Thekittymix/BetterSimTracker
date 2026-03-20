import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SETTINGS_PRIMARY_SECTION_LABELS, SETTINGS_SECTION_IDS } from "../src/settingsModalSections";
import { BST_UI_SURFACE_CONTRACT, SETTINGS_SUBDRAWER_STYLE_CONTRACT } from "../src/ui";

test("settings modal exposes the new primary section outline", () => {
  assert.deepEqual(SETTINGS_PRIMARY_SECTION_LABELS, [
    "Setup",
    "Extraction",
    "Context Sources",
    "User Tracking",
    "Prompt Injection",
    "Tracking Schema",
    "Display",
    "Prompts",
    "Diagnostics",
  ]);
});

test("settings modal section ids stay aligned with the primary outline", () => {
  assert.deepEqual(SETTINGS_SECTION_IDS, {
    "Setup": "setup",
    "Extraction": "extraction",
    "Context Sources": "context-sources",
    "User Tracking": "user-tracking",
    "Prompt Injection": "prompt-injection",
    "Tracking Schema": "tracking-schema",
    "Display": "display",
    "Prompts": "prompts",
    "Diagnostics": "diagnostics",
  });
});

test("settings modal subdrawer style contract keeps drawer-like chevron affordance", () => {
  assert.equal(SETTINGS_SUBDRAWER_STYLE_CONTRACT.chevronIcon, "\\f13a");
  assert.equal(SETTINGS_SUBDRAWER_STYLE_CONTRACT.chevronSize, 28);
  assert.equal(SETTINGS_SUBDRAWER_STYLE_CONTRACT.summaryMinHeight, 44);
  assert.equal(SETTINGS_SUBDRAWER_STYLE_CONTRACT.closedRotationDeg, -90);
  assert.equal(SETTINGS_SUBDRAWER_STYLE_CONTRACT.openRotationDeg, 0);
});

test("settings and related surfaces share the common UI surface contract", () => {
  assert.deepEqual(BST_UI_SURFACE_CONTRACT, {
    headerClass: "bst-surface-header",
    footerClass: "bst-surface-footer",
    disclosureIconClass: "bst-disclosure-icon",
  });
});

test("settings modal exposes the global mood symbol fallback map controls", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /data-bst-row="globalMoodSymbolMap"/);
  assert.match(source, /data-bst-global-mood-symbol/);
});

test("settings modal exposes mood symbol chip display controls in Card Appearance", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /Mood Symbol Min Width/);
  assert.match(source, /Mood Symbol Min Height/);
  assert.match(source, /Mood Symbol Radius/);
  assert.match(source, /Mood Symbol Font Size/);
});

test("settings modal exposes entity tracking mode control in Extraction", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /Entity Tracking Mode/);
  assert.match(source, /Multi-Character \(Experimental\)/);
});
