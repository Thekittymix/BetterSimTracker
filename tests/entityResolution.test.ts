import test from "node:test";
import assert from "node:assert/strict";

import {
  collectResolvedCharacterNames,
  extractMultiCharacterAliases,
  isAliasResolvedOwner,
  projectTrackerDataToMessageScopedOwners,
  resolveCharacterIdentity,
  resolveCharacterFromContext,
  resolveMessageScopedActiveCharacters,
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

test("resolveMessageScopedActiveCharacters replaces a source-card speaker with a unique alias speaker from AI message text", () => {
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

  assert.deepEqual(resolved, ["Ashley", "Billie"]);
});

test("resolveMessageScopedActiveCharacters keeps source-card owner when message text does not uniquely identify one alias", () => {
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

  assert.deepEqual(resolved, ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"]);
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
