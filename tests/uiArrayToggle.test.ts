import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("array more toggles keep overflow items in DOM for in-place fallback expansion", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /data-bst-action="toggle-array-values"/);
  assert.match(source, /bst-array-item-chip[\s\S]*index >= 4 \? " hidden" : ""/);
  assert.match(source, /bst-array-item-chip[\s\S]*index >= arrayLimit \? " hidden" : ""/);
});

test("array more toggles can expand in place when a full rerender callback is unavailable", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /function rerenderArrayToggleInPlace\(host: ParentNode, key: string, expanded: boolean\)/);
  assert.match(source, /if \(onRequestRerender\) \{\s*onRequestRerender\(\);\s*\} else \{\s*rerenderArrayToggleInPlace\(root, key, !wasExpanded\);\s*\}/);
  assert.match(source, /if \(onRequestRerender\) \{\s*onRequestRerender\(\);\s*\} else \{\s*rerenderArrayToggleInPlace\(sceneRoot, key, !wasExpanded\);\s*\}/);
});
