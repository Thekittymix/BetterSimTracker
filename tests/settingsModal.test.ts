import test from "node:test";
import assert from "node:assert/strict";

import { SETTINGS_PRIMARY_SECTION_LABELS, SETTINGS_SECTION_IDS } from "../src/settingsModalSections";
import { SETTINGS_SUBDRAWER_STYLE_CONTRACT } from "../src/ui";

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
});
