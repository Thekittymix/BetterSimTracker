import test from "node:test";
import assert from "node:assert/strict";

import { defaultSettings } from "../src/settings";
import {
  applyConfidenceScaledDelta,
  buildNoActiveContinuityTrackerData,
  buildPromptCurrentTrackerData,
  enabledBuiltInAndTextStats,
  enabledCustomStats,
  groupCustomStatsForSequential,
  isManualExtractionReason,
  normalizeSequentialGroupId,
  resolveBaselineBeforeIndex,
  resolveMoodWithConfidence,
  selectNoActiveContinuityTrackerEntry,
  shouldBypassConfidenceControls,
} from "../src/extractorHelpers";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import type { BetterSimTrackerSettings, CustomStatDefinition } from "../src/types";

function makeSettings(overrides: Partial<BetterSimTrackerSettings> = {}): BetterSimTrackerSettings {
  return { ...defaultSettings, ...overrides };
}

function textStat(id: string, group = ""): CustomStatDefinition {
  return {
    id,
    label: id,
    kind: "text_short",
    defaultValue: "",
    track: true,
    includeInInjection: true,
    showOnCard: true,
    showInGraph: false,
    textMaxLength: 120,
    sequentialGroup: group,
  };
}

test("normalizeSequentialGroupId sanitizes, lowers and clamps group id", () => {
  assert.equal(normalizeSequentialGroupId("  Clothes + Pose  "), "clothes_pose");
  assert.equal(normalizeSequentialGroupId(""), "");
  assert.equal(normalizeSequentialGroupId("A".repeat(80)).length, 32);
});

test("enabledBuiltInAndTextStats returns enabled built-ins only", () => {
  const settings = makeSettings({
    trackAffection: true,
    trackTrust: false,
    trackDesire: true,
    trackConnection: false,
    trackMood: true,
    trackLastThought: false,
  });
  assert.deepEqual(enabledBuiltInAndTextStats(settings), ["affection", "desire", "mood"]);
});

test("enabledCustomStats returns tracked-only custom definitions", () => {
  const settings = makeSettings({
    customStats: [
      textStat("a"),
      { ...textStat("b"), track: false },
      textStat("c"),
    ],
  });
  assert.deepEqual(
    enabledCustomStats(settings).map(stat => stat.id),
    ["a", "c"],
  );
});

test("groupCustomStatsForSequential groups by sanitized group id when enabled", () => {
  const stats = [
    textStat("clothes", "appearance"),
    textStat("pose", " Appearance "),
    textStat("vitals", ""),
    textStat("goal", "goal@group"),
  ];
  const groups = groupCustomStatsForSequential(stats, true);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].map(stat => stat.id), ["clothes", "pose"]);
  assert.deepEqual(groups[1].map(stat => stat.id), ["goal"]);
  assert.deepEqual(groups[2].map(stat => stat.id), ["vitals"]);
});

test("groupCustomStatsForSequential keeps one-stat groups when disabled", () => {
  const stats = [textStat("clothes", "appearance"), textStat("pose", "appearance")];
  const groups = groupCustomStatsForSequential(stats, false);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map(stat => stat.id), ["clothes"]);
  assert.deepEqual(groups[1].map(stat => stat.id), ["pose"]);
});

test("isManualExtractionReason only allows manual refresh flows", () => {
  assert.equal(isManualExtractionReason("manual_refresh"), true);
  assert.equal(isManualExtractionReason("manual_refresh_retry"), true);
  assert.equal(isManualExtractionReason("GENERATION_ENDED"), false);
  assert.equal(isManualExtractionReason("USER_MESSAGE_RENDERED"), false);
});

test("shouldBypassConfidenceControls covers retrack and edited-message flows", () => {
  assert.equal(shouldBypassConfidenceControls("manual_refresh"), true);
  assert.equal(shouldBypassConfidenceControls("manual_refresh_retry"), true);
  assert.equal(shouldBypassConfidenceControls("USER_MESSAGE_EDITED"), true);
  assert.equal(shouldBypassConfidenceControls("MESSAGE_EDITED"), true);
  assert.equal(shouldBypassConfidenceControls("GENERATION_ENDED"), false);
});

test("applyConfidenceScaledDelta uses confidence scaling by default", () => {
  const next = applyConfidenceScaledDelta({
    previousValue: 50,
    delta: 10,
    confidence: 0.2,
    confidenceDampening: 1,
    maxDeltaPerTurn: 15,
  });
  assert.equal(next, 52);
});

test("applyConfidenceScaledDelta bypasses confidence scaling when requested", () => {
  const next = applyConfidenceScaledDelta({
    previousValue: 50,
    delta: 10,
    confidence: 0.2,
    confidenceDampening: 1,
    maxDeltaPerTurn: 15,
    bypassConfidenceControls: true,
  });
  assert.equal(next, 60);
});

test("resolveMoodWithConfidence keeps previous mood only when confidence controls are active", () => {
  assert.equal(
    resolveMoodWithConfidence({
      previousMood: "Neutral",
      nextMood: "Excited",
      confidence: 0.2,
      moodStickiness: 0.5,
    }),
    "Neutral",
  );
  assert.equal(
    resolveMoodWithConfidence({
      previousMood: "Neutral",
      nextMood: "Excited",
      confidence: 0.2,
      moodStickiness: 0.5,
      bypassConfidenceControls: true,
    }),
    "Excited",
  );
});

test("resolveBaselineBeforeIndex excludes the current message for retrack baselines", () => {
  assert.equal(
    resolveBaselineBeforeIndex({ targetMessageIndex: 4, lastIndex: 4 }),
    4,
  );
  assert.equal(
    resolveBaselineBeforeIndex({ targetMessageIndex: 2, lastIndex: 4 }),
    2,
  );
  assert.equal(
    resolveBaselineBeforeIndex({ lastIndex: 4 }),
    4,
  );
});

test("buildPromptCurrentTrackerData prefers the current resolver entityResolution over stale previous tracker data", () => {
  const tracker = buildPromptCurrentTrackerData({
    activeCharacters: ["Blake"],
    entityResolution: {
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    },
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Ashley", "Garret"],
      entityResolution: {
        sceneOwners: ["Ashley", "Garret"],
        messageOwners: ["Ashley", "Garret"],
        sceneEntityIds: ["ent-ashley", "ent-garret"],
        messageEntityIds: ["ent-ashley", "ent-garret"],
        source: "fallback",
      },
      statistics: {
        affection: { Ashley: 60 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    previousStatistics: {
      affection: { Blake: 52 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: {},
  });

  assert.deepEqual(tracker.activeCharacters, ["Blake"]);
  assert.deepEqual(tracker.entityResolution, {
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["ent-blake"],
    messageEntityIds: ["ent-blake"],
    source: "model",
  });
  assert.deepEqual(tracker.statistics.affection, { Blake: 52 });
});

test("buildNoActiveContinuityTrackerData preserves continuity stats while keeping scene continuity and clearing active resolver state", () => {
  const snapshot = buildNoActiveContinuityTrackerData({
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Blake"],
      entityResolution: {
        sceneOwners: ["Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-blake"],
        messageEntityIds: ["ent-blake"],
        source: "model",
      },
      statistics: {
        affection: { Blake: 55 },
        trust: {},
        desire: {},
        connection: {},
        mood: { Blake: "Neutral" },
        lastThought: { Blake: "Finally some quiet." },
      },
      customStatistics: {},
      customNonNumericStatistics: {
        pose: { Blake: "Standing in the doorway." },
      },
      entityOwnerMap: {
        Blake: {
          entityId: "ent-blake",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["Blackout Blake"],
          sourceKey: "camp.png|camp",
          kind: "multi_character_alias",
        },
      },
    },
    timestamp: 999,
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.timestamp, 999);
  assert.deepEqual(snapshot?.activeCharacters, []);
  assert.deepEqual(snapshot?.entityResolution, {
    sceneOwners: ["Blake"],
    messageOwners: [],
    sceneEntityIds: ["ent-blake"],
    messageEntityIds: [],
    source: "model",
  });
  assert.deepEqual(snapshot?.statistics.affection, { Blake: 55 });
  assert.deepEqual(snapshot?.statistics.mood, { Blake: "Neutral" });
  assert.deepEqual(snapshot?.customNonNumericStatistics, {
    pose: { Blake: "Standing in the doorway." },
  });
  assert.deepEqual(snapshot?.entityOwnerMap, {
    Blake: {
      entityId: "ent-blake",
      ownerName: "Blake",
      canonicalName: "Blake",
      aliases: ["Blackout Blake"],
      sourceKey: "camp.png|camp",
      kind: "multi_character_alias",
    },
  });
});

test("buildNoActiveContinuityTrackerData overlays latest scene and user continuity without wiping prior character continuity", () => {
  const snapshot = buildNoActiveContinuityTrackerData({
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Blake"],
      entityResolution: {
        sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
        messageEntityIds: ["ent-blake"],
        source: "model",
      },
      statistics: {
        affection: { Blake: 48 },
        trust: { Blake: 50 },
        desire: { Blake: 50 },
        connection: { Blake: 49 },
        mood: { [USER_TRACKER_KEY]: "Neutral", Blake: "Frustrated" },
        lastThought: {
          [USER_TRACKER_KEY]: "I want to see if Blake will actually follow my instructions.",
          Blake: "Great, another would-be director trying to script my lines.",
        },
      },
      customStatistics: {},
      customNonNumericStatistics: {
        clothes: {
          [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
          Blake: ["oversized baggy dark emo goth clothes", "heavy charcoal eyeliner"],
        },
        characters_in_scene: {
          [GLOBAL_TRACKER_KEY]: ["Jones", "Blake", "Raleigh", "Ashley", "Garret", "Kuba"],
        },
        pose: {
          [USER_TRACKER_KEY]: "Unknown",
          Blake: "Smirking with arms crossed over his chest",
        },
        scene_date_time: {
          [GLOBAL_TRACKER_KEY]: "2026-03-04 20:05",
        },
      },
    },
    latestSceneTrackerData: {
      timestamp: 2,
      activeCharacters: [USER_TRACKER_KEY],
      entityResolution: {
        sceneOwners: [],
        messageOwners: [USER_TRACKER_KEY],
        sceneEntityIds: [],
        messageEntityIds: [],
        source: "fallback",
      },
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: { [USER_TRACKER_KEY]: "Neutral" },
        lastThought: { [USER_TRACKER_KEY]: "Finally, I have a moment of peace and quiet to myself in this office." },
      },
      customStatistics: {},
      customNonNumericStatistics: {
        clothes: { [USER_TRACKER_KEY]: ["t-shirt", "jeans"] },
        characters_in_scene: { [GLOBAL_TRACKER_KEY]: ["Kuba"] },
        pose: { [USER_TRACKER_KEY]: "standing alone inside the office" },
        scene_date_time: { [GLOBAL_TRACKER_KEY]: "2026-03-04 20:10" },
      },
    },
    timestamp: 999,
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.timestamp, 999);
  assert.deepEqual(snapshot?.activeCharacters, []);
  assert.deepEqual(snapshot?.entityResolution, {
    sceneOwners: [],
    messageOwners: [],
    sceneEntityIds: [],
    messageEntityIds: [],
    source: "model",
  });
  assert.deepEqual(snapshot?.statistics.affection, { Blake: 48 });
  assert.deepEqual(snapshot?.statistics.lastThought, {
    [USER_TRACKER_KEY]: "Finally, I have a moment of peace and quiet to myself in this office.",
    Blake: "Great, another would-be director trying to script my lines.",
  });
  assert.deepEqual(snapshot?.customNonNumericStatistics, {
    clothes: {
      [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
      Blake: ["oversized baggy dark emo goth clothes", "heavy charcoal eyeliner"],
    },
    characters_in_scene: {
      [GLOBAL_TRACKER_KEY]: ["Kuba"],
    },
    pose: {
      [USER_TRACKER_KEY]: "standing alone inside the office",
      Blake: "Smirking with arms crossed over his chest",
    },
    scene_date_time: {
      [GLOBAL_TRACKER_KEY]: "2026-03-04 20:10",
    },
  });
});

test("selectNoActiveContinuityTrackerEntry prefers the latest earlier character continuity entry for AI no-active turns", () => {
  const userOnly = {
    data: {
      timestamp: 2,
      activeCharacters: [USER_TRACKER_KEY],
      entityResolution: {
        sceneOwners: [],
        messageOwners: [USER_TRACKER_KEY],
        sceneEntityIds: [],
        messageEntityIds: [],
        source: "fallback" as const,
      },
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: { [USER_TRACKER_KEY]: "Neutral" },
        lastThought: { [USER_TRACKER_KEY]: "Quiet at last." },
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    messageIndex: 6,
  };
  const priorAi = {
    data: {
      timestamp: 1,
      activeCharacters: ["Ashley", "Blake"],
      entityResolution: {
        sceneOwners: ["Ashley", "Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-ashley", "ent-blake"],
        messageEntityIds: ["ent-blake"],
        source: "model" as const,
      },
      statistics: {
        affection: { Blake: 55 },
        trust: {},
        desire: {},
        connection: {},
        mood: { Blake: "Neutral" },
        lastThought: { Blake: "Still here." },
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    messageIndex: 5,
  };

  assert.equal(
    selectNoActiveContinuityTrackerEntry({
      entries: [priorAi as never, userOnly as never],
      userExtraction: false,
    })?.messageIndex,
    5,
  );

  assert.equal(
    selectNoActiveContinuityTrackerEntry({
      entries: [priorAi as never, userOnly as never],
      userExtraction: true,
    })?.messageIndex,
    6,
  );
});
