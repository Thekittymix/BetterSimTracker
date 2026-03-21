import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCharacterResolverPrompt,
  parseMultiCharacterResolverResponse,
} from "../src/entityResolver";

test("buildMultiCharacterResolverPrompt lists candidate owners and latest AI message", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateOwners: ["Ashley", "Blake", "Garret", "Raleigh"],
    contextText: "User: Ashley leaves the room. Blake stays here alone now.",
    message: {
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      mes: "Blake watched the door click shut.",
      is_user: false,
    } as any,
  });

  assert.match(prompt, /Candidate owners: \["Ashley", "Blake", "Garret", "Raleigh"\]/);
  assert.match(prompt, /Latest AI message:/);
  assert.match(prompt, /Blake watched the door click shut\./);
});

test("parseMultiCharacterResolverResponse keeps only known owners and falls back messageOwners to sceneOwners", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneOwners: ["Blake", "Kuba", "Blake"],
      messageOwners: [],
    }),
    ["Ashley", "Blake", "Garret", "Raleigh"],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
  });
});

test("parseMultiCharacterResolverResponse accepts narrowed message owners from a broader scene owner set", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      sceneOwners: ["Blake", "Raleigh"],
      messageOwners: ["Blake"],
    }),
    ["Ashley", "Blake", "Garret", "Raleigh"],
  );

  assert.deepEqual(parsed, {
    sceneOwners: ["Blake", "Raleigh"],
    messageOwners: ["Blake"],
  });
});
