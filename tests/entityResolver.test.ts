import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCharacterResolverPrompt,
  parseMultiCharacterResolverResponse,
} from "../src/entityResolver";

test("buildMultiCharacterResolverPrompt lists candidate owners and latest AI message", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
    contextText: "User: Ashley leaves the room. Blake stays here alone now.",
    message: {
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      mes: "Blake watched the door click shut.",
      is_user: false,
    } as any,
  });

  assert.match(prompt, /\"entityRef\": \"ent1\"/);
  assert.match(prompt, /\"ownerName\": \"Blake\"/);
  assert.match(prompt, /Latest AI message:/);
  assert.match(prompt, /Blake watched the door click shut\./);
});

test("parseMultiCharacterResolverResponse keeps only known owners and falls back messageOwners to sceneOwners", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneOwners: ["Blake", "Kuba", "Blake"],
      messageOwners: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: [],
    messageEntityIds: [],
  });
});

test("parseMultiCharacterResolverResponse accepts narrowed message owners from a broader scene owner set", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneOwners: ["Blake", "Raleigh"],
      messageOwners: ["Blake"],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake", "Raleigh"],
    messageOwners: ["Blake"],
    sceneEntityIds: [],
    messageEntityIds: [],
  });
});

test("parseMultiCharacterResolverResponse maps entity refs back to stable entity ids", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneEntityRefs: ["ent2", "ent4"],
      messageEntityRefs: ["ent2"],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake", "Raleigh"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:raleigh"],
    messageEntityIds: ["bst_mc_alias:test:blake"],
  });
});
