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
    subtitle: "Waiting for the tracker response from the selected AI backend.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(0, "Requesting full JSON extraction"), {
    title: "Requesting full JSON extraction",
    subtitle: "Waiting for one JSON response containing all enabled stats and active owners.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(1, "Parsing full JSON extraction"), {
    title: "Parsing full JSON extraction",
    subtitle: "Validating the structured JSON tracker response.",
  });
  assert.deepEqual(resolveExtractionLoadingCopy(2, "Applying full JSON extraction"), {
    title: "Applying full JSON extraction",
    subtitle: "Applying the parsed JSON tracker values to the current message.",
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
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(0, 3, "Requesting full JSON extraction"), {
    stageText: "requesting",
    percent: 0,
    ratio: 0,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(1, 3, "Parsing full JSON extraction"), {
    stageText: "parsing",
    percent: 33,
    ratio: 1 / 3,
  });
  assert.deepEqual(resolveExtractionProgressDisplayWithLabel(2, 3, "Applying full JSON extraction"), {
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
