import { strict as assert } from "node:assert";
import test from "node:test";
import { normalizeRefreshTargetMessageIndex } from "../src/windowApi";

test("normalizeRefreshTargetMessageIndex preserves omitted refresh target", () => {
  assert.equal(normalizeRefreshTargetMessageIndex(), undefined);
  assert.equal(normalizeRefreshTargetMessageIndex(null), undefined);
  assert.equal(normalizeRefreshTargetMessageIndex({}), undefined);
});

test("normalizeRefreshTargetMessageIndex accepts non-negative integer message indices", () => {
  assert.equal(normalizeRefreshTargetMessageIndex(0), 0);
  assert.equal(normalizeRefreshTargetMessageIndex(12), 12);
  assert.equal(normalizeRefreshTargetMessageIndex({ messageIndex: 3 }), 3);
});

test("normalizeRefreshTargetMessageIndex rejects unsafe refresh targets", () => {
  assert.equal(normalizeRefreshTargetMessageIndex(-1), undefined);
  assert.equal(normalizeRefreshTargetMessageIndex(1.5), undefined);
  assert.equal(normalizeRefreshTargetMessageIndex(Number.NaN), undefined);
  assert.equal(normalizeRefreshTargetMessageIndex({ messageIndex: "4" }), undefined);
});
