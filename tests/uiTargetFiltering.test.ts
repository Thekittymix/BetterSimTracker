import test from "node:test";
import assert from "node:assert/strict";

import {
  filterArchivedOwnersFromTargets,
  filterTechnicalSourceOwnersFromTargets,
  mergeRegistryOwnersIntoTargets,
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
