import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiCharacterResolverPrompt,
  filterResolvedEntitiesForLifecycleReactivation,
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
  assert.match(prompt, /minor spelling, capitalization, punctuation, or transliteration variant/i);
  assert.match(prompt, /resolve that existing `entityRef` instead of creating a new entity/i);
});

test("buildMultiCharacterResolverPrompt includes previous-message responder guidance without relying on phrase hardcoding in code", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Candy", entityId: "bst_narrative:candy" },
      { entityRef: "ent2", ownerName: "Lisa", entityId: "bst_narrative:lisa" },
      { entityRef: "ent3", ownerName: "Marylyn", entityId: "bst_narrative:marylyn" },
      { entityRef: "ent4", ownerName: "Serena", entityId: "bst_narrative:serena" },
    ],
    contextText: "Candy, Lisa, Marylyn, and Serena are all still in the kitchen.",
    previousMessage: {
      name: "Kuba",
      mes: "\"Candy, answer first.\" Lisa, Marylyn, and Serena stay here and listen.",
      is_user: true,
      is_system: false,
    } as any,
    message: {
      name: "Your Family",
      mes: "Candy replied while the others watched in silence.",
      is_user: false,
      is_system: false,
    } as any,
  });

  assert.match(prompt, /Previous message metadata:/);
  assert.match(prompt, /role: user/);
  assert.match(prompt, /speaker: Kuba/);
  assert.match(prompt, /Candy, answer first\./);
  assert.match(prompt, /keep the scene broad but keep `inMessage=true` only for entities the latest reply actually advances/i);
  assert.match(prompt, /Do not mark an entity `inMessage=true` just because it is named in instructions/i);
});

test("buildMultiCharacterResolverPrompt distinguishes off-screen mention from active scene presence", () => {
  const prompt = buildMultiCharacterResolverPrompt({
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Marylyn", entityId: "bst_narrative:marylyn" },
      { entityRef: "ent2", ownerName: "Candy", entityId: "bst_narrative:candy" },
    ],
    contextText: "Marylyn and Candy were both tracked earlier in the house.",
    previousMessage: {
      name: "Kuba",
      mes: "\"Did Candy manage to fall asleep?\"",
      is_user: true,
      is_system: false,
    } as any,
    message: {
      name: "Your Family",
      mes: "Marylyn says Candy is resting in the guest room and does not enter the hallway scene.",
      is_user: false,
      is_system: false,
    } as any,
  });

  assert.match(prompt, /off-screen or in another room/i);
  assert.match(prompt, /resting away from the interaction/i);
  assert.match(prompt, /talks about them in dialogue or narration while they remain absent/i);
  assert.match(prompt, /resting in another room/i);
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
      {
        entityRef: "ent1",
        ownerName: "Candy",
        entityId: "bst_narrative:candy",
        lifecycle: { state: "active", lastSeenMessageIndex: 9, lastActiveMessageIndex: 9 },
      },
      {
        entityRef: "ent2",
        ownerName: "Lisa",
        entityId: "bst_narrative:lisa",
        lifecycle: { state: "archived", lastSeenMessageIndex: 4, lastActiveMessageIndex: 2 },
      },
    ],
    contextText: "Candy bounced on her toes while Lisa stayed near the dresser.",
    previousMessage: {
      name: "Kuba",
      mes: "\"Lisa, wait here while Candy answers.\"",
      is_user: true,
      is_system: false,
    } as any,
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
  assert.match(prompt, /"continuityHints"/);
  assert.match(prompt, /"inLastScene": true/);
  assert.match(prompt, /"inPersistentScene": true/);
  assert.match(prompt, /"recentNarrativeEntity": true/);
  assert.match(prompt, /"sourceGroupMembers"/);
  assert.match(prompt, /Use continuity hints as prior-state context/i);
  assert.match(prompt, /not commands to activate everyone/i);
  assert.match(prompt, /"lifecycle"/);
  assert.match(prompt, /"state": "archived"/);
  assert.match(prompt, /"lastSeenMessageIndex": 4/);
  assert.match(prompt, /Candidate `lifecycle` is historical registry context only/i);
  assert.match(prompt, /inactive or archived candidate can return only when the latest context clearly brings them back/i);
  assert.match(prompt, /"mentionHints"/);
  assert.match(prompt, /"latestMessageAliases": \[\s+"Candy"\s+\]/);
  assert.match(prompt, /"previousMessageAliases": \[\s+"Lisa"\s+\]/);
  assert.match(prompt, /Mentions are evidence to inspect, not automatic proof/i);
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

test("parseMultiCharacterResolverResponse resolves a unique minor spelling variant to an existing candidate", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { name: "Elise", inScene: true, inMessage: true },
      ],
      created: [],
      unresolvedMentions: [],
    }),
    [
      { entityRef: "ent1", ownerName: "Elyse", entityId: "bst_narrative:elyse", kind: "narrative-entity" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [
      {
        entityId: "bst_narrative:elyse",
        kind: "narrative-entity",
        name: "Elyse",
        avatar: null,
        aliases: undefined,
        inScene: true,
        inMessage: true,
        sceneEvidence: ["resolver_alias"],
        messageEvidence: ["resolver_alias"],
        sceneConfidence: 0.72,
        messageConfidence: 0.72,
      },
    ],
    createdEntities: [],
    unresolvedMentions: [],
  });
});

test("parseMultiCharacterResolverResponse leaves ambiguous minor spelling variants unresolved", () => {
  const parsed = parseMultiCharacterResolverResponse(
    JSON.stringify({
      resolved: [
        { name: "Elise", inScene: true, inMessage: true },
      ],
      created: [],
      unresolvedMentions: ["Elise"],
    }),
    [
      { entityRef: "ent1", ownerName: "Elyse", entityId: "bst_narrative:elyse", kind: "narrative-entity" },
      { entityRef: "ent2", ownerName: "Elisa", entityId: "bst_narrative:elisa", kind: "narrative-entity" },
    ],
  );

  assert.deepEqual(parsed, {
    resolvedEntities: [],
    createdEntities: [],
    unresolvedMentions: ["Elise"],
  });
});

test("filterResolvedEntitiesForLifecycleReactivation removes inactive or archived entities without latest-message evidence", () => {
  const resolvedEntities = [
    {
      entityId: "bst_narrative:serena",
      kind: "narrative-entity" as const,
      name: "Serena",
      avatar: null,
      inScene: true,
      inMessage: true,
    },
    {
      entityId: "bst_narrative:lisa",
      kind: "narrative-entity" as const,
      name: "Lisa",
      avatar: null,
      inScene: true,
      inMessage: false,
    },
    {
      entityId: "bst_narrative:candy",
      kind: "narrative-entity" as const,
      name: "Candy",
      avatar: null,
      inScene: true,
      inMessage: false,
    },
  ];

  assert.deepEqual(filterResolvedEntitiesForLifecycleReactivation({
    resolvedEntities,
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Serena", entityId: "bst_narrative:serena", kind: "narrative-entity", lifecycle: { state: "active" } },
      { entityRef: "ent2", ownerName: "Lisa", entityId: "bst_narrative:lisa", kind: "narrative-entity", lifecycle: { state: "archived" } },
      { entityRef: "ent3", ownerName: "Candy", entityId: "bst_narrative:candy", kind: "narrative-entity", lifecycle: { state: "inactive" } },
    ],
    messageText: "Serena leaned closer to Marylyn in the hallway. Marylyn answered her directly.",
    messageName: "Your Family",
  }), [
    {
      entityId: "bst_narrative:serena",
      kind: "narrative-entity",
      name: "Serena",
      avatar: null,
      inScene: true,
      inMessage: true,
    },
  ]);
});

test("filterResolvedEntitiesForLifecycleReactivation allows inactive or archived entities with direct or unique near-name evidence", () => {
  const resolvedEntities = [
    {
      entityId: "bst_narrative:lisa",
      kind: "narrative-entity" as const,
      name: "Lisa",
      avatar: null,
      inScene: true,
      inMessage: true,
    },
    {
      entityId: "bst_narrative:elyse",
      kind: "narrative-entity" as const,
      name: "Elyse",
      avatar: null,
      inScene: true,
      inMessage: true,
    },
  ];

  assert.deepEqual(filterResolvedEntitiesForLifecycleReactivation({
    resolvedEntities,
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Lisa", entityId: "bst_narrative:lisa", kind: "narrative-entity", lifecycle: { state: "archived" } },
      { entityRef: "ent2", ownerName: "Elyse", entityId: "bst_narrative:elyse", kind: "narrative-entity", lifecycle: { state: "inactive" } },
    ],
    messageText: "Lisa returned to the hallway as Elise stepped in behind her.",
    messageName: "Your Family",
  }), resolvedEntities);
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

test("resolveResolvedEntityConfidence weights resolver evidence deterministically", () => {
  assert.equal(resolveResolvedEntityConfidence(["resolver_entity_ref"]), 1);
  assert.equal(resolveResolvedEntityConfidence(["resolver_owner_name"]), 0.8);
  assert.equal(resolveResolvedEntityConfidence(["resolver_alias"]), 0.72);
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
