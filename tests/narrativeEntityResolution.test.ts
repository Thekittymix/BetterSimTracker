import assert from "node:assert/strict";
import test from "node:test";

import { materializeNarrativeEntityCreations } from "../src/narrativeEntityResolution";
import type { STContext } from "../src/types";

function makeContext(): STContext {
  return {
    name1: "User",
    chat: [],
    chatMetadata: {},
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
      },
    ],
  };
}

test("materializeNarrativeEntityCreations stays inert in standard mode", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "standard" },
    candidateEntities: [],
    resolvedEntities: [],
    createdEntities: [
      { name: "Forest Spirit", aliases: ["Spirit"], inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Forest Spirit"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [],
    unresolvedMentions: ["Forest Spirit"],
  });
});

test("materializeNarrativeEntityCreations creates runtime-owned narrative ids in dynamic characters mode", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [],
    resolvedEntities: [],
    createdEntities: [
      { name: "Forest Spirit", aliases: ["Spirit"], inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Forest Spirit"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        name: "Forest Spirit",
        avatar: null,
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
        created: true,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations rejects object-like created proposals in dynamic characters mode", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [],
    resolvedEntities: [],
    createdEntities: [
      { name: "folded piece of parchment", aliases: ["map"], inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["folded piece of parchment"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [],
    unresolvedMentions: ["folded piece of parchment"],
  });
});

test("materializeNarrativeEntityCreations reuses exact candidates before creating new entities", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Blake",
        entityId: "bst_mc_alias:camp|camp:blake",
        kind: "st-character",
        aliases: ["Blackout Blake"],
      },
    ],
    resolvedEntities: [],
    createdEntities: [
      { name: "Blackout Blake", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Blackout Blake"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:camp|camp:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: ["Blackout Blake"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations reuses candidates when created names only differ by a leading article", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Forest Spirit",
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        aliases: ["Spirit"],
      },
    ],
    resolvedEntities: [],
    createdEntities: [
      { name: "the spirit", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["the spirit"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        name: "Forest Spirit",
        avatar: null,
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations reuses a Camp alias candidate instead of minting a narrative entity when source and alias candidates share one family", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        entityId: "bst_owner:camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "st-character",
        aliases: ["Ashley", "Blake", "Garret", "Raleigh"],
      },
      {
        entityRef: "ent2",
        ownerName: "Raleigh",
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:raleigh",
        kind: "st-character",
        aliases: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      },
    ],
    resolvedEntities: [],
    createdEntities: [
      { name: "Raleigh", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Raleigh"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:raleigh",
        kind: "st-character",
        name: "Raleigh",
        avatar: null,
        aliases: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations drops a solo generic source owner once multiple same-source child narratives are materialized", () => {
  const result = materializeNarrativeEntityCreations({
    context: {
      ...makeContext(),
      characters: [{ name: "Your Family", avatar: "your family.png" }],
    },
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Your Family",
        entityId: "bst_owner:your family.png|your family",
        kind: "st-character",
        aliases: ["Your Family"],
      },
    ],
    resolvedEntities: [
      {
        entityId: "bst_owner:your family.png|your family",
        kind: "st-character",
        name: "Your Family",
        avatar: null,
        aliases: ["Your Family"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    createdEntities: [
      { name: "Marylyn", inScene: true, inMessage: true },
      { name: "Lisa", inScene: true, inMessage: true },
      { name: "Candy", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Marylyn", "Lisa", "Candy"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:marylyn",
        kind: "narrative-entity",
        name: "Marylyn",
        avatar: null,
        aliases: undefined,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      },
      {
        entityId: "bst_narrative:lisa",
        kind: "narrative-entity",
        name: "Lisa",
        avatar: null,
        aliases: undefined,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      },
      {
        entityId: "bst_narrative:candy",
        kind: "narrative-entity",
        name: "Candy",
        avatar: null,
        aliases: undefined,
        sourceKey: "your family.png|your family",
        inScene: true,
        inMessage: true,
        created: true,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations reuses a uniquely close alias spelling before minting a new narrative entity", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        entityId: "bst_owner:camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "st-character",
        aliases: ["Ashley", "Blake", "Garret", "Raleigh"],
      },
      {
        entityRef: "ent2",
        ownerName: "Garret",
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:garret",
        kind: "st-character",
        aliases: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
      },
    ],
    resolvedEntities: [],
    createdEntities: [
      { name: "Garrett", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Garrett"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:garret",
        kind: "st-character",
        name: "Garret",
        avatar: null,
        aliases: ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations reuses archived narrative registry entities before minting new ids", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_narrative:forest-spirit": {
          id: "bst_narrative:forest-spirit",
          ownerName: "Forest Spirit",
          canonicalName: "Forest Spirit",
          aliases: ["Spirit"],
          sourceName: "Forest Spirit",
          sourceAvatar: null,
          sourceKey: "narrative:bst_narrative:forest-spirit",
          kind: "narrative-entity",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 0,
          lastActiveMessageIndex: 0,
          lifecycleState: "archived",
          archivedAtMessageIndex: 1,
          lifecycleEvents: [
            { messageIndex: 0, state: "active" },
            { messageIndex: 1, state: "archived" },
          ],
        },
      },
      ownerToEntityId: {
        "forest spirit": "bst_narrative:forest-spirit",
        spirit: "bst_narrative:forest-spirit",
      },
    },
  };

  const result = materializeNarrativeEntityCreations({
    context,
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [],
    resolvedEntities: [],
    createdEntities: [
      { name: "Spirit", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Spirit"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        name: "Forest Spirit",
        avatar: null,
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations reuses archived narrative registry entities when created names include a leading article", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_narrative:forest-spirit": {
          id: "bst_narrative:forest-spirit",
          ownerName: "Forest Spirit",
          canonicalName: "Forest Spirit",
          aliases: ["Spirit"],
          sourceName: "Forest Spirit",
          sourceAvatar: null,
          sourceKey: "narrative:bst_narrative:forest-spirit",
          kind: "narrative-entity",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 0,
          lastActiveMessageIndex: 0,
          lifecycleState: "archived",
          archivedAtMessageIndex: 1,
          lifecycleEvents: [
            { messageIndex: 0, state: "active" },
            { messageIndex: 1, state: "archived" },
          ],
        },
      },
      ownerToEntityId: {
        "forest spirit": "bst_narrative:forest-spirit",
        spirit: "bst_narrative:forest-spirit",
      },
    },
  };

  const result = materializeNarrativeEntityCreations({
    context,
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [],
    resolvedEntities: [],
    createdEntities: [
      { name: "the spirit", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["the spirit"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        name: "Forest Spirit",
        avatar: null,
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
    unresolvedMentions: [],
  });
});

test("materializeNarrativeEntityCreations keeps ambiguous exact alias collisions unresolved instead of reusing the first candidate", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_characters" },
    candidateEntities: [
      {
        entityRef: "ent1",
        ownerName: "Ashley",
        entityId: "bst_mc_alias:test:ashley",
        kind: "st-character",
        aliases: ["Ash"],
      },
      {
        entityRef: "ent2",
        ownerName: "Ash",
        entityId: "bst_narrative:ash",
        kind: "narrative-entity",
      },
    ],
    resolvedEntities: [],
    createdEntities: [
      { name: "Ash", inScene: true, inMessage: true },
    ],
    unresolvedMentions: ["Ash"],
  });

  assert.deepEqual(result, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:ash",
        kind: "narrative-entity",
        name: "Ash",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: true,
        created: true,
      },
    ],
    unresolvedMentions: [],
  });
});
