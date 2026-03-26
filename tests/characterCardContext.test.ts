import test from "node:test";
import assert from "node:assert/strict";

import { buildCharacterCardsContext } from "../src/characterCardContext";

test("buildCharacterCardsContext includes all same-name cards and disambiguates by avatar", () => {
  const context = {
    characters: [
      { name: "Chloe", avatar: "chloe_a.png", description: "Variant A description." },
      { name: "Chloe", avatar: "chloe_b.png", personality: "Variant B personality." },
      { name: "Billie", avatar: "billie.png", description: "Billie card." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["Chloe"]);
  assert.match(rendered, /Character Card - Chloe \[chloe_a\.png\]/);
  assert.match(rendered, /Character Card - Chloe \[chloe_b\.png\]/);
  assert.match(rendered, /Variant A description\./);
  assert.match(rendered, /Variant B personality\./);
  assert.doesNotMatch(rendered, /Billie card\./);
});

test("buildCharacterCardsContext can target by avatar token", () => {
  const context = {
    characters: [
      { name: "Chloe", avatar: "chloe_a.png", description: "Variant A description." },
      { name: "Chloe", avatar: "chloe_b.png", description: "Variant B description." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["chloe_b.png"]);
  assert.match(rendered, /Character Card - Chloe \[chloe_b\.png\]/);
  assert.match(rendered, /Variant B description\./);
  assert.doesNotMatch(rendered, /chloe_a\.png/);
});

test("buildCharacterCardsContext in 1:1 chat scopes duplicate names to current characterId avatar", () => {
  const context = {
    characterId: 0,
    groupId: "",
    characters: [
      { name: "Chloe", avatar: "chloe_a.png", description: "Variant A description." },
      { name: "Chloe", avatar: "chloe_b.png", description: "Variant B description." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["Chloe"]);
  assert.match(rendered, /Character Card - Chloe \[chloe_a\.png\]/);
  assert.match(rendered, /Variant A description\./);
  assert.doesNotMatch(rendered, /chloe_b\.png/);
  assert.doesNotMatch(rendered, /Variant B description\./);
});

test("buildCharacterCardsContext skips cards without descriptive fields", () => {
  const context = {
    characters: [
      { name: "Chloe", avatar: "chloe_a.png" },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["Chloe"]);
  assert.equal(rendered, "");
});

test("buildCharacterCardsContext includes source card context when an active alias resolves to a multi-character card", () => {
  const context = {
    groupId: "group-1",
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
        description: "Whispering Pines description.",
      },
      { name: "Billie", avatar: "billie.png", description: "Billie card." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["Ashley"], [], "dynamic_characters");
  assert.match(rendered, /Camp Whispering Pines \| Ashley, Blake, Garret, & Raleigh/);
  assert.match(rendered, /Whispering Pines description\./);
  assert.doesNotMatch(rendered, /Billie card\./);
});

test("buildCharacterCardsContext can include multi-character source card context from active entity ids", () => {
  const context = {
    groupId: "group-1",
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
            introducedAtMessageIndex: 0,
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
    },
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
        description: "Whispering Pines description.",
      },
      { name: "Billie", avatar: "billie.png", description: "Billie card." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, [], ["ent-ashley"], "dynamic_characters");
  assert.match(rendered, /Camp Whispering Pines \| Ashley, Blake, Garret, & Raleigh/);
  assert.match(rendered, /Whispering Pines description\./);
  assert.doesNotMatch(rendered, /Billie card\./);
});

test("buildCharacterCardsContext prefers explicit entity ids over stale raw active character tokens", () => {
  const context = {
    groupId: "group-1",
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
            introducedAtMessageIndex: 0,
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
    },
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
        description: "Whispering Pines description.",
      },
      { name: "Billie", avatar: "billie.png", description: "Billie card." },
    ],
  } as any;

  const rendered = buildCharacterCardsContext(context, ["Billie"], ["ent-ashley"], "dynamic_characters");
  assert.match(rendered, /Camp Whispering Pines \| Ashley, Blake, Garret, & Raleigh/);
  assert.match(rendered, /Whispering Pines description\./);
  assert.doesNotMatch(rendered, /Billie card\./);
});

