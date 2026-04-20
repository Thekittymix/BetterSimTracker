import test from "node:test";
import assert from "node:assert/strict";

import {
  extractFirstJsonObjectBlock,
  JSON_EXTRACTION_PROTOCOL_VERSION,
  JSON_EXTRACTION_REQUEST_TYPE,
  JSON_EXTRACTION_RESPONSE_TYPE,
  parseAndValidateJsonExtractionResponseV1,
  parseAndValidateJsonExtractionStatResponseV1,
  validateJsonExtractionRequestV1,
  validateJsonExtractionResponseV1,
  type JsonExtractionRequestV1,
  type JsonExtractionResponseV1,
} from "../src/jsonExtractionProtocol";

function makeRequest(): JsonExtractionRequestV1 {
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestType: JSON_EXTRACTION_REQUEST_TYPE,
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
    recentHistory: [
      {
        messageIndex: 11,
        speaker: "Kuba",
        isUser: true,
        isSystem: false,
        text: "Candy, answer first. The others stay here.",
        trackerSnapshot: {
          activeOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          messageOwners: [],
          entityResolution: {},
        },
      },
    ],
    currentState: {
      latestRelevantSnapshot: {},
      builtInStats: {},
      customStats: {},
      customNonNumericStats: {},
    },
    entityContext: {
      candidateOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
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
    statDefinitions: {
      builtIn: [
        {
          id: "mood",
          label: "Mood",
          kind: "text_short",
          trackCharacters: true,
          trackUser: true,
          globalScope: false,
          includeInInjection: true,
          behaviorGuidance: "Preserve continuity unless the recent scene clearly changes mood.",
          emptySemantics: "Omitted owner means no extracted mood value. Empty string is invalid.",
        },
      ],
      customNumeric: [],
      customNonNumeric: [
        {
          id: "clothes",
          label: "Clothes",
          kind: "array",
          trackCharacters: true,
          trackUser: true,
          globalScope: false,
          includeInInjection: true,
          behaviorGuidance: "Track currently worn clothing/accessory items as a live list.",
          emptySemantics: "Empty array means known empty, not unknown.",
        },
      ],
    },
    rules: {
      taskInstruction: "Extract tracker state for the current message.",
      sourcePriority: {
        recentMessages: 1,
        previousTrackerState: 2,
        characterCards: 3,
        activatedLorebook: 4,
      },
      continuityRules: [
        "Preserve current scene continuity unless recent evidence shows a real change.",
      ],
      entityRules: [
        "inScene and inMessage are distinct.",
        "Mention-only references do not imply scene presence.",
      ],
      emptyValueRules: [
        "Empty array means known empty, not unknown.",
      ],
    },
    outputContract: {
      format: "json_only",
      allowMarkdownFences: false,
      allowProse: false,
      requiredSections: [
        "result",
        "entityResolution",
        "builtInStats",
        "customStats",
        "customNonNumericStats",
      ],
    },
  };
}

function makeResponse(): JsonExtractionResponseV1 {
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    responseType: JSON_EXTRACTION_RESPONSE_TYPE,
    result: {
      status: "ok",
    },
    entityResolution: {
      sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
      messageOwners: ["Candy"],
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
          inScene: true,
          inMessage: true,
        },
        {
          entityId: "bst_narrative:lisa",
          ownerName: "Lisa",
          kind: "narrative-entity",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    builtInStats: {
      mood: {
        Candy: "Playful",
      },
    },
    customStats: {},
    customNonNumericStats: {
      clothes: {
        Candy: ["t-shirt", "panties"],
      },
    },
  };
}

test("validateJsonExtractionRequestV1 accepts a valid full request contract", () => {
  const result = validateJsonExtractionRequestV1(makeRequest());
  assert.equal(result.ok, true);
});

test("validateJsonExtractionRequestV1 rejects missing required request sections", () => {
  const invalid = {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestType: JSON_EXTRACTION_REQUEST_TYPE,
    task: makeRequest().task,
  };
  const result = validateJsonExtractionRequestV1(invalid);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.map(error => error.path).join("\n"), /message/);
  assert.match(result.errors.map(error => error.path).join("\n"), /recentHistory/);
  assert.match(result.errors.map(error => error.path).join("\n"), /currentState/);
});

test("validateJsonExtractionRequestV1 keeps explicit empty scene/message arrays valid in history snapshots", () => {
  const request = makeRequest();
  request.recentHistory[0].trackerSnapshot = {
    activeOwners: [],
    sceneOwners: [],
    messageOwners: [],
    entityResolution: null,
  };

  const result = validateJsonExtractionRequestV1(request);
  assert.equal(result.ok, true);
});

test("validateJsonExtractionResponseV1 accepts a valid full response contract", () => {
  const result = validateJsonExtractionResponseV1(makeResponse());
  assert.equal(result.ok, true);
});

test("validateJsonExtractionResponseV1 rejects semantic violation when inMessage is true but inScene is false", () => {
  const response = makeResponse();
  response.entityResolution.resolvedEntities[0].inScene = false;

  const result = validateJsonExtractionResponseV1(response);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.map(error => error.code).join("\n"), /semantic_violation/);
});

test("validateJsonExtractionResponseV1 keeps explicit empty scene arrays valid", () => {
  const response = makeResponse();
  response.entityResolution.sceneOwners = [];
  response.entityResolution.messageOwners = [];
  response.entityResolution.resolvedEntities = [];

  const result = validateJsonExtractionResponseV1(response);
  assert.equal(result.ok, true);
});

test("extractFirstJsonObjectBlock extracts the first JSON object from wrapped output", () => {
  const raw = "<think></think>```json\n{\"protocolVersion\":\"bst.extract.v1\"}\n```";
  assert.equal(
    extractFirstJsonObjectBlock(raw),
    "{\"protocolVersion\":\"bst.extract.v1\"}",
  );
});

test("parseAndValidateJsonExtractionResponseV1 parses wrapped JSON responses and validates them", () => {
  const raw = `<think></think>\n\`\`\`json\n${JSON.stringify(makeResponse(), null, 2)}\n\`\`\``;
  const result = parseAndValidateJsonExtractionResponseV1(raw);
  assert.equal(result.ok, true);
});

test("parseAndValidateJsonExtractionStatResponseV1 accepts wrapped sequential stat responses", () => {
  const raw = "```json\n" + JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "stat_extraction_result",
    result: { status: "ok" },
    statId: "pose",
    values: {
      Candy: "Standing by the bed.",
    },
  }) + "\n```";
  const result = parseAndValidateJsonExtractionStatResponseV1(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.statId, "pose");
  assert.equal(result.value.values.Candy, "Standing by the bed.");
});

test("parseAndValidateJsonExtractionResponseV1 rejects non-JSON text", () => {
  const result = parseAndValidateJsonExtractionResponseV1("not json");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors[0]?.message ?? "", /does not contain a JSON object/i);
});
