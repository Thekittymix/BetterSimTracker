import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import { __testables } from "../src/promptInjection";
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
  assert.match(prompt, /<BST_BEHAVIOR_BANDS>/);
  assert.match(prompt, /<BST_REACT_RULES>/);
  assert.match(prompt, /<BST_PRIORITY_RULES>/);
  assert.match(prompt, /<BST_TRACKER_STATE>/);
  assert.doesNotMatch(prompt, /<BST_PUBLIC_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_LINES>/);
  assert.match(prompt, /<BST_SUMMARIZATION_NOTE>/);
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

test("buildPrompt keeps BST tags when using custom injection template", () => {
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
  assert.match(prompt, /<BST_BEHAVIOR_BANDS>/);
  assert.match(prompt, /<BST_REACT_RULES>/);
  assert.match(prompt, /<BST_PRIORITY_RULES>/);
  assert.match(prompt, /<BST_TRACKER_STATE>/);
  assert.doesNotMatch(prompt, /<BST_PUBLIC_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_STATS>/);
  assert.doesNotMatch(prompt, /<BST_OWNER_STATE_LINES>/);
  assert.match(prompt, /<BST_SUMMARIZATION_NOTE>/);
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
