import assert from "node:assert/strict";
import test from "node:test";

import { syncEntityRegistryFromRender, readEntityRegistry } from "../src/entityRegistry";
import { syncEntityRegistryFromTrackerData } from "../src/entityRegistrySync";
import { writeTrackerDataToMessage } from "../src/storage";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeContext(): STContext {
  return {
    chat: [
      {
        is_user: false,
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "Ashley and Blake are both here.",
        extra: {},
        swipe_id: 0,
      },
      {
        is_user: false,
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        mes: "Ashley answers first.",
        extra: {},
        swipe_id: 0,
      },
    ],
    chatMetadata: {},
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
      },
    ],
    groupId: null,
    characterId: 0,
    onlineStatus: "connected",
  } as unknown as STContext;
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    entityTrackingMode: "multi_character",
    showInactive: true,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  } as BetterSimTrackerSettings;
}

function makeTrackerData(activeCharacters: string[]): TrackerData {
  return {
    timestamp: Date.now(),
    activeCharacters,
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
}

test("syncEntityRegistryFromTrackerData prefers explicit resolver scene owners over stale activeCharacters", () => {
  const context = makeContext();
  const settings = makeSettings();

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const current = {
    ...makeTrackerData(["Garret"]),
    entityResolution: {
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      source: "model" as const,
    },
  };
  writeTrackerDataToMessage(context, current, 1);

  syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake", "Garret"],
  });

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "active");
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.garret]?.lifecycleState, "inactive");
});

test("syncEntityRegistryFromTrackerData preserves registry continuity for inactive multi-character aliases", () => {
  const context = makeContext();
  const settings = makeSettings();

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const current = makeTrackerData(["Ashley"]);
  writeTrackerDataToMessage(context, current, 1);
  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake"],
  });

  assert.equal(changed, true);

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "active");
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lastSeenMessageIndex, 1);
});

test("syncEntityRegistryFromTrackerData is a no-op outside multi-character mode", () => {
  const context = makeContext();
  const settings = {
    ...makeSettings(),
    entityTrackingMode: "standard",
  } as BetterSimTrackerSettings;
  const current = makeTrackerData(["Ashley"]);
  writeTrackerDataToMessage(context, current, 1);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake"],
  });

  assert.equal(changed, false);
  assert.deepEqual(readEntityRegistry(context).entities, {});
});
