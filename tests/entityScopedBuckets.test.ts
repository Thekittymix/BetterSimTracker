import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEntityScopedCustomNonNumericStatisticsBuckets,
  buildEntityScopedCustomStatisticsBuckets,
  buildEntityScopedStatisticsBuckets,
  buildTargetToEntityMap,
} from "../src/entityScopedBuckets";
import type { STContext, Statistics } from "../src/types";

function makeContext(): STContext {
  return {
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_mc_alias:test:blake": {
            id: "bst_mc_alias:test:blake",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: [],
            sourceName: "Camp",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          blake: "bst_mc_alias:test:blake",
        },
      },
    },
  } as unknown as STContext;
}

test("buildTargetToEntityMap prefers explicit resolver entity ids and falls back to registry", () => {
  const context = makeContext();

  assert.deepEqual(
    buildTargetToEntityMap(context, ["Blake"], ["bst_mc_alias:test:resolver-blake"]),
    { Blake: "bst_mc_alias:test:resolver-blake" },
  );

  assert.deepEqual(
    buildTargetToEntityMap(context, ["Blake"]),
    { Blake: "bst_mc_alias:test:blake" },
  );
});

test("buildTargetToEntityMap can synthesize multi-character alias ids without a populated registry", () => {
  const context = {
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
  } as unknown as STContext;

  assert.deepEqual(
    buildTargetToEntityMap(context, ["Blake"], undefined, "multi_character"),
    {
      Blake: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
    },
  );
});

test("entity-scoped bucket builders mirror owner buckets onto entity ids", () => {
  const targetToEntity = {
    Blake: "bst_mc_alias:test:blake",
  };
  const statistics: Statistics = {
    affection: { Blake: 61 },
    trust: { Blake: 58 },
    desire: {},
    connection: {},
    mood: { Blake: "Guarded" },
    lastThought: { Blake: "keep it short" },
  };

  assert.deepEqual(buildEntityScopedStatisticsBuckets(statistics, targetToEntity), {
    affection: { "bst_mc_alias:test:blake": 61 },
    trust: { "bst_mc_alias:test:blake": 58 },
    desire: {},
    connection: {},
    mood: { "bst_mc_alias:test:blake": "Guarded" },
    lastThought: { "bst_mc_alias:test:blake": "keep it short" },
  });

  assert.deepEqual(buildEntityScopedCustomStatisticsBuckets({
    focus: { Blake: 72 },
  }, targetToEntity), {
    focus: { "bst_mc_alias:test:blake": 72 },
  });

  assert.deepEqual(buildEntityScopedCustomNonNumericStatisticsBuckets({
    pose: { Blake: "slumped by the cabinet" },
  }, targetToEntity), {
    pose: { "bst_mc_alias:test:blake": "slumped by the cabinet" },
  });
});
