import assert from "node:assert/strict";
import test from "node:test";

import { buildActiveSeedDefaultsPolicy, shouldUseConfiguredOwnerDefaults } from "../src/entitySeedPolicy";
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
      {
        name: "Seraphina",
        avatar: "sera.png",
      },
    ],
  };
}

test("shouldUseConfiguredOwnerDefaults blocks runtime narrative ids before registry sync", () => {
  const context = makeContext();

  assert.equal(
    shouldUseConfiguredOwnerDefaults(context, "Forest Spirit", "bst_narrative:forest-spirit"),
    false,
  );
  assert.equal(
    shouldUseConfiguredOwnerDefaults(context, "Seraphina", "bst_owner:sera.png|seraphina"),
    true,
  );
});

test("buildActiveSeedDefaultsPolicy keeps narrative entities off ST owner defaults while preserving known owners", () => {
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
          lastSeenMessageIndex: 2,
          lastActiveMessageIndex: 2,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 0, state: "active" }],
        },
      },
      ownerToEntityId: {
        "forest spirit": "bst_narrative:forest-spirit",
      },
    },
  };

  const policy = buildActiveSeedDefaultsPolicy(
    context,
    ["Ashley", "Forest Spirit"],
    [
      "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
      "bst_narrative:forest-spirit",
    ],
  );

  assert.equal(policy.get("Ashley"), true);
  assert.equal(policy.get("Forest Spirit"), false);
});

test("buildActiveSeedDefaultsPolicy prefers narrative entity ids over colliding owner labels", () => {
  const context = makeContext();

  const policy = buildActiveSeedDefaultsPolicy(
    context,
    ["Ashley"],
    ["bst_narrative:ashley-shadow"],
  );

  assert.equal(policy.get("Ashley"), false);
});
