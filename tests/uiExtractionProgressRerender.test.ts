import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("extraction progress can update the loading box in place instead of requiring a full queueRender", () => {
  const uiSource = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  const indexSource = fs.readFileSync(path.resolve("src/index.ts"), "utf8");

  assert.match(uiSource, /export function rerenderExtractionLoadingInPlace\(\s*messageIndex: number,\s*uiState: TrackerUiState,\s*\): boolean/);
  assert.match(uiSource, /data-bst-loading-role="title"/);
  assert.match(uiSource, /data-bst-loading-role="stage"/);
  assert.match(uiSource, /data-bst-loading-role="fill"/);
  assert.match(uiSource, /data-bst-loading-role="subtitle"/);
  assert.match(indexSource, /if \(!rerenderExtractionLoadingInPlace\(lastIndex, trackerUiState\)\) \{\s*queueRender\(\);\s*\}/);
});

