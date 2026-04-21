import test from "node:test";
import assert from "node:assert/strict";

import { buildJsonExtractionRequestV1, serializeJsonExtractionRequestV1 } from "../src/jsonExtractionProtocolBuilder";
import { validateJsonExtractionRequestV1 } from "../src/jsonExtractionProtocol";
import type { BetterSimTrackerSettings } from "../src/types";

function makeSettings(overrides: Partial<BetterSimTrackerSettings> = {}): Pick<
  BetterSimTrackerSettings,
  | "customStats"
  | "sequentialExtraction"
  | "promptTemplateUnified"
  | "promptTemplateSequentialAffection"
  | "promptTemplateSequentialTrust"
  | "promptTemplateSequentialDesire"
  | "promptTemplateSequentialConnection"
  | "promptTemplateSequentialMood"
  | "promptTemplateSequentialLastThought"
  | "promptTemplateSequentialCustomNumeric"
  | "promptTemplateSequentialCustomNonNumeric"
  | "promptProtocolUnified"
  | "promptProtocolSequentialAffection"
  | "promptProtocolSequentialTrust"
  | "promptProtocolSequentialDesire"
  | "promptProtocolSequentialConnection"
  | "promptProtocolSequentialMood"
  | "promptProtocolSequentialLastThought"
  | "promptProtocolSequentialCustomNumeric"
  | "promptProtocolSequentialCustomNonNumeric"
> {
  return {
    sequentialExtraction: true,
    promptTemplateUnified: "Unified semantic prompt",
    promptTemplateSequentialAffection: "Sequential affection semantic prompt",
    promptTemplateSequentialTrust: "Sequential trust semantic prompt",
    promptTemplateSequentialDesire: "Sequential desire semantic prompt",
    promptTemplateSequentialConnection: "Sequential connection semantic prompt",
    promptTemplateSequentialMood: "Sequential mood semantic prompt",
    promptTemplateSequentialLastThought: "Sequential lastThought semantic prompt",
    promptTemplateSequentialCustomNumeric: "Sequential custom numeric semantic prompt",
    promptTemplateSequentialCustomNonNumeric: "Sequential custom non-numeric semantic prompt",
    promptProtocolUnified: "Unified protocol prompt",
    promptProtocolSequentialAffection: "Sequential affection protocol prompt",
    promptProtocolSequentialTrust: "Sequential trust protocol prompt",
    promptProtocolSequentialDesire: "Sequential desire protocol prompt",
    promptProtocolSequentialConnection: "Sequential connection protocol prompt",
    promptProtocolSequentialMood: "Sequential mood protocol prompt",
    promptProtocolSequentialLastThought: "Sequential lastThought protocol prompt",
    promptProtocolSequentialCustomNumeric: "Sequential custom numeric protocol prompt",
    promptProtocolSequentialCustomNonNumeric: "Sequential custom non-numeric protocol prompt",
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
    ...overrides,
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
  assert.equal(JSON.stringify(request.outputContract.responseSchema).includes("Owner display name"), false);
  assert.deepEqual((request.outputContract.responseSchema?.builtInStats as Record<string, Record<string, unknown>>).mood, {
    Candy: {
      value: "calm",
      confidence: 0.8,
    },
    Lisa: {
      value: "calm",
      confidence: 0.8,
    },
  });
  const lastThoughtDefinition = request.statDefinitions.builtIn.find(definition => definition.id === "lastThought");
  assert.equal(lastThoughtDefinition?.behaviorGuidance, "Sequential lastThought semantic prompt");
  assert.equal(lastThoughtDefinition?.protocolGuidance, "Sequential lastThought protocol prompt");
  const affectionDefinition = request.statDefinitions.builtIn.find(definition => definition.id === "affection");
  assert.equal(affectionDefinition?.behaviorGuidance, "Sequential affection semantic prompt");
  assert.equal(affectionDefinition?.protocolGuidance, "Sequential affection protocol prompt");
  const stressDefinition = request.statDefinitions.customNumeric.find(definition => definition.id === "stress");
  assert.equal(stressDefinition?.behaviorGuidance, "Track current stress while preserving continuity.");
  assert.equal(stressDefinition?.protocolGuidance, "Sequential custom numeric protocol prompt");
  const clothesDefinition = request.statDefinitions.customNonNumeric.find(definition => definition.id === "clothes");
  assert.equal(clothesDefinition?.behaviorGuidance, "Track only current on-body clothes and keep continuity unless the scene changes.");
  assert.equal(clothesDefinition?.protocolGuidance, "Sequential custom non-numeric protocol prompt");
});

test("buildJsonExtractionRequestV1 carries unified custom prompts in non-sequential JSON requests", () => {
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
      text: "Candy replies while Lisa watches.",
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
      candidateEntities: [],
      currentEntityOwnerMap: {},
    },
    enabledBuiltInStats: ["lastThought"],
    settings: makeSettings({
      sequentialExtraction: false,
      promptTemplateUnified: "Unified semantic override for JSON mode",
      promptProtocolUnified: "Unified protocol override for JSON mode",
      customStats: [],
    }),
  });

  const result = validateJsonExtractionRequestV1(request);
  assert.equal(result.ok, true);
  assert.equal(request.statDefinitions.builtIn[0]?.behaviorGuidance, "Unified semantic override for JSON mode");
  assert.equal(request.statDefinitions.builtIn[0]?.protocolGuidance, "Unified protocol override for JSON mode");
  assert.deepEqual(request.outputContract.requiredSections, [
    "result",
    "entityResolution",
    "builtInStats",
    "customStats",
    "customNonNumericStats",
  ]);
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
