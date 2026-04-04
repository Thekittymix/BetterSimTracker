import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCharacterResolverPrompt,
  constrainResolvedEntitiesToMessageFocus,
  parseMultiCharacterResolverResponse,
  resolveMessageOwnersFromResolvedEntities,
  resolveResolvedEntityConfidence,
  resolveSceneOwnersFromResolvedEntities,
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

  assert.match(prompt, /"entityRef": "ent1"/);
  assert.match(prompt, /"ownerName": "Blake"/);
  assert.match(prompt, /Latest message:/);
  assert.match(prompt, /role: ai/);
  assert.match(prompt, /Blake watched the door click shut\./);
  assert.match(prompt, /inScene=true.*end of the latest message/i);
  assert.match(prompt, /`inMessage` may be true while `inScene` is false/i);
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
  assert.match(prompt, /return an empty `resolved` array/i);
  assert.match(prompt, /Resolve which already-known entities are present in the scene at the end of the latest message/i);
});

test("buildMultiCharacterResolverPrompt enables conservative created entities only in dynamic mode", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", kind: "st-character" },
      { entityRef: "ent2", ownerName: "Forest Spirit", entityId: "bst_narrative:forest-spirit", kind: "narrative-entity" },
    ],
    contextText: "Blake heard branches move behind him.",
    message: {
      name: "Narrator",
      mes: "A forest spirit stepped out of the fog and watched Blake closely.",
      is_user: false,
    } as any,
    allowNarrativeEntityCreation: true,
  });

  assert.match(prompt, /Use `created` only for clearly new non-user characters, beings, or scene actors/i);
  assert.match(prompt, /Never invent stable IDs/i);
  assert.match(prompt, /"kind": "narrative-entity"/);
  assert.match(prompt, /"created": \[\{ "name": "Forest Spirit"/);
});

test("buildMultiCharacterResolverPrompt forbids props and objects in created entities", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", kind: "st-character" },
    ],
    contextText: "Blake stared at the old map on the table.",
    message: {
      name: "Narrator",
      mes: "The folded parchment slid across the wood as a stranger stepped into the room.",
      is_user: false,
    } as any,
    allowNarrativeEntityCreation: true,
  });

  assert.match(prompt, /character-like scene actors/i);
  assert.match(prompt, /Do not create props, objects, containers, furniture, locations, groups/i);
});

test("buildMultiCharacterResolverPrompt includes explicit continuity snapshot guidance when provided", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Candy", entityId: "bst_narrative:candy" },
      { entityRef: "ent2", ownerName: "Lisa", entityId: "bst_narrative:lisa" },
    ],
    contextText: "Candy bounced on her toes while Lisa stayed near the dresser.",
    message: {
      name: "Narrator",
      mes: "Candy grinned and answered first while Lisa stayed close.",
      is_user: false,
    } as any,
    continuitySnapshot: {
      lastSceneOwners: ["Candy", "Lisa"],
      persistentSceneOwners: ["Candy", "Lisa", "Serena"],
      recentNarrativeEntities: ["Candy", "Lisa", "Serena"],
      recentSourceGroups: [
        { label: "Candy, Lisa, Serena", members: ["Candy", "Lisa", "Serena"] },
      ],
    },
  });

  assert.match(prompt, /Continuity snapshot:/);
  assert.match(prompt, /"lastSceneOwners"/);
  assert.match(prompt, /"persistentSceneOwners"/);
  assert.match(prompt, /"recentNarrativeEntities"/);
  assert.match(prompt, /Candy, Lisa, Serena/);
});

test("parseMultiCharacterResolverResponse keeps scene entities separate when no entity advances the message", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { entityRef: "ent2", inScene: true, inMessage: false },
      ],
      created: [],
      unresolvedMentions: ["Kuba", "Kuba"],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: false,
        sceneEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
      },
    ],
    createdEntities: [],
    unresolvedMentions: ["Kuba"],
  });
});

test("parseMultiCharacterResolverResponse accepts narrowed message entities from a broader scene set", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { entityRef: "ent2", inScene: true, inMessage: true },
        { entityRef: "ent4", inScene: true, inMessage: false },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_entity_ref"],
        messageEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
        messageConfidence: 1,
      },
      {
        entityId: "bst_mc_alias:test:raleigh",
        kind: "st-character",
        name: "Raleigh",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: false,
        sceneEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse maps entity refs back to stable entity ids", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { entityRef: "ent2", inScene: true, inMessage: true },
        { entityRef: "ent4", inScene: true, inMessage: false },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
      { entityRef: "ent4", ownerName: "Raleigh", entityId: "bst_mc_alias:test:raleigh" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_entity_ref"],
        messageEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
        messageConfidence: 1,
      },
      {
        entityId: "bst_mc_alias:test:raleigh",
        kind: "st-character",
        name: "Raleigh",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: false,
        sceneEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse keeps inMessage false when only scene entities are provided", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { entityRef: "ent2", inScene: true, inMessage: false },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: false,
        sceneEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse accepts ownerName fallback when the model omits entityRef", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { ownerName: "Blake", inScene: true, inMessage: true },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley", aliases: ["Ash"] },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", aliases: ["Blackout Blake"] },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        aliases: ["Blackout Blake"],
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_owner_name"],
        messageEvidence: ["resolver_owner_name"],
        sceneConfidence: 0.8,
        messageConfidence: 0.8,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse records alias-based evidence when the model resolves by alias", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { ownerName: "Blackout Blake", inScene: true, inMessage: true },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", aliases: ["Blackout Blake"] },
    ],
  );

  assert.deepEqual(parsed?.resolvedEntities, [
    {
      entityId: "bst_mc_alias:test:blake",
      kind: "st-character",
      name: "Blake",
      avatar: null,
      aliases: ["Blackout Blake"],
      inScene: true,
      inMessage: true,
      sceneEvidence: ["resolver_alias"],
      messageEvidence: ["resolver_alias"],
      sceneConfidence: 0.72,
      messageConfidence: 0.72,
    },
  ]);
});

test("parseMultiCharacterResolverResponse preserves explicit empty-scene resolutions", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley" },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse preserves narrative creation proposals without inventing ids", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [],
      created: [
        { name: "Forest Spirit", aliases: ["Spirit"], inScene: true, inMessage: true },
      ],
      unresolvedMentions: ["Forest Spirit"],
    }),
    [
      { entityRef: "ent1", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", kind: "st-character" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [],
    createdEntities: [
      {
        name: "Forest Spirit",
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
      },
    ],
    unresolvedMentions: ["Forest Spirit"],
  });
});

test("parseMultiCharacterResolverResponse preserves narrative candidate kinds", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { entityRef: "ent2", inScene: true, inMessage: true },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", kind: "st-character" },
      { entityRef: "ent2", ownerName: "Forest Spirit", entityId: "bst_narrative:forest-spirit", kind: "narrative-entity", aliases: ["Spirit"] },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:forest-spirit",
        kind: "narrative-entity",
        name: "Forest Spirit",
        avatar: null,
        aliases: ["Spirit"],
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_entity_ref"],
        messageEvidence: ["resolver_entity_ref"],
        sceneConfidence: 1,
        messageConfidence: 1,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("constrainResolvedEntitiesToMessageFocus keeps only the explicit focused speaker inMessage", () => {
  const constrained = constrainResolvedEntitiesToMessageFocus(
    [
      {
        entityId: "bst_mc_alias:test:ashley",
        kind: "st-character",
        name: "Ashley",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "bst_mc_alias:test:garret",
        kind: "st-character",
        name: "Garret",
        avatar: null,
        inScene: true,
        inMessage: false,
      },
    ],
    [
      { entityRef: "ent1", ownerName: "Ashley", entityId: "bst_mc_alias:test:ashley", aliases: ["Ash"] },
      { entityRef: "ent2", ownerName: "Blake", entityId: "bst_mc_alias:test:blake", aliases: ["Blackout Blake"] },
      { entityRef: "ent3", ownerName: "Garret", entityId: "bst_mc_alias:test:garret" },
    ],
    {
      name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      mes: "*Blake slowly pushed himself off the filing cabinet.*\n\n\"A question,\" Blake said flatly.",
      is_user: false,
    } as any,
  );

  assert.deepEqual(constrained.map(entity => ({ name: entity.name, inScene: entity.inScene, inMessage: entity.inMessage })), [
    { name: "Ashley", inScene: true, inMessage: false },
    { name: "Blake", inScene: true, inMessage: true },
    { name: "Garret", inScene: true, inMessage: false },
  ]);
  assert.deepEqual(constrained.find(entity => entity.name === "Blake")?.messageEvidence, ["focus_constrained"]);
  assert.equal(constrained.find(entity => entity.name === "Blake")?.messageConfidence, 0.12);
  assert.equal(constrained.find(entity => entity.name === "Ashley")?.messageEvidence, undefined);
  assert.equal(constrained.find(entity => entity.name === "Ashley")?.messageConfidence, undefined);
});

test("constrainResolvedEntitiesToMessageFocus honors a previous user single-reply directive even when the AI reply advances everyone", () => {
  const constrained = constrainResolvedEntitiesToMessageFocus(
    [
      {
        entityId: "bst_narrative:candy",
        kind: "narrative-entity",
        name: "Candy",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "bst_narrative:lisa",
        kind: "narrative-entity",
        name: "Lisa",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "bst_narrative:marylyn",
        kind: "narrative-entity",
        name: "Marylyn",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "bst_narrative:serena",
        kind: "narrative-entity",
        name: "Serena",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    [
      { entityRef: "ent1", ownerName: "Candy", entityId: "bst_narrative:candy" },
      { entityRef: "ent2", ownerName: "Lisa", entityId: "bst_narrative:lisa" },
      { entityRef: "ent3", ownerName: "Marylyn", entityId: "bst_narrative:marylyn" },
      { entityRef: "ent4", ownerName: "Serena", entityId: "bst_narrative:serena" },
    ],
    {
      name: "Your Family",
      mes: "Candy answered, but Lisa scoffed, Serena watched with amusement, and Marylyn added a soft comment.",
      is_user: false,
    } as any,
    {
      name: "Kuba",
      mes: "\"Candy, answer only for yourself in one short reply.\" The rest of you stay here and listen, but don't answer.",
      is_user: true,
    } as any,
  );

  assert.deepEqual(constrained.map(entity => ({ name: entity.name, inScene: entity.inScene, inMessage: entity.inMessage })), [
    { name: "Candy", inScene: true, inMessage: true },
    { name: "Lisa", inScene: true, inMessage: false },
    { name: "Marylyn", inScene: true, inMessage: false },
    { name: "Serena", inScene: true, inMessage: false },
  ]);
  assert.deepEqual(constrained.find(entity => entity.name === "Candy")?.messageEvidence, ["focus_constrained"]);
  assert.equal(constrained.find(entity => entity.name === "Candy")?.messageConfidence, 0.12);
});

test("resolveResolvedEntityConfidence weights resolver evidence deterministically", () => {
  assert.equal(resolveResolvedEntityConfidence(["resolver_entity_ref"]), 1);
  assert.equal(resolveResolvedEntityConfidence(["resolver_owner_name"]), 0.8);
  assert.equal(resolveResolvedEntityConfidence(["resolver_alias"]), 0.72);
  assert.equal(resolveResolvedEntityConfidence(["resolver_alias", "focus_constrained"]), 0.84);
  assert.equal(resolveResolvedEntityConfidence(undefined), undefined);
});

test("resolved-owner helpers recover alias owners from technical entity labels", () => {
  const resolvedEntities = [
    {
      entityId: "bst_mc_alias:test:ashley",
      kind: "st-character" as const,
      name: "bst_mc_alias:test:ashley",
      avatar: null,
      inScene: true,
      inMessage: false,
    },
    {
      entityId: "bst_mc_alias:test:blake",
      kind: "st-character" as const,
      name: "bst_mc_alias:test:blake",
      avatar: null,
      inScene: true,
      inMessage: true,
    },
  ];

  assert.deepEqual(resolveSceneOwnersFromResolvedEntities(resolvedEntities), ["ashley", "blake"]);
  assert.deepEqual(resolveMessageOwnersFromResolvedEntities(resolvedEntities), ["blake"]);
});
