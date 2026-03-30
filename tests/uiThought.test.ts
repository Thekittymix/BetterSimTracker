import test from "node:test";
import assert from "node:assert/strict";
import { hasThoughtOverflow, renderThoughtMarkup, shouldEnableThoughtExpand } from "../src/uiThought";

test("shouldEnableThoughtExpand enables for long one-line text", () => {
  const longBubble = "a".repeat(111);
  const longPanel = "b".repeat(81);
  assert.equal(shouldEnableThoughtExpand(longBubble, "bubble"), true);
  assert.equal(shouldEnableThoughtExpand(longPanel, "panel"), true);
});

test("shouldEnableThoughtExpand enables for multiline and disables for short text", () => {
  assert.equal(shouldEnableThoughtExpand("line1\nline2", "bubble"), true);
  assert.equal(shouldEnableThoughtExpand("short", "bubble"), false);
  assert.equal(shouldEnableThoughtExpand("   ", "panel"), false);
});

test("shouldEnableThoughtExpand catches wrapped sentence thoughts before they silently disappear behind the line clamp", () => {
  const wrappedPanelThought = "He keeps replaying the whole exchange in his head, trying to decide whether that pause meant fear, doubt, or a lie.";
  const wrappedBubbleThought = "She notices the tremor in his voice and quietly decides to keep smiling until she figures out whether he is bluffing or begging for help.";
  assert.equal(shouldEnableThoughtExpand(wrappedPanelThought, "panel"), true);
  assert.equal(shouldEnableThoughtExpand(wrappedBubbleThought, "bubble"), true);
});

test("renderThoughtMarkup renders escaped text and proper toggle state", () => {
  const text = "<unsafe> " + "x".repeat(200);
  const htmlCollapsed = renderThoughtMarkup(text, "k1", "bubble", false);
  assert.match(htmlCollapsed, /bst-mood-bubble/);
  assert.match(htmlCollapsed, /More thought/);
  assert.match(htmlCollapsed, /aria-expanded="false"/);
  assert.doesNotMatch(htmlCollapsed, /<unsafe>/);
  assert.match(htmlCollapsed, /&lt;unsafe&gt;/);

  const htmlExpanded = renderThoughtMarkup(text, "k1", "panel", true);
  assert.match(htmlExpanded, /bst-thought/);
  assert.match(htmlExpanded, /bst-thought-expanded/);
  assert.match(htmlExpanded, /Less thought/);
  assert.match(htmlExpanded, /aria-expanded="true"/);
});

test("hasThoughtOverflow only reports real rendered overflow", () => {
  assert.equal(hasThoughtOverflow({
    scrollHeight: 120,
    clientHeight: 80,
    scrollWidth: 0,
    clientWidth: 0,
  }), true);
  assert.equal(hasThoughtOverflow({
    scrollHeight: 80,
    clientHeight: 80,
    scrollWidth: 120,
    clientWidth: 80,
  }), true);
  assert.equal(hasThoughtOverflow({
    scrollHeight: 80,
    clientHeight: 80,
    scrollWidth: 80,
    clientWidth: 80,
  }), false);
});
