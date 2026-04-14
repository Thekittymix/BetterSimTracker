import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("card collapse toggles update locally without queueing a full rerender", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /function rerenderCardCollapseInPlace\(host: ParentNode, cardKey: string, collapsed: boolean\): void/);
  assert.match(source, /rerenderCardCollapseInPlace\(root, cardKey, nextCollapsed\);/);
  assert.doesNotMatch(source, /const cardCollapse[\s\S]*?root\.dataset\.bstRenderSignature = ""[\s\S]*?onRequestRerender\?\(\);/);
});

test("root collapse toggles cards in place without queueing a full rerender", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /root\.querySelectorAll<HTMLElement>\("\.bst-card\[data-bst-card-key\]"\)\.forEach\(card => \{[\s\S]*?rerenderCardCollapseInPlace\(root, cardKey, nextCollapsed\);[\s\S]*?\}\);/);
  assert.doesNotMatch(source, /const collapse = closestFromEventTarget\(target, '\[data-bst-action="toggle-all-collapse"\]'\);[\s\S]*?root\.dataset\.bstRenderSignature = ""[\s\S]*?onRequestRerender\?\(\);/);
});
