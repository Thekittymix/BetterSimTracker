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

test("settings modal seeds mood symbol numeric controls from saved settings on reopen", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /set\("moodSymbolMinWidth", String\(input\.settings\.moodSymbolMinWidth\)\)/);
  assert.match(source, /set\("moodSymbolMinHeight", String\(input\.settings\.moodSymbolMinHeight\)\)/);
  assert.match(source, /set\("moodSymbolBoxRadius", String\(input\.settings\.moodSymbolBoxRadius\)\)/);
  assert.match(source, /set\("moodSymbolFontSize", String\(input\.settings\.moodSymbolFontSize\)\)/);
});

test("settings modal exposes multi-character archive lifecycle controls in Extraction only", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /Auto-Archive Inactive/);
  assert.match(source, /Archive After Turns/);
  assert.match(source, /Dynamic Character Lifecycle/);
  assert.match(source, /entityTrackingMode === "dynamic_characters"/);
  assert.doesNotMatch(source, /Show Archived/);
});

test("settings modal exposes entity tracking mode control in Extraction", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /Entity Tracking Mode/);
  assert.match(source, /Dynamic Characters \(Experimental\)/);
});

test("settings modal diagnostics section exposes stable debug box hooks for live refresh", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /data-bst-row="latestDebugRecordBox"/);
  assert.match(source, /data-bst-row="latestInjectedPromptBox"/);
});

test("settings modal explains that explicit character macros are required for multi-target chats", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /When multiple character targets exist in the current chat, use explicit target macros/);
  assert.match(source, /examples\.length >= 6/);
});

test("settings modal collectSettings persists mood symbol numeric controls", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /moodSymbolMinWidth:\s*readNumber\("moodSymbolMinWidth"/);
  assert.match(source, /moodSymbolMinHeight:\s*readNumber\("moodSymbolMinHeight"/);
  assert.match(source, /moodSymbolBoxRadius:\s*readNumber\("moodSymbolBoxRadius"/);
  assert.match(source, /moodSymbolFontSize:\s*readNumber\("moodSymbolFontSize"/);
});

test("settings modal exposes live preview for non-dynamic injection placeholders", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /Static Placeholder Preview \(live\)/);
  assert.match(source, /data-bst-row="injectPromptPreview"/);
  assert.match(source, /Static preview below shows the non-dynamic placeholder blocks only/);
  assert.match(source, /\{\{statSemantics\}\}.*enabled built-in stat meanings plus enabled custom-stat descriptions/s);
});

test("settings modal numeric custom stat defaults do not fall back from zero to fifty", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /normalizeCustomNumericDefaultValue\(candidate\.defaultValue\)/);
  assert.doesNotMatch(source, /Number\(candidate\.defaultValue\) \|\| 50/);
});

test("custom stat wizard keeps text and array max-length fields distinct", () => {
  const source = fs.readFileSync(path.resolve("src/settingsModal.ts"), "utf8");
  assert.match(source, /data-bst-custom-field="textShortMaxLength"/);
  assert.match(source, /data-bst-custom-field="arrayTextMaxLength"/);
  assert.match(source, /const getTextMaxLengthField = \(\): HTMLInputElement \| null =>/);
  assert.match(source, /return getField\("arrayTextMaxLength"\) as HTMLInputElement \| null;/);
  assert.match(source, /return getField\("textShortMaxLength"\) as HTMLInputElement \| null;/);
  assert.doesNotMatch(source, /data-bst-custom-field="textMaxLength"/);
});

test("settings checkbox checked state keeps a visible non-color-mix fallback", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /\.bst-check input\[type="checkbox"\]::before \{[\s\S]*border-right: 2px solid rgba\(247, 250, 255, 0\.96\);/);
  assert.match(source, /\.bst-check input\[type="checkbox"\]:checked \{[\s\S]*border-color: #78c9ff;[\s\S]*background: linear-gradient\(180deg, #76c9ff, #2f87d7\);/);
});

test("index lazy-loads the settings modal through a cached dynamic import", () => {
  const source = fs.readFileSync(path.resolve("src/index.ts"), "utf8");
  assert.doesNotMatch(source, /import\s+\{\s*closeSettingsModal,\s*openSettingsModal\s*\}\s+from\s+"\.\/settingsModal"/);
  assert.match(source, /let settingsModalModulePromise: Promise<typeof import\("\.\/settingsModal"\)> \| null = null;/);
  assert.match(source, /function loadSettingsModalModule\(\): Promise<typeof import\("\.\/settingsModal"\)>/);
  assert.match(source, /settingsModalModulePromise = import\("\.\/settingsModal"\);/);
  assert.match(source, /const settingsModal = await loadSettingsModalModule\(\);[\s\S]*settingsModal\.openSettingsModal\(/);
});
