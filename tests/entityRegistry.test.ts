import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEntitySourceKey,
  buildTrackerEntityId,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryOwnersForMessage,
  readEntityRegistry,
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
  assert.equal(registry.ownerToEntityId.Ashley, ashleyId);
  assert.equal(registry.ownerToEntityId.Blake, blakeId);
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
