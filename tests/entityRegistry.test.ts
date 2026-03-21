import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEntitySourceKey,
  buildTrackerEntityId,
  getEntityRegistryEntryByOwnerName,
  getEntityRegistryEntryForMessage,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryEntriesForMessage,
  listEntityRegistryLookupNames,
  listEntityRegistryOwnersForMessage,
  readEntityRegistry,
  resolveEntityRegistryLookupValue,
  syncEntityRegistryFromRender,
} from "../src/entityRegistry";
import type { STContext } from "../src/types";

function makeContext(): STContext {
  return {
    chat: [],
    chatMetadata: {},
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
      },
      {
        name: "Billie",
        avatar: "billie.png",
      },
    ],
  };
}

test("buildTrackerEntityId is deterministic for source owners and aliases", () => {
  assert.equal(
    buildTrackerEntityId({
      sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      sourceAvatar: "camp.png",
      ownerName: "Ashley",
      matchedBy: "alias",
    }),
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
  );
  assert.equal(
    buildTrackerEntityId({
      sourceName: "Billie",
      sourceAvatar: "billie.png",
      ownerName: "Billie",
      matchedBy: "source",
    }),
    "bst_owner:billie.png|billie",
  );
});

test("syncEntityRegistryFromRender stores multi-character alias lifecycle in chat metadata", () => {
  const context = makeContext();
  const changed = syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });
  assert.equal(changed, true);

  const registry = readEntityRegistry(context);
  const ashleyId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Ashley",
    matchedBy: "alias",
  });
  const blakeId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Blake",
    matchedBy: "alias",
  });
  assert.equal(registry.ownerToEntityId.ashley, ashleyId);
  assert.equal(registry.ownerToEntityId.blake, blakeId);
  assert.equal(registry.entities[ashleyId]?.lifecycleState, "active");
  assert.equal(registry.entities[ashleyId]?.lastActiveMessageIndex, 8);
  assert.equal(registry.entities[blakeId]?.lifecycleState, "inactive");
  assert.equal(
    registry.entities[blakeId]?.sourceKey,
    buildEntitySourceKey("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "camp.png"),
  );
});

test("syncEntityRegistryFromRender marks archived aliases without deleting them", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 15,
    owners: ["Ashley"],
    getLifecycleState: () => "archived",
  });

  const registry = readEntityRegistry(context);
  const ashleyId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Ashley",
    matchedBy: "alias",
  });
  assert.equal(registry.entities[ashleyId]?.lifecycleState, "archived");
  assert.equal(registry.entities[ashleyId]?.archivedAtMessageIndex, 15);
  assert.equal(registry.entities[ashleyId]?.lastActiveMessageIndex, 8);
});

test("listEntityRegistryOwnersForMessage returns visible owners for a given message index", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 15,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "archived",
  });

  assert.deepEqual(
    listEntityRegistryOwnersForMessage(context, 8),
    ["Ashley", "Blake"],
  );
  assert.deepEqual(
    listEntityRegistryOwnersForMessage(context, 14),
    ["Ashley", "Blake"],
  );
  assert.deepEqual(
    listEntityRegistryOwnersForMessage(context, 15),
    ["Ashley"],
  );
});

test("getEntityRegistryEntryByOwnerName is case-insensitive and resolves canonical aliases", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  const byLower = getEntityRegistryEntryByOwnerName(context, "ashley");
  const byCanonical = getEntityRegistryEntryByOwnerName(context, "Ashley");

  assert.equal(byLower?.ownerName, "Ashley");
  assert.equal(byCanonical?.ownerName, "Ashley");
  assert.equal(byLower?.id, byCanonical?.id);
});

test("listEntityRegistryLookupNames includes owner, canonical name, and aliases for a registry-backed entity", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:test:ashley": {
          id: "bst_mc_alias:test:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: buildEntitySourceKey("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "camp.png"),
          kind: "multi_character_alias",
          introducedAtMessageIndex: 8,
          lastSeenMessageIndex: 8,
          lastActiveMessageIndex: 8,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ash: "bst_mc_alias:test:ashley",
        ashley: "bst_mc_alias:test:ashley",
      },
    },
  };

  assert.deepEqual(
    listEntityRegistryLookupNames(context, "Ashley"),
    ["Ashley", "Ash"],
  );
  assert.deepEqual(
    listEntityRegistryLookupNames(context, "Ash"),
    ["Ash", "Ashley"],
  );
});

test("resolveEntityRegistryLookupValue reads alias state stored under a canonical owner spelling", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:test:ashley": {
          id: "bst_mc_alias:test:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: buildEntitySourceKey("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "camp.png"),
          kind: "multi_character_alias",
          introducedAtMessageIndex: 8,
          lastSeenMessageIndex: 8,
          lastActiveMessageIndex: 8,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ash: "bst_mc_alias:test:ashley",
        ashley: "bst_mc_alias:test:ashley",
      },
    },
  };

  const affection = resolveEntityRegistryLookupValue(
    context,
    { Ashley: 61 },
    "Ash",
  );
  const clothes = resolveEntityRegistryLookupValue(
    context,
    { Ashley: ["worn hoodie"] },
    "Ash",
  );

  assert.equal(affection, 61);
  assert.deepEqual(clothes, ["worn hoodie"]);
});

test("resolveEntityRegistryLookupValue prefers the direct owner spelling before falling back to canonical alias names", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:test:ashley": {
          id: "bst_mc_alias:test:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: buildEntitySourceKey("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "camp.png"),
          kind: "multi_character_alias",
          introducedAtMessageIndex: 8,
          lastSeenMessageIndex: 8,
          lastActiveMessageIndex: 8,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ash: "bst_mc_alias:test:ashley",
        ashley: "bst_mc_alias:test:ashley",
      },
    },
  };

  const clothes = resolveEntityRegistryLookupValue(
    context,
    { Ash: ["scene hoodie"], Ashley: ["default dress"] },
    "Ash",
  );

  assert.deepEqual(clothes, ["scene hoodie"]);
});

test("listEntityRegistryEntriesForMessage returns visible entities in introduction order", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Blake", "Ashley"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });

  const entries = listEntityRegistryEntriesForMessage(context, 8);
  assert.deepEqual(entries.map(entry => entry.ownerName), ["Ashley", "Blake"]);
  assert.deepEqual(entries.map(entry => entry.kind), ["multi_character_alias", "multi_character_alias"]);
});

test("getEntityRegistryEntryForMessage hides pre-introduction and archived entries outside their visible window", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 15,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "archived",
  });

  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 7), null);
  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 8)?.ownerName, "Ashley");
  assert.equal(getEntityRegistryEntryForMessage(context, "Blake", 14)?.ownerName, "Blake");
  assert.equal(getEntityRegistryEntryForMessage(context, "Blake", 15), null);
});

test("getEntityRegistryLifecycleStateForMessage clamps registry lifecycle to the requested message index", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 15,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "archived",
  });

  assert.deepEqual(
    getEntityRegistryLifecycleStateForMessage(context, "Ashley", 8),
    { lastActiveMessageIndex: null, lifecycleState: "inactive", archivedAtMessageIndex: null, introducedAtMessageIndex: 8 },
  );
  assert.deepEqual(
    getEntityRegistryLifecycleStateForMessage(context, "Blake", 8),
    { lastActiveMessageIndex: null, lifecycleState: "inactive", archivedAtMessageIndex: null, introducedAtMessageIndex: 8 },
  );
  assert.deepEqual(
    getEntityRegistryLifecycleStateForMessage(context, "Blake", 15),
    { lastActiveMessageIndex: null, lifecycleState: "archived", archivedAtMessageIndex: 15, introducedAtMessageIndex: 8 },
  );
});
