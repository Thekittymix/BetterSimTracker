import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import {
  collectResolvedCharacterNames,
  extractMultiCharacterAliases,
  filterResolvedEntitiesToTrackedOwners,
  isAliasResolvedOwner,
  projectTrackerDataToMessageScopedOwners,
  resolvePersistedActiveOwners,
  resolvePersistedSnapshotActiveOwners,
  resolvePersistedSnapshotEntityOwners,
  resolvePersistedSnapshotResolvedEntities,
  resolveCharacterIdentity,
  resolveCharacterFromContext,
  resolveStableEntityIdForOwner,
  constrainFallbackOwnerScopesToPreviousUserScene,
  constrainResolvedOwnerScopesToPreviousUserScene,
  resolveExtractionOwnerScopes,
  resolveEntityResolverCandidateOwners,
  resolveInitialExtractionOwners,
  resolveMessageScopedActiveCharacters,
  resolveMessageScopedParticipants,
  resolveUserExtractionOwnerScopes,
} from "../src/entityResolution";
import { USER_TRACKER_KEY } from "../src/constants";

test("extractMultiCharacterAliases parses multi-character source card names generically", () => {
  assert.deepEqual(
    extractMultiCharacterAliases("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"),
    ["Ashley", "Blake", "Garret", "Raleigh"],
  );
  assert.deepEqual(
    extractMultiCharacterAliases("Some Card: Alice and Bob / Carol"),
    ["Alice", "Bob", "Carol"],
  );
  assert.deepEqual(extractMultiCharacterAliases("Seraphina"), []);
});

test("resolveCharacterIdentity maps alias names back to the source card in multi-character mode", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  const alias = resolveCharacterIdentity(context, "Ashley", "dynamic_characters");
  assert.deepEqual(alias, {
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    resolvedName: "Ashley",
    matchedBy: "alias",
  });

  const source = resolveCharacterIdentity(context, "Billie", "dynamic_characters");
  assert.deepEqual(source, {
    sourceName: "Billie",
    sourceAvatar: "billie.png",
    resolvedName: "Billie",
    matchedBy: "source",
  });
});

test("resolveCharacterFromContext returns the source character entry for a resolved alias", () => {
  const camp = {
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    avatar: "camp.png",
    description: "Camp description.",
  };
  const context = { characters: [camp] } as any;

  assert.equal(resolveCharacterFromContext(context, "Raleigh", "dynamic_characters"), camp);
  assert.equal(resolveCharacterFromContext(context, "Raleigh", "standard"), null);
});

test("isAliasResolvedOwner is true only for aliases in multi-character mode", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  assert.equal(isAliasResolvedOwner(context, "Ashley", { entityTrackingMode: "dynamic_characters" }), true);
  assert.equal(isAliasResolvedOwner(context, "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", { entityTrackingMode: "dynamic_characters" }), false);
  assert.equal(isAliasResolvedOwner(context, "Ashley", { entityTrackingMode: "standard" }), false);
});

test("collectResolvedCharacterNames includes aliases only in multi-character mode", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  assert.deepEqual(
    collectResolvedCharacterNames(context, { entityTrackingMode: "standard" }),
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"],
  );
  assert.deepEqual(
    collectResolvedCharacterNames(context, { entityTrackingMode: "dynamic_characters" }),
    [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Billie",
    ],
  );
});

test("resolveMessageScopedActiveCharacters expands a multi-character source owner to the full alias pool for scene continuity", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  const resolved = resolveMessageScopedActiveCharacters(
    context,
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"],
    {
      mes: "Ashley flinched at the direct question. Her gaze darted from the door to the floor and back again.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved, ["Ashley", "Blake", "Garret", "Raleigh", "Billie"]);
});

test("resolveMessageScopedActiveCharacters keeps multi-character source owners expanded even when the message mentions multiple aliases", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const resolved = resolveMessageScopedActiveCharacters(
    context,
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    {
      mes: "The tense silence hung between Ashley and Blake as both of them stared toward the door.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved, ["Ashley", "Blake", "Garret", "Raleigh"]);
});

test("resolveMessageScopedParticipants narrows a multi-character speaker to the aliases actually present in the AI message", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  const resolved = resolveMessageScopedParticipants(
    context,
    ["Ashley", "Blake", "Garret", "Raleigh", "Billie"],
    {
      mes: "Ashley froze at the door while Blake glanced over her shoulder.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved, ["Ashley", "Blake"]);
});

test("resolveMessageScopedParticipants keeps a non-multi speaker even if the message does not repeat its own name", () => {
  const context = {
    characters: [
      { name: "Billie", avatar: "billie.png" },
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const resolved = resolveMessageScopedParticipants(
    context,
    ["Billie", "Ashley", "Blake"],
    {
      mes: "She crossed her arms and stared at the window.",
      name: "Billie",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved, ["Billie"]);
});

test("resolveEntityResolverCandidateOwners strips a technical multi-character source owner down to concrete alias candidates", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  const resolved = resolveEntityResolverCandidateOwners(
    context,
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"],
    {
      mes: "Blake watched the door click shut while Billie stayed quiet.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved, ["Ashley", "Blake", "Garret", "Raleigh", "Billie"]);
});

test("resolveExtractionOwnerScopes keeps scene-active aliases broader than request targets for focused multi-character replies", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const resolved = resolveExtractionOwnerScopes(
    context,
    ["Ashley", "Blake", "Garret", "Raleigh"],
    {
      mes: "Ashley lowered her voice and answered without looking up.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved.sceneActiveCharacters, ["Ashley", "Blake", "Garret", "Raleigh"]);
  assert.deepEqual(resolved.requestCharacters, ["Ashley"]);
});

test("resolveExtractionOwnerScopes narrows scene-active aliases when a recent user turn explicitly sends the others away", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        mes: "Ashley answered softly while Blake hovered by the window and Garret paced behind Raleigh.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
      {
        mes: "Only Ashley is still here with me now. Blake, Garret, and Raleigh already left the room. Ashley only.",
        name: "User",
        is_user: true,
      },
      {
        mes: "Ashley fidgeted with the ends of her braids and answered under her breath.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
    ],
  } as any;

  const resolved = resolveExtractionOwnerScopes(
    context,
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    context.chat[2],
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(resolved.sceneActiveCharacters, ["Ashley"]);
  assert.deepEqual(resolved.requestCharacters, ["Ashley"]);
});

test("resolveUserExtractionOwnerScopes keeps non-user scene continuity while pinning request ownership to the user", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        mes: "Raleigh greeted Kuba while Ashley, Blake, and Garret lingered nearby.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
      {
        mes: "Blake, answer only for yourself in one short reply. Ashley, Garret, and Raleigh stay silent.",
        name: "Kuba",
        is_user: true,
      },
    ],
  } as any;

  const resolved = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    message: context.chat[1],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    resolvedSceneActiveCharacters: null,
  });

  assert.deepEqual(resolved, {
    sceneActiveCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
    requestCharacters: [USER_TRACKER_KEY],
    source: "fallback",
  });
});

test("resolveUserExtractionOwnerScopes preserves previous mixed-scene continuity when fallback activity no longer includes an inactive narrative entity", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        mes: "Earlier mixed-scene turn.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
      {
        mes: "I stop looking at the woods and focus on Blake instead.",
        name: "Kuba",
        is_user: true,
      },
    ],
  } as any;

  const resolved = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    message: context.chat[1],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    resolvedSceneActiveCharacters: null,
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Blake", "Forest Spirit"],
      entityResolution: buildEntityResolution({
        resolvedEntities: [
          {
            entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
            kind: "st-character",
            name: "Blake",
            aliases: ["Blake"],
            avatar: null,
            inScene: true,
            inMessage: true,
            created: false,
          },
          {
            entityId: "bst_narrative:forest-spirit",
            kind: "narrative-entity",
            name: "Forest Spirit",
            aliases: ["the spirit"],
            avatar: null,
            inScene: true,
            inMessage: false,
            created: false,
          },
        ],
        source: "model",
      }),
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
        Blake: {
          entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["Blake"],
          sourceKey: "camp.png|camp whispering pines",
          kind: "multi_character_alias",
        },
        "Forest Spirit": {
          entityId: "bst_narrative:forest-spirit",
          ownerName: "Forest Spirit",
          canonicalName: "Forest Spirit",
          aliases: ["the spirit"],
          sourceKey: "narrative:bst_narrative:forest-spirit",
          kind: "narrative-entity",
        },
      },
    } as any,
  });

  assert.deepEqual(resolved, {
    sceneActiveCharacters: ["Blake", "Forest Spirit"],
    requestCharacters: [USER_TRACKER_KEY],
    source: "fallback",
  });
});

test("resolveUserExtractionOwnerScopes merges previous scene continuity into a partial resolved user-turn scene when omitted owners did not explicitly leave", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        mes: "Everyone is still in the office, but Mercer is part of the story now.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
      {
        mes: "I glance from Blake to Ashley and ask what Mercer wanted from each of them.",
        name: "Kuba",
        is_user: true,
      },
    ],
  } as any;

  const resolved = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    message: context.chat[1],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    resolvedSceneActiveCharacters: ["Ashley", "Blake", "Elias Mercer"],
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
      entityResolution: buildEntityResolution({
        sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
        messageOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
        source: "model",
      }),
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
    } as any,
  });

  assert.deepEqual(resolved, {
    sceneActiveCharacters: ["Ashley", "Blake", "Elias Mercer", "Garret", "Raleigh"],
    requestCharacters: [USER_TRACKER_KEY],
    source: "model",
  });
});

test("resolveUserExtractionOwnerScopes does not restore omitted previous scene owners when the user message explicitly sends them away", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        mes: "Ashley and Blake were both in the room a moment ago.",
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        is_user: false,
      },
      {
        mes: "Ashley leaves the room. Blake stays here alone now and answers in one short reply.",
        name: "Kuba",
        is_user: true,
      },
    ],
  } as any;

  const resolved = resolveUserExtractionOwnerScopes({
    context,
    detectedActiveCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
    message: context.chat[1],
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    resolvedSceneActiveCharacters: ["Blake"],
    previousTrackerData: {
      timestamp: 1,
      activeCharacters: ["Ashley", "Blake"],
      entityResolution: buildEntityResolution({
        sceneOwners: ["Ashley", "Blake"],
        messageOwners: ["Ashley", "Blake"],
        source: "model",
      }),
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
    } as any,
  });

  assert.deepEqual(resolved, {
    sceneActiveCharacters: ["Blake"],
    requestCharacters: [USER_TRACKER_KEY],
    source: "model",
  });
});

test("resolvePersistedActiveOwners excludes User by default for AI-side tracker targets", () => {
  const refined = resolvePersistedActiveOwners(["Ashley", "Blake", "__bst_user__"]);
  assert.deepEqual(refined, ["Ashley", "Blake"]);
});

test("resolvePersistedActiveOwners can retain User for user-side tracker targets", () => {
  const refined = resolvePersistedActiveOwners(["__bst_user__"], { includeUserOwner: true });
  assert.deepEqual(refined, ["__bst_user__"]);
});

test("constrainFallbackOwnerScopesToPreviousUserScene keeps fallback AI scopes inside the latest user-declared scene", () => {
  const constrained = constrainFallbackOwnerScopesToPreviousUserScene({
    userExtraction: false,
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    previousMessage: {
      is_user: true,
      name: "Kuba",
      mes: "Blake leaves too. Raleigh stays with me now and answers in one short reply.",
    } as any,
    previousTrackerData: {
      entityResolution: buildEntityResolution({
        sceneOwners: ["Raleigh"],
        messageOwners: [USER_TRACKER_KEY],
        source: "model",
      }),
    } as any,
    fallbackSceneActiveCharacters: ["Garret", "Raleigh"],
    fallbackRequestCharacters: ["Ashley", "Raleigh"],
  });

  assert.deepEqual(constrained, {
    sceneActiveCharacters: ["Raleigh"],
    requestCharacters: ["Raleigh"],
  });
});

test("constrainFallbackOwnerScopesToPreviousUserScene can preserve an explicitly empty scene", () => {
  const constrained = constrainFallbackOwnerScopesToPreviousUserScene({
    userExtraction: false,
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    previousMessage: {
      is_user: true,
      name: "Kuba",
      mes: "Raleigh exits too. Nobody from the group stays here with me now.",
    } as any,
    previousTrackerData: {
      entityResolution: buildEntityResolution({
        sceneOwners: [],
        messageOwners: [USER_TRACKER_KEY],
        source: "fallback",
      }),
    } as any,
    fallbackSceneActiveCharacters: ["Garret", "Raleigh"],
    fallbackRequestCharacters: ["Garret", "Raleigh"],
  });

  assert.deepEqual(constrained, {
    sceneActiveCharacters: [],
    requestCharacters: [],
  });
});

test("constrainResolvedOwnerScopesToPreviousUserScene keeps no-speaker AI scopes inside the latest user-declared scene", () => {
  const constrained = constrainResolvedOwnerScopesToPreviousUserScene({
    userExtraction: false,
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    previousMessage: {
      is_user: true,
      name: "Kuba",
      mes: "Raleigh exits too. Nobody from the group stays here with me now.",
    } as any,
    previousTrackerData: {
      entityResolution: buildEntityResolution({
        sceneOwners: [],
        messageOwners: [USER_TRACKER_KEY],
        source: "fallback",
      }),
    } as any,
    resolvedSceneActiveCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
    resolvedRequestCharacters: [],
  });

  assert.deepEqual(constrained, {
    sceneActiveCharacters: [],
    requestCharacters: [],
  });
});

test("constrainResolvedOwnerScopesToPreviousUserScene does not clamp replies that still have explicit participants", () => {
  const constrained = constrainResolvedOwnerScopesToPreviousUserScene({
    userExtraction: false,
    settings: { entityTrackingMode: "dynamic_characters" } as any,
    previousMessage: {
      is_user: true,
      name: "Kuba",
      mes: "Blake stays and answers.",
    } as any,
    previousTrackerData: {
      entityResolution: buildEntityResolution({
        sceneOwners: ["Blake"],
        messageOwners: [USER_TRACKER_KEY],
        source: "model",
      }),
    } as any,
    resolvedSceneActiveCharacters: ["Ashley", "Blake"],
    resolvedRequestCharacters: ["Blake"],
  });

  assert.equal(constrained, null);
});

test("resolvePersistedActiveOwners excludes User from resolver-backed entity owner sets by default", () => {
  const refined = resolvePersistedActiveOwners(["Blake", "__bst_user__"]);
  assert.deepEqual(refined, ["Blake"]);
});

test("resolveInitialExtractionOwners keeps user extraction pinned to the user owner", () => {
  const resolved = resolveInitialExtractionOwners({
    userExtraction: true,
    forceRetrack: true,
    detectedActiveCharacters: ["Blake"],
    existingActiveCharacters: ["Garret", "Raleigh"],
  });
  assert.deepEqual(resolved, ["__bst_user__"]);
});

test("resolveInitialExtractionOwners reuses existing tracker owners when retracking a message with saved data", () => {
  const resolved = resolveInitialExtractionOwners({
    context: null,
    userExtraction: false,
    forceRetrack: true,
    detectedActiveCharacters: ["Garret", "Raleigh"],
    existingActiveCharacters: ["Blake", "__bst_user__"],
  });
  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveInitialExtractionOwners can ignore existing tracker owners on swipe retracks", () => {
  const resolved = resolveInitialExtractionOwners({
    context: { name1: "User" } as never,
    userExtraction: false,
    forceRetrack: true,
    preferExistingOwnersOnRetrack: false,
    detectedActiveCharacters: ["Blake"],
    existingTrackerData: {
      timestamp: 1,
      activeCharacters: ["Garret", "Raleigh"],
      statistics: {
        affection: { Garret: 50, Raleigh: 50 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    existingActiveCharacters: ["Garret", "Raleigh"],
  });
  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveInitialExtractionOwners uses fresh activity for first-pass extraction", () => {
  const resolved = resolveInitialExtractionOwners({
    context: null,
    userExtraction: false,
    forceRetrack: false,
    detectedActiveCharacters: ["Ashley", "Blake"],
    existingActiveCharacters: ["Garret"],
  });
  assert.deepEqual(resolved, ["Ashley", "Blake"]);
});

test("resolveInitialExtractionOwners prefers built-in stat owners from saved tracker data when retracking", () => {
  const resolved = resolveInitialExtractionOwners({
    context: { name1: "User" } as never,
    userExtraction: false,
    forceRetrack: true,
    detectedActiveCharacters: ["Garret", "Raleigh"],
    existingTrackerData: {
      timestamp: 1,
      activeCharacters: ["Garret", "Raleigh"],
      statistics: {
        affection: { Blake: 49 },
        trust: { Blake: 49 },
        desire: {},
        connection: {},
        mood: { __bst_user__: "Neutral", Blake: "Neutral" },
        lastThought: { __bst_user__: "x", Blake: "y" },
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    existingActiveCharacters: ["Garret", "Raleigh"],
  });
  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveInitialExtractionOwners prefers resolver scene owners over stale built-in owner buckets when retracking", () => {
  const resolved = resolveInitialExtractionOwners({
    context: { name1: "User" } as never,
    userExtraction: false,
    forceRetrack: true,
    detectedActiveCharacters: ["Garret", "Raleigh"],
    existingTrackerData: {
      timestamp: 1,
      activeCharacters: ["Garret", "Raleigh"],
      entityResolution: buildEntityResolution({
        source: "model",
        sceneOwners: ["Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["bst_mc_alias:test:blake"],
        messageEntityIds: ["bst_mc_alias:test:blake"],
      }),
      statistics: {
        affection: { Garret: 50, Raleigh: 50 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    existingActiveCharacters: ["Garret", "Raleigh"],
  });
  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveInitialExtractionOwners can resolve scene owners from persisted sceneEntityIds through entityOwnerMap", () => {
  const resolved = resolveInitialExtractionOwners({
    context: { name1: "User" } as never,
    userExtraction: false,
    forceRetrack: true,
    detectedActiveCharacters: ["Garret", "Raleigh"],
    existingTrackerData: {
      timestamp: 1,
      activeCharacters: ["Garret", "Raleigh"],
      entityResolution: buildEntityResolution({
        source: "model",
        sceneOwners: [],
        messageOwners: [],
        sceneEntityIds: ["bst_mc_alias:test:blake"],
        messageEntityIds: ["bst_mc_alias:test:blake"],
      }),
      entityOwnerMap: {
        Blake: {
          entityId: "bst_mc_alias:test:blake",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["Blackout Blake"],
          sourceKey: "camp.png|camp whispering pines",
          kind: "multi_character_alias",
        },
      },
      statistics: {
        affection: { Garret: 50, Raleigh: 50 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    existingActiveCharacters: ["Garret", "Raleigh"],
  });
  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveExtractionOwnerScopes narrows scene activity to a single remaining alias when the latest user cue makes presence exclusive", () => {
  const context = {
    characterId: 0,
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chatMetadata: {},
    chat: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "Raleigh greeted User while Ashley fidgeted and Garret paced in the background.",
        is_user: false,
        is_system: false,
      },
      {
        name: "User",
        mes: "Ashley leaves the room. Blake stays here alone now and answers in one short reply.",
        is_user: true,
        is_system: false,
      },
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "Blake remained by the filing cabinet and answered in a flat monotone.",
        is_user: false,
        is_system: false,
      },
    ],
  } as any;

  const result = resolveExtractionOwnerScopes(
    context,
    ["Ashley", "Blake", "Garret", "Raleigh"],
    context.chat[2],
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(result.requestCharacters, ["Blake"]);
  assert.deepEqual(result.sceneActiveCharacters, ["Blake"]);
});

test("projectTrackerDataToMessageScopedOwners remaps source-card tracker payload to the inferred alias owner", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const projected = projectTrackerDataToMessageScopedOwners(
    context,
    {
      timestamp: 1,
      activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      entityResolution: buildEntityResolution({
        sceneOwners: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
        messageOwners: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
        sceneEntityIds: ["bst_mc_source:camp.png"],
        messageEntityIds: ["bst_mc_source:camp.png"],
        source: "model",
      }),
      statistics: {
        affection: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": 51 },
        trust: {},
        desire: {},
        connection: {},
        mood: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": "Anxious" },
        lastThought: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": "Need to keep moving." },
      },
      customStatistics: {},
      customNonNumericStatistics: {
        clothes: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": ["sneakers"] },
        pose: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": "Frozen in the kitchen doorway." },
      },
    },
    {
      mes: "Ashley flinched and stared toward the door.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(projected.activeCharacters, ["Ashley"]);
  assert.deepEqual(projected.entityResolution, buildEntityResolution({
    sceneOwners: ["Ashley"],
    messageOwners: ["Ashley"],
    sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley"],
    messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley"],
    source: "model",
  }));
  assert.deepEqual(projected.statistics.affection, { Ashley: 51 });
  assert.deepEqual(projected.statistics.mood, { Ashley: "Anxious" });
  assert.deepEqual(projected.statistics.lastThought, { Ashley: "Need to keep moving." });
  assert.deepEqual(projected.customNonNumericStatistics?.clothes, { Ashley: ["sneakers"] });
  assert.deepEqual(projected.customNonNumericStatistics?.pose, { Ashley: "Frozen in the kitchen doorway." });
  assert.equal(projected.entityOwnerMap, undefined);
});

test("projectTrackerDataToMessageScopedOwners remaps technical resolved entity labels through entity identity before fallback", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const projected = projectTrackerDataToMessageScopedOwners(
    context,
    {
      timestamp: 1,
      activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      entityResolution: buildEntityResolution({
        resolvedEntities: [{
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          kind: "st-character",
          name: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        }],
        source: "model",
      }),
      entityOwnerMap: {
        Ashley: {
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: [],
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
        },
      },
      statistics: {
        affection: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": 51 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
    },
    {
      mes: "Ashley flinched and stared toward the door.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(projected.activeCharacters, ["Ashley"]);
  assert.deepEqual(projected.entityResolution, buildEntityResolution({
    resolvedEntities: [{
      entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
      kind: "st-character",
      name: "Ashley",
      avatar: null,
      aliases: undefined,
      inScene: true,
      inMessage: true,
      created: false,
    }],
    source: "model",
  }));
});

test("projectTrackerDataToMessageScopedOwners can leave owner-scoped non-numeric custom stats unmapped for continuity reads", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const projected = projectTrackerDataToMessageScopedOwners(
    context,
    {
      timestamp: 1,
      activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      statistics: {
        affection: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": 51 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {
        clothes: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": ["sneakers"] },
      },
    },
    {
      mes: "Ashley flinched and stared toward the door.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
    { projectOwnerScopedCustomNonNumeric: false },
  );

  assert.deepEqual(projected.activeCharacters, ["Ashley"]);
  assert.deepEqual(projected.statistics.affection, { Ashley: 51 });
  assert.deepEqual(projected.customNonNumericStatistics?.clothes, {
    "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": ["sneakers"],
  });
});

test("projectTrackerDataToMessageScopedOwners preserves narrative entity ids when owner labels collide with source-card aliases", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const projected = projectTrackerDataToMessageScopedOwners(
    context,
    {
      timestamp: 1,
      activeCharacters: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      entityResolution: buildEntityResolution({
        resolvedEntities: [
          {
            entityId: "bst_narrative:ashley-shadow",
            kind: "narrative-entity",
            name: "Ashley",
            avatar: null,
            aliases: ["The Ashley in the mirror"],
            inScene: true,
            inMessage: true,
            created: true,
          },
        ],
        source: "model",
      }),
      entityOwnerMap: {
        Ashley: {
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: [],
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
        },
      },
      statistics: {
        affection: { "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": 51 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
    },
    {
      mes: "Ashley flinched and stared toward the door.",
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      is_user: false,
    } as any,
    { entityTrackingMode: "dynamic_characters" },
  );

  assert.deepEqual(projected.entityResolution, buildEntityResolution({
    resolvedEntities: [
      {
        entityId: "bst_narrative:ashley-shadow",
        kind: "narrative-entity",
        name: "Ashley",
        avatar: null,
        aliases: ["The Ashley in the mirror"],
        inScene: true,
        inMessage: true,
        created: true,
      },
    ],
    source: "model",
  }));
});

test("resolvePersistedSnapshotActiveOwners keeps user snapshots scoped to the user tracker owner", () => {
  assert.deepEqual(
    resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters: ["Blake"],
      requestCharacters: [USER_TRACKER_KEY],
      userExtraction: true,
    }),
    [USER_TRACKER_KEY],
  );

  assert.deepEqual(
    resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters: ["Blake"],
      requestCharacters: [USER_TRACKER_KEY],
      userExtraction: false,
    }),
    [],
  );

  assert.deepEqual(
    resolvePersistedSnapshotActiveOwners({
      sceneActiveCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
      requestCharacters: ["Blake"],
      userExtraction: false,
    }),
    ["Blake"],
  );
});

test("resolvePersistedSnapshotResolvedEntities keeps user snapshots scene-only and preserves AI message participation", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  assert.deepEqual(
    resolvePersistedSnapshotResolvedEntities({
      context,
      sceneActiveCharacters: ["Blake"],
      requestCharacters: [USER_TRACKER_KEY],
      resolvedEntities: [{
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      }],
      userExtraction: true,
    }),
    [{
      entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
      kind: "st-character",
      name: "Blake",
      avatar: null,
      aliases: undefined,
      inScene: true,
      inMessage: false,
      created: false,
    }],
  );

  assert.deepEqual(
    resolvePersistedSnapshotResolvedEntities({
      context,
      sceneActiveCharacters: ["Blake"],
      requestCharacters: ["Blake"],
      resolvedEntities: [{
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      }],
      userExtraction: false,
    }),
    [{
      entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
      kind: "st-character",
      name: "Blake",
      avatar: null,
      aliases: undefined,
      inScene: true,
      inMessage: true,
      created: false,
    }],
  );
});

test("resolvePersistedSnapshotEntityOwners keeps full scene continuity owners and excludes the user owner", () => {
  assert.deepEqual(
    resolvePersistedSnapshotEntityOwners({
      sceneActiveCharacters: ["Ashley", "Blake"],
    }),
    ["Ashley", "Blake"],
  );

  assert.deepEqual(
    resolvePersistedSnapshotEntityOwners({
      sceneActiveCharacters: ["Blake", USER_TRACKER_KEY],
    }),
    ["Blake"],
  );
});

test("resolveEntityResolverCandidateOwners keeps archived narrative entities available for dynamic reactivation", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chatMetadata: {
      bstEntityRegistry: {
        entities: {
          "bst_narrative:forest-spirit": {
            id: "bst_narrative:forest-spirit",
            ownerName: "Forest Spirit",
            canonicalName: "Forest Spirit",
            aliases: ["the spirit"],
            kind: "narrative-entity",
            sourceKey: "narrative:bst_narrative:forest-spirit",
            introducedAtMessageIndex: 12,
            lastSeenMessageIndex: 16,
            lastActiveMessageIndex: 16,
            lifecycleState: "archived",
            archivedAtMessageIndex: 18,
            lifecycleEvents: [
              { messageIndex: 12, state: "active" },
              { messageIndex: 17, state: "inactive" },
              { messageIndex: 18, state: "archived" },
            ],
          },
        },
        ownerToEntityId: {
          "forest spirit": "bst_narrative:forest-spirit",
          "the spirit": "bst_narrative:forest-spirit",
        },
      },
    },
    chat: [
      ...Array.from({ length: 22 }, (_, index) => ({
        name: index % 2 === 0
          ? "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"
          : "User",
        mes: `Earlier turn ${index}.`,
        is_user: index % 2 === 1,
        is_system: false,
      })),
      {
        name: "User",
        mes: "Blake, talk about yourself and the spirit in the same reply.",
        is_user: true,
        is_system: false,
      },
    ],
  } as any;

  assert.deepEqual(
    resolveEntityResolverCandidateOwners(
      context,
      ["Ashley", "Blake", "Garret", "Raleigh"],
      context.chat[22],
      { entityTrackingMode: "dynamic_characters" },
      {
        previousTrackerData: {
          timestamp: 1,
          activeCharacters: ["Blake", "Forest Spirit"],
          entityResolution: buildEntityResolution({
            resolvedEntities: [
              {
                entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
                kind: "st-character",
                name: "Blake",
                avatar: null,
                aliases: ["Blake"],
                inScene: true,
                inMessage: true,
                created: false,
              },
              {
                entityId: "bst_narrative:forest-spirit",
                kind: "narrative-entity",
                name: "Forest Spirit",
                avatar: null,
                aliases: ["the spirit"],
                inScene: true,
                inMessage: true,
                created: false,
              },
            ],
            source: "model",
          }),
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
            Blake: {
              entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blake"],
              sourceKey: "camp.png|camp whispering pines",
              kind: "multi_character_alias",
            },
            "Forest Spirit": {
              entityId: "bst_narrative:forest-spirit",
              ownerName: "Forest Spirit",
              canonicalName: "Forest Spirit",
              aliases: ["the spirit"],
              sourceKey: "narrative:bst_narrative:forest-spirit",
              kind: "narrative-entity",
            },
          },
        } as any,
      },
    ),
    ["Blake", "Forest Spirit"],
  );
});

test("resolveEntityResolverCandidateOwners can widen a user-turn candidate set with explicitly named aliases outside the previous scene", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        name: "User",
        mes: "Ashley and Blake, answer together.",
        is_user: true,
        is_system: false,
      },
    ],
  } as any;

  assert.deepEqual(
    resolveEntityResolverCandidateOwners(
      context,
      ["Ashley", "Blake", "Garret", "Raleigh"],
      context.chat[0],
      { entityTrackingMode: "dynamic_characters" },
      {
        previousTrackerData: {
          timestamp: 1,
          activeCharacters: ["Blake"],
          entityResolution: buildEntityResolution({
            sceneOwners: ["Blake"],
            messageOwners: ["Blake"],
            sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines:blake"],
            messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines:blake"],
            source: "model",
          }),
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
            Blake: {
              entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blake"],
              sourceKey: "camp.png|camp whispering pines",
              kind: "multi_character_alias",
            },
          },
        } as any,
      },
    ),
    ["Blake", "Ashley"],
  );
});

test("resolveEntityResolverCandidateOwners keeps ai-turn candidates scoped to the previous scene when the reply only advances one alias", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "*Blake folded his arms over his chest.* \"My existence is simply a performance.\"",
        is_user: false,
        is_system: false,
      },
    ],
  } as any;

  assert.deepEqual(
    resolveEntityResolverCandidateOwners(
      context,
      ["Ashley", "Blake", "Garret", "Raleigh", "spirit"],
      context.chat[0],
      { entityTrackingMode: "dynamic_characters" },
      {
        previousTrackerData: {
          timestamp: 1,
          activeCharacters: ["Blake", "spirit"],
          entityResolution: buildEntityResolution({
            sceneOwners: ["Blake", "spirit"],
            messageOwners: ["Blake", "spirit"],
            sceneEntityIds: [
              "bst_mc_alias:camp.png|camp whispering pines:blake",
              "bst_narrative:spirit",
            ],
            messageEntityIds: [
              "bst_mc_alias:camp.png|camp whispering pines:blake",
              "bst_narrative:spirit",
            ],
            source: "model",
          }),
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
            Blake: {
              entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blake"],
              sourceKey: "camp.png|camp whispering pines",
              kind: "multi_character_alias",
            },
            spirit: {
              entityId: "bst_narrative:spirit",
              ownerName: "spirit",
              canonicalName: "spirit",
              aliases: ["the spirit"],
              sourceKey: "narrative:bst_narrative:spirit",
              kind: "narrative-entity",
            },
          },
        } as any,
      },
    ),
    ["Blake", "spirit"],
  );
});

test("resolveEntityResolverCandidateOwners can widen an ai-turn candidate set with explicit off-scene mentions", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chat: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "*Blake glanced at Ashley before answering her.*",
        is_user: false,
        is_system: false,
      },
    ],
  } as any;

  assert.deepEqual(
    resolveEntityResolverCandidateOwners(
      context,
      ["Ashley", "Blake", "Garret", "Raleigh"],
      context.chat[0],
      { entityTrackingMode: "dynamic_characters" },
      {
        previousTrackerData: {
          timestamp: 1,
          activeCharacters: ["Blake"],
          entityResolution: buildEntityResolution({
            sceneOwners: ["Blake"],
            messageOwners: ["Blake"],
            sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines:blake"],
            messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines:blake"],
            source: "model",
          }),
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
            Blake: {
              entityId: "bst_mc_alias:camp.png|camp whispering pines:blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blake"],
              sourceKey: "camp.png|camp whispering pines",
              kind: "multi_character_alias",
            },
          },
        } as any,
      },
    ),
    ["Blake", "Ashley"],
  );
});

test("resolvePersistedSnapshotResolvedEntities can synthesize entity-first continuity without legacy owner arrays", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  assert.deepEqual(
    resolvePersistedSnapshotResolvedEntities({
      context,
      sceneActiveCharacters: ["Ashley", "Blake"],
      requestCharacters: ["Blake"],
      resolvedEntities: [],
      userExtraction: false,
    }),
    [
      {
        entityId: "bst_owner:ashley",
        kind: "st-character",
        name: "Ashley",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: false,
        created: false,
      },
      {
        entityId: "bst_owner:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
  );
});

test("filterResolvedEntitiesToTrackedOwners resolves technical entity ids back to tracked multi-character owners", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  const filtered = filterResolvedEntitiesToTrackedOwners({
    context,
    trackedOwners: ["Blake"],
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        kind: "st-character",
        name: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        avatar: null,
        inScene: true,
        inMessage: true,
        created: false,
      },
      {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
        kind: "st-character",
        name: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
        avatar: null,
        inScene: true,
        inMessage: false,
        created: false,
      },
    ],
  });

  assert.deepEqual(filtered.map(entity => entity.entityId), [
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
  ]);
});

test("resolveStableEntityIdForOwner can synthesize multi-character alias ids before registry exists", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as any;

  assert.equal(
    resolveStableEntityIdForOwner(context, "Blake", "dynamic_characters"),
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
  );

  assert.equal(
    resolveStableEntityIdForOwner(context, "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "dynamic_characters"),
    "bst_owner:camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
  );
});
