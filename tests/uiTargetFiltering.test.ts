import test from "node:test";
import assert from "node:assert/strict";

import { filterTechnicalSourceOwnersFromTargets, type OwnerRenderIdentity } from "../src/ui";

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
