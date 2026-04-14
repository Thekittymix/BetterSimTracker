import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("edit surfaces render text_short custom stats with textarea editors", () => {
  const editModalSource = fs.readFileSync(path.resolve("src/editStatsModal.ts"), "utf8");
  const characterPanelSource = fs.readFileSync(path.resolve("src/characterPanel.ts"), "utf8");
  const personaPanelSource = fs.readFileSync(path.resolve("src/personaPanel.ts"), "utf8");

  assert.match(editModalSource, /<textarea rows="3" maxlength="\$\{def\.textMaxLength\}" data-bst-edit-non-numeric="\$\{escapeHtml\(def\.id\)\}" data-bst-edit-kind="text_short"/);
  assert.doesNotMatch(editModalSource, /<input type="text" maxlength="\$\{def\.textMaxLength\}" data-bst-edit-non-numeric="\$\{escapeHtml\(def\.id\)\}" data-bst-edit-kind="text_short"/);

  assert.match(characterPanelSource, /<textarea rows="3" maxlength="\$\{maxLength\}" data-bst-custom-default-text="\$\{escapeHtml\(id\)\}"/);
  assert.doesNotMatch(characterPanelSource, /<input type="text" maxlength="\$\{maxLength\}" data-bst-custom-default-text="\$\{escapeHtml\(id\)\}"/);
  assert.match(characterPanelSource, /panel\.querySelectorAll<HTMLTextAreaElement>\("\[data-bst-custom-default-text\]"\)/);

  assert.match(personaPanelSource, /<textarea rows="3" maxlength="\$\{maxLength\}" data-bst-persona-custom-default-text="\$\{escapeHtml\(id\)\}"/);
  assert.doesNotMatch(personaPanelSource, /<input type="text" maxlength="\$\{maxLength\}" data-bst-persona-custom-default-text="\$\{escapeHtml\(id\)\}"/);
  assert.match(personaPanelSource, /panel\.querySelectorAll<HTMLTextAreaElement>\("\[data-bst-persona-custom-default-text\]"\)/);
});
