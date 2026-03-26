import assert from "node:assert/strict";
import test from "node:test";
import { buildEntityResolution } from "./helpers/entityResolution";

import {
  buildLifecycleHistorySnapshotsFromTrackerEntries,
  buildTrackerDataEntityOwnerMap,
  buildEntitySourceKey,
  buildTrackerEntityId,
  getEntityRegistryEntryByEntityIdForMessage,
  getEntityRegistryEntryByOwnerName,
  getEntityRegistryEntryForMessage,
  getEntityRegistryLifecycleStateForEntityIdForMessage,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryEntriesForMessage,
  listEntityRegistryLookupNames,
  listEntityRegistryOwnersForMessage,
  listTrackerDataLookupNamesForEntityIds,
  listTrackerDataLookupNamesForOwnerWithEntityFallback,
  readEntityRegistry,
  resolveTrackerActiveEntityIds,
  resolveTrackerActiveOwners,
  resolveTrackerDataLookupValue,
  resolveTrackerEntityIdsForOwners,
  resolveTrackerMessageOwners,
  resolveTrackerSceneEntityIds,
  resolveTrackerSceneOwners,
  resolveTrackerOwnersForEntityIds,
  resolveEntityRegistryLookupValue,
  syncEntityRegistryFromRender,
} from "../src/entityRegistry";
import type { STContext, TrackerData } from "../src/types";

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

function makeTracker(overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: overrides.activeCharacters ?? [],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
      ...overrides.statistics,
    },
    customStatistics: overrides.customStatistics ?? {},
    customNonNumericStatistics: overrides.customNonNumericStatistics ?? {},
    statisticsByEntityId: overrides.statisticsByEntityId,
    customStatisticsByEntityId: overrides.customStatisticsByEntityId,
    customNonNumericStatisticsByEntityId: overrides.customNonNumericStatisticsByEntityId,
    entityResolution: overrides.entityResolution,
    entityOwnerMap: overrides.entityOwnerMap,
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

test("readEntityRegistry preserves narrative-entity entries with derived narrative source metadata", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "ent-forest-spirit": {
          id: "ent-forest-spirit",
          ownerName: "Forest Spirit",
          canonicalName: "Forest Spirit",
          aliases: ["Spirit"],
          kind: "narrative-entity",
          introducedAtMessageIndex: 3,
          lastSeenMessageIndex: 5,
          lastActiveMessageIndex: 5,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {},
    },
  };

  const registry = readEntityRegistry(context);
  assert.equal(registry.entities["ent-forest-spirit"]?.kind, "narrative-entity");
  assert.equal(registry.entities["ent-forest-spirit"]?.sourceName, "Forest Spirit");
  assert.equal(registry.entities["ent-forest-spirit"]?.sourceKey, "narrative:ent-forest-spirit");
  assert.equal(registry.ownerToEntityId["forest spirit"], "ent-forest-spirit");
  assert.equal(registry.ownerToEntityId.spirit, "ent-forest-spirit");
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

test("syncEntityRegistryFromRender preserves latest metadata while backfilling historical lifecycle events", () => {
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
    getLifecycleState: () => "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 3,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  const registry = readEntityRegistry(context);
  const ashleyId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Ashley",
    matchedBy: "alias",
  });
  assert.equal(registry.entities[ashleyId]?.introducedAtMessageIndex, 3);
  assert.equal(registry.entities[ashleyId]?.lastSeenMessageIndex, 15);
  assert.equal(registry.entities[ashleyId]?.lastActiveMessageIndex, 8);
  assert.equal(registry.entities[ashleyId]?.lifecycleState, "inactive");
  assert.deepEqual(
    registry.entities[ashleyId]?.lifecycleEvents,
    [
      { messageIndex: 3, state: "active" },
      { messageIndex: 8, state: "active" },
      { messageIndex: 15, state: "inactive" },
    ],
  );
});

test("syncEntityRegistryFromRender keeps same-name registry entries distinct when targets carry entity ids", () => {
  const context = makeContext();
  const sourceEntityId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Ashley",
    matchedBy: "alias",
  });
  const shadowEntityId = buildTrackerEntityId({
    sourceName: "Billie",
    sourceAvatar: "billie.png",
    ownerName: "Ashley",
    matchedBy: "source",
  });
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        [sourceEntityId]: {
          id: sourceEntityId,
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: [],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: buildEntitySourceKey("Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "camp.png"),
          kind: "multi_character_alias",
          introducedAtMessageIndex: 8,
          lastSeenMessageIndex: 8,
          lastActiveMessageIndex: 8,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 8, state: "active" }],
        },
        [shadowEntityId]: {
          id: shadowEntityId,
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: [],
          sourceName: "Billie",
          sourceAvatar: "billie.png",
          sourceKey: buildEntitySourceKey("Billie", "billie.png"),
          kind: "owner",
          introducedAtMessageIndex: 10,
          lastSeenMessageIndex: 10,
          lastActiveMessageIndex: 10,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
          lifecycleEvents: [{ messageIndex: 10, state: "active" }],
        },
      },
      ownerToEntityId: {},
    },
  };

  const changed = syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 15,
    targets: [
      {
        ownerName: "Ashley",
        registryEntry: readEntityRegistry(context).entities[sourceEntityId],
      },
      {
        ownerName: "Ashley",
        registryEntry: readEntityRegistry(context).entities[shadowEntityId],
      },
    ],
    getLifecycleStateByTarget: target =>
      target.registryEntry?.id === sourceEntityId ? "active" : "inactive",
  });

  assert.equal(changed, true);
  const registry = readEntityRegistry(context);
  assert.equal(registry.entities[sourceEntityId]?.lifecycleState, "active");
  assert.equal(registry.entities[sourceEntityId]?.lastSeenMessageIndex, 15);
  assert.equal(registry.entities[shadowEntityId]?.lifecycleState, "inactive");
  assert.equal(registry.entities[shadowEntityId]?.lastSeenMessageIndex, 15);
  assert.deepEqual(
    registry.entities[shadowEntityId]?.lifecycleEvents,
    [
      { messageIndex: 10, state: "active" },
      { messageIndex: 15, state: "inactive" },
    ],
  );
});

test("getEntityRegistryLifecycleStateForMessage resolves last active message from lifecycle events at that message", () => {
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
    getLifecycleState: () => "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 3,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  assert.deepEqual(
    getEntityRegistryLifecycleStateForMessage(context, "Ashley", 3),
    {
      lastActiveMessageIndex: 3,
      lifecycleState: "inactive",
      archivedAtMessageIndex: null,
      introducedAtMessageIndex: 3,
    },
  );
  assert.deepEqual(
    getEntityRegistryLifecycleStateForMessage(context, "Ashley", 10),
    {
      lastActiveMessageIndex: 8,
      lifecycleState: "inactive",
      archivedAtMessageIndex: null,
      introducedAtMessageIndex: 3,
    },
  );
});

test("entity registry resolves owner names to stable entity ids and back", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const entityIds = resolveTrackerEntityIdsForOwners(context, ["Blake", "Ashley", "Blake"]);
  assert.deepEqual(entityIds, [
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake",
    "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
  ]);
  assert.deepEqual(resolveTrackerOwnersForEntityIds(context, [entityIds[1], entityIds[0], entityIds[1]]), [
    "Ashley",
    "Blake",
  ]);
});

test("listTrackerDataLookupNamesForEntityIds resolves tracker lookup aliases from persisted entity identity", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  const names = listTrackerDataLookupNamesForEntityIds(
    context,
    makeTracker({
      entityOwnerMap: {
        Ash: {
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
        },
      },
    }),
    ["bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley"],
  );

  assert.deepEqual(names, ["Ash", "Ashley"]);
});

test("listTrackerDataLookupNamesForOwnerWithEntityFallback merges owner and persisted entity lookup names", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  const names = listTrackerDataLookupNamesForOwnerWithEntityFallback(
    context,
    makeTracker({
      entityOwnerMap: {
        Ash: {
          entityId: "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
          kind: "multi_character_alias",
        },
      },
    }),
    "Ashley",
  );

  assert.deepEqual(names, ["Ashley", "Ash"]);
});

test("resolveTrackerSceneOwners prefers scene entity ids over stale owner-name arrays", () => {
  const context = makeContext();
  const blakeEntityId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Blake",
    matchedBy: "alias",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const resolved = resolveTrackerSceneOwners(context, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Garret"],
      messageOwners: ["Blake"],
      sceneEntityIds: [blakeEntityId],
      messageEntityIds: [blakeEntityId],
      source: "model",
    }),
  }));

  assert.deepEqual(resolved, ["Blake"]);
  assert.deepEqual(
    resolveTrackerSceneEntityIds(context, makeTracker({
      activeCharacters: ["Garret"],
      entityResolution: buildEntityResolution({
        sceneOwners: ["Garret"],
        messageOwners: ["Blake"],
        sceneEntityIds: [blakeEntityId],
        messageEntityIds: [blakeEntityId],
        source: "model",
      }),
    })),
    [blakeEntityId],
  );
});

test("resolveTrackerSceneOwners can materialize scene owners from sceneEntityIds plus entityOwnerMap without context", () => {
  const resolved = resolveTrackerSceneOwners(null, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: [],
      messageOwners: [],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Blackout Blake"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Garret: {
        entityId: "ent-garret",
        ownerName: "Garret",
        canonicalName: "Garret",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  }));

  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveTrackerMessageOwners prefers message entity ids over stale message owner arrays", () => {
  const context = makeContext();
  const blakeEntityId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Blake",
    matchedBy: "alias",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const resolved = resolveTrackerMessageOwners(context, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: ["Garret"],
      sceneEntityIds: [blakeEntityId],
      messageEntityIds: [blakeEntityId],
      source: "model",
    }),
  }));

  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveTrackerMessageOwners can materialize message owners from messageEntityIds plus entityOwnerMap without context", () => {
  const resolved = resolveTrackerMessageOwners(null, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Garret"],
      messageOwners: [],
      sceneEntityIds: ["ent-garret"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Blackout Blake"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
      Garret: {
        entityId: "ent-garret",
        ownerName: "Garret",
        canonicalName: "Garret",
        aliases: [],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
  }));

  assert.deepEqual(resolved, ["Blake"]);
});

test("resolveTrackerSceneOwners can derive alias owner from technical entity id before registry hydration", () => {
  const entityId = "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake";
  const resolved = resolveTrackerSceneOwners(null, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      resolvedEntities: [
        {
          entityId,
          kind: "st-character",
          name: entityId,
          avatar: null,
          inScene: true,
          inMessage: true,
        },
      ],
      source: "model",
    }),
  }));

  assert.deepEqual(resolved, ["blake"]);
});

test("resolveTrackerMessageOwners can derive alias owner from technical entity id before registry hydration", () => {
  const entityId = "bst_mc_alias:camp.png|camp whispering pines | ashley, blake, garret, & raleigh:blake";
  const resolved = resolveTrackerMessageOwners(null, makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      resolvedEntities: [
        {
          entityId,
          kind: "st-character",
          name: entityId,
          avatar: null,
          inScene: true,
          inMessage: true,
        },
      ],
      source: "model",
    }),
  }));

  assert.deepEqual(resolved, ["blake"]);
});

test("buildLifecycleHistorySnapshotsFromTrackerEntries uses explicit active owners for lifecycle history and falls back to scene owners only when missing", () => {
  const context = makeContext();
  const blakeEntityId = buildTrackerEntityId({
    sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    sourceAvatar: "camp.png",
    ownerName: "Blake",
    matchedBy: "alias",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: () => "active",
  });

  const snapshots = buildLifecycleHistorySnapshotsFromTrackerEntries(context, [
    {
      messageIndex: 8,
      data: makeTracker({
        activeCharacters: [],
        entityResolution: buildEntityResolution({
          sceneOwners: ["Garret"],
          messageOwners: ["Blake"],
          sceneEntityIds: [blakeEntityId],
          messageEntityIds: [blakeEntityId],
          source: "model",
        }),
      }),
    } as never,
    (() => {
      const tracker = makeTracker({
        entityResolution: undefined,
      });
      tracker.activeCharacters = ["Garret"];
      return {
      messageIndex: 9,
      data: tracker,
    } as never;
    })(),
  ]);

  assert.deepEqual(snapshots, [
    {
      messageIndex: 8,
      activeCharacters: [],
      activeEntityIds: [],
    },
    {
      messageIndex: 9,
      activeCharacters: ["Garret"],
      activeEntityIds: [],
    },
  ]);
});

test("resolveTrackerActiveOwners and entity ids preserve explicit empty active sets for continuity snapshots", () => {
  const context = makeContext();
  const tracker = makeTracker({
    activeCharacters: [],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake"],
      messageOwners: [],
      sceneEntityIds: ["ent-ashley", "ent-blake"],
      messageEntityIds: [],
      source: "model",
    }),
  });

  assert.deepEqual(resolveTrackerActiveOwners(context, tracker), []);
  assert.deepEqual(resolveTrackerActiveEntityIds(context, tracker), []);
  assert.deepEqual(resolveTrackerSceneOwners(context, tracker), ["Ashley", "Blake"]);
  assert.deepEqual(resolveTrackerSceneEntityIds(context, tracker), ["ent-ashley", "ent-blake"]);
});

test("resolveTrackerActiveOwners and entity ids prefer message owners over broader scene owners", () => {
  const tracker = makeTracker({
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "camp|camp whispering pines",
        kind: "multi_character_alias",
      },
    },
  });

  assert.deepEqual(resolveTrackerActiveOwners(null, tracker), ["Blake"]);
  assert.deepEqual(resolveTrackerActiveEntityIds(null, tracker), ["ent-blake"]);
  assert.deepEqual(resolveTrackerSceneOwners(null, tracker), ["Ashley", "Blake", "Garret", "Raleigh"]);
});

test("resolveTrackerActiveOwners and entity ids fall back to resolver scene owners when explicit activeCharacters are missing", () => {
  const tracker = {
    timestamp: 1,
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
    entityResolution: buildEntityResolution({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-ashley", "ent-blake", "ent-garret", "ent-raleigh"],
      messageEntityIds: ["ent-blake"],
      source: "model",
    }),
  } as TrackerData;

  assert.deepEqual(resolveTrackerActiveOwners(null, tracker), ["Blake"]);
  assert.deepEqual(resolveTrackerActiveEntityIds(null, tracker), ["ent-blake"]);
  assert.deepEqual(resolveTrackerSceneOwners(null, tracker), ["Ashley", "Blake", "Garret", "Raleigh"]);
  assert.deepEqual(resolveTrackerMessageOwners(null, tracker), ["Blake"]);
});

test("entity registry reactivation restores archived aliases for later messages without reviving them in archived history windows", () => {
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
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 22,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 14)?.ownerName, "Ashley");
  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 16), null);
  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 22)?.ownerName, "Ashley");
  assert.equal(getEntityRegistryEntryForMessage(context, "Ashley", 30)?.ownerName, "Ashley");

  assert.deepEqual(listEntityRegistryOwnersForMessage(context, 16), []);
  assert.deepEqual(listEntityRegistryOwnersForMessage(context, 22), ["Ashley"]);

  const archivedState = getEntityRegistryLifecycleStateForMessage(context, "Ashley", 16);
  assert.equal(archivedState?.lifecycleState, "archived");
  assert.equal(archivedState?.archivedAtMessageIndex, 15);

  const restoredState = getEntityRegistryLifecycleStateForMessage(context, "Ashley", 22);
  assert.equal(restoredState?.lifecycleState, "inactive");
  assert.equal(restoredState?.archivedAtMessageIndex, null);
  assert.equal(restoredState?.lastActiveMessageIndex, 22);
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

test("resolveTrackerDataLookupValue prefers by-entity shadow values before owner-name fallback", () => {
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

  const data = makeTracker({
    entityOwnerMap: {
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "test-source",
        kind: "multi_character_alias",
      },
    },
    customNonNumericStatistics: {
      clothes: { Ashley: ["default dress"] },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_mc_alias:test:ashley": ["scene hoodie"] },
    },
  });

  const value = resolveTrackerDataLookupValue({
    context,
    data,
    byOwner: data.customNonNumericStatistics?.clothes ?? {},
    byEntityId: data.customNonNumericStatisticsByEntityId?.clothes,
    ownerName: "Ash",
  });

  assert.deepEqual(value, ["scene hoodie"]);
});

test("resolveTrackerDataLookupValue falls back to owner-name lookup when no by-entity shadow exists", () => {
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

  const data = makeTracker({
    customNonNumericStatistics: {
      clothes: { Ashley: ["default dress"] },
    },
  });

  const value = resolveTrackerDataLookupValue({
    context,
    data,
    byOwner: data.customNonNumericStatistics?.clothes ?? {},
    byEntityId: data.customNonNumericStatisticsByEntityId?.clothes,
    ownerName: "Ash",
  });

  assert.deepEqual(value, ["default dress"]);
});

test("resolveTrackerDataLookupValue prefers current entityOwnerMap alias matches before stale registry owner-name collisions", () => {
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

  const data = makeTracker({
    entityOwnerMap: {
      "Ashley Shadow": {
        entityId: "bst_narrative:ashley-shadow",
        ownerName: "Ashley Shadow",
        canonicalName: "Ashley Shadow",
        aliases: ["Ashley", "Ash"],
        sourceKey: "narrative:bst_narrative:ashley-shadow",
        kind: "narrative-entity",
      },
    },
    customNonNumericStatistics: {
      clothes: { Ashley: ["default dress"] },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_narrative:ashley-shadow": ["mirror shroud"] },
    },
  });

  const value = resolveTrackerDataLookupValue({
    context,
    data,
    byOwner: data.customNonNumericStatistics?.clothes ?? {},
    byEntityId: data.customNonNumericStatisticsByEntityId?.clothes,
    ownerName: "Ashley",
  });

  assert.deepEqual(value, ["mirror shroud"]);
});

test("buildTrackerDataEntityOwnerMap captures registry-backed alias owners present in tracker data", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });

  const tracker = makeTracker({
    activeCharacters: ["Ashley"],
    statistics: {
      affection: { Ashley: 61, Blake: 50 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: { Ashley: ["hoodie"] },
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Ashley?.canonicalName, "Ashley");
  assert.equal(map?.Ashley?.kind, "multi_character_alias");
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Blake?.kind, "multi_character_alias");
});

test("buildTrackerDataEntityOwnerMap prefers resolver scene/message owners over stale activeCharacters", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });

  const tracker = makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake"],
      sceneEntityIds: [],
      messageEntityIds: [],
    }),
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Ashley?.canonicalName, "Ashley");
  assert.equal(map?.Garret, undefined);
});

test("buildTrackerDataEntityOwnerMap ignores stale activeCharacters when resolver owners are explicit even if registry already knows them", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake", "Garret"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });

  const tracker = makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake"],
      sceneEntityIds: [],
      messageEntityIds: [],
    }),
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Ashley?.canonicalName, "Ashley");
  assert.equal(map?.Garret, undefined);
});

test("buildTrackerDataEntityOwnerMap prefers resolver scene entity ids over stale activeCharacters even without explicit scene owner names", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Blake", "Ashley"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });

  const [blakeEntityId] = resolveTrackerEntityIdsForOwners(context, ["Blake"]);
  assert.ok(blakeEntityId);

  const tracker = makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: [],
      messageOwners: ["Blake"],
      sceneEntityIds: [blakeEntityId],
      messageEntityIds: [blakeEntityId],
    }),
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Garret, undefined);
});

test("buildTrackerDataEntityOwnerMap prefers resolver message entity ids over stale activeCharacters even when scene owners are empty", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Blake", "Ashley"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });

  const [blakeEntityId] = resolveTrackerEntityIdsForOwners(context, ["Blake"]);
  assert.ok(blakeEntityId);

  const tracker = makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: [],
      messageOwners: [],
      sceneEntityIds: [],
      messageEntityIds: [blakeEntityId],
    }),
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Garret, undefined);
});

test("buildTrackerDataEntityOwnerMap ignores raw stat owner keys once resolver/entity identity is explicit", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Blake" ? "active" : "inactive",
  });
  syncEntityRegistryFromRender({
    context,
    mode: "multi_character",
    messageIndex: 8,
    owners: ["Billie"],
    getLifecycleState: () => "inactive",
  });

  const tracker = makeTracker({
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake"],
      sceneEntityIds: [],
      messageEntityIds: [],
    }),
    statistics: {
      affection: { Billie: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customNonNumericStatistics: {
      clothes: { Billie: ["jacket"] },
    },
  });

  const map = buildTrackerDataEntityOwnerMap(context, tracker);
  assert.ok(map);
  assert.equal(map?.Blake?.canonicalName, "Blake");
  assert.equal(map?.Ashley?.canonicalName, "Ashley");
  assert.equal(map?.Billie, undefined);
  assert.equal(map?.Garret, undefined);
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

test("getEntityRegistryEntryByEntityIdForMessage resolves visible windows without owner-name lookup", () => {
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

  assert.equal(getEntityRegistryEntryByEntityIdForMessage(context, ashleyId, 7), null);
  assert.equal(getEntityRegistryEntryByEntityIdForMessage(context, ashleyId, 8)?.ownerName, "Ashley");
  assert.equal(getEntityRegistryEntryByEntityIdForMessage(context, blakeId, 14)?.ownerName, "Blake");
  assert.equal(getEntityRegistryEntryByEntityIdForMessage(context, blakeId, 15), null);
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
    { lastActiveMessageIndex: 8, lifecycleState: "inactive", archivedAtMessageIndex: null, introducedAtMessageIndex: 8 },
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

test("getEntityRegistryLifecycleStateForEntityIdForMessage clamps lifecycle without owner-name lookup", () => {
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

  assert.deepEqual(
    getEntityRegistryLifecycleStateForEntityIdForMessage(context, ashleyId, 8),
    { lastActiveMessageIndex: 8, lifecycleState: "inactive", archivedAtMessageIndex: null, introducedAtMessageIndex: 8 },
  );
  assert.deepEqual(
    getEntityRegistryLifecycleStateForEntityIdForMessage(context, blakeId, 15),
    { lastActiveMessageIndex: null, lifecycleState: "archived", archivedAtMessageIndex: 15, introducedAtMessageIndex: 8 },
  );
});
