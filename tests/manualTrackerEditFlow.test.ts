import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { __testables as editModalTestables } from "../src/editStatsModal";
import { readEntityRegistry } from "../src/entityRegistry";
import { syncEntityRegistryFromTrackerData } from "../src/entityRegistrySync";
import { writeTrackerDataToMessage, getTrackerDataFromMessage } from "../src/storage";
import { buildEditedTrackerDataSnapshot, applyEditedTrackerActiveState, syncEditedTrackerEntityState } from "../src/trackerEditState";
import { resolveCurrentLifecycleOwnersForTrackerData } from "../src/ui";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function assertSameMembers(actual: string[], expected: string[]): void {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

function makeContext(): STContext {
  return {
    chat: [
      {
        mes: "Candy is still in Kuba's lap while the others crowd around the bed.",
        name: "Your Family",
        is_user: false,
        is_system: false,
        extra: {},
        swipe_id: 0,
      },
    ],
    chatMetadata: {},
    characters: [
      {
        name: "Your Family",
        avatar: "your-family.png",
      },
    ],
    groupId: null,
    characterId: 0,
    onlineStatus: "connected",
  } as unknown as STContext;
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    entityTrackingMode: "dynamic_characters",
    showInactive: true,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  } as BetterSimTrackerSettings;
}

function makeCurrentTracker(): TrackerData {
  return {
    timestamp: 1000,
    activeCharacters: ["Lisa", "Marylyn", "Serena"],
    entityResolution: buildEntityResolution({
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          avatar: null,
          inScene: true,
          inMessage: false,
          created: true,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:marylyn",
          kind: "narrative-entity",
          name: "Marylyn",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
        {
          entityId: "bst_narrative:serena",
          kind: "narrative-entity",
          name: "Serena",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: true,
        },
      ],
    }),
    statistics: {
      affection: { Candy: 50, Lisa: 50, Marylyn: 50, Serena: 50 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Excited" },
      lastThought: { Candy: "Games are more fun when everyone stays together." },
    },
    statisticsByEntityId: {
      affection: { "bst_narrative:candy": 50 },
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_narrative:candy": "Excited" },
      lastThought: { "bst_narrative:candy": "Games are more fun when everyone stays together." },
    },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {
      clothes: {
        Candy: ["too-small t-shirt", "panties"],
      },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "bst_narrative:candy": ["too-small t-shirt", "panties"],
      },
    },
    entityOwnerMap: {
      Candy: {
        entityId: "bst_narrative:candy",
        ownerName: "Candy",
        canonicalName: "Candy",
        aliases: [],
        sourceKey: "narrative:bst_narrative:candy",
        kind: "narrative-entity",
      },
      Lisa: {
        entityId: "bst_narrative:lisa",
        ownerName: "Lisa",
        canonicalName: "Lisa",
        aliases: [],
        sourceKey: "narrative:bst_narrative:lisa",
        kind: "narrative-entity",
      },
      Marylyn: {
        entityId: "bst_narrative:marylyn",
        ownerName: "Marylyn",
        canonicalName: "Marylyn",
        aliases: [],
        sourceKey: "narrative:bst_narrative:marylyn",
        kind: "narrative-entity",
      },
      Serena: {
        entityId: "bst_narrative:serena",
        ownerName: "Serena",
        canonicalName: "Serena",
        aliases: [],
        sourceKey: "narrative:bst_narrative:serena",
        kind: "narrative-entity",
      },
    },
  };
}

test("manual tracker edit save keeps an in-scene narrative entity active through write, reread, and registry sync", () => {
  const context = makeContext();
  const settings = makeSettings();
  const current = makeCurrentTracker();
  const ownerKeys = editModalTestables.uniqueOwnerKeys("Candy", "Candy");

  assert.equal(editModalTestables.resolveEditIsCurrentlyActive(current, "Candy", ownerKeys), true);

  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 1001,
    activeCharacters: [...current.activeCharacters],
    statistics: structuredClone(current.statistics),
    customStatistics: structuredClone(current.customStatistics ?? {}),
    customNonNumericStatistics: structuredClone(current.customNonNumericStatistics ?? {}),
    clearedStatistics: current.clearedStatistics ? structuredClone(current.clearedStatistics) : undefined,
    clearedCustomStatistics: current.clearedCustomStatistics ? structuredClone(current.clearedCustomStatistics) : undefined,
    clearedCustomNonNumericStatistics: current.clearedCustomNonNumericStatistics
      ? structuredClone(current.clearedCustomNonNumericStatistics)
      : undefined,
  });

  assertSameMembers(edited.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);

  const withActive = applyEditedTrackerActiveState(edited, "Candy", true);
  const entitySynced = syncEditedTrackerEntityState(withActive, "Candy");

  writeTrackerDataToMessage(context, entitySynced, 0, {
    preserveExplicitActiveCharactersWhenConsistent: true,
  });

  const reread = getTrackerDataFromMessage(context.chat[0]);
  assert.ok(reread);
  assertSameMembers(reread.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);
  assertSameMembers(resolveCurrentLifecycleOwnersForTrackerData(reread), ["Candy", "Lisa", "Marylyn", "Serena"]);

  const changed = syncEntityRegistryFromTrackerData({
    context,
    messageIndex: 0,
    data: reread,
    settings,
    allKnownCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
  });

  assert.equal(changed, true);
  const registry = readEntityRegistry(context);
  assert.equal(registry.ownerToEntityId.candy, "bst_narrative:candy");
  assert.equal(registry.entities["bst_narrative:candy"]?.lifecycleState, "active");
});
