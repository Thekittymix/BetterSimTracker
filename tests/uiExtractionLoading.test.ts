import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExtractionLoadingCopy,
  resolveExtractionProgressDisplay,
  resolveExtractionProgressDisplayWithLabel,
} from "../src/ui";

test("resolveExtractionLoadingCopy explains resolver phases explicitly", () => {
  assert.deepEqual(resolveExtractionLoadingCopy(0, "Resolving active characters"), {
    title: "Resolving active characters",
    subtitle: "Determining who is active for this message before extraction.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(0, "Resolving multi-character aliases"), {
    title: "Resolving multi-character aliases",
    subtitle: "Matching source cards, aliases, and active owners before extraction.",
  });
});

test("resolveExtractionLoadingCopy explains baseline and later request phases", () => {
  assert.deepEqual(resolveExtractionLoadingCopy(0, "Building extraction baseline"), {
    title: "Building extraction baseline",
    subtitle: "Collecting recent messages, tracker history, and owner context for extraction.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(1, "Requesting Custom: Clothes"), {
    title: "Requesting Custom: Clothes",
    subtitle: "Requesting Custom: Clothes",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(2, "Parsing Built-in: mood"), {
    title: "Parsing Built-in: mood",
    subtitle: "Parsing Built-in: mood",
  });
});

test("resolveExtractionProgressDisplay keeps resolver preflight out of fake 1/1 stage math", () => {
  assert.deepEqual(resolveExtractionProgressDisplay(0, 0), {
    stageText: "preparing",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplay(0, 9), {
    stageText: "stage 1/9",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplay(2, 9), {
    stageText: "stage 3/9",
    percent: 22,
    ratio: 2 / 9,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(0, 1, "Resolving multi-character aliases"), {
    stageText: "preparing",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(0, 1, "Building extraction baseline"), {
    stageText: "preparing",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(0, 1, "Parsing Built-in: mood"), {
    stageText: "preparing",
    percent: 0,
    ratio: 0,
  });
});
