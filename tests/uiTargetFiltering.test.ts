import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDisplayPoolWithRegistry,
  filterArchivedOwnersFromTargets,
  filterTechnicalSourceOwnersFromTargets,
  mergeRegistryEntitiesIntoTargets,
  mergeRegistryOwnersIntoTargets,
  applyTrackerCardCollapsed,
  resolveRegistryLookupNamesForOwner,
  resolveRegistryOwnersFromEntries,
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

test("shouldKeepOwnerInRenderTargetPool keeps registry-visible owners even without current stat payload", () => {
  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Blake",
      hasAnyStat: false,
      isActive: false,
      registryOwners: new Set(["blake", "garret"]),
    }),
    true,
  );

  assert.equal(
    shouldKeepOwnerInRenderTargetPool({
      ownerName: "Raleigh",
      hasAnyStat: false,
      isActive: false,
      registryOwners: new Set(["blake", "garret"]),
    }),
    false,
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
