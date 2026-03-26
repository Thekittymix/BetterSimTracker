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

test("materializeNarrativeEntityCreations stays inert outside dynamic entity mode", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "multi_character" },
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

test("materializeNarrativeEntityCreations creates runtime-owned narrative ids in dynamic mode", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_entities" },
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

test("materializeNarrativeEntityCreations reuses exact candidates before creating new entities", () => {
  const result = materializeNarrativeEntityCreations({
    context: makeContext(),
    settings: { entityTrackingMode: "dynamic_entities" },
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
    settings: { entityTrackingMode: "dynamic_entities" },
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
