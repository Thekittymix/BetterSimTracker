import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import {
  buildDisplayPoolWithRegistry,
  collectCharacterNamesFromTrackerData,
  filterArchivedOwnersFromTargets,
  filterTechnicalSourceOwnersFromTargets,
  isUserOwnerToken,
  mergeRegistryEntitiesIntoTargets,
  mergeRegistryOwnersIntoTargets,
  applyTrackerCardCollapsed,
  resolveRegistryLookupNamesForOwner,
  resolveRegistryEntryForOwnerInMessageData,
  resolveLifecycleRegistryStateForOwnerInMessageData,
  resolveRegistryOwnersFromEntries,
  resolveCurrentLifecycleOwners,
  resolveCurrentLifecycleOwnersForTrackerData,
  resolveTrackerCardCollapsed,
  resolveOwnerUiKey,
  shouldKeepOwnerInRenderTargetPool,
  type OwnerRenderIdentity,
} from "../src/ui";

test("filterTechnicalSourceOwnersFromTargets hides a source-card owner when one of its aliases is rendered", () => {
  const identities = new Map<string, OwnerRenderIdentity>([
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", { sourceKey: "camp.png|Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", isAlias: false, isSource: true }],
    ["Ashley", { sourceKey: "camp.png|Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", isAlias: true, isSource: false }],
    ["Billie", { sourceKey: "billie.png|Billie", isAlias: false, isSource: true }],
  ]);

  const filtered = filterTechnicalSourceOwnersFromTargets(
    ["Ashley", "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"],
    ownerName => identities.get(ownerName) ?? null,
  );

  assert.deepEqual(filtered, ["Ashley", "Billie"]);
});

test("filterTechnicalSourceOwnersFromTargets keeps source-card owner when no alias from that source is rendered", () => {
  const identities = new Map<string, OwnerRenderIdentity>([
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", { sourceKey: "camp.png|Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", isAlias: false, isSource: true }],
    ["Billie", { sourceKey: "billie.png|Billie", isAlias: false, isSource: true }],
  ]);

  const filtered = filterTechnicalSourceOwnersFromTargets(
    ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"],
    ownerName => identities.get(ownerName) ?? null,
  );

  assert.deepEqual(filtered, ["Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", "Billie"]);
});

test("filterArchivedOwnersFromTargets removes archived owners from the render target list", () => {
  const filtered = filterArchivedOwnersFromTargets(
    ["Ashley", "Blake", "Garret"],
    ownerName => ownerName === "Ashley" ? "archived" : "inactive",
  );

  assert.deepEqual(filtered, ["Blake", "Garret"]);
});

test("mergeRegistryOwnersIntoTargets backfills registry owners without duplicating existing names", () => {
  const merged = mergeRegistryOwnersIntoTargets(
    ["Ashley", "Blake"],
    ["Blake", "Garret", "Raleigh"],
  );

  assert.deepEqual(merged, ["Ashley", "Blake", "Garret", "Raleigh"]);
});

test("mergeRegistryEntitiesIntoTargets deduplicates entity-backed targets by registry id, not just owner spelling", () => {
  const registryEntries = [
    { id: "ent-ashley", ownerName: "Ashley" },
    { id: "ent-blake", ownerName: "Blake" },
  ] as never[];
  const merged = mergeRegistryEntitiesIntoTargets({
    targets: ["Ash", "Blake"],
    registryEntries,
    resolveRegistryEntry: ownerName => {
      if (ownerName === "Ash") return { id: "ent-ashley", ownerName: "Ashley" } as never;
      if (ownerName === "Blake") return { id: "ent-blake", ownerName: "Blake" } as never;
      return null;
    },
  });

  assert.deepEqual(merged, ["Ash", "Blake"]);
});

test("collectCharacterNamesFromTrackerData prefers resolver scene owners and entity owner map over stale activeCharacters", () => {
  const names = collectCharacterNamesFromTrackerData(
    {
      chat: [],
      chatMetadata: {
        bstEntityRegistry: {
          entities: {
            "ent-blake": {
              id: "ent-blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blackout Blake"],
              kind: "multi_character_alias",
              sourceKey: "camp",
              lifecycle: "active",
              createdAtMessageIndex: 0,
              lastSeenMessageIndex: 2,
              lastActiveMessageIndex: 2,
            },
          },
          byOwner: {
            Blake: "ent-blake",
          },
          bySource: {},
        },
      },
    } as never,
    {
      activeCharacters: ["Garret", "Raleigh"],
      entityResolution: buildEntityResolution({
        source: "model",
        sceneOwners: ["Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-blake"],
        messageEntityIds: ["ent-blake"],
      }),
      entityOwnerMap: {
        Blake: {
          entityId: "ent-blake",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["Blackout Blake"],
          kind: "multi_character_alias",
          sourceKey: "camp",
        },
      },
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
      timestamp: 1,
    },
  );

  assert.deepEqual(names, ["Blake"]);
});

test("collectCharacterNamesFromTrackerData ignores raw stat owner keys once explicit resolver/entity identity exists", () => {
  const names = collectCharacterNamesFromTrackerData(
    {
      chat: [],
      chatMetadata: {
        bstEntityRegistry: {
          entities: {
            "ent-blake": {
              id: "ent-blake",
              ownerName: "Blake",
              canonicalName: "Blake",
              aliases: ["Blackout Blake"],
              kind: "multi_character_alias",
              sourceKey: "camp",
              lifecycle: "active",
              createdAtMessageIndex: 0,
              lastSeenMessageIndex: 2,
              lastActiveMessageIndex: 2,
            },
          },
          byOwner: {
            Blake: "ent-blake",
          },
          bySource: {},
        },
      },
    } as never,
    {
      activeCharacters: ["Garret"],
      entityResolution: buildEntityResolution({
        source: "model",
        sceneOwners: ["Blake"],
        messageOwners: ["Blake"],
        sceneEntityIds: ["ent-blake"],
        messageEntityIds: ["ent-blake"],
      }),
      entityOwnerMap: {
        Blake: {
          entityId: "ent-blake",
          ownerName: "Blake",
          canonicalName: "Blake",
          aliases: ["Blackout Blake"],
          kind: "multi_character_alias",
          sourceKey: "camp",
        },
      },
      statistics: {
        affection: { Garret: 50, Raleigh: 50 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {
        pose: {
          Ashley: "near the door",
        },
      },
      timestamp: 1,
    },
  );

  assert.deepEqual(names, ["Blake"]);
});

test("collectCharacterNamesFromTrackerData can materialize resolver scene owners from entity ids plus owner map without context", () => {
  const names = collectCharacterNamesFromTrackerData({
    activeCharacters: ["Garret", "Raleigh"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: [],
      messageOwners: [],
      sceneEntityIds: ["ent-blake"],
      messageEntityIds: ["ent-blake"],
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Blackout Blake"],
        kind: "multi_character_alias",
        sourceKey: "camp",
      },
    },
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
    timestamp: 1,
  } as never);

  assert.deepEqual(names, ["Blake"]);
});

test("resolveRegistryOwnersFromEntries preserves introduction order and deduplicates names", () => {
  const owners = resolveRegistryOwnersFromEntries([
    { id: "a", ownerName: "Ashley" } as never,
    { id: "b", ownerName: "Blake" } as never,
    { id: "c", ownerName: "Ashley" } as never,
    { id: "d", ownerName: "Raleigh" } as never,
  ]);

  assert.deepEqual(owners, ["Ashley", "Blake", "Raleigh"]);
});

test("resolveRegistryLookupNamesForOwner includes entity aliases without falling back to source-card owner", () => {
  const names = resolveRegistryLookupNamesForOwner(
    "Ashley",
    {
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash", "Ashley"],
      kind: "multi_character_alias",
    } as never,
  );

  assert.deepEqual(names, ["Ashley", "Ash"]);
});

test("resolveRegistryEntryForOwnerInMessageData prefers tracker data entity ids over stale owner-name registry matches", () => {
  const resolved = resolveRegistryEntryForOwnerInMessageData({
    ownerName: "Ash",
    messageIndex: 2,
    data: {
      activeCharacters: ["Ash"],
      entityOwnerMap: {
        Ash: {
          entityId: "ent-ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "camp",
          kind: "multi_character_alias",
        },
      },
    } as never,
    resolveRegistryEntryForMessage: ownerName =>
      ownerName === "Ash"
        ? ({ id: "ent-stale", ownerName: "Ash", canonicalName: "Ash", aliases: [], kind: "multi_character_alias" } as never)
        : null,
    resolveRegistryEntryByEntityIdForMessage: entityId =>
      entityId === "ent-ashley"
        ? ({ id: "ent-ashley", ownerName: "Ashley", canonicalName: "Ashley", aliases: ["Ash"], kind: "multi_character_alias" } as never)
        : null,
  });

  assert.equal(resolved?.id, "ent-ashley");
  assert.equal(resolved?.ownerName, "Ashley");
});

test("resolveLifecycleRegistryStateForOwnerInMessageData prefers tracker data entity ids over stale owner-name lifecycle matches", () => {
  const resolved = resolveLifecycleRegistryStateForOwnerInMessageData({
    ownerName: "Ash",
    messageIndex: 2,
    data: {
      activeCharacters: ["Ash"],
      entityOwnerMap: {
        Ash: {
          entityId: "ent-ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "camp",
          kind: "multi_character_alias",
        },
      },
    } as never,
    resolveLifecycleRegistryState: ownerName =>
      ownerName === "Ash"
        ? ({ lifecycleState: "inactive", lastActiveMessageIndex: 1, introducedAtMessageIndex: 0 } as never)
        : null,
    resolveLifecycleRegistryStateByEntityId: entityId =>
      entityId === "ent-ashley"
        ? ({ lifecycleState: "active", lastActiveMessageIndex: 2, introducedAtMessageIndex: 0 } as never)
        : null,
  });

  assert.equal(resolved?.lifecycleState, "active");
  assert.equal(resolved?.lastActiveMessageIndex, 2);
});

test("buildDisplayPoolWithRegistry keeps registry owners visible in direct-chat continuity mode", () => {
  const displayPool = buildDisplayPoolWithRegistry({
    entityTrackingMode: "multi_character",
    includeAllTargets: false,
    activeCharacters: ["Ashley"],
    dataCharacterNames: ["Ashley"],
    mergedWithRegistryOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
  });

  assert.deepEqual(displayPool, ["Ashley", "Blake", "Garret", "Raleigh"]);
});

test("buildDisplayPoolWithRegistry keeps standard mode focused on current active/data owners", () => {
  const displayPool = buildDisplayPoolWithRegistry({
    entityTrackingMode: "standard",
    includeAllTargets: false,
    activeCharacters: ["Ashley"],
    dataCharacterNames: ["Ashley"],
    mergedWithRegistryOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
  });

  assert.deepEqual(displayPool, ["Ashley"]);
});

test("isUserOwnerToken recognizes both the internal user key and legacy visible user labels", () => {
  const resolveDisplayName = (ownerName: string): string =>
    ownerName === "__bst_user__" ? "User" : ownerName;

  assert.equal(isUserOwnerToken("__bst_user__", resolveDisplayName), true);
  assert.equal(isUserOwnerToken("User", resolveDisplayName), true);
  assert.equal(isUserOwnerToken("Blake", resolveDisplayName), false);
});

test("shouldKeepOwnerInRenderTargetPool requires real state evidence, not registry presence alone", () => {
  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Blake",
      hasAnyStat: false,
      isActive: false,
    }),
    false,
  );

  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Raleigh",
      hasAnyStat: false,
      isActive: false,
    }),
    false,
  );

  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Ashley",
      hasAnyStat: true,
      isActive: false,
    }),
    true,
  );

  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Garret",
      hasAnyStat: false,
      isActive: true,
    }),
    true,
  );
});

test("resolveOwnerUiKey prefers stable registry entity ids over raw owner names", () => {
  assert.equal(
    resolveOwnerUiKey("Ashley", { id: "bst_mc_alias:camp:ashley" }),
    "bst_mc_alias:camp:ashley",
  );

  assert.equal(
    resolveOwnerUiKey("Ashley", null),
    "ashley",
  );
});

test("resolveTrackerCardCollapsed defaults active cards open and inactive cards collapsed", () => {
  assert.equal(
    resolveTrackerCardCollapsed({
      cardKey: "m:ashley",
      isActive: true,
      collapsedActiveCardKeys: new Set(),
      expandedInactiveCardKeys: new Set(),
    }),
    false,
  );

  assert.equal(
    resolveTrackerCardCollapsed({
      cardKey: "m:blake",
      isActive: false,
      collapsedActiveCardKeys: new Set(),
      expandedInactiveCardKeys: new Set(),
    }),
    true,
  );
});

test("resolveCurrentLifecycleOwners includes message-only user owner without duplicating scene owners", () => {
  assert.deepEqual(
    resolveCurrentLifecycleOwners({
      sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
      messageOwners: ["__bst_user__", "Blake"],
    }),
    ["Ashley", "Blake", "Garret", "Raleigh", "__bst_user__"],
  );
});

test("resolveCurrentLifecycleOwnersForTrackerData preserves explicit empty active sets instead of falling back to scene owners", () => {
  assert.deepEqual(
    resolveCurrentLifecycleOwnersForTrackerData({
      timestamp: 1,
      activeCharacters: [],
      entityResolution: buildEntityResolution({
        sceneOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
        messageOwners: [],
        source: "model",
      }),
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
    }),
    [],
  );
});

test("applyTrackerCardCollapsed overrides per-card UI state by stable card key", () => {
  const collapsedActive = new Set<string>();
  const expandedInactive = new Set<string>();

  applyTrackerCardCollapsed({
    cardKey: "m:ashley",
    isActive: true,
    nextCollapsed: true,
    collapsedActiveCardKeys: collapsedActive,
    expandedInactiveCardKeys: expandedInactive,
  });
  applyTrackerCardCollapsed({
    cardKey: "m:blake",
    isActive: false,
    nextCollapsed: false,
    collapsedActiveCardKeys: collapsedActive,
    expandedInactiveCardKeys: expandedInactive,
  });

  assert.equal(
    resolveTrackerCardCollapsed({
      cardKey: "m:ashley",
      isActive: true,
      collapsedActiveCardKeys: collapsedActive,
      expandedInactiveCardKeys: expandedInactive,
    }),
    true,
  );
  assert.equal(
    resolveTrackerCardCollapsed({
      cardKey: "m:blake",
      isActive: false,
      collapsedActiveCardKeys: collapsedActive,
      expandedInactiveCardKeys: expandedInactive,
    }),
    false,
  );
});
