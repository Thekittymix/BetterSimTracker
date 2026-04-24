import test from "node:test";
import assert from "node:assert/strict";
import { USER_TRACKER_KEY } from "../src/constants";
import { buildCharacterCardsContext } from "../src/characterCardContext";

import {
  DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NUMERIC,
  DEFAULT_PROTOCOL_SEQUENTIAL_LAST_THOUGHT,
  DEFAULT_PROTOCOL_UNIFIED,
  DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS,
  DEFAULT_UNIFIED_PROMPT_INSTRUCTION,
  buildBuiltInSequentialPromptGenerationPrompt,
  buildCustomStatBehaviorGuidanceGenerationPrompt,
  buildSequentialCustomNumericPrompt,
  buildSequentialCustomOverrideGenerationPrompt,
  buildSequentialCustomNonNumericPrompt,
  buildSequentialPrompt,
  buildTrackerSummaryGenerationPrompt,
  buildUnifiedAllStatsPrompt,
  buildUnifiedPrompt,
} from "../src/prompts";
import type { TrackerData } from "../src/types";

function makeTracker(timestamp: number, overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    timestamp,
    activeCharacters: ["Seraphina"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
      ...overrides.statistics,
    },
    customStatistics: overrides.customStatistics ?? {},
    customNonNumericStatistics: overrides.customNonNumericStatistics ?? {},
  };
}

test("buildUnifiedPrompt includes current state, history, instruction, and protocol values", () => {
  const prompt = buildUnifiedPrompt(
    ["affection", "mood"],
    "User",
    ["Seraphina"],
    "Seraphina smiles.",
    {
      affection: { Seraphina: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
    [makeTracker(1, {
      statistics: {
        affection: { Seraphina: 58 },
        trust: {},
        desire: {},
        connection: {},
        mood: { Seraphina: "Content" },
        lastThought: {},
      },
    })],
    12,
  );

  assert.match(prompt, /<BST_CRUCIAL_BEHAVE_INSTRUCTION>/);
  assert.match(prompt, /<BST_ENVELOPE>/);
  assert.match(prompt, /<BST_CURRENT_STATE>/);
  assert.match(prompt, /<BST_RECENT_SNAPSHOTS>/);
  assert.match(prompt, /<BST_TASK>/);
  assert.match(prompt, /<BST_OUTPUT_PROTOCOL>/);
  assert.match(prompt, /affection=61/);
  assert.match(prompt, /mood=Hopeful/);
  assert.match(prompt, /Snapshot 1/);
  assert.match(prompt, /Use recent messages first/);
  assert.match(prompt, /Numeric stats to update \(affection\):/);
  assert.match(prompt, /Text stats to update \(mood\):/);
  assert.match(prompt, /-12\.\.12/);
});

test("buildUnifiedPrompt resolves {{char}} inside included character card text to a non-user speaker during user extraction", () => {
  const prompt = buildUnifiedPrompt(
    ["mood"],
    "Kuba",
    [USER_TRACKER_KEY],
    [
      "Recent messages:",
      "\"I need to know whether Blake is lying.\"",
      "",
      "Character cards (use only to disambiguate if recent messages are unclear):",
      "Character Card - Blake",
      "Description: {{char}} studies the campfire in silence.",
    ].join("\n"),
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Serious" },
      lastThought: {},
    },
    [],
    12,
    undefined,
    undefined,
    "Blake",
  );

  assert.match(prompt, /Description: Blake studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: Kuba studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: User studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: __bst_user__ studies the campfire in silence\./);
});

test("buildUnifiedPrompt carries lastThought current-message update rules and prior state", () => {
  const prompt = buildUnifiedPrompt(
    ["lastThought"],
    "User",
    ["Lisa", "Candy"],
    "Lisa flinched and warned him not to push it, but her voice softened. Candy stayed nearby.",
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {
        Lisa: "Great, another boring summer... maybe not.",
        Candy: "I can go get them right now!",
      },
    },
    [],
    12,
  );

  assert.match(prompt, /Lisa: lastThought="Great, another boring summer\.\.\. maybe not\."/);
  assert.match(prompt, /Candy: lastThought="I can go get them right now!"/);
  assert.match(prompt, /If lastThought is requested and the latest message directly advances a target/);
  assert.match(prompt, /For lastThought, do not copy the previous tracker thought/);
  assert.match(prompt, /Preserve lastThought only when recent messages provide no new thought cue/);
});

test("buildUnifiedPrompt resolves alias owner built-in state through registry lookup names", () => {
  const prompt = buildUnifiedPrompt(
    ["affection", "mood"],
    "User",
    ["Ash"],
    "Ashley glances over.",
    {
      affection: { Ashley: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Hopeful" },
      lastThought: {},
    },
    [],
    12,
    undefined,
    undefined,
    undefined,
    true,
    true,
    {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley": {
              id: "bst_mc_alias:test:ashley",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley",
            ashley: "bst_mc_alias:test:ashley",
          },
        },
      },
    } as never,
  );

  assert.match(prompt, /- Ash: affection=61, mood=Hopeful/);
  assert.doesNotMatch(prompt, /trust=50/);
  assert.doesNotMatch(prompt, /desire=50/);
  assert.doesNotMatch(prompt, /connection=50/);
});

test("buildUnifiedPrompt keeps same-name built-in reads scoped to the current entity id", () => {
  const currentData: TrackerData = {
    timestamp: 2,
    activeCharacters: ["Ash"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
    entityOwnerMap: {
      Ash: {
        entityId: "bst_narrative:ashley-current",
        ownerName: "Ashley Summers",
        canonicalName: "Ashley Summers",
        aliases: ["Ashley", "Ash"],
        sourceKey: "camp",
        kind: "narrative-entity",
      },
    },
  };
  const historyEntry: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Ash"],
    statistics: {
      affection: { Ashley: 14, "Ashley Summers": 58 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Angry", "Ashley Summers": "Content" },
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
    entityOwnerMap: {
      Ash: {
        entityId: "bst_narrative:ashley-current",
        ownerName: "Ashley Summers",
        canonicalName: "Ashley Summers",
        aliases: ["Ashley", "Ash"],
        sourceKey: "camp",
        kind: "narrative-entity",
      },
    },
  };
  const prompt = buildUnifiedPrompt(
    ["affection", "mood"],
    "User",
    ["Ash"],
    "Ashley glances over.",
    {
      affection: { Ashley: 9, "Ashley Summers": 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Angry", "Ashley Summers": "Hopeful" },
      lastThought: {},
    },
    [historyEntry],
    12,
    undefined,
    undefined,
    undefined,
    true,
    true,
    {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley-stale": {
              id: "bst_mc_alias:test:ashley-stale",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
            "bst_narrative:ashley-current": {
              id: "bst_narrative:ashley-current",
              ownerName: "Ashley Summers",
              canonicalName: "Ashley Summers",
              aliases: ["Ashley", "Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "narrative-entity",
              introducedAtMessageIndex: 2,
              lastSeenMessageIndex: 2,
              lastActiveMessageIndex: 2,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley-stale",
            ashley: "bst_mc_alias:test:ashley-stale",
            "ashley summers": "bst_narrative:ashley-current",
          },
        },
      },
    } as never,
    currentData,
  );

  assert.match(prompt, /- Ash: affection=61, mood=Hopeful/);
  assert.match(prompt, /Snapshot 1 \(newest-0\):[\s\S]*- Ash: affection=58, mood=Content/);
  assert.doesNotMatch(prompt, /trust=50/);
  assert.doesNotMatch(prompt, /desire=50/);
  assert.doesNotMatch(prompt, /connection=50/);
  assert.doesNotMatch(prompt, /- Ash: affection=9, trust=50, desire=50, connection=50, mood=Angry/);
  assert.doesNotMatch(prompt, /- Ash: affection=14, trust=50, desire=50, connection=50, mood=Angry/);
});

test("buildUnifiedAllStatsPrompt includes custom numeric and non-numeric values", () => {
  const prompt = buildUnifiedAllStatsPrompt({
    stats: ["affection", "mood"],
    customStats: [
      {
        id: "satisfaction",
        kind: "numeric",
        label: "Satisfaction",
        description: "Tracks overall relationship satisfaction in the current scene.",
        defaultValue: 50,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: true,
        includeInInjection: true,
      },
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        description: "Tracks currently worn clothing and accessories.",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
    userName: "User",
    characters: ["Seraphina"],
    contextText: "Scene text",
    current: {
      affection: { Seraphina: 65 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
    currentCustom: {
      satisfaction: { Seraphina: 72 },
    },
    currentCustomNonNumeric: {
      clothes: { Seraphina: ["black sundress", "sandals"] },
    },
    history: [],
    maxDeltaPerTurn: 8,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /satisfaction=72/);
  assert.match(prompt, /clothes=\["black sundress","sandals"\]/);
  assert.match(prompt, /<BST_CRUCIAL_BEHAVE_INSTRUCTION>/);
  assert.match(prompt, /<BST_CUSTOM_STAT_MEANINGS>/);
  assert.match(prompt, /<BST_OUTPUT_PROTOCOL>/);
  assert.match(prompt, /- satisfaction \(Satisfaction, numeric, owner-scoped\): Tracks overall relationship satisfaction in the current scene\./);
  assert.match(prompt, /Tracks currently worn clothing and accessories\./);
  assert.match(prompt, /For custom numeric stats, use `delta\.<statId>`\./);
  assert.match(prompt, /For custom non-numeric stats, use `value\.<statId>`\./);
  assert.match(prompt, /Custom non-numeric stats to update \(clothes\):/);
});

test("buildUnifiedAllStatsPrompt does not leak global fallback into owner-scoped custom stats", () => {
  const prompt = buildUnifiedAllStatsPrompt({
    stats: [],
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        description: "Tracks currently worn clothing and accessories.",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
      {
        id: "scene_date_time",
        kind: "date_time",
        label: "Scene Date/Time",
        defaultValue: "2026-03-06 20:00",
        dateTimeMode: "timestamp",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: true,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
    userName: "User",
    characters: ["Seraphina"],
    contextText: "Scene text",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {},
    currentCustomNonNumeric: {
      clothes: { "__bst_global__": ["global robe"] },
      scene_date_time: { "__bst_global__": "2026-03-06 20:05" },
    },
    history: [],
    maxDeltaPerTurn: 8,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.doesNotMatch(prompt, /clothes=\["global robe"\]/);
  assert.match(prompt, /scene_date_time="2026-03-06 20:05"/);
});

test("buildUnifiedAllStatsPrompt preserves explicit empty owner-scoped non-numeric values instead of falling back to defaults", () => {
  const prompt = buildUnifiedAllStatsPrompt({
    stats: [],
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: ["black sundress", "white panties"],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
    userName: "User",
    characters: ["Ashley"],
    contextText: "Scene text",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {},
    currentCustomNonNumeric: {
      clothes: { Ashley: [] },
    },
    history: [],
    maxDeltaPerTurn: 8,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /clothes=\[\]/);
  assert.doesNotMatch(prompt, /black sundress/);
});

test("buildUnifiedAllStatsPrompt resolves alias owner custom stats through registry lookup names", () => {
  const prompt = buildUnifiedAllStatsPrompt({
    context: {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley": {
              id: "bst_mc_alias:test:ashley",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley",
            ashley: "bst_mc_alias:test:ashley",
          },
        },
      },
    } as never,
    stats: [],
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        description: "Tracks currently worn clothing and accessories.",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
    userName: "User",
    characters: ["Ash"],
    contextText: "Scene text",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {},
    currentCustomNonNumeric: {
      clothes: { Ashley: ["worn hoodie"] },
    },
    history: [],
    maxDeltaPerTurn: 8,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /- Ash: clothes=\["worn hoodie"\]/);
});

test("buildUnifiedAllStatsPrompt resolves current custom stats through tracker entityOwnerMap before raw owner-name lookup", () => {
  const currentData: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Ash"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
    entityOwnerMap: {
      Ash: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley Summers",
        canonicalName: "Ashley Summers",
        aliases: ["Ashley", "Ash"],
        sourceKey: "camp",
        kind: "multi_character_alias",
      },
    },
  };
  const prompt = buildUnifiedAllStatsPrompt({
    context: {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley": {
              id: "bst_mc_alias:test:ashley",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley",
            ashley: "bst_mc_alias:test:ashley",
          },
        },
      },
    } as never,
    stats: [],
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        description: "Tracks currently worn clothing and accessories.",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
    userName: "User",
    characters: ["Ash"],
    contextText: "Scene text",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentData,
    currentCustom: {},
    currentCustomNonNumeric: {
      clothes: { "Ashley Summers": ["worn hoodie"] },
    },
    history: [],
    maxDeltaPerTurn: 8,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /- Ash: clothes=\["worn hoodie"\]/);
});

test("buildSequentialCustomNonNumericPrompt resolves current scoped values through currentData entityOwnerMap", () => {
  const prompt = buildSequentialCustomNonNumericPrompt({
    context: {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley": {
              id: "bst_mc_alias:test:ashley",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley",
            ashley: "bst_mc_alias:test:ashley",
          },
        },
      },
    } as never,
    statId: "clothes",
    statKind: "array",
    statLabel: "Clothes",
    statDefault: [],
    textMaxLength: 80,
    userName: "User",
    characters: ["Ash"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentData: {
      timestamp: 1,
      activeCharacters: ["Ash"],
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
      entityOwnerMap: {
        Ash: {
          entityId: "bst_mc_alias:test:ashley",
          ownerName: "Ashley Summers",
          canonicalName: "Ashley Summers",
          aliases: ["Ashley", "Ash"],
          sourceKey: "camp",
          kind: "multi_character_alias",
        },
      },
    },
    currentCustomNonNumeric: {
      clothes: { "Ashley Summers": ["worn hoodie"] },
    },
    history: [],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /- Ash: clothes=\["worn hoodie"\]/);
});

test("buildSequentialPrompt respects built-in tracking and source priority wording", () => {
  const prompt = buildSequentialPrompt(
    "trust",
    "User",
    ["Seraphina"],
    "Recent lines",
    {
      affection: { Seraphina: 55 },
      trust: { Seraphina: 42 },
      desire: {},
      connection: {},
      mood: { Seraphina: "Neutral" },
      lastThought: {},
    },
    [],
    7,
    undefined,
    undefined,
    undefined,
    false,
    true,
    {
      trackAffection: false,
      trackTrust: true,
      trackDesire: false,
      trackConnection: false,
      trackMood: false,
    },
  );

  assert.doesNotMatch(prompt, /affection=55/);
  assert.match(prompt, /<BST_CRUCIAL_BEHAVE_INSTRUCTION>/);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /Primary target: Seraphina/);
  assert.match(prompt, /Extract updates only for these target owners: Seraphina/);
  assert.match(prompt, /<BST_OUTPUT_PROTOCOL>/);
  assert.match(prompt, /<BST_SNAPSHOT_GUIDANCE>/);
  assert.match(prompt, /CURRENT_STATE is the latest known tracked state before this extraction/);
  assert.match(prompt, /Snapshot ordering: newest-0 is the most recent prior snapshot; newest-1 is older/);
  assert.match(prompt, /trust=42/);
  assert.match(prompt, /Use recent messages first; use lorebook only to disambiguate when context is unclear\./);
});

test("default lastThought prompts require updating directly advanced owners before preserving continuity", () => {
  assert.match(DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.lastThought, /latest message directly advances a target owner/);
  assert.match(DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.lastThought, /Do not copy the previous tracker thought/);
  assert.match(DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.lastThought, /scene-present\/background/);
  assert.match(DEFAULT_PROTOCOL_SEQUENTIAL_LAST_THOUGHT, /current immediate internal thought after the latest relevant message/);
  assert.match(DEFAULT_PROTOCOL_SEQUENTIAL_LAST_THOUGHT, /Preserve the previous thought only when recent messages provide no new thought cue/);
  assert.match(DEFAULT_UNIFIED_PROMPT_INSTRUCTION, /If lastThought is requested/);
  assert.match(DEFAULT_PROTOCOL_UNIFIED, /For lastThought, do not copy the previous tracker thought/);
});

test("buildSequentialPrompt carries the lastThought current-message update contract with prior state", () => {
  const prompt = buildSequentialPrompt(
    "lastThought",
    "User",
    ["Lisa", "Candy"],
    [
      "Recent messages:",
      "[34] Your Family: Lisa flinched as if the words had touched something raw. \"Don't push it,\" she said, but there was unexpected softness in her warning. Candy stayed by the doorway.",
    ].join("\n"),
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {
        Lisa: "Great, another boring summer... maybe not.",
        Candy: "I can go get them right now!",
      },
    },
    [],
    7,
    undefined,
    undefined,
    undefined,
    true,
    false,
    {
      trackAffection: false,
      trackTrust: false,
      trackDesire: false,
      trackConnection: false,
      trackMood: false,
      trackLastThought: true,
    },
  );

  assert.match(prompt, /Lisa: lastThought="Great, another boring summer\.\.\. maybe not\."/);
  assert.match(prompt, /Candy: lastThought="I can go get them right now!"/);
  assert.match(prompt, /If the latest message directly advances a target owner through dialogue, action, or emotional reaction, update that owner's thought from those latest cues\./);
  assert.match(prompt, /Do not copy the previous tracker thought for an owner whose current message cues changed\./);
  assert.match(prompt, /Preserve the previous thought only when recent messages provide no new thought cue for that owner/);
  assert.match(prompt, /lastThought must be the character's current immediate internal thought after the latest relevant message/);
});

test("buildSequentialPrompt resolves {{char}} inside included character card text to a non-user speaker during user extraction", () => {
  const prompt = buildSequentialPrompt(
    "mood",
    "Kuba",
    [USER_TRACKER_KEY],
    [
      "Recent messages:",
      "\"I need to know whether Blake is lying.\"",
      "",
      "Character cards (use only to disambiguate if recent messages are unclear):",
      "Character Card - Blake",
      "Description: {{char}} studies the campfire in silence.",
    ].join("\n"),
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Serious" },
      lastThought: {},
    },
    [],
    12,
    undefined,
    undefined,
    "Blake",
  );

  assert.match(prompt, /<BST_RECENT_MESSAGES>/);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /Primary target: Kuba/);
  assert.match(prompt, /Extract updates only for these target owners: Kuba/);
  assert.match(prompt, /<BST_OTHER_CARD_CONTEXT>/);
  assert.match(prompt, /<BST_OTHER_CARD_CONTEXT>[\s\S]*Character Card - Blake/);
  assert.match(prompt, /Description: Blake studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: Kuba studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: User studies the campfire in silence\./);
  assert.doesNotMatch(prompt, /Description: __bst_user__ studies the campfire in silence\./);
});

test("buildSequentialPrompt separates target card context from non-target cards", () => {
  const prompt = buildSequentialPrompt(
    "mood",
    "Kuba",
    ["Ashley"],
    [
      "Recent messages:",
      "\"Ashley keeps the flashlight steady while Blake checks the door.\"",
      "",
      "Target character card context (highest priority card context for Ashley; do not use any other card as this target's state source):",
      "Character Card - Ashley",
      "Description: Ashley keeps everyone focused.",
      "",
      "Other character cards (non-target context only; never copy their traits into the current target unless the recent messages explicitly attribute them to that target):",
      "Character Card - Blake",
      "Description: Blake studies the campfire in silence.",
    ].join("\n"),
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Serious" },
      lastThought: {},
    },
    [],
    12,
    undefined,
    undefined,
    "Ashley",
  );

  assert.match(prompt, /<BST_TARGET_CARD_CONTEXT>/);
  assert.match(prompt, /Character Card - Ashley/);
  assert.match(prompt, /<BST_OTHER_CARD_CONTEXT>/);
  assert.match(prompt, /Character Card - Blake/);
});

test("buildSequentialPrompt carries focused 1:1 source card context for alias owners", () => {
  const context = {
    characterId: 0,
    groupId: "",
    characters: [
      {
        name: "Your Family",
        avatar: "family.png",
        description: "Marylyn keeps the house running with affectionate chaos.",
      },
    ],
  } as any;
  const contextText = [
    "Recent messages:",
    "Kuba: I'm in my room alone",
    "Your Family: A blonde head pokes in through the doorway.",
    buildCharacterCardsContext(context, ["Candy"], [], "standard", "Your Family"),
  ].join("\n\n");

  const prompt = buildSequentialPrompt(
    "mood",
    "Kuba",
    ["Candy"],
    contextText,
    {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Neutral" },
      lastThought: {},
    },
    [],
    12,
    undefined,
    undefined,
    "Your Family",
  );

  assert.match(prompt, /<BST_TARGET_CARD_CONTEXT>/);
  assert.match(prompt, /Character Card - Your Family/);
  assert.match(prompt, /Marylyn keeps the house running with affectionate chaos\./);
  assert.doesNotMatch(prompt, /<BST_TARGET_CARD_CONTEXT>\s*- none\s*<\/BST_TARGET_CARD_CONTEXT>/);
});

test("buildUnifiedPrompt only includes requested built-in stat families", () => {
  const prompt = buildUnifiedPrompt(
    ["trust"],
    "User",
    ["Seraphina"],
    "Recent lines",
    {
      affection: { Seraphina: 55 },
      trust: { Seraphina: 42 },
      desire: { Seraphina: 77 },
      connection: { Seraphina: 12 },
      mood: { Seraphina: "Neutral" },
      lastThought: { Seraphina: "Hidden thought" },
    },
    [],
    12,
  );

  assert.match(prompt, /Stat meanings:\n- trust:/);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /Primary target: Seraphina/);
  assert.match(prompt, /<BST_SNAPSHOT_GUIDANCE>/);
  assert.doesNotMatch(prompt, /- affection:/);
  assert.doesNotMatch(prompt, /- desire:/);
  assert.doesNotMatch(prompt, /- connection:/);
  assert.doesNotMatch(prompt, /- mood:/);
  assert.doesNotMatch(prompt, /- lastThought:/);
  assert.match(prompt, /- Seraphina: trust=42/);
  assert.doesNotMatch(prompt, /affection=55/);
  assert.doesNotMatch(prompt, /desire=77/);
  assert.doesNotMatch(prompt, /connection=12/);
  assert.doesNotMatch(prompt, /mood=Neutral/);
  assert.doesNotMatch(prompt, /lastThought=/);
  assert.doesNotMatch(prompt, /Text stats to update/);
  assert.doesNotMatch(prompt, /mood must be one of/);
});

test("buildSequentialCustomNumericPrompt includes BST tagged extraction sections", () => {
  const prompt = buildSequentialCustomNumericPrompt({
    statId: "satisfaction",
    statLabel: "Satisfaction",
    statDescription: "General satisfaction.",
    statDefault: 50,
    maxDeltaPerTurn: 9,
    userName: "User",
    characters: ["Seraphina"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {
      satisfaction: { Seraphina: 64 },
    },
    history: [],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: true,
  });

  assert.match(prompt, /<BST_CRUCIAL_BEHAVE_INSTRUCTION>/);
  assert.match(prompt, /<BST_ENVELOPE>/);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /<BST_CURRENT_STATE>/);
  assert.match(prompt, /<BST_SNAPSHOT_GUIDANCE>/);
  assert.match(prompt, /<BST_RECENT_SNAPSHOTS>/);
  assert.match(prompt, /<BST_CUSTOM_STAT_MEANING>/);
  assert.match(prompt, /<BST_TASK>/);
  assert.match(prompt, /<BST_OUTPUT_PROTOCOL>/);
  assert.match(prompt, /- Meaning: General satisfaction\./);
  assert.match(prompt, /Primary target: Seraphina/);
  assert.match(prompt, /Use the custom stat description to interpret what this stat actually measures\./);
  assert.match(prompt, /satisfaction=64/);
  assert.doesNotMatch(prompt, /Stat meanings:\n- affection:/);
  assert.doesNotMatch(prompt, /- trust:/);
  assert.doesNotMatch(prompt, /- desire:/);
  assert.doesNotMatch(prompt, /- connection:/);
  assert.doesNotMatch(prompt, /- mood:/);
  assert.doesNotMatch(prompt, /- lastThought:/);
});

test("buildSequentialCustomNumericPrompt preserves explicit zero defaults", () => {
  const prompt = buildSequentialCustomNumericPrompt({
    statId: "satisfaction",
    statLabel: "Satisfaction",
    statDescription: "General satisfaction.",
    statDefault: 0,
    maxDeltaPerTurn: 9,
    userName: "User",
    characters: ["Seraphina"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {},
    history: [],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /satisfaction=0/);
});

test("buildSequentialCustomNumericPrompt resolves {{statId}} inside custom protocol templates", () => {
  const prompt = buildSequentialCustomNumericPrompt({
    statId: "satisfaction",
    statLabel: "Satisfaction",
    statDescription: "General satisfaction.",
    statDefault: 50,
    maxDeltaPerTurn: 9,
    userName: "User",
    characters: ["Seraphina"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {},
    history: [],
    protocolTemplate: DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NUMERIC,
  });

  assert.match(prompt, /"satisfaction": 0/);
  assert.doesNotMatch(prompt, /\{\{statId\}\}/);
});

test("buildSequentialCustomNumericPrompt keeps same-name custom numeric reads scoped to the current entity id", () => {
  const prompt = buildSequentialCustomNumericPrompt({
    context: {
      chatMetadata: {
        bstEntityRegistry: {
          version: 1,
          entities: {
            "bst_mc_alias:test:ashley-stale": {
              id: "bst_mc_alias:test:ashley-stale",
              ownerName: "Ashley",
              canonicalName: "Ashley",
              aliases: ["Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "multi_character_alias",
              introducedAtMessageIndex: 1,
              lastSeenMessageIndex: 1,
              lastActiveMessageIndex: 1,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
            "bst_narrative:ashley-current": {
              id: "bst_narrative:ashley-current",
              ownerName: "Ashley Summers",
              canonicalName: "Ashley Summers",
              aliases: ["Ashley", "Ash"],
              sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
              sourceAvatar: "camp.png",
              sourceKey: "camp",
              kind: "narrative-entity",
              introducedAtMessageIndex: 2,
              lastSeenMessageIndex: 2,
              lastActiveMessageIndex: 2,
              lifecycleState: "active",
              archivedAtMessageIndex: null,
            },
          },
          ownerToEntityId: {
            ash: "bst_mc_alias:test:ashley-stale",
            ashley: "bst_mc_alias:test:ashley-stale",
            "ashley summers": "bst_narrative:ashley-current",
          },
        },
      },
    } as never,
    statId: "satisfaction",
    statLabel: "Satisfaction",
    statDescription: "General satisfaction.",
    statDefault: 50,
    maxDeltaPerTurn: 9,
    userName: "User",
    characters: ["Ash"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentData: {
      timestamp: 2,
      activeCharacters: ["Ash"],
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
      entityOwnerMap: {
        Ash: {
          entityId: "bst_narrative:ashley-current",
          ownerName: "Ashley Summers",
          canonicalName: "Ashley Summers",
          aliases: ["Ashley", "Ash"],
          sourceKey: "camp",
          kind: "narrative-entity",
        },
      },
    },
    currentCustom: {
      satisfaction: { Ashley: 12, "Ashley Summers": 64 },
    },
    history: [
      {
        timestamp: 1,
        activeCharacters: ["Ash"],
        statistics: {
          affection: {},
          trust: {},
          desire: {},
          connection: {},
          mood: {},
          lastThought: {},
        },
        customStatistics: {
          satisfaction: { Ashley: 5, "Ashley Summers": 57 },
        },
        customNonNumericStatistics: {},
        entityOwnerMap: {
          Ash: {
            entityId: "bst_narrative:ashley-current",
            ownerName: "Ashley Summers",
            canonicalName: "Ashley Summers",
            aliases: ["Ashley", "Ash"],
            sourceKey: "camp",
            kind: "narrative-entity",
          },
        },
      },
    ],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /- Ash: satisfaction=64/);
  assert.match(prompt, /Snapshot 1 \(newest-0\):[\s\S]*- Ash: satisfaction=57/);
  assert.doesNotMatch(prompt, /<BST_CURRENT_STATE>\n- Ash: satisfaction=12\n<\/BST_CURRENT_STATE>/);
  assert.doesNotMatch(prompt, /Snapshot 1 \(newest-0\):\n  - Ash: satisfaction=5\n/);
});

test("buildSequentialCustomNonNumericPrompt includes scoped values and mode-aware schema", () => {
  const prompt = buildSequentialCustomNonNumericPrompt({
    statId: "scene_date_time",
    statKind: "date_time",
    globalScope: true,
    statLabel: "Scene Date/Time",
    statDescription: "Tracks current scene time.",
    statDefault: "2026-03-06 20:00",
    dateTimeMode: "structured",
    userName: "User",
    characters: ["Seraphina"],
    contextText: "The evening continues.",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustomNonNumeric: {
      scene_date_time: { "__bst_global__": "2026-03-06 20:05" },
    },
    history: [],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: true,
  });

  assert.match(prompt, /scene_date_time="2026-03-06 20:05"/);
  assert.match(prompt, /<BST_CRUCIAL_BEHAVE_INSTRUCTION>/);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /<BST_CUSTOM_STAT_MEANING>/);
  assert.match(prompt, /<BST_SNAPSHOT_GUIDANCE>/);
  assert.match(prompt, /<BST_OUTPUT_PROTOCOL>/);
  assert.match(prompt, /- Meaning: Tracks current scene time\./);
  assert.match(prompt, /Primary target: Seraphina/);
  assert.match(prompt, /structured datetime intent/);
  assert.match(prompt, /Use the custom stat description to interpret what this stat actually measures\./);
  assert.match(prompt, /use character cards and lorebook only to disambiguate when context is unclear\./);
});

test("buildSequentialCustomNonNumericPrompt preserves explicit empty arrays instead of falling back to defaults", () => {
  const prompt = buildSequentialCustomNonNumericPrompt({
    statId: "clothes",
    statKind: "array",
    statLabel: "Clothes",
    statDefault: ["black sundress", "white panties"],
    textMaxLength: 80,
    userName: "User",
    characters: ["Ashley"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustomNonNumeric: {
      clothes: { Ashley: [] },
    },
    history: [],
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
  });

  assert.match(prompt, /clothes=\[\]/);
  assert.doesNotMatch(prompt, /black sundress/);
});

test("buildUnifiedAllStatsPrompt custom-only mode omits built-in framing for grouped custom sequential requests", () => {
  const prompt = buildUnifiedAllStatsPrompt({
    stats: [],
    customStats: [
      {
        id: "satisfaction",
        label: "Satisfaction",
        kind: "numeric",
        description: "Tracks current satisfaction with the scene.",
        defaultValue: 50,
        maxDeltaPerTurn: 9,
        scope: "character",
      } as never,
      {
        id: "clothes",
        label: "Clothes",
        kind: "array",
        description: "Tracks currently worn clothing items.",
        defaultValue: [],
        textMaxLength: 80,
        scope: "character",
      } as never,
    ],
    userName: "User",
    characters: ["Ashley"],
    contextText: "Recent lines",
    current: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    currentCustom: {
      satisfaction: { Ashley: 64 },
    },
    currentCustomNonNumeric: {
      clothes: { Ashley: ["raincoat"] },
    },
    history: [],
    maxDeltaPerTurn: 9,
    template: "- Update only these custom stats in one response: satisfaction, clothes.",
    customOnlyMode: true,
  });

  assert.match(prompt, /Update only the requested custom stats in this single response\./);
  assert.match(prompt, /<BST_TARGET>/);
  assert.match(prompt, /Primary target: Ashley/);
  assert.match(prompt, /<BST_SNAPSHOT_GUIDANCE>/);
  assert.match(prompt, /<BST_CUSTOM_STAT_MEANINGS>/);
  assert.match(prompt, /- satisfaction \(Satisfaction, numeric, owner-scoped\): Tracks current satisfaction with the scene\./);
  assert.match(prompt, /- clothes \(Clothes, array, owner-scoped\): Tracks currently worn clothing items\./);
  assert.match(prompt, /Custom numeric delta stats to update \(satisfaction\):/);
  assert.match(prompt, /Custom non-numeric stats to update \(clothes\):/);
  assert.doesNotMatch(prompt, /Update built-in and custom stats in this single response\./);
  assert.doesNotMatch(prompt, /Stat meanings:\n- affection:/);
  assert.doesNotMatch(prompt, /Text stats to update/);
  assert.doesNotMatch(prompt, /mood must be one of/);
  assert.doesNotMatch(prompt, /lastThought must be one short sentence/);
});

test("buildTrackerSummaryGenerationPrompt keeps tracked-dimension scope explicit", () => {
  const prompt = buildTrackerSummaryGenerationPrompt({
    userName: "User",
    activeCharacters: ["Seraphina"],
    characters: ["Seraphina", "Billie"],
    contextText: "Recent dialogue",
    trackerStateLines: "- Seraphina: hopeful, protective",
    trackedDimensions: ["mood", "connection", "clothes"],
  });

  assert.match(prompt, /Tracked dimensions \(only these\):/);
  assert.match(prompt, /mood, connection, clothes/);
  assert.match(prompt, /Do not use numerals or percentages\./);
});

test("buildSequentialCustomOverrideGenerationPrompt emphasizes continuity and disambiguation-only card usage", () => {
  const prompt = buildSequentialCustomOverrideGenerationPrompt({
    statId: "clothes",
    statLabel: "Clothes",
    statDescription: "Track currently worn clothing/accessory items as a live list.",
    statKind: "array",
    textMaxLength: 120,
  });

  assert.match(prompt, /Treat the previous Clothes tracker value as the current known state for continuity\./);
  assert.match(prompt, /Change clothes only when recent messages provide clear evidence of change; otherwise preserve the previous value\./);
  assert.match(prompt, /Use recent messages as the primary source of change and previous tracker state as the primary source of continuity\./);
  assert.match(prompt, /Use character cards, defaults, and lorebook only when clothes is empty, unknown, or genuinely unclear from the recent scene\./);
  assert.match(prompt, /Never overwrite a known current Clothes value only because background\/card text mentions a different baseline state\./);
});

test("buildBuiltInSequentialPromptGenerationPrompt reinforces continuity for built-ins", () => {
  const prompt = buildBuiltInSequentialPromptGenerationPrompt({
    stat: "trust",
    currentInstruction: "",
  });

  assert.match(prompt, /Prioritize recent messages for changes and previous tracker state for continuity; use character cards only for disambiguation\./);
  assert.match(prompt, /Require preserving the current Trust state unless recent messages clearly justify movement\./);
});

test("buildCustomStatBehaviorGuidanceGenerationPrompt asks for continuity-aware guidance", () => {
  const prompt = buildCustomStatBehaviorGuidanceGenerationPrompt({
    statId: "pose",
    statLabel: "Pose",
    statDescription: "Current posture, immediate action, and local position.",
    statKind: "text_short",
    textMaxLength: 120,
  });

  assert.match(prompt, /Keep the guidance anchored to the current Pose state instead of generic label synonyms\./);
  assert.match(prompt, /describe how the model should remain consistent with an already-established pose value across nearby turns/i);
});
