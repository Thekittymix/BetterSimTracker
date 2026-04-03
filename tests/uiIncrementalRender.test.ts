import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/ui";

function makeDataset(values?: Record<string, string>): { dataset: Record<string, string> } {
  return { dataset: { ...(values ?? {}) } };
}

test("ui dirty-render skip allows reusing an idle tracker root before the dirty cutoff", () => {
  const root = makeDataset({
    bstRenderPhase: "idle",
    bstRenderSignature: "msg:10|sig",
  });
  const sceneRoot = makeDataset({
    bstRenderPhase: "idle",
    bstRenderSignature: "scene:10|sig",
  });

  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(root as any, sceneRoot as any, 10, 11), true);
  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(root as any, sceneRoot as any, 10, null), true);
});

test("ui dirty-render skip blocks reuse at or after the dirty cutoff", () => {
  const root = makeDataset({
    bstRenderPhase: "idle",
    bstRenderSignature: "msg:10|sig",
  });

  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(root as any, null, 10, 10), false);
  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(root as any, null, 12, 10), false);
});

test("ui dirty-render skip blocks reuse when the existing root is not a stable idle render", () => {
  const missingSignature = makeDataset({
    bstRenderPhase: "idle",
  });
  const extracting = makeDataset({
    bstRenderPhase: "extracting",
    bstRenderSignature: "old",
  });
  const sceneRootMissing = makeDataset({
    bstRenderPhase: "idle",
  });
  const stableRoot = makeDataset({
    bstRenderPhase: "idle",
    bstRenderSignature: "root",
  });

  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(missingSignature as any, null, 9, null), false);
  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(extracting as any, null, 9, null), false);
  assert.equal(__testables.shouldSkipIdleTrackerEntryRender(stableRoot as any, sceneRootMissing as any, 9, null), false);
});
