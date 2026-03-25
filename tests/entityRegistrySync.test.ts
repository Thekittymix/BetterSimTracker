import assert from "node:assert/strict";
import test from "node:test";
import { buildEntityResolution } from "./helpers/entityResolution";

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
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
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
  assert.equal(registry.ownerToEntityId.garret, undefined);
});

test("syncEntityRegistryFromTrackerData prefers resolver scene entity ids over stale scene owner names", () => {
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
    entityResolution: buildEntityResolution({
      sceneOwners: ["Garret"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
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
  assert.equal(registry.ownerToEntityId.garret, undefined);
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

test("syncEntityRegistryFromTrackerData does not depend on showInactive to keep multi-character continuity", () => {
  const context = makeContext();
  const settings = {
    ...makeSettings(),
    showInactive: false,
  } as BetterSimTrackerSettings;

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const current = {
    ...makeTrackerData(["Blake"]),
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
  };
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
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "active");
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lastSeenMessageIndex, 1);
});

test("syncEntityRegistryFromTrackerData updates multi-character lifecycle on user messages from resolver/data state", () => {
  const context = makeContext();
  context.chat[1].is_user = true;
  context.chat[1].name = "Kuba";
  context.chat[1].mes = "Ashley leaves the room. Blake stays here alone now and answers in one short reply.";
  const settings = {
    ...makeSettings(),
    showInactive: false,
  } as BetterSimTrackerSettings;

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const current = {
    ...makeTrackerData(["Blake"]),
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
    statistics: {
      affection: { Ashley: 45, Blake: 45 },
      trust: { Ashley: 45, Blake: 46 },
      desire: { Ashley: 35, Blake: 35 },
      connection: { Ashley: 48, Blake: 47 },
      mood: { Ashley: "Neutral", Blake: "Lonely" },
      lastThought: {
        Ashley: "Finally out of there.",
        Blake: "Now it is just me and Kuba.",
      },
    },
  } satisfies TrackerData;
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
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "active");
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lastSeenMessageIndex, 1);
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lastSeenMessageIndex, 1);
});

test("syncEntityRegistryFromTrackerData keeps scene continuity while deriving lifecycle from explicit active owners", () => {
  const context = makeContext();
  const settings = makeSettings();

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake", "Garret", "Raleigh"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake", "Garret", "Raleigh"],
    getLifecycleState: () => "active",
  });

  const current = {
    ...makeTrackerData(["Blake"]),
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Blake"],
      sceneEntityIds: [
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:garret",
        "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:raleigh",
      ],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
  };
  writeTrackerDataToMessage(context, current, 1);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
  });

  assert.equal(changed, true);

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "active");
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.garret]?.lifecycleState, "inactive");
  assert.equal(registry.entities[registry.ownerToEntityId.raleigh]?.lifecycleState, "inactive");
});

test("syncEntityRegistryFromTrackerData backfills inactive continuity for aliases that were only introduced in later registry sync", () => {
  const context = makeContext();
  context.chat.push({
    is_user: false,
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    mes: "Blake answers alone.",
    extra: {},
    swipe_id: 0,
  } as never);
  const settings = makeSettings();

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake", "Garret", "Raleigh"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake", "Garret", "Raleigh"],
    getLifecycleState: () => "active",
  });

  writeTrackerDataToMessage(context, makeTrackerData(["Blake"]), 2);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 2,
    owners: ["Ashley", "Blake", "Garret", "Raleigh"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });

  const current = {
    ...makeTrackerData(["Blake"]),
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      messageEntityIds: ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake"],
      source: "model" as const,
    }),
  } satisfies TrackerData;
  writeTrackerDataToMessage(context, current, 1);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 1,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake", "Garret", "Raleigh"],
  });

  assert.equal(changed, true);

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.introducedAtMessageIndex, 0);
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lastActiveMessageIndex, 2);
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.introducedAtMessageIndex, 0);
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "inactive");
  assert.deepEqual(
    registry.entities[registry.ownerToEntityId.ashley]?.lifecycleEvents,
    [
      { messageIndex: 0, state: "active" },
      { messageIndex: 1, state: "inactive" },
      { messageIndex: 2, state: "inactive" },
    ],
  );
  assert.deepEqual(
    registry.entities[registry.ownerToEntityId.garret]?.lifecycleEvents,
    [
      { messageIndex: 0, state: "active" },
      { messageIndex: 1, state: "inactive" },
      { messageIndex: 2, state: "inactive" },
    ],
  );
  assert.deepEqual(
    registry.entities[registry.ownerToEntityId.raleigh]?.lifecycleEvents,
    [
      { messageIndex: 0, state: "active" },
      { messageIndex: 1, state: "inactive" },
      { messageIndex: 2, state: "inactive" },
    ],
  );
});

test("syncEntityRegistryFromTrackerData archives inactive aliases on no-active continuity turns", () => {
  const context = makeContext();
  context.chat.push({
    is_user: false,
    name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    mes: "The room falls quiet after everyone leaves.",
    extra: {},
    swipe_id: 0,
  } as never);
  const settings = {
    ...makeSettings(),
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 1,
  } as BetterSimTrackerSettings;

  writeTrackerDataToMessage(context, makeTrackerData(["Ashley", "Blake"]), 0);
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 0,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const current = {
    ...makeTrackerData([]),
    entityResolution: buildEntityResolution({
      sceneOwners: [],
      messageOwners: [],
      sceneEntityIds: [],
      messageEntityIds: [],
      source: "model" as const,
    }),
  } satisfies TrackerData;
  writeTrackerDataToMessage(context, current, 2);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 2,
    data: current,
    settings,
    allKnownCharacters: ["Ashley", "Blake"],
  });

  assert.equal(changed, true);

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[registry.ownerToEntityId.ashley]?.lifecycleState, "archived");
  assert.equal(registry.entities[registry.ownerToEntityId.blake]?.lifecycleState, "archived");
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
