import test from "node:test";
import assert from "node:assert/strict";

import { buildEntityResolution } from "./helpers/entityResolution";

import {
  buildRecentContext,
  getAllTrackedCharacterNames,
  readManualInactiveCharacters,
  reconcileManualInactiveCharactersWithScene,
  resolveActiveCharacterAnalysis,
  setManualInactiveCharacter,
} from "../src/activity";
import { resolveSceneOwnersFromResolvedEntities } from "../src/entityResolver";
import { defaultSettings } from "../src/settings";
import type { STContext } from "../src/types";

function makeContext(): STContext {
  return {
    groupId: "group-1",
    groups: [{ id: "group-1", members: ["alice.png", "billie.png"] }],
    characters: [
      { name: "Alice", avatar: "alice.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
    chatMetadata: {},
    chat: [
      { name: "Alice", mes: "Alice opens the scene.", is_user: false, is_system: false },
      { name: "User", mes: "Okay.", is_user: true, is_system: false },
      { name: "Billie", mes: "Billie talks.", is_user: false, is_system: false },
      { name: "User", mes: "Go on.", is_user: true, is_system: false },
      { name: "Billie", mes: "Billie keeps talking.", is_user: false, is_system: false },
      { name: "User", mes: "Continue.", is_user: true, is_system: false },
      { name: "Billie", mes: "Still Billie.", is_user: false, is_system: false },
      { name: "User", mes: "Sure.", is_user: true, is_system: false },
      { name: "Billie", mes: "Latest Billie turn.", is_user: false, is_system: false },
    ],
  };
}

test("activity analysis does not keep stale speakers active for the old long persistence window", () => {
  const context = makeContext();
  const result = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });

  assert.deepEqual(result.activeCharacters, ["Billie"]);
  assert.match(result.reasons.Alice, /not seen in recent activity window/i);
});

test("manual inactive override persists until the character speaks again and can still be cleared manually", () => {
  const context = makeContext();

  const inactive = setManualInactiveCharacter(context, "Billie", true);
  assert.deepEqual(inactive, ["Billie"]);
  assert.deepEqual(readManualInactiveCharacters(context), ["Billie"]);

  const inactiveResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });
  assert.deepEqual(inactiveResult.activeCharacters, []);
  assert.equal(inactiveResult.reasons.Billie, "manual inactive override");
  assert.deepEqual(inactiveResult.manualInactiveCharacters, ["Billie"]);

  context.chat.push(
    { name: "User", mes: "Say something again.", is_user: true, is_system: false },
    { name: "Billie", mes: "I'm back in the scene.", is_user: false, is_system: false },
  );

  const resumedResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });
  assert.deepEqual(resumedResult.activeCharacters, ["Billie"]);
  assert.deepEqual(resumedResult.manualInactiveCharacters, []);
  assert.deepEqual(readManualInactiveCharacters(context), []);
});

test("manual inactive override can still be cleared manually before the character speaks again", () => {
  const context = makeContext();
  setManualInactiveCharacter(context, "Billie", true);

  const cleared = setManualInactiveCharacter(context, "Billie", false);
  assert.deepEqual(cleared, []);
  assert.deepEqual(readManualInactiveCharacters(context), []);

  const clearedResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
  });
  assert.deepEqual(clearedResult.activeCharacters, ["Billie"]);
});

test("manual inactive override clears when model-backed scene resolution confirms the character is in scene", () => {
  const context = makeContext();
  setManualInactiveCharacter(context, "Billie", true);

  const reconciliation = reconcileManualInactiveCharactersWithScene(context, ["Billie", "Alice"]);

  assert.deepEqual(reconciliation.cleared, ["Billie"]);
  assert.deepEqual(reconciliation.remaining, []);
  assert.deepEqual(readManualInactiveCharacters(context), []);
});

test("manual inactive override clears from model-backed scene entities for dynamic single-card scenes", () => {
  const context = {
    characterId: 0,
    characters: [
      { name: "Your Family", avatar: "your-family.png" },
    ],
    extensionSettings: {
      bettersimtracker: {
        entityTrackingMode: "dynamic_characters",
      },
    },
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_narrative:lisa": {
            id: "bst_narrative:lisa",
            ownerName: "Lisa",
            canonicalName: "Lisa",
            aliases: [],
            sourceName: "Your Family",
            sourceAvatar: "your-family.png",
            sourceKey: "your-family.png|your family",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
          "bst_narrative:marylyn": {
            id: "bst_narrative:marylyn",
            ownerName: "Marylyn",
            canonicalName: "Marylyn",
            aliases: [],
            sourceName: "Your Family",
            sourceAvatar: "your-family.png",
            sourceKey: "your-family.png|your family",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          lisa: "bst_narrative:lisa",
          marylyn: "bst_narrative:marylyn",
        },
      },
    },
    chat: [
      { name: "Your Family", mes: "Lisa freezes as Marylyn rushes into the room.", is_user: false, is_system: false },
    ],
  } as unknown as STContext;

  setManualInactiveCharacter(context, "Marylyn", true);
  assert.deepEqual(readManualInactiveCharacters(context), ["Marylyn"]);

  const resolved = buildEntityResolution({
    source: "model",
    resolvedEntities: [
      {
        entityId: "bst_narrative:lisa",
        kind: "narrative-entity",
        name: "Lisa",
        avatar: null,
        inScene: true,
        inMessage: true,
        created: false,
      },
      {
        entityId: "bst_narrative:marylyn",
        kind: "narrative-entity",
        name: "Marylyn",
        avatar: null,
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
  });

  const reconciliation = reconcileManualInactiveCharactersWithScene(
    context,
    resolveSceneOwnersFromResolvedEntities(resolved.resolvedEntities ?? []),
  );

  assert.deepEqual(reconciliation.cleared, ["Marylyn"]);
  assert.deepEqual(reconciliation.remaining, []);
  assert.deepEqual(readManualInactiveCharacters(context), []);
});

test("getAllTrackedCharacterNames expands multi-character source cards into aliases when enabled", () => {
  const context = {
    groupId: "group-1",
    groups: [{ id: "group-1", members: ["camp.png", "billie.png"] }],
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
    chatMetadata: {},
    chat: [],
  } as unknown as STContext;

  assert.deepEqual(
    getAllTrackedCharacterNames(context, { entityTrackingMode: "dynamic_characters" }),
    [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Billie",
    ],
  );
});

test("getAllTrackedCharacterNames keeps muted multi-character group members in the known identity universe", () => {
  const context = {
    groupId: "group-1",
    groups: [{
      id: "group-1",
      members: ["camp.png", "chloe.png"],
      disabled_members: ["camp.png", "chloe.png"],
    }],
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Chloe", avatar: "chloe.png" },
    ],
    chatMetadata: {},
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Raleigh checked the porch while Blake watched the treeline.", is_user: false, is_system: false },
      { name: "Chloe", mes: "\"I'm still here,\" Chloe whispered.", is_user: false, is_system: false },
    ],
  } as unknown as STContext;

  assert.deepEqual(
    getAllTrackedCharacterNames(context, { entityTrackingMode: "dynamic_characters" }),
    [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Chloe",
    ],
  );
});

test("getAllTrackedCharacterNames includes visible registry-backed narrative entities in multi-character mode", () => {
  const context = {
    groupId: undefined,
    characterId: 0,
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-forest-spirit": {
            id: "ent-forest-spirit",
            ownerName: "Forest Spirit",
            canonicalName: "Forest Spirit",
            aliases: ["Spirit"],
            sourceName: "Forest Spirit",
            sourceAvatar: null,
            sourceKey: "narrative:ent-forest-spirit",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          "forest spirit": "ent-forest-spirit",
          spirit: "ent-forest-spirit",
        },
      },
    },
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "A forest spirit watches from the trees.", is_user: false, is_system: false },
      { name: "User", mes: "Keep going.", is_user: true, is_system: false },
    ],
  } as unknown as STContext;

  assert.deepEqual(
    getAllTrackedCharacterNames(context, { entityTrackingMode: "dynamic_characters" }),
    [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Forest Spirit",
    ],
  );
});

test("getAllTrackedCharacterNames includes registry-backed narrative entities in dynamic entity mode", () => {
  const context = {
    groupId: undefined,
    characterId: 0,
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-forest-spirit": {
            id: "ent-forest-spirit",
            ownerName: "Forest Spirit",
            canonicalName: "Forest Spirit",
            aliases: ["Spirit"],
            sourceName: "Forest Spirit",
            sourceAvatar: null,
            sourceKey: "narrative:ent-forest-spirit",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          "forest spirit": "ent-forest-spirit",
          spirit: "ent-forest-spirit",
        },
      },
    },
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "A forest spirit watches from the trees.", is_user: false, is_system: false },
      { name: "User", mes: "Keep going.", is_user: true, is_system: false },
    ],
  } as unknown as STContext;

  assert.deepEqual(
    getAllTrackedCharacterNames(context, { entityTrackingMode: "dynamic_characters" }),
    [
      "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
      "Ashley",
      "Blake",
      "Garret",
      "Raleigh",
      "Forest Spirit",
    ],
  );
});

test("activity analysis keeps the full alias pool active for a multi-character source-card reply", () => {
  const context = {
    groupId: undefined,
    characterId: 0,
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    chatMetadata: {},
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Ashley froze at the door while Blake glanced over her shoulder.", is_user: false, is_system: false },
      { name: "User", mes: "What now?", is_user: true, is_system: false },
    ],
  } as unknown as STContext;

  const result = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
    entityTrackingMode: "dynamic_characters",
  });

  assert.deepEqual(result.activeCharacters, ["Ashley", "Blake", "Garret", "Raleigh"]);
  assert.match(result.reasons.Ashley, /spoke in last 5 messages/i);
  assert.match(result.reasons.Blake, /spoke in last 5 messages/i);
});

test("manual inactive alias override does not clear from a mention-only multi-character source-card reply", () => {
  const context = {
    groupId: undefined,
    characterId: 0,
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
    ],
    extensionSettings: {
      bettersimtracker: {
        entityTrackingMode: "dynamic_characters",
      },
    },
    chatMetadata: {},
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Ashley stared toward the window.", is_user: false, is_system: false },
    ],
  } as unknown as STContext;

  setManualInactiveCharacter(context, "Ashley", true);
  assert.deepEqual(readManualInactiveCharacters(context), ["Ashley"]);

  context.chat.push(
    { name: "User", mes: "Ashley, answer again.", is_user: true, is_system: false },
    { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Ashley flinched and answered quietly.", is_user: false, is_system: false },
  );

  const result = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 5,
    entityTrackingMode: "dynamic_characters",
  });

  assert.deepEqual(result.manualInactiveCharacters, ["Ashley"]);
  assert.deepEqual(readManualInactiveCharacters(context), ["Ashley"]);
  assert.deepEqual(result.activeCharacters, [
    "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
    "Blake",
    "Garret",
    "Raleigh",
  ]);
  assert.equal(result.reasons.Ashley, "manual inactive override");
});

test("activity analysis can scope retrack detection away from later messages", () => {
  const context = {
    groupId: "group-1",
    groups: [{ id: "group-1", members: ["blake.png", "garret.png"] }],
    characters: [
      { name: "Blake", avatar: "blake.png" },
      { name: "Garret", avatar: "garret.png" },
    ],
    chatMetadata: {},
    chat: [
      { name: "Blake", mes: "Blake answered first.", is_user: false, is_system: false },
      { name: "User", mes: "Keep going.", is_user: true, is_system: false },
      { name: "Blake", mes: "Blake answered again.", is_user: false, is_system: false },
      { name: "User", mes: "The scene drifts forward.", is_user: true, is_system: false },
      { name: "User", mes: "Still no Garret yet.", is_user: true, is_system: false },
      { name: "User", mes: "Now Garret replies later.", is_user: true, is_system: false },
      { name: "Garret", mes: "Garret took over the later scene.", is_user: false, is_system: false },
    ],
  } as unknown as STContext;

  const currentResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 1,
  });
  assert.deepEqual(currentResult.activeCharacters, ["Garret"]);

  const retrackResult = resolveActiveCharacterAnalysis(context, {
    ...defaultSettings,
    autoDetectActive: true,
    activityLookback: 1,
  }, {
    targetMessageIndex: 2,
  });
  assert.deepEqual(retrackResult.activeCharacters, ["Blake"]);
});

test("buildRecentContext can scope retrack context to an older target message", () => {
  const context = {
    name1: "User",
    chat: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Raleigh welcomed User to camp.", is_user: false, is_system: false },
      { name: "User", mes: "Ashley leaves the room. Blake stays here alone now and answers in one short reply.", is_user: true, is_system: false },
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Blake answered in a flat monotone.", is_user: false, is_system: false },
      { name: "User", mes: "Later, Garret and Raleigh come back.", is_user: true, is_system: false },
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", mes: "Garret laughed while Raleigh watched.", is_user: false, is_system: false },
    ],
  } as unknown as STContext;

  const currentContext = buildRecentContext(context, 4);
  assert.match(currentContext, /Garret laughed while Raleigh watched/i);

  const retrackContext = buildRecentContext(context, 4, 2);
  assert.match(retrackContext, /Blake answered in a flat monotone/i);
  assert.doesNotMatch(retrackContext, /Garret laughed while Raleigh watched/i);
});
