import test from "node:test";
import assert from "node:assert/strict";

import {
  formatExtractionProgressStageText,
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
    subtitle: "Waiting for the tracker response from the selected AI backend.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(0, "Requesting JSON stats extraction"), {
    title: "Requesting JSON stats extraction",
    subtitle: "Waiting for the JSON stats response from the selected AI backend.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(1, "Parsing JSON stats extraction"), {
    title: "Parsing JSON stats extraction",
    subtitle: "Validating the structured JSON stats response.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(2, "Applying JSON stats extraction"), {
    title: "Applying JSON stats extraction",
    subtitle: "Applying the parsed JSON stat values to the current message.",
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

test("resolveExtractionProgressDisplayWithLabel uses real extraction phase names instead of fake stage labels", () => {
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(0, 3, "Requesting JSON stats extraction"), {
    stageText: "requesting",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(1, 3, "Parsing JSON stats extraction"), {
    stageText: "parsing",
    percent: 33,
    ratio: 1 / 3,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(2, 3, "Applying JSON stats extraction"), {
    stageText: "applying",
    percent: 67,
    ratio: 2 / 3,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(3, 3, "Finalizing"), {
    stageText: "finalizing",
    percent: 100,
    ratio: 1,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(12, 30, "Requesting mood"), {
    stageText: "requesting",
    percent: 40,
    ratio: 0.4,
  });
});

test("formatExtractionProgressStageText only appends percentages to generic stage counters", () => {
  assert.equal(formatExtractionProgressStageText({
    stageText: "stage 1/3",
    percent: 0,
  }), "stage 1/3 (0%)");
  assert.equal(formatExtractionProgressStageText({
    stageText: "requesting",
    percent: 33,
  }), "requesting");
  assert.equal(formatExtractionProgressStageText({
    stageText: "parsing",
    percent: 67,
  }), "parsing");
  assert.equal(formatExtractionProgressStageText({
    stageText: "applying",
    percent: 100,
  }), "applying");
  assert.equal(formatExtractionProgressStageText({
    stageText: "finalizing",
    percent: 100,
  }), "finalizing");
  assert.equal(formatExtractionProgressStageText({
    stageText: "preparing",
    percent: 0,
  }), "preparing");
});
