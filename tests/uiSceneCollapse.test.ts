import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("scene collapse toggles update locally without queueing a full rerender", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /function rerenderSceneCollapseInPlace\(host: ParentNode \| null \| undefined, collapsed: boolean, title: string\): void/);
  assert.match(source, /rerenderSceneCollapseInPlace\(root, nextCollapsed, settings\.sceneCardTitle\);/);
  assert.match(source, /rerenderSceneCollapseInPlace\(sceneRoot, nextCollapsed, settings\.sceneCardTitle\);/);
  assert.doesNotMatch(source, /const sceneCollapse = closestFromEventTarget\(target, '\[data-bst-action="toggle-scene-collapse"\]'\);[\s\S]*?onRequestRerender\?\(\);/);
});

