import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderTextShortMarkup, resolveTextShortToggleState, shouldEnableTextShortExpand } from "../src/uiTextShort";

test("shouldEnableTextShortExpand enables for multiline and long text", () => {
  assert.equal(shouldEnableTextShortExpand("line1\nline2"), true);
  assert.equal(shouldEnableTextShortExpand("short value"), false);
  assert.equal(
    shouldEnableTextShortExpand("He keeps his hand on the flashlight while quietly counting each breath in the room before anyone can panic again."),
    true,
  );
});

test("renderTextShortMarkup renders hidden toggle by default for expandable values", () => {
  const html = renderTextShortMarkup({
    text: "He keeps his hand on the flashlight while quietly counting each breath in the room before anyone can panic again.",
    key: "pose:test",
    color: "#fff",
    expanded: false,
  });
  assert.match(html, /data-bst-text-short-container="1"/);
  assert.match(html, /data-bst-action="toggle-text-short"/);
  assert.match(html, /bst-expand-toggle/);
  assert.match(html, /hidden/);
  assert.match(html, />More</);
});

test("renderTextShortMarkup omits toggle for short values", () => {
  const html = renderTextShortMarkup({
    text: "Short value",
    key: "pose:test",
    color: "#fff",
    expanded: false,
  });
  assert.doesNotMatch(html, /toggle-text-short/);
});

test("resolveTextShortToggleState exposes toggle only on real overflow", () => {
  assert.deepEqual(
    resolveTextShortToggleState({ scrollHeight: 59, clientHeight: 45, scrollWidth: 0, clientWidth: 0 }, false),
    { overflowing: true, hidden: false, ariaExpanded: "false", label: "More" },
  );
  assert.deepEqual(
    resolveTextShortToggleState({ scrollHeight: 45, clientHeight: 45, scrollWidth: 0, clientWidth: 0 }, true),
    { overflowing: false, hidden: true, ariaExpanded: "false", label: "More" },
  );
});

test("mobile-facing more toggles keep an explicit tap target and pointer-safe CSS", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /\.bst-expand-toggle \{[\s\S]*min-height: 28px !important;[\s\S]*touch-action: manipulation;[\s\S]*pointer-events: auto;[\s\S]*position: relative;[\s\S]*z-index: 1;/);
  assert.match(source, /\.bst-array-toggle \{[\s\S]*min-height: 28px;[\s\S]*touch-action: manipulation;[\s\S]*pointer-events: auto;[\s\S]*position: relative;[\s\S]*z-index: 1;/);
});
