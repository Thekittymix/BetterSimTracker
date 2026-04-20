import test from "node:test";
import assert from "node:assert/strict";

import { buildJsonExtractionRequestV1, serializeJsonExtractionRequestV1 } from "../src/jsonExtractionProtocolBuilder";
import { validateJsonExtractionRequestV1 } from "../src/jsonExtractionProtocol";
import type { BetterSimTrackerSettings } from "../src/types";

function makeSettings(): Pick<BetterSimTrackerSettings, "customStats"> {
  return {
    customStats: [
      {
        id: "stress",
        kind: "numeric",
        label: "Stress",
        defaultValue: 50,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        showOnCard: true,
        showInGraph: true,
        includeInInjection: true,
        behaviorGuidance: "Track current stress while preserving continuity.",
      },
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: [],
        textMaxLength: 120,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
        promptOverride: "Track only current on-body clothes and keep continuity unless the scene changes.",
      },
      {
        id: "scene_date_time",
        kind: "date_time",
        label: "Scene Date/Time",
        defaultValue: "2026-03-07 20:00",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: true,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
        behaviorGuidance: "Track the current scene date and time.",
      },
      {
        id: "hidden_pose",
        kind: "text_short",
        label: "Hidden Pose",
        defaultValue: "",
        track: false,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        showOnCard: false,
        showInGraph: false,
        includeInInjection: false,
      },
    ],
  };
}

test("buildJsonExtractionRequestV1 builds a schema-valid request with built-ins and tracked custom stats only", () => {
  const request = buildJsonExtractionRequestV1({
    task: {
      mode: "ai_turn",
      messageIndex: 12,
      retrack: false,
      swipeRetrack: false,
      entityTrackingMode: "dynamic_characters",
      includeCharacterCards: true,
      includeActivatedLorebook: false,
    },
    message: {
      speaker: "Your Family",
      isUser: false,
      isSystem: false,
      text: "Candy replies while the others watch.",
    },
    recentHistory: [],
    currentState: {
      latestRelevantSnapshot: {},
      builtInStats: {},
      customStats: {},
      customNonNumericStats: {},
    },
    entityContext: {
      candidateOwners: ["Candy", "Lisa"],
      candidateEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
        },
      ],
      currentEntityOwnerMap: {},
    },
    enabledBuiltInStats: ["mood", "lastThought", "affection"],
    settings: makeSettings(),
  });

  const result = validateJsonExtractionRequestV1(request);
  assert.equal(result.ok, true);

  assert.deepEqual(
    request.statDefinitions.builtIn.map(definition => definition.id),
    ["mood", "lastThought", "affection"],
  );
  assert.deepEqual(
    request.statDefinitions.customNumeric.map(definition => definition.id),
    ["stress"],
  );
  assert.deepEqual(
    request.statDefinitions.customNonNumeric.map(definition => definition.id),
    ["clothes", "scene_date_time"],
  );
});

test("buildJsonExtractionRequestV1 preserves structured rule sections instead of collapsing into one prompt blob", () => {
  const request = buildJsonExtractionRequestV1({
    task: {
      mode: "user_turn",
      messageIndex: 4,
      retrack: true,
      swipeRetrack: false,
      entityTrackingMode: "standard",
      includeCharacterCards: false,
      includeActivatedLorebook: true,
    },
    message: {
      speaker: "Kuba",
      isUser: true,
      isSystem: false,
      text: "Candy, answer first. The others stay here.",
    },
    recentHistory: [],
    currentState: {
      latestRelevantSnapshot: null,
      builtInStats: {},
      customStats: {},
      customNonNumericStats: {},
    },
    entityContext: {
      candidateOwners: [],
      candidateEntities: [],
      currentEntityOwnerMap: {},
    },
    enabledBuiltInStats: [],
    settings: makeSettings(),
    rules: {
      taskInstruction: "Extract tracker state from the user message.",
      continuityRules: ["Keep the broad scene unless the user explicitly sends someone away."],
      entityRules: ["Mention-only names are not enough for inScene."],
      emptyValueRules: ["Explicit empty arrays are known empty values."],
    },
  });

  assert.equal(typeof request.rules.taskInstruction, "string");
  assert.deepEqual(request.rules.continuityRules, ["Keep the broad scene unless the user explicitly sends someone away."]);
  assert.deepEqual(request.rules.entityRules, ["Mention-only names are not enough for inScene."]);
  assert.deepEqual(request.rules.emptyValueRules, ["Explicit empty arrays are known empty values."]);
  assert.deepEqual(request.outputContract.responseSchema?.result, { status: "ok" });
  assert.ok(request.outputContract.responseSchema?.entityResolution);
});

test("serializeJsonExtractionRequestV1 returns transport JSON for the built request", () => {
  const request = buildJsonExtractionRequestV1({
    task: {
      mode: "ai_turn",
      messageIndex: 2,
      retrack: false,
      swipeRetrack: false,
      entityTrackingMode: "dynamic_characters",
      includeCharacterCards: true,
      includeActivatedLorebook: false,
    },
    message: {
      speaker: "Your Family",
      isUser: false,
      isSystem: false,
      text: "Candy grins.",
    },
    recentHistory: [],
    currentState: {
      latestRelevantSnapshot: {},
      builtInStats: {},
      customStats: {},
      customNonNumericStats: {},
    },
    entityContext: {
      candidateOwners: ["Candy"],
      candidateEntities: [],
      currentEntityOwnerMap: {},
    },
    enabledBuiltInStats: ["mood"],
    settings: makeSettings(),
  });

  const serialized = serializeJsonExtractionRequestV1(request);
  const parsed = JSON.parse(serialized) as unknown;
  const result = validateJsonExtractionRequestV1(parsed);

  assert.equal(result.ok, true);
});
