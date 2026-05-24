import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import { __testables, getLastInjectedPrompt } from "../src/promptInjection";
import { defaultSettings } from "../src/settings";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeContext(overrides: Partial<STContext> = {}): STContext {
  return {
    chat: [],
    name1: "User",
    name2: "Seraphina",
    characterId: 0,
    characters: [{ name: "Seraphina", avatar: "seraphina.png" }],
    ...overrides,
  };
}

function makeTracker(overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    timestamp: Date.now(),
    activeCharacters: ["Seraphina"],
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
    ...overrides,
  };
}

function makeSettings(overrides: Partial<BetterSimTrackerSettings> = {}): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    trackAffection: false,
    trackTrust: false,
    trackDesire: false,
    trackConnection: false,
    trackMood: false,
    trackLastThought: false,
    includeUserTrackerInInjection: false,
    customStats: [],
    ...overrides,
  };
}

test("buildPrompt includes global custom stats in a dedicated Scene line", () => {
  const settings = makeSettings({
    customStats: [
      {
        id: "scene_date_time",
        kind: "date_time",
        label: "Scene Date/Time",
        defaultValue: "2026-03-07 20:00",
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
    characterDefaults: {
      Seraphina: {
        statEnabled: {
          scene_date_time: false,
        },
      },
    },
  });
  const data = makeTracker({
    customNonNumericStatistics: {
      scene_date_time: {
        [GLOBAL_TRACKER_KEY]: "2026-03-07 20:05",
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /<BST_STAT_SEMANTICS>/);
  assert.doesNotMatch(prompt, /<BST_BEHAVIOR_BANDS>/);
  assert.doesNotMatch(prompt, /<BST_REACT_RULES>/);
  assert.match(prompt, /<BST_PRIORITY_RULES>/);
  assert.match(prompt, /<BST_TRACKER_STATE>/);
  assert.doesNotMatch(prompt, /<BST_PUBLIC_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_LINES>/);
  assert.doesNotMatch(prompt, /<BST_SUMMARIZATION_NOTE>/);
  assert.match(prompt, /- Scene: scene_date_time="2026-03-07 20:05"/);
});

test("buildPrompt includes global custom stats even when there are no owner lines", () => {
  const settings = makeSettings({
    customStats: [
      {
        id: "scene_location",
        kind: "text_short",
        label: "Scene Location",
        defaultValue: "Unknown",
        textMaxLength: 200,
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
  });
  const data = makeTracker({
    activeCharacters: [],
    customNonNumericStatistics: {
      scene_location: {
        [GLOBAL_TRACKER_KEY]: "Forest cottage",
      },
    },
  });
  const context = makeContext({ name2: "", characterId: -1, characters: [] });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Scene: scene_location="Forest cottage"/);
});

test("buildPrompt excludes global custom stats when includeInInjection is disabled", () => {
  const settings = makeSettings({
    customStats: [
      {
        id: "scene_date_time",
        kind: "date_time",
        label: "Scene Date/Time",
        defaultValue: "2026-03-07 20:00",
        dateTimeMode: "timestamp",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: true,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: false,
      },
    ],
  });
  const data = makeTracker({
    customNonNumericStatistics: {
      scene_date_time: {
        [GLOBAL_TRACKER_KEY]: "2026-03-07 20:05",
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.equal(prompt, "");
});

test("buildPrompt excludes custom stats from semantics and lines when track is disabled", () => {
  const settings = makeSettings({
    customStats: [
      {
        id: "characters_in_scene",
        kind: "array",
        label: "Characters in Scene",
        defaultValue: [],
        textMaxLength: 64,
        track: false,
        trackCharacters: true,
        trackUser: true,
        globalScope: true,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
        description: "Global scene roster of all entities physically present right now.",
      },
    ],
  });
  const data = makeTracker({
    customNonNumericStatistics: {
      characters_in_scene: {
        [GLOBAL_TRACKER_KEY]: ["Blake", "Kuba"],
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.doesNotMatch(prompt, /characters_in_scene/i);
});

test("buildPrompt keeps non-empty BST tags and omits empty blocks when using custom injection template", () => {
  const settings = makeSettings({
    promptTemplateInjection: [
      "{{header}}",
      "{{statSemantics}}",
      "{{behaviorBands}}",
      "{{reactRules}}",
      "{{priorityRules}}",
      "{{lines}}",
      "{{summarizationNote}}",
    ].join("\n"),
    customStats: [
      {
        id: "scene_date_time",
        kind: "date_time",
        label: "Scene Date/Time",
        defaultValue: "2026-03-07 20:00",
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
  });
  const data = makeTracker({
    customNonNumericStatistics: {
      scene_date_time: {
        [GLOBAL_TRACKER_KEY]: "2026-03-07 20:05",
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /<BST_STAT_SEMANTICS>/);
  assert.doesNotMatch(prompt, /<BST_BEHAVIOR_BANDS>/);
  assert.doesNotMatch(prompt, /<BST_REACT_RULES>/);
  assert.match(prompt, /<BST_PRIORITY_RULES>/);
  assert.match(prompt, /<BST_TRACKER_STATE>/);
  assert.doesNotMatch(prompt, /<BST_PUBLIC_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_LINES>/);
  assert.doesNotMatch(prompt, /<BST_SUMMARIZATION_NOTE>/);
  assert.doesNotMatch(prompt, /\n{3,}/);
});

test("buildPrompt uses constructive hidden-state guidance instead of aggressive output suppression", () => {
  const settings = makeSettings({
    trackMood: true,
  });
  const data = makeTracker({
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Calm" },
      lastThought: {},
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /This block is hidden control data for maintaining character behavior consistency\./);
  assert.match(prompt, /Continue roleplaying naturally - this guidance only influences how the character feels and acts\./);
  assert.doesNotMatch(prompt, /Never reveal, copy, paraphrase, summarize, or transform/i);
  assert.doesNotMatch(prompt, /Never output numeric stats/i);
});

test("buildPrompt keeps bst_inject_block wrapper outside the header placeholder content", () => {
  const settings = makeSettings({
    trackMood: true,
    promptTemplateInjection: "{{header}}\n\n{{lines}}",
  });
  const data = makeTracker({
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /^<bst_inject_block>\n\[Relationship State - internal guidance\]/);
  assert.match(prompt, /- Seraphina: mood=Hopeful/);
  assert.match(prompt, /<\/bst_inject_block>$/);
  assert.equal((prompt.match(/<bst_inject_block>/g) ?? []).length, 1);
});

test("buildPrompt includes target character owner line even when active list is partial", () => {
  const settings = makeSettings({
    trackMood: true,
  });
  const data = makeTracker({
    activeCharacters: [USER_TRACKER_KEY],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
  });
  const context = makeContext({
    name2: "Seraphina",
    characterId: 0,
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Seraphina:/);
});

test("buildPrompt in 1:1 chat scopes owner lines to current target owner", () => {
  const settings = makeSettings({
    trackMood: true,
    includeUserTrackerInInjection: false,
    enableUserTracking: false,
  });
  const data = makeTracker({
    activeCharacters: ["Seraphina", "Billie"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful", Billie: "Neutral" },
      lastThought: {},
    },
  });
  const context = makeContext({
    characterId: 0,
    name2: "Seraphina",
    groupId: "",
    characters: [
      { name: "Seraphina", avatar: "seraphina.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Seraphina:/);
  assert.doesNotMatch(prompt, /- Billie:/);
});

test("buildPrompt does not render user owner line when includeUserTrackerInInjection is off", () => {
  const settings = makeSettings({
    trackMood: true,
    includeUserTrackerInInjection: false,
    enableUserTracking: true,
    userTrackMood: true,
  });
  const data = makeTracker({
    activeCharacters: [USER_TRACKER_KEY, "Seraphina"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { [USER_TRACKER_KEY]: "Neutral", Seraphina: "Hopeful" },
      lastThought: {},
    },
  });
  const context = makeContext({
    characterId: 0,
    name2: "Seraphina",
    groupId: "",
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Seraphina:/);
  assert.doesNotMatch(prompt, /- User:/);
});

test("buildPrompt includes explicit None placeholders for empty injected user non-numeric state", () => {
  const settings = makeSettings({
    includeUserTrackerInInjection: true,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: false,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
  });
  const data = makeTracker({
    activeCharacters: ["Seraphina"],
    customNonNumericStatistics: {
      clothes: {
        [USER_TRACKER_KEY]: [],
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /- User: clothes=None; mood=None; lastThought=None/);
});

test("buildPrompt includes explicit None placeholders for empty injected character non-numeric state", () => {
  const settings = makeSettings({
    trackMood: true,
    trackLastThought: true,
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
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
  });
  const data = makeTracker({
    activeCharacters: ["Seraphina"],
    customNonNumericStatistics: {
      clothes: {
        Seraphina: [],
      },
    },
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /- Seraphina: clothes=None; mood=None; lastThought=None/);
});

test("buildPrompt omits non-numeric fields that are not in injection scope instead of emitting None", () => {
  const settings = makeSettings({
    trackMood: true,
    trackLastThought: false,
    customStats: [
      {
        id: "secret_note",
        kind: "text_short",
        label: "Secret Note",
        defaultValue: "",
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: false,
      },
    ],
  });
  const data = makeTracker({
    activeCharacters: ["Seraphina"],
  });

  const prompt = __testables.buildPrompt(data, settings, makeContext());
  assert.match(prompt, /- Seraphina: mood=None/);
  assert.doesNotMatch(prompt, /lastThought=None/);
  assert.doesNotMatch(prompt, /secret_note=None/);
});

test("buildPrompt filters reserved system owner names and avoids fake fallback values", () => {
  const settings = makeSettings({
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
  });
  const data = makeTracker({
    activeCharacters: ["SillyTavern System", "Seraphina"],
    statistics: {
      affection: { Seraphina: 12 },
      trust: { Seraphina: 18 },
      desire: { Seraphina: 2 },
      connection: { Seraphina: 15 },
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
  });
  const context = makeContext({ name2: "Seraphina", characterId: 0, groupId: "" });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.doesNotMatch(prompt, /SillyTavern System/i);
  assert.doesNotMatch(prompt, /affection=50/);
  assert.match(prompt, /- Seraphina:/);
  assert.match(prompt, /affection=12/);
});

test("buildPrompt resolves alias owner lines through registry-backed lookup names", () => {
  const settings = makeSettings({
    trackMood: true,
    includeUserTrackerInInjection: false,
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
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
  });
  const data = makeTracker({
    activeCharacters: ["Ash"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Hopeful" },
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: {
        Ashley: ["worn hoodie"],
      },
    },
  });
  const context = makeContext({
    name2: "Ash",
    groupId: "group-1",
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-ashley": {
            id: "ent-ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          ashley: "ent-ashley",
          ash: "ent-ashley",
        },
      },
    } as any,
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Ash: clothes=\["worn hoodie"\]; mood=Hopeful/);
});

test("buildPrompt prefers resolved scene owners over request-only activeCharacters", () => {
  const settings = makeSettings({
    trackMood: true,
    includeUserTrackerInInjection: false,
    enableUserTracking: false,
  });
  const data = makeTracker({
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: [],
      messageEntityIds: [],
    }),
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Neutral", Blake: "Hopeful" },
      lastThought: {},
    },
  });
  const context = makeContext({
    name2: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    groupId: "group-1",
    characterId: 0,
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Ashley: mood=Neutral/);
  assert.match(prompt, /- Blake: mood=Hopeful/);
});

test("buildPrompt keeps full multi-character scene injection in non-group source-card chats when entity owner map shows multiple active owners", () => {
  const settings = makeSettings({
    entityTrackingMode: "dynamic_characters",
    trackMood: true,
    includeUserTrackerInInjection: true,
    enableUserTracking: true,
  });
  const data = makeTracker({
    activeCharacters: ["__bst_user__"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Raleigh"],
      messageOwners: [],
      sceneEntityIds: ["ent-raleigh"],
      messageEntityIds: [],
    }),
    entityOwnerMap: {
      Ashley: {
        entityId: "ent-ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Garret: {
        entityId: "ent-garret",
        ownerName: "Garret",
        canonicalName: "Garret",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Raleigh: {
        entityId: "ent-raleigh",
        ownerName: "Raleigh",
        canonicalName: "Raleigh",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: { Ashley: 45, Blake: 45, Garret: 45, Raleigh: 45 },
      trust: {},
      desire: {},
      connection: {},
      mood: {
        Ashley: "Neutral",
        Blake: "Neutral",
        Garret: "Neutral",
        Raleigh: "Serious",
        __bst_user__: "Neutral",
      },
      lastThought: {
        __bst_user__: "Where's Raleigh?",
      },
    },
  });
  const context = makeContext({
    name1: "Kuba",
    name2: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    groupId: "",
    characterId: 0,
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Ashley: mood=Neutral/);
  assert.match(prompt, /- Blake: mood=Neutral/);
  assert.match(prompt, /- Garret: mood=Neutral/);
  assert.match(prompt, /- Raleigh: mood=Serious/);
  assert.match(prompt, /- Kuba: mood=Neutral; lastThought="Where's Raleigh\?"/);
});

test("resolveInjectionTargetOwner prefers resolver message entity ids over source-card fallback names", () => {
  const data = makeTracker({
    activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: [],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-ashley"],
    }),
  });
  const context = makeContext({
    name2: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    groupId: "group-1",
    characterId: 0,
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-ashley": {
            id: "ent-ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 1, state: "active" }],
          },
          "ent-blake": {
            id: "ent-blake",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: [],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 1, state: "active" }],
          },
        },
        ownerToEntityId: {
          ashley: "ent-ashley",
          ash: "ent-ashley",
          blake: "ent-blake",
        },
      },
    } as any,
    chat: [
      {
        is_user: false,
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "source-card style reply",
      },
    ] as any,
  });

  assert.equal(__testables.resolveInjectionTargetOwner(context, data), "Ashley");
});

test("resolveInjectionTargetOwner can materialize message owners from messageEntityIds plus entityOwnerMap when registry lookup is unavailable", () => {
  const data = makeTracker({
    activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: [],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: ["ent-ashley"],
    }),
    entityOwnerMap: {
      Ashley: {
        entityId: "ent-ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  });
  const context = makeContext({
    name2: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    groupId: "group-1",
    characterId: 0,
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {},
        ownerToEntityId: {},
      },
    } as any,
    chat: [
      {
        is_user: false,
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "source-card style reply",
      },
    ] as any,
  });

  assert.equal(__testables.resolveInjectionTargetOwner(context, data), "Ashley");
});

test("buildPrompt resolves owner lines through tracker entityOwnerMap before raw owner-name lookup", () => {
  const settings = makeSettings({
    trackMood: true,
    includeUserTrackerInInjection: false,
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
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
  });
  const data: TrackerData = {
    timestamp: Date.now(),
    activeCharacters: ["Ash"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ash"],
      messageOwners: ["Ash"],
      sceneEntityIds: ["ent-ashley"],
      messageEntityIds: ["ent-ashley"],
    }),
    entityOwnerMap: {
      Ash: {
        entityId: "ent-ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Hopeful" },
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Ashley: ["worn hoodie"],
      },
    },
  };
  const context = makeContext({
    name2: "Ash",
    groupId: "group-1",
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-ashley": {
            id: "ent-ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 1, state: "active" }],
          },
        },
        ownerToEntityId: {
          ashley: "ent-ashley",
          ash: "ent-ashley",
        },
      },
    } as any,
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Ashley: clothes=\["worn hoodie"\]; mood=Hopeful/);
});

test("buildPrompt keeps built-in owner stats scoped to the current entity id instead of stale same-name registry aliases", () => {
  const settings = makeSettings({
    trackAffection: true,
    includeUserTrackerInInjection: false,
  });
  const data: TrackerData = {
    timestamp: Date.now(),
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake-current"],
      messageEntityIds: ["ent-blake-current"],
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake-current",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["B-current"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: {
        "B-current": 82,
        "B-stale": 15,
      },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    statisticsByEntityId: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
  const context = makeContext({
    name2: "Blake",
    groupId: "group-1",
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-blake-stale": {
            id: "ent-blake-stale",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: ["B-stale"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "inactive",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "inactive" }],
          },
        },
        ownerToEntityId: {
          blake: "ent-blake-stale",
          "b-stale": "ent-blake-stale",
        },
      },
    } as any,
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Blake: affection=82/);
  assert.doesNotMatch(prompt, /affection=15/);
});

test("buildPrompt prefers the current narrative entity id over colliding owner defaults", () => {
  const settings = makeSettings({
    entityTrackingMode: "dynamic_characters",
    trackMood: true,
    characterDefaults: {
      "avatar:blake.png": {
        statEnabled: {
          mood: false,
        },
      },
    },
  });
  const data: TrackerData = {
    timestamp: Date.now(),
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_narrative:blake-shadow"],
      messageEntityIds: ["bst_narrative:blake-shadow"],
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "bst_narrative:blake-shadow",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Shadow Blake"],
        sourceKey: "narrative:bst_narrative:blake-shadow",
        kind: "narrative-entity",
      },
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Blake: "Guarded" },
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
  const context = makeContext({
    name2: "Blake",
    groupId: "group-1",
    characters: [{ name: "Blake", avatar: "blake.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_owner:blake.png|blake": {
            id: "bst_owner:blake.png|blake",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: [],
            sourceName: "Blake",
            sourceAvatar: "blake.png",
            sourceKey: "blake.png|blake",
            kind: "owner",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          blake: "bst_owner:blake.png|blake",
        },
      },
    } as any,
  });

  const prompt = __testables.buildPrompt(data, settings, context);
  assert.match(prompt, /- Blake: mood=Guarded/);
});

test("syncPromptInjection clears both ST prompt and bst_injection macro state when injection is disabled", async () => {
  const calls: Array<{
    key: string;
    value: string;
    position: number;
    depth: number;
    scan?: boolean;
    role?: number;
  }> = [];
  const settings = makeSettings({
    injectTrackerIntoPrompt: false,
    trackMood: true,
  });
  const data = makeTracker({
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Seraphina: "Hopeful" },
      lastThought: {},
    },
  });

  await __testables.syncPromptInjectionWithScriptModule({
    context: makeContext(),
    settings,
    data,
    module: {
      extension_prompt_types: { IN_CHAT: 3 },
      extension_prompt_roles: { SYSTEM: 0 },
      setExtensionPrompt: (key, value, position, depth, scan, role) => {
        calls.push({ key, value, position, depth, scan, role });
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "bst_relationship_state");
  assert.equal(calls[0].value, "");
  assert.equal(calls[0].scan, false);
  assert.equal(getLastInjectedPrompt(), "");
});
