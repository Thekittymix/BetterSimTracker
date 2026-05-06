import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function extractAround(source: string, marker: string, radius = 300): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing marker: ${marker}`);
  return source.slice(start, Math.min(source.length, start + radius));
}

test("settings save paths delegate to the shared runtime settings update helper", () => {
  const source = fs.readFileSync(path.resolve("src/index.ts"), "utf8");
  const panelSaveSegment = extractAround(source, "onSave: patch => {");
  const modalSaveSegment = extractAround(source, "onSave: next => {");

  assert.match(panelSaveSegment, /applyRuntimeSettingsUpdate\(context, \{ \.\.\.settings, \.\.\.patch \}, "settings_panel"\);/);
  assert.doesNotMatch(panelSaveSegment, /queueRender\(\);/);

  assert.match(modalSaveSegment, /applyRuntimeSettingsUpdate\(activeContext, next, "settings_modal"\);/);
  assert.doesNotMatch(modalSaveSegment, /queueRender\(\);/);
});

test("settings-adjacent refresh callbacks suppress bootstrap scheduling side effects", () => {
  const source = fs.readFileSync(path.resolve("src/index.ts"), "utf8");
  assert.match(source, /onClearDiagnostics: \(\) => \{[\s\S]*?pushTrace\("diagnostics\.cleared"\);[\s\S]*?refreshFromStoredData\(\{\s*allowBootstrapScheduling: false,\s*syncDynamicCharactersPanel: false,\s*syncSettingsPanel: false,\s*\}\);[\s\S]*?\}/);
  assert.match(source, /initCharacterPanel\(\{[\s\S]*?onSettingsUpdated: \(\) => refreshFromStoredData\(\{\s*allowBootstrapScheduling: false,\s*syncDynamicCharactersPanel: false,\s*syncSettingsPanel: false,\s*\}\)/);
  assert.match(source, /initPersonaPanel\(\{[\s\S]*?onSettingsUpdated: \(\) => refreshFromStoredData\(\{\s*allowBootstrapScheduling: false,\s*syncDynamicCharactersPanel: false,\s*syncSettingsPanel: false,\s*\}\)/);
  assert.match(source, /initDynamicCharactersPanel\(\{[\s\S]*?onStateChanged: \(\) => refreshFromStoredData\(\{\s*allowBootstrapScheduling: false,\s*syncDynamicCharactersPanel: false,\s*syncSettingsPanel: false,\s*\}\)/);
  assert.match(source, /pushTrace\("tracker\.edit", \{[\s\S]*?refreshFromStoredData\(\{\s*allowBootstrapScheduling: false,\s*syncSettingsPanel: false,\s*\}\);/);
});
