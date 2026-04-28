import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("lastThought edit surfaces use the 1200-character limit consistently", () => {
  const characterPanelSource = fs.readFileSync(path.resolve("src/characterPanel.ts"), "utf8");
  const personaPanelSource = fs.readFileSync(path.resolve("src/personaPanel.ts"), "utf8");
  const uiSource = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  const editModalSource = fs.readFileSync(path.resolve("src/editStatsModal.ts"), "utf8");

  assert.match(characterPanelSource, /const LAST_THOUGHT_DEFAULT_MAX_CHARS = 1200;/);
  assert.match(characterPanelSource, /maxlength="\$\{LAST_THOUGHT_DEFAULT_MAX_CHARS\}" data-bst-default="lastThought"/);
  assert.match(characterPanelSource, /slice\(0, LAST_THOUGHT_DEFAULT_MAX_CHARS\)/);

  assert.match(personaPanelSource, /const LAST_THOUGHT_DEFAULT_MAX_CHARS = 1200;/);
  assert.match(personaPanelSource, /maxlength="\$\{LAST_THOUGHT_DEFAULT_MAX_CHARS\}" data-bst-persona-default="lastThought"/);
  assert.match(personaPanelSource, /slice\(0, LAST_THOUGHT_DEFAULT_MAX_CHARS\)/);

  assert.match(uiSource, /export const MAX_EDIT_LAST_THOUGHT_CHARS = 1200;/);
  assert.match(editModalSource, /maxlength="\$\{MAX_EDIT_LAST_THOUGHT_CHARS\}" data-bst-edit-text="lastThought"/);
  assert.match(editModalSource, /slice\(0, MAX_EDIT_LAST_THOUGHT_CHARS\)/);
});
