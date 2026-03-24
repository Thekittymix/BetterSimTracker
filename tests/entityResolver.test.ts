import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCharacterResolverPrompt,
  parseMultiCharacterResolverResponse,
} from "../src/entityResolver";

test("buildMultiCharacterResolverPrompt lists candidate owners and latest message metadata", () => {
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
  assert.match(prompt, /Latest message:/);
  assert.match(prompt, /role: ai/);
  assert.match(prompt, /Blake watched the door click shut\./);
});

test("buildMultiCharacterResolverPrompt supports user-turn scene resolution", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
    ],
    contextText: "Ashley, Blake, Garret, and Raleigh were all here a moment ago.",
    message: {
      name: "User",
      mes: "Ashley leaves the room. Blake stays here alone now.",
      is_user: true,
    } as any,
  });

  assert.match(prompt, /Latest message:/);
  assert.match(prompt, /role: user/);
  assert.match(prompt, /Ashley leaves the room\. Blake stays here alone now\./);
});

test("parseMultiCharacterResolverResponse keeps scene owners separate when messageOwners are empty", () => {
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
    messageOwners: [],
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

test("parseMultiCharacterResolverResponse keeps messageEntityIds empty when only scene entity refs are provided", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneEntityRefs: ["ent2"],
      messageEntityRefs: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
    ],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake"],
    messageOwners: [],
    sceneEntityIds: ["bst_mc_alias:test:blake"],
    messageEntityIds: [],
  });
});
