import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { USER_TRACKER_KEY } from "../src/constants";
import { defaultSettings } from "../src/settings";
import { buildMacroPreviewCandidates, getBstMacroDebugSnapshot, resetBstMacroStateForTests, syncBstMacros } from "../src/runtimeMacros";
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
      const resolved = String(value ?? "").replace(/\{\{([^{}]+)\}\}/g, (_, rawName) => {
        const name = String(rawName ?? "").trim();
        const handler = registeredNewEngine.get(name) ?? registered.get(name);
        return typeof handler === "function" ? handler() : `{{${name}}}`;
      });
      return resolved.replace(/\\([{}])/g, "$1");
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
      {
        id: "satisfaction",
        kind: "numeric",
        label: "Satisfaction",
        defaultValue: 50,
        maxDeltaPerTurn: 10,
        track: true,
        trackCharacters: false,
        trackUser: true,
        globalScope: false,
        privateToOwner: true,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
      {
        id: "threat_level",
        kind: "enum_single",
        label: "Threat Level",
        defaultValue: "medium",
        enumOptions: ["low", "medium", "high"],
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
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

test("syncBstMacros uses enabled visible scene roster stats for bst_image_state when available", () => {
  const { context, registeredNewEngine } = makeContext();
  const tracker = makeTracker();
  tracker.activeCharacters = ["Seraphina"];
  tracker.customNonNumericStatistics = {
    ...tracker.customNonNumericStatistics,
    characters_in_scene: {
      __bst_global__: ["Ashley", "Blake", "Garret"],
    },
  };
  const settings = makeSettings();
  settings.customStats = [
    ...settings.customStats,
    {
      id: "characters_in_scene",
      kind: "array",
      label: "Characters in Scene",
      defaultValue: [],
      textMaxLength: 80,
      track: true,
      trackCharacters: true,
      trackUser: true,
      globalScope: true,
      privateToOwner: false,
      showOnCard: true,
      showInGraph: false,
      includeInInjection: false,
    },
  ];

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  const block = registeredNewEngine.get("bst_image_state")?.() ?? "";
  assert.match(block, /^Scene: Ashley, Blake, Garret/m);
});

test("syncBstMacros ignores disabled scene roster stats for bst_image_state and falls back to resolver scene owners", () => {
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
    characters_in_scene: {
      __bst_global__: ["Ashley", "Blake", "Garret", "Raleigh"],
    },
  };
  const settings = makeSettings();
  settings.customStats = [
    ...settings.customStats,
    {
      id: "characters_in_scene",
      kind: "array",
      label: "Characters in Scene",
      defaultValue: [],
      textMaxLength: 80,
      track: false,
      trackCharacters: true,
      trackUser: true,
      globalScope: true,
      privateToOwner: false,
      showOnCard: true,
      showInGraph: false,
      includeInInjection: false,
    },
  ];

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Ashley", "Blake", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  const block = registeredNewEngine.get("bst_image_state")?.() ?? "";
  assert.match(block, /^Scene: Ashley, Blake/m);
  assert.doesNotMatch(block, /^Scene: Ashley, Blake, Garret, Raleigh/m);
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

test("syncBstMacros registers explicit mixed-scene macros for alias and narrative entities without source-card wrapper targets", () => {
  const { context, registeredNewEngine } = makeContext();
  const settings = {
    ...makeSettings(),
    entityTrackingMode: "dynamic_characters" as const,
  };
  context.characterId = 0;
  context.name2 = "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh";
  context.characters = [
    {
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      avatar: "Camp Whispering Pines  Ashley, Blake, Garret, & Raleigh.png",
    } as any,
  ];
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_narrative:elias-mercer": {
          id: "bst_narrative:elias-mercer",
          ownerName: "Elias Mercer",
          canonicalName: "Elias Mercer",
          aliases: ["Mercer"],
          sourceName: "Elias Mercer",
          sourceAvatar: null,
          sourceKey: "narrative:elias-mercer",
          kind: "narrative-entity",
          introducedAtMessageIndex: 12,
          lastSeenMessageIndex: 22,
          lastActiveMessageIndex: 22,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        "elias mercer": "bst_narrative:elias-mercer",
        mercer: "bst_narrative:elias-mercer",
      },
    },
  } as any;

  const tracker: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Ashley", "Blake", "Garret", "Raleigh", "Elias Mercer"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh", "Elias Mercer"],
      messageOwners: ["Ashley", "Blake", "Garret", "Raleigh", "Elias Mercer"],
      sceneEntityIds: [
        "ent-ashley",
        "ent-blake",
        "ent-garret",
        "ent-raleigh",
        "bst_narrative:elias-mercer",
      ],
      messageEntityIds: [
        "ent-ashley",
        "ent-blake",
        "ent-garret",
        "ent-raleigh",
        "bst_narrative:elias-mercer",
      ],
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
      "Elias Mercer": {
        entityId: "bst_narrative:elias-mercer",
        ownerName: "Elias Mercer",
        canonicalName: "Elias Mercer",
        aliases: ["Mercer"],
        sourceKey: "narrative:elias-mercer",
        kind: "narrative-entity",
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
        "ent-ashley": ["worn oversized hoodie"],
        "ent-blake": ["oversized dark shirt"],
        "ent-garret": ["leather jacket"],
        "ent-raleigh": ["preppy shirt"],
        "bst_narrative:elias-mercer": ["heavy work boots", "lantern"],
      },
      pose: {
        "ent-ashley": "crumpled on the floor",
        "ent-blake": "pinned against the fireplace",
        "ent-garret": "slumped against the wall",
        "ent-raleigh": "collapsed on hands and knees",
        "bst_narrative:elias-mercer": "standing in the office doorway",
      },
      physicality: {
        "ent-ashley": "messy brown pigtails",
        "ent-blake": "heavy charcoal eyeliner",
        "ent-garret": "scarred knuckles",
        "ent-raleigh": "sweaty tangled hair",
        "bst_narrative:elias-mercer": "holding pulsing lantern, deep-set eyes",
      },
    },
  };

  syncBstMacros({
    context,
    settings,
    allCharacterNames: [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Elias Mercer",
    ],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_ashley")?.(), "worn oversized hoodie");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_blake")?.(), "oversized dark shirt");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_elias_mercer")?.(), "heavy work boots, lantern");
  assert.equal(registeredNewEngine.has("bst_stat_char_clothes_camp_whispering_pines_ashley_blake_garret_raleigh"), false);
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "\\{\\{bst_stat_char_clothes\\}\\}");
  assert.equal(context.substituteParams("{{bst_stat_char_clothes}}"), "{{bst_stat_char_clothes}}");

  const previewCandidates = buildMacroPreviewCandidates({
    context,
    settings,
    data: tracker,
    allCharacterNames: [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Elias Mercer",
    ],
  });
  assert.deepEqual(
    previewCandidates.map(candidate => candidate.name),
    ["Ashley", "Blake", "Garret", "Raleigh", "Elias Mercer"],
  );

  const debug = getBstMacroDebugSnapshot();
  assert.equal(debug?.["currentCharacterTarget"], null);
});

test("syncBstMacros resets bare character macros to a literal fallback when switching from single-target to mixed-target scope", () => {
  const { context, registeredNewEngine } = makeContext();

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => makeTracker(),
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "black sundress, sandals");

  const settings = {
    ...makeSettings(),
    entityTrackingMode: "dynamic_characters" as const,
  };
  context.characterId = 0;
  context.name2 = "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh";
  context.characters = [
    {
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      avatar: "Camp Whispering Pines  Ashley, Blake, Garret, & Raleigh.png",
    } as any,
  ];

  const tracker: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
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
    statistics: { affection: {}, trust: {}, desire: {}, connection: {}, mood: {}, lastThought: {} },
    statisticsByEntityId: { affection: {}, trust: {}, desire: {}, connection: {}, mood: {}, lastThought: {} },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: { clothes: {}, pose: {}, physicality: {} },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "ent-ashley": ["worn oversized hoodie"],
        "ent-blake": ["oversized dark shirt"],
        "ent-garret": ["leather jacket"],
        "ent-raleigh": ["preppy shirt"],
      },
    },
  };

  syncBstMacros({
    context,
    settings,
    allCharacterNames: [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      USER_TRACKER_KEY,
    ],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "\\{\\{bst_stat_char_clothes\\}\\}");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_ashley")?.(), "worn oversized hoodie");
  assert.equal(context.substituteParams("{{bst_stat_char_clothes}}"), "{{bst_stat_char_clothes}}");
});

test("syncBstMacros keeps character stat macros scoped to the current entity id instead of stale same-name registry aliases", () => {
  const { context, registeredNewEngine } = makeContext();
  context.name2 = "Blake";
  context.characters = [{ name: "Blake", avatar: "blake-current.png" }] as unknown as STContext["characters"];
  (context as STContext & { chatMetadata?: unknown }).chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "ent-blake-stale": {
          id: "ent-blake-stale",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["B-stale"],
          sourceName: "Old Blake",
          sourceAvatar: "blake-stale.png",
          sourceKey: "blake-stale.png|old blake",
          kind: "multi_character_alias",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 0,
          lastActiveMessageIndex: 0,
          lifecycleState: "inactive",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        blake: "ent-blake-stale",
        "b-stale": "ent-blake-stale",
      },
    },
  };

  const tracker: TrackerData = {
    timestamp: 1,
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
        sourceKey: "blake-current.png|blake current",
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
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        "B-current": ["oversized black hoodie"],
        "B-stale": ["old wrong jacket"],
      },
    },
  };

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Blake"],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_char_clothes")?.(), "oversized black hoodie");
  assert.equal(registeredNewEngine.get("bst_stat_char_clothes_blake")?.(), "oversized black hoodie");
  const debug = getBstMacroDebugSnapshot();
  const currentCharacterTarget = debug?.["currentCharacterTarget"] as Record<string, unknown> | undefined;
  assert.equal(currentCharacterTarget?.entityId, "ent-blake-current");
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

test("syncBstMacros falls back to configured custom defaults when owner-scoped custom stats have no persisted value yet", () => {
  const { context, registeredNewEngine } = makeContext();
  const tracker = makeTracker();

  syncBstMacros({
    context,
    settings: makeSettings(),
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_user_satisfaction")?.(), "50");
  assert.equal(registeredNewEngine.get("bst_stat_char_threat_level_seraphina")?.(), "medium");
});

test("syncBstMacros still exposes scope-specific macros when legacy track is false but scope flags remain enabled", () => {
  const { context, registeredNewEngine } = makeContext();
  const settings = makeSettings();
  const satisfaction = settings.customStats.find(stat => stat.id === "satisfaction");
  assert.ok(satisfaction);
  satisfaction.track = false;
  satisfaction.trackUser = true;

  const tracker = makeTracker();

  syncBstMacros({
    context,
    settings,
    allCharacterNames: ["Seraphina", USER_TRACKER_KEY],
    getLatestPromptMacroData: () => tracker,
    getLastInjectedPrompt: () => "",
  });

  assert.equal(registeredNewEngine.get("bst_stat_user_satisfaction")?.(), "50");
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
  assert.equal(characterTargets[0]?.entityId, "ent-ashley");
});
