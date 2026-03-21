import test from "node:test";
import assert from "node:assert/strict";

import {
  collectResolvedCharacterNames,
  extractMultiCharacterAliases,
  isAliasResolvedOwner,
  projectTrackerDataToMessageScopedOwners,
  resolvePersistedActiveOwners,
  resolveCharacterIdentity,
  resolveCharacterFromContext,
  resolveExtractionOwnerScopes,
  resolveInitialExtractionOwners,
  resolveMessageScopedActiveCharacters,
  resolveMessageScopedParticipants,
} from "../src/entityResolution";

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

  const alias = resolveCharacterIdentity(context, "Ashley", "multi_character");
  assert.deepEqual(alias, {
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    resolvedName: "Ashley",
    matchedBy: "alias",
  });

  const source = resolveCharacterIdentity(context, "Billie", "multi_character");
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

  assert.equal(resolveCharacterFromContext(context, "Raleigh", "multi_character"), camp);
  assert.equal(resolveCharacterFromContext(context, "Raleigh", "standard"), null);
});

test("isAliasResolvedOwner is true only for aliases in multi-character mode", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  } as any;

  assert.equal(isAliasResolvedOwner(context, "Ashley", { entityTrackingMode: "multi_character" }), true);
  assert.equal(isAliasResolvedOwner(context, "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", { entityTrackingMode: "multi_character" }), false);
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
    collectResolvedCharacterNames(context, { entityTrackingMode: "multi_character" }),
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
    { entityTrackingMode: "multi_character" },
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
    { entityTrackingMode: "multi_character" },
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
    { entityTrackingMode: "multi_character" },
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
    { entityTrackingMode: "multi_character" },
  );

  assert.deepEqual(resolved, ["Billie"]);
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
    { entityTrackingMode: "multi_character" },
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
    { entityTrackingMode: "multi_character" },
  );

  assert.deepEqual(resolved.sceneActiveCharacters, ["Ashley"]);
  assert.deepEqual(resolved.requestCharacters, ["Ashley"]);
});

test("resolvePersistedActiveOwners excludes User by default for AI-side tracker targets", () => {
  const refined = resolvePersistedActiveOwners(["Ashley", "Blake", "__bst_user__"]);
  assert.deepEqual(refined, ["Ashley", "Blake"]);
});

test("resolvePersistedActiveOwners can retain User for user-side tracker targets", () => {
  const refined = resolvePersistedActiveOwners(["__bst_user__"], { includeUserOwner: true });
  assert.deepEqual(refined, ["__bst_user__"]);
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
    { entityTrackingMode: "multi_character" },
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
    { entityTrackingMode: "multi_character" },
  );

  assert.deepEqual(projected.activeCharacters, ["Ashley"]);
  assert.deepEqual(projected.statistics.affection, { Ashley: 51 });
  assert.deepEqual(projected.statistics.mood, { Ashley: "Anxious" });
  assert.deepEqual(projected.statistics.lastThought, { Ashley: "Need to keep moving." });
  assert.deepEqual(projected.customNonNumericStatistics?.clothes, { Ashley: ["sneakers"] });
  assert.deepEqual(projected.customNonNumericStatistics?.pose, { Ashley: "Frozen in the kitchen doorway." });
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
    { entityTrackingMode: "multi_character" },
    { projectOwnerScopedCustomNonNumeric: false },
  );

  assert.deepEqual(projected.activeCharacters, ["Ashley"]);
  assert.deepEqual(projected.statistics.affection, { Ashley: 51 });
  assert.deepEqual(projected.customNonNumericStatistics?.clothes, {
    "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh": ["sneakers"],
  });
});
