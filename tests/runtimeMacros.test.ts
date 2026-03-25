import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { defaultSettings } from "../src/settings";
import { getBstMacroDebugSnapshot, resetBstMacroStateForTests, syncBstMacros } from "../src/runtimeMacros";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeContext(options?: { includeNewEngine?: boolean }) {
  const includeNewEngine = options?.includeNewEngine ?? true;
  const registered = new Map<string, () => string>();
  const registeredNewEngine = new Map<string, () => string>();
  const unregistered: string[] = [];
  const context = {
    chat: [],
    characterId: 0,
    name1: "User",
    characters: [{ name: "Seraphina" }],
    registerMacro(name, value) {
      if (typeof value === "function") {
        registered.set(name, value);
      }
    },
    unregisterMacro(name) {
      unregistered.push(name);
      registered.delete(name);
    },
    substituteParams(value: string) {
      return String(value ?? "").replace(/\{\{([^{}]+)\}\}/g, (_, rawName) => {
        const name = String(rawName ?? "").trim();
        const handler = registeredNewEngine.get(name) ?? registered.get(name);
        return typeof handler === "function" ? handler() : `{{${name}}}`;
      });
    },
  } as STContext & { substituteParams: (value: string) => string; macros?: unknown };

  if (includeNewEngine) {
    context.macros = {
      register(name, definition) {
        const handler = typeof definition?.handler === "function"
          ? (definition.handler as () => string)
          : null;
        if (handler) {
          registeredNewEngine.set(name, handler);
        }
      },
      registry: {
        unregisterMacro(name) {
          registeredNewEngine.delete(name);
        },
      },
    };
  }

  return { context, registered, registeredNewEngine, unregistered };
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
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
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
      {
        id: "pose",
        kind: "text_short",
        label: "Pose",
        defaultValue: "",
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
      {
        id: "physicality",
        kind: "text_short",
        label: "Physicality",
        defaultValue: "",
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
        dateTimeMode: "structured",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: true,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
      {
        id: "secret_note",
        kind: "text_short",
        label: "Secret Note",
        defaultValue: "",
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: true,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: false,
      },
      {
        id: "hidden_pose",
        kind: "text_short",
        label: "Hidden Pose",
        defaultValue: "",
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: false,
        showInGraph: false,
        includeInInjection: false,
      },
    ],
  };
}

function makeTracker(): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Seraphina"],
    statistics: {
      affection: { Seraphina: 61 },
      trust: { Seraphina: 44 },
      desire: { Seraphina: 10 },
      connection: { Seraphina: 72 },
      mood: { Seraphina: "Hopeful", [USER_TRACKER_KEY]: "Neutral" },
      lastThought: { Seraphina: "Stay calm.", [USER_TRACKER_KEY]: "Need to rest." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Seraphina: ["black sundress", "sandals"],
        [USER_TRACKER_KEY]: ["hoodie"],
      },
      pose: {
        Seraphina: "standing near the bed",
        [USER_TRACKER_KEY]: "sitting upright",
      },
      physicality: {
        Seraphina: "pink hair, amber eyes, soft skin",
      },
      secret_note: {
        Seraphina: "should not leak",
        [USER_TRACKER_KEY]: "should not leak",
      },
      hidden_pose: {
        Seraphina: "should stay hidden",
        [USER_TRACKER_KEY]: "should stay hidden",
      },
      scene_date_time: {
        __bst_global__: "2026-03-06 20:05",
      },
    },
  };
}

afterEach(() => {
  resetBstMacroStateForTests();
});

test("syncBstMacros registers BST macros in the new macro engine by default", () => {
  const { context, registered, registeredNewEngine } = makeContext();
  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => makeTracker(),
    getLastInjectedPrompt: () => "<bst_inject_block>demo</bst_inject_block>",
  });

  assert.equal(registered.size, 0);
  assert.equal(registeredNewEngine.get("bst_injection")?.(), "<bst_inject_block>demo</bst_inject_block>");
  assert.equal(registeredNewEngine.get("bst_stat_char_affection_seraphina")?.(), "61");
  assert.equal(registeredNewEngine.get("bst_stat_char_mood_seraphina")?.(), "Hopeful");
  assert.equal(registeredNewEngine.get("bst_stat_user_mood")?.(), "Neutral");
  assert.equal(registeredNewEngine.get("bst_stat_user_clothes")?.(), "hoodie");
  assert.equal(registeredNewEngine.get("bst_stat_scene_scene_date_time")?.(), "2026-03-06 20:05");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "black sundress, sandals");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_seraphina")?.(), "black sundress, sandals");
});

test("syncBstMacros exposes compact bst_image_state using configured owner-scoped visible non-numeric stats", () => {
  const { context, registeredNewEngine } = makeContext();
  const tracker = makeTracker();
  tracker.activeCharacters = ["Seraphina", "Billie"];
  tracker.customNonNumericStatistics = {
    ...tracker.customNonNumericStatistics,
    clothes: {
      Seraphina: ["black sundress", "sandals"],
      Billie: ["hoodie", "leggings"],
      [USER_TRACKER_KEY]: ["hoodie"],
    },
    pose: {
      Seraphina: "standing near the bed",
      Billie: "sitting on the couch",
      [USER_TRACKER_KEY]: "sitting upright",
    },
    physicality: {
      Seraphina: "pink hair, amber eyes, soft skin",
      Billie: "green-black hair, blue eyes",
    },
    secret_note: {
      Seraphina: "should not leak",
      Billie: "should not leak",
      [USER_TRACKER_KEY]: "should not leak",
    },
    hidden_pose: {
      Seraphina: "hidden",
      Billie: "hidden",
      [USER_TRACKER_KEY]: "hidden",
    },
  };

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", "Billie", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  const block = registeredNewEngine.get("bst_image_state")?.() ?? "";
  assert.match(block, /^Scene: Seraphina, Billie/m);
  assert.match(block, /^User: clothes=hoodie; pose=sitting upright/m);
  assert.match(block, /^Seraphina: clothes=black sundress, sandals; pose=standing near the bed; physicality=pink hair, amber eyes, soft skin/m);
  assert.match(block, /^Billie: clothes=hoodie, leggings; pose=sitting on the couch; physicality=green-black hair, blue eyes/m);
  assert.equal(block.includes("secret note"), false);
  assert.equal(block.includes("hidden pose"), false);
  assert.equal(block.includes("scene date/time"), false);
});

test("syncBstMacros uses resolved scene owners for bst_image_state instead of request-only activeCharacters", () => {
  const { context, registeredNewEngine } = makeContext();
  const tracker = makeTracker();
  tracker.activeCharacters = ["Blake"];
  tracker.entityResolution = buildEntityResolution({
    source: "model",
    sceneOwners: ["Ashley", "Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: [],
    messageEntityIds: [],
  });
  tracker.customNonNumericStatistics = {
    ...tracker.customNonNumericStatistics,
    clothes: {
      Ashley: ["worn hoodie"],
      Blake: ["oversized baggy dark emo goth clothes"],
      [USER_TRACKER_KEY]: ["hoodie"],
    },
    pose: {
      Ashley: "fidgeting near the door",
      Blake: "leaning against the filing cabinet",
      [USER_TRACKER_KEY]: "standing nearby",
    },
    physicality: {
      Ashley: "bushy brown braided pigtails, hazel eyes",
      Blake: "black mullet, heavy charcoal eyeliner",
    },
  };

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Ashley", "Blake", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  const block = registeredNewEngine.get("bst_image_state")?.() ?? "";
  assert.match(block, /^Scene: Ashley, Blake/m);
  assert.match(block, /^Ashley: clothes=worn hoodie; pose=fidgeting near the door; physicality=bushy brown braided pigtails, hazel eyes/m);
  assert.match(block, /^Blake: clothes=oversized baggy dark emo goth clothes; pose=leaning against the filing cabinet; physicality=black mullet, heavy charcoal eyeliner/m);
});

test("syncBstMacros resolves alias macro values through entityOwnerMap and byEntityId state", () => {
  const { context, registeredNewEngine } = makeContext();
  context.name2 = "Ash";
  context.groupId = "group-1" as unknown as string;
  context.characters = [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }] as unknown as STContext["characters"];
  (context as STContext & { chatMetadata?: unknown }).chatMetadata = {
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
        ash: "ent-ashley",
        ashley: "ent-ashley",
      },
    },
  };

  const tracker: TrackerData = {
    timestamp: 1,
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
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {
      clothes: {},
      pose: {},
      physicality: {},
    },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "ent-ashley": ["worn hoodie"],
      },
      pose: {
        "ent-ashley": "fidgeting near the door",
      },
      physicality: {
        "ent-ashley": "bushy brown braided pigtails, hazel eyes",
      },
    },
  };

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Ash"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "worn hoodie");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_ashley")?.(), "worn hoodie");
  const block = registeredNewEngine.get("bst_image_state")?.() ?? "";
  assert.match(block, /^Scene: Ash/m);
  assert.match(block, /^Ashley: clothes=worn hoodie; pose=fidgeting near the door; physicality=bushy brown braided pigtails, hazel eyes/m);
});

test("syncBstMacros falls back to legacy registration only when new engine is unavailable", () => {
  const { context, registered, registeredNewEngine } = makeContext({ includeNewEngine: false });
  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => makeTracker(),
    getLastInjectedPrompt: () => "<bst_inject_block>demo</bst_inject_block>",
  });

  assert.equal(registered.get("bst_injection")?.(), "<bst_inject_block>demo</bst_inject_block>");
  assert.equal(registered.get("bst_stat_user_clothes")?.(), "hoodie");
  assert.equal(registered.get("bst_stat_scene_scene_date_time")?.(), "2026-03-06 20:05");
  assert.equal(registered.get("bst_stat_char_clothes_seraphina")?.(), "black sundress, sandals");
  assert.equal(registeredNewEngine.size, 0);
});

test("syncBstMacros unregisters previous macros when signature changes and skips re-registering identical signatures", () => {
  const { context, registered, registeredNewEngine, unregistered } = makeContext();
  const settings = makeSettings();
  const tracker = makeTracker();

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "first",
  });
  const countAfterFirst = registeredNewEngine.size;

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "second",
  });
  assert.equal(registered.size, 0);
  assert.equal(registeredNewEngine.size, countAfterFirst);
  assert.deepEqual(unregistered, []);
  assert.equal(registeredNewEngine.get("bst_injection")?.(), "first");

  const debug = getBstMacroDebugSnapshot();
  assert.equal(debug?.["skippedBecauseSignatureUnchanged"], true);
  assert.deepEqual(
    (debug?.["resolutionSamples"] as any)?.character?.resolved,
    "black sundress, sandals",
  );

  const changedSettings = {
    ...settings,
    customStats: settings.customStats.filter(stat => stat.id !== "clothes"),
  };
  syncBstMacros({
    context,
    settings: changedSettings,
    allCharacterNames: ["Seraphina"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "third",
  });
  assert.equal(unregistered.length, 0);
  assert.equal(registeredNewEngine.get("bst_injection")?.(), "third");
  assert.equal(registeredNewEngine.has("bst_stat_user_clothes"), false);
});

test("syncBstMacros creates collision-safe character macros for duplicate names", () => {
  const { context, registered, registeredNewEngine } = makeContext();
  context.characters = [
    { name: "Chloe", avatar: "chloe_a.png" } as any,
    { name: "Chloe", avatar: "chloe_b.png" } as any,
  ];
  const settings = makeSettings();
  const tracker = makeTracker();
  tracker.statistics.affection = { Chloe: 42 };
  tracker.activeCharacters = ["Chloe"];

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Chloe"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "demo",
  });

  assert.equal(registered.has("bst_stat_char_affection_chloe_a"), false);
  assert.equal(registered.has("bst_stat_char_affection_chloe_b"), false);
  assert.equal(registeredNewEngine.get("bst_stat_char_affection_chloe_a")?.(), "42");
  assert.equal(registeredNewEngine.get("bst_stat_char_affection_chloe_b")?.(), "42");
  assert.equal(registeredNewEngine.has("bst_stat_char_affection_chloe"), false);
});

test("syncBstMacros stat getters read fresh tracker data even when registration signature is unchanged", () => {
  const { context, registered, registeredNewEngine } = makeContext();
  const settings = makeSettings();
  let tracker: TrackerData | null = null;

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registered.get("bst_stat_user_clothes")?.(), undefined);
  assert.equal(registeredNewEngine.get("bst_stat_user_clothes")?.(), "");

  tracker = makeTracker();

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registered.get("bst_stat_user_clothes")?.(), undefined);
  assert.equal(registered.get("bst_stat_scene_scene_date_time")?.(), undefined);
  assert.equal(registered.get("bst_stat_char_clothes_seraphina")?.(), undefined);
  assert.equal(registeredNewEngine.get("bst_stat_user_clothes")?.(), "hoodie");
  assert.equal(registeredNewEngine.get("bst_stat_scene_scene_date_time")?.(), "2026-03-06 20:05");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_seraphina")?.(), "black sundress, sandals");
});

test("syncBstMacros exposes a legacy name-slug alias for unique characters when avatar slug differs", () => {
  const { context, registered, registeredNewEngine } = makeContext();
  context.characters = [
    { name: "Seraphina", avatar: "cards/sera_alt.png" } as any,
  ];

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => makeTracker(),
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registered.get("bst_stat_char_clothes_sera_alt")?.(), undefined);
  assert.equal(registered.get("bst_stat_char_clothes_seraphina")?.(), undefined);
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_sera_alt")?.(), "black sundress, sandals");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_seraphina")?.(), "black sundress, sandals");
});

test("syncBstMacros does not fall back to global values for owner-scoped character stats", () => {
  const { context, registered, registeredNewEngine } = makeContext();
  const tracker = makeTracker();
  tracker.customNonNumericStatistics = {
    ...tracker.customNonNumericStatistics,
    clothes: {
      __bst_global__: ["global robe"],
      [USER_TRACKER_KEY]: ["hoodie"],
    },
  };

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registered.get("bst_stat_char_clothes")?.(), undefined);
  assert.equal(registered.get("bst_stat_char_clothes_seraphina")?.(), undefined);
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_seraphina")?.(), "");
});

test("syncBstMacros deduplicates character macro targets by registry entity id", () => {
  const { context } = makeContext();
  context.characters = [{ name: "Ashley", avatar: "camp.png" } as any];
  context.chatMetadata = {
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
          lastSeenMessageIndex: 2,
          lastActiveMessageIndex: 2,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ashley: "ent-ashley",
        ash: "ent-ashley",
      },
    },
  } as any;
  const tracker = makeTracker();
  tracker.statistics.affection = { Ashley: 42 };
  tracker.activeCharacters = ["Ashley"];

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Ash", "Ashley"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  const debug = getBstMacroDebugSnapshot();
  const characterTargets = Array.isArray(debug?.["characterTargets"]) ? debug?.["characterTargets"] as Array<Record<string, unknown>> : [];
  assert.equal(characterTargets.length, 1);
  assert.equal(characterTargets[0]?.ownerName, "Ashley");
});
