import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActiveSeedDefaultsPolicy,
  resolveSeededOwnerLookupValue,
  shouldUseConfiguredOwnerDefaults,
} from "../src/entitySeedPolicy";
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

test("shouldUseConfiguredOwnerDefaults blocks explicit narrative kind even without registry context", () => {
  assert.equal(
    shouldUseConfiguredOwnerDefaults(null, "Forest Spirit", null, "narrative-entity"),
    false,
  );
  assert.equal(
    shouldUseConfiguredOwnerDefaults(null, "Seraphina", null, "owner"),
    true,
  );
});

test("resolveSeededOwnerLookupValue preserves alias continuity for the explicit active entity id", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake": {
          id: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
          ownerName: "Blake",
          canonicalName: "Blake Belladonna",
          aliases: ["B."],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 3,
          lastActiveMessageIndex: 3,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 0, state: "active" }],
        },
      },
      ownerToEntityId: {
        "blake": "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        "blake belladonna": "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        "b.": "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
      },
    },
  };

  const value = resolveSeededOwnerLookupValue(
    context,
    { "B.": 64 },
    "Blake",
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
  );

  assert.equal(value, 64);
});

test("resolveSeededOwnerLookupValue blocks registry owner-name fallback for a different explicit entity id", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_owner:sera.png": {
          id: "bst_owner:sera.png",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Seraphina",
          sourceAvatar: "sera.png",
          sourceKey: "sera.png|seraphina",
          kind: "owner",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 4,
          lastActiveMessageIndex: 4,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 0, state: "active" }],
        },
      },
      ownerToEntityId: {
        "ashley": "bst_owner:sera.png",
        "ash": "bst_owner:sera.png",
      },
    },
  };

  const value = resolveSeededOwnerLookupValue(
    context,
    { Ash: 77 },
    "Ashley",
    "bst_narrative:ashley-shadow",
  );

  assert.equal(value, undefined);
});
