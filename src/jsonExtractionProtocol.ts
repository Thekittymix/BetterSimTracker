export const JSON_EXTRACTION_PROTOCOL_VERSION = "bst.extract.v1" as const;
export const JSON_EXTRACTION_REQUEST_TYPE = "tracker_extraction" as const;
export const JSON_EXTRACTION_RESPONSE_TYPE = "tracker_extraction_result" as const;

export type JsonExtractionTaskMode = "ai_turn" | "user_turn";
export type JsonExtractionEntityTrackingMode = "standard" | "dynamic_characters";
export type JsonExtractionEntityKind = "owner" | "multi_character_alias" | "narrative-entity" | "st-character" | "persona";
export type JsonExtractionStatKind = "numeric" | "enum_single" | "boolean" | "text_short" | "array" | "date_time";

export interface JsonExtractionRequestTask {
  mode: JsonExtractionTaskMode;
  messageIndex: number;
  retrack: boolean;
  swipeRetrack: boolean;
  entityTrackingMode: JsonExtractionEntityTrackingMode;
  includeCharacterCards: boolean;
  includeActivatedLorebook: boolean;
}

export interface JsonExtractionRequestMessage {
  speaker: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
}

export interface JsonExtractionRequestTrackerSnapshot {
  activeOwners: string[];
  sceneOwners: string[];
  messageOwners: string[];
  entityResolution: Record<string, unknown> | null;
}

export interface JsonExtractionRequestHistoryEntry {
  messageIndex: number;
  speaker: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
  trackerSnapshot: JsonExtractionRequestTrackerSnapshot | null;
}

export interface JsonExtractionRequestEntityCandidate {
  entityId: string;
  ownerName: string;
  kind: JsonExtractionEntityKind;
  aliases: string[];
}

export interface JsonExtractionRequestStatDefinition {
  id: string;
  label: string;
  kind: JsonExtractionStatKind;
  trackCharacters: boolean;
  trackUser: boolean;
  globalScope: boolean;
  includeInInjection: boolean;
  behaviorGuidance: string;
  emptySemantics: string;
}

export interface JsonExtractionRequestOutputContract {
  format: "json_only";
  allowMarkdownFences: boolean;
  allowProse: boolean;
  requiredSections: string[];
}

export interface JsonExtractionRequestV1 {
  protocolVersion: typeof JSON_EXTRACTION_PROTOCOL_VERSION;
  requestType: typeof JSON_EXTRACTION_REQUEST_TYPE;
  task: JsonExtractionRequestTask;
  message: JsonExtractionRequestMessage;
  recentHistory: JsonExtractionRequestHistoryEntry[];
  currentState: {
    latestRelevantSnapshot: Record<string, unknown> | null;
    builtInStats: Record<string, unknown>;
    customStats: Record<string, unknown>;
    customNonNumericStats: Record<string, unknown>;
  };
  entityContext: {
    candidateOwners: string[];
    candidateEntities: JsonExtractionRequestEntityCandidate[];
    currentEntityOwnerMap: Record<string, unknown>;
  };
  statDefinitions: {
    builtIn: JsonExtractionRequestStatDefinition[];
    customNumeric: JsonExtractionRequestStatDefinition[];
    customNonNumeric: JsonExtractionRequestStatDefinition[];
  };
  rules: {
    taskInstruction: string;
    sourcePriority: Record<string, number>;
    continuityRules: string[];
    entityRules: string[];
    emptyValueRules: string[];
  };
  outputContract: JsonExtractionRequestOutputContract;
}

export interface JsonExtractionResolvedEntity {
  entityId: string;
  ownerName: string;
  kind: JsonExtractionEntityKind;
  aliases: string[];
  inScene: boolean;
  inMessage: boolean;
}

export interface JsonExtractionResponseV1 {
  protocolVersion: typeof JSON_EXTRACTION_PROTOCOL_VERSION;
  responseType: typeof JSON_EXTRACTION_RESPONSE_TYPE;
  result: {
    status: "ok";
  };
  entityResolution: {
    sceneOwners: string[];
    messageOwners: string[];
    resolvedEntities: JsonExtractionResolvedEntity[];
  };
  builtInStats: Record<string, Record<string, unknown>>;
  customStats: Record<string, Record<string, unknown>>;
  customNonNumericStats: Record<string, Record<string, unknown>>;
}

export interface JsonExtractionProtocolValidationError {
  path: string;
  code:
    | "invalid_type"
    | "missing_required"
    | "invalid_value"
    | "unknown_root"
    | "semantic_violation";
  message: string;
}

export type JsonExtractionProtocolValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: JsonExtractionProtocolValidationError[] };

function ok<T>(value: T): JsonExtractionProtocolValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(errors: JsonExtractionProtocolValidationError[]): JsonExtractionProtocolValidationResult<T> {
  return { ok: false, errors };
}

function pushError(
  errors: JsonExtractionProtocolValidationError[],
  path: string,
  code: JsonExtractionProtocolValidationError["code"],
  message: string,
): void {
  errors.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function validateRootObject(
  payload: unknown,
  expectedProtocolVersion: string,
  expectedTypeKey: "requestType" | "responseType",
  expectedTypeValue: string,
): JsonExtractionProtocolValidationError[] {
  const errors: JsonExtractionProtocolValidationError[] = [];
  if (!isRecord(payload)) {
    pushError(errors, "", "invalid_type", "Root payload must be a JSON object.");
    return errors;
  }
  if (!("protocolVersion" in payload)) {
    pushError(errors, "protocolVersion", "missing_required", "protocolVersion is required.");
  } else if (payload.protocolVersion !== expectedProtocolVersion) {
    pushError(errors, "protocolVersion", "invalid_value", `protocolVersion must be ${expectedProtocolVersion}.`);
  }
  if (!(expectedTypeKey in payload)) {
    pushError(errors, expectedTypeKey, "missing_required", `${expectedTypeKey} is required.`);
  } else if (payload[expectedTypeKey] !== expectedTypeValue) {
    pushError(errors, expectedTypeKey, "invalid_value", `${expectedTypeKey} must be ${expectedTypeValue}.`);
  }
  return errors;
}

function validateRequestTask(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestTask {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "task must be an object.");
    return false;
  }
  const mode = value.mode;
  if (mode !== "ai_turn" && mode !== "user_turn") {
    pushError(errors, `${path}.mode`, "invalid_value", "task.mode must be ai_turn or user_turn.");
  }
  if (!isFiniteNumber(value.messageIndex)) {
    pushError(errors, `${path}.messageIndex`, "invalid_type", "task.messageIndex must be a finite number.");
  }
  for (const key of ["retrack", "swipeRetrack", "includeCharacterCards", "includeActivatedLorebook"] as const) {
    if (!isBoolean(value[key])) {
      pushError(errors, `${path}.${key}`, "invalid_type", `${path}.${key} must be a boolean.`);
    }
  }
  if (value.entityTrackingMode !== "standard" && value.entityTrackingMode !== "dynamic_characters") {
    pushError(errors, `${path}.entityTrackingMode`, "invalid_value", "task.entityTrackingMode must be standard or dynamic_characters.");
  }
  return true;
}

function validateRequestMessage(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestMessage {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "message must be an object.");
    return false;
  }
  if (!isNonEmptyString(value.speaker)) {
    pushError(errors, `${path}.speaker`, "invalid_type", "message.speaker must be a non-empty string.");
  }
  if (!isBoolean(value.isUser)) {
    pushError(errors, `${path}.isUser`, "invalid_type", "message.isUser must be a boolean.");
  }
  if (!isBoolean(value.isSystem)) {
    pushError(errors, `${path}.isSystem`, "invalid_type", "message.isSystem must be a boolean.");
  }
  if (!isNonEmptyString(value.text)) {
    pushError(errors, `${path}.text`, "invalid_type", "message.text must be a non-empty string.");
  }
  return true;
}

function validateRequestTrackerSnapshot(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestTrackerSnapshot | null {
  if (value === null) return true;
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "trackerSnapshot must be an object or null.");
    return false;
  }
  for (const key of ["activeOwners", "sceneOwners", "messageOwners"] as const) {
    if (!isStringArray(value[key])) {
      pushError(errors, `${path}.${key}`, "invalid_type", `${path}.${key} must be an array of strings.`);
    }
  }
  if (!("entityResolution" in value)) {
    pushError(errors, `${path}.entityResolution`, "missing_required", "trackerSnapshot.entityResolution is required.");
  } else if (value.entityResolution !== null && !isRecord(value.entityResolution)) {
    pushError(errors, `${path}.entityResolution`, "invalid_type", "trackerSnapshot.entityResolution must be an object or null.");
  }
  return true;
}

function validateHistoryEntry(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestHistoryEntry {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "history entry must be an object.");
    return false;
  }
  if (!isFiniteNumber(value.messageIndex)) {
    pushError(errors, `${path}.messageIndex`, "invalid_type", "history entry messageIndex must be a finite number.");
  }
  if (!isNonEmptyString(value.speaker)) {
    pushError(errors, `${path}.speaker`, "invalid_type", "history entry speaker must be a non-empty string.");
  }
  if (!isBoolean(value.isUser)) {
    pushError(errors, `${path}.isUser`, "invalid_type", "history entry isUser must be a boolean.");
  }
  if (!isBoolean(value.isSystem)) {
    pushError(errors, `${path}.isSystem`, "invalid_type", "history entry isSystem must be a boolean.");
  }
  if (!isNonEmptyString(value.text)) {
    pushError(errors, `${path}.text`, "invalid_type", "history entry text must be a non-empty string.");
  }
  validateRequestTrackerSnapshot("trackerSnapshot" in value ? value.trackerSnapshot : undefined, `${path}.trackerSnapshot`, errors);
  return true;
}

function validateRequestEntityCandidate(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestEntityCandidate {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "entity candidate must be an object.");
    return false;
  }
  if (!isNonEmptyString(value.entityId)) {
    pushError(errors, `${path}.entityId`, "invalid_type", "candidate entityId must be a non-empty string.");
  }
  if (!isNonEmptyString(value.ownerName)) {
    pushError(errors, `${path}.ownerName`, "invalid_type", "candidate ownerName must be a non-empty string.");
  }
  const kinds = new Set<JsonExtractionEntityKind>(["owner", "multi_character_alias", "narrative-entity", "st-character", "persona"]);
  if (!isNonEmptyString(value.kind) || !kinds.has(value.kind as JsonExtractionEntityKind)) {
    pushError(errors, `${path}.kind`, "invalid_value", "candidate kind must be a supported entity kind.");
  }
  if (!isStringArray(value.aliases)) {
    pushError(errors, `${path}.aliases`, "invalid_type", "candidate aliases must be an array of strings.");
  }
  return true;
}

function validateStatDefinition(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestStatDefinition {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "stat definition must be an object.");
    return false;
  }
  if (!isNonEmptyString(value.id)) {
    pushError(errors, `${path}.id`, "invalid_type", "stat definition id must be a non-empty string.");
  }
  if (!isNonEmptyString(value.label)) {
    pushError(errors, `${path}.label`, "invalid_type", "stat definition label must be a non-empty string.");
  }
  const kinds = new Set<JsonExtractionStatKind>(["numeric", "enum_single", "boolean", "text_short", "array", "date_time"]);
  if (!isNonEmptyString(value.kind) || !kinds.has(value.kind as JsonExtractionStatKind)) {
    pushError(errors, `${path}.kind`, "invalid_value", "stat definition kind must be supported.");
  }
  for (const key of ["trackCharacters", "trackUser", "globalScope", "includeInInjection"] as const) {
    if (!isBoolean(value[key])) {
      pushError(errors, `${path}.${key}`, "invalid_type", `${path}.${key} must be a boolean.`);
    }
  }
  if (!isNonEmptyString(value.behaviorGuidance)) {
    pushError(errors, `${path}.behaviorGuidance`, "invalid_type", "stat definition behaviorGuidance must be a non-empty string.");
  }
  if (!isNonEmptyString(value.emptySemantics)) {
    pushError(errors, `${path}.emptySemantics`, "invalid_type", "stat definition emptySemantics must be a non-empty string.");
  }
  return true;
}

function validateOutputContract(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionRequestOutputContract {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "outputContract must be an object.");
    return false;
  }
  if (value.format !== "json_only") {
    pushError(errors, `${path}.format`, "invalid_value", "outputContract.format must be json_only.");
  }
  if (!isBoolean(value.allowMarkdownFences)) {
    pushError(errors, `${path}.allowMarkdownFences`, "invalid_type", "outputContract.allowMarkdownFences must be a boolean.");
  }
  if (!isBoolean(value.allowProse)) {
    pushError(errors, `${path}.allowProse`, "invalid_type", "outputContract.allowProse must be a boolean.");
  }
  if (!isStringArray(value.requiredSections)) {
    pushError(errors, `${path}.requiredSections`, "invalid_type", "outputContract.requiredSections must be an array of strings.");
  }
  return true;
}

export function validateJsonExtractionRequestV1(payload: unknown): JsonExtractionProtocolValidationResult<JsonExtractionRequestV1> {
  const errors = validateRootObject(
    payload,
    JSON_EXTRACTION_PROTOCOL_VERSION,
    "requestType",
    JSON_EXTRACTION_REQUEST_TYPE,
  );
  if (!isRecord(payload)) return fail(errors);

  validateRequestTask(payload.task, "task", errors);
  validateRequestMessage(payload.message, "message", errors);

  if (!Array.isArray(payload.recentHistory)) {
    pushError(errors, "recentHistory", "invalid_type", "recentHistory must be an array.");
  } else {
    payload.recentHistory.forEach((entry, index) => validateHistoryEntry(entry, `recentHistory[${index}]`, errors));
  }

  if (!isRecord(payload.currentState)) {
    pushError(errors, "currentState", "invalid_type", "currentState must be an object.");
  } else {
    if (!("latestRelevantSnapshot" in payload.currentState)) {
      pushError(errors, "currentState.latestRelevantSnapshot", "missing_required", "currentState.latestRelevantSnapshot is required.");
    } else if (payload.currentState.latestRelevantSnapshot !== null && !isRecord(payload.currentState.latestRelevantSnapshot)) {
      pushError(errors, "currentState.latestRelevantSnapshot", "invalid_type", "currentState.latestRelevantSnapshot must be an object or null.");
    }
    for (const key of ["builtInStats", "customStats", "customNonNumericStats"] as const) {
      if (!isRecord(payload.currentState[key])) {
        pushError(errors, `currentState.${key}`, "invalid_type", `currentState.${key} must be an object.`);
      }
    }
  }

  if (!isRecord(payload.entityContext)) {
    pushError(errors, "entityContext", "invalid_type", "entityContext must be an object.");
  } else {
    if (!isStringArray(payload.entityContext.candidateOwners)) {
      pushError(errors, "entityContext.candidateOwners", "invalid_type", "entityContext.candidateOwners must be an array of strings.");
    }
    if (!Array.isArray(payload.entityContext.candidateEntities)) {
      pushError(errors, "entityContext.candidateEntities", "invalid_type", "entityContext.candidateEntities must be an array.");
    } else {
      payload.entityContext.candidateEntities.forEach((entry, index) => validateRequestEntityCandidate(entry, `entityContext.candidateEntities[${index}]`, errors));
    }
    if (!isRecord(payload.entityContext.currentEntityOwnerMap)) {
      pushError(errors, "entityContext.currentEntityOwnerMap", "invalid_type", "entityContext.currentEntityOwnerMap must be an object.");
    }
  }

  if (!isRecord(payload.statDefinitions)) {
    pushError(errors, "statDefinitions", "invalid_type", "statDefinitions must be an object.");
  } else {
    for (const key of ["builtIn", "customNumeric", "customNonNumeric"] as const) {
      const bucket = payload.statDefinitions[key];
      if (!Array.isArray(bucket)) {
        pushError(errors, `statDefinitions.${key}`, "invalid_type", `statDefinitions.${key} must be an array.`);
      } else {
        bucket.forEach((entry, index) => validateStatDefinition(entry, `statDefinitions.${key}[${index}]`, errors));
      }
    }
  }

  if (!isRecord(payload.rules)) {
    pushError(errors, "rules", "invalid_type", "rules must be an object.");
  } else {
    if (!isNonEmptyString(payload.rules.taskInstruction)) {
      pushError(errors, "rules.taskInstruction", "invalid_type", "rules.taskInstruction must be a non-empty string.");
    }
    if (!isRecord(payload.rules.sourcePriority)) {
      pushError(errors, "rules.sourcePriority", "invalid_type", "rules.sourcePriority must be an object.");
    } else {
      for (const [key, priority] of Object.entries(payload.rules.sourcePriority)) {
        if (!isFiniteNumber(priority)) {
          pushError(errors, `rules.sourcePriority.${key}`, "invalid_type", "sourcePriority values must be finite numbers.");
        }
      }
    }
    for (const key of ["continuityRules", "entityRules", "emptyValueRules"] as const) {
      if (!isStringArray(payload.rules[key])) {
        pushError(errors, `rules.${key}`, "invalid_type", `rules.${key} must be an array of strings.`);
      }
    }
  }

  validateOutputContract(payload.outputContract, "outputContract", errors);

  if (errors.length) return fail(errors);
  return ok(payload as unknown as JsonExtractionRequestV1);
}

function validateResolvedEntity(value: unknown, path: string, errors: JsonExtractionProtocolValidationError[]): value is JsonExtractionResolvedEntity {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", "resolved entity must be an object.");
    return false;
  }
  if (!isNonEmptyString(value.entityId)) {
    pushError(errors, `${path}.entityId`, "invalid_type", "resolved entityId must be a non-empty string.");
  }
  if (!isNonEmptyString(value.ownerName)) {
    pushError(errors, `${path}.ownerName`, "invalid_type", "resolved ownerName must be a non-empty string.");
  }
  const kinds = new Set<JsonExtractionEntityKind>(["owner", "multi_character_alias", "narrative-entity", "st-character", "persona"]);
  if (!isNonEmptyString(value.kind) || !kinds.has(value.kind as JsonExtractionEntityKind)) {
    pushError(errors, `${path}.kind`, "invalid_value", "resolved entity kind must be supported.");
  }
  if (!isStringArray(value.aliases)) {
    pushError(errors, `${path}.aliases`, "invalid_type", "resolved aliases must be an array of strings.");
  }
  if (!isBoolean(value.inScene)) {
    pushError(errors, `${path}.inScene`, "invalid_type", "resolved inScene must be a boolean.");
  }
  if (!isBoolean(value.inMessage)) {
    pushError(errors, `${path}.inMessage`, "invalid_type", "resolved inMessage must be a boolean.");
  }
  if (value.inMessage === true && value.inScene !== true) {
    pushError(errors, path, "semantic_violation", "resolved entity cannot have inMessage=true while inScene=false.");
  }
  return true;
}

function validateStatBucketMap(
  value: unknown,
  path: string,
  errors: JsonExtractionProtocolValidationError[],
): value is Record<string, Record<string, unknown>> {
  if (!isRecord(value)) {
    pushError(errors, path, "invalid_type", `${path} must be an object.`);
    return false;
  }
  for (const [statId, bucket] of Object.entries(value)) {
    if (!isRecord(bucket)) {
      pushError(errors, `${path}.${statId}`, "invalid_type", `Stat bucket ${path}.${statId} must be an object.`);
    }
  }
  return true;
}

export function validateJsonExtractionResponseV1(payload: unknown): JsonExtractionProtocolValidationResult<JsonExtractionResponseV1> {
  const errors = validateRootObject(
    payload,
    JSON_EXTRACTION_PROTOCOL_VERSION,
    "responseType",
    JSON_EXTRACTION_RESPONSE_TYPE,
  );
  if (!isRecord(payload)) return fail(errors);

  if (!isRecord(payload.result)) {
    pushError(errors, "result", "invalid_type", "result must be an object.");
  } else if (payload.result.status !== "ok") {
    pushError(errors, "result.status", "invalid_value", "result.status must be ok.");
  }

  if (!isRecord(payload.entityResolution)) {
    pushError(errors, "entityResolution", "invalid_type", "entityResolution must be an object.");
  } else {
    if (!isStringArray(payload.entityResolution.sceneOwners)) {
      pushError(errors, "entityResolution.sceneOwners", "invalid_type", "entityResolution.sceneOwners must be an array of strings.");
    }
    if (!isStringArray(payload.entityResolution.messageOwners)) {
      pushError(errors, "entityResolution.messageOwners", "invalid_type", "entityResolution.messageOwners must be an array of strings.");
    }
    if (!Array.isArray(payload.entityResolution.resolvedEntities)) {
      pushError(errors, "entityResolution.resolvedEntities", "invalid_type", "entityResolution.resolvedEntities must be an array.");
    } else {
      payload.entityResolution.resolvedEntities.forEach((entry, index) => validateResolvedEntity(entry, `entityResolution.resolvedEntities[${index}]`, errors));
    }
  }

  validateStatBucketMap(payload.builtInStats, "builtInStats", errors);
  validateStatBucketMap(payload.customStats, "customStats", errors);
  validateStatBucketMap(payload.customNonNumericStats, "customNonNumericStats", errors);

  if (errors.length) return fail(errors);
  return ok(payload as unknown as JsonExtractionResponseV1);
}

export function extractFirstJsonObjectBlock(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }
  return null;
}

export function parseAndValidateJsonExtractionResponseV1(raw: string): JsonExtractionProtocolValidationResult<JsonExtractionResponseV1> {
  const jsonBlock = extractFirstJsonObjectBlock(raw);
  if (!jsonBlock) {
    return fail([
      {
        path: "",
        code: "invalid_type",
        message: "Response does not contain a JSON object.",
      },
    ]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return fail([
      {
        path: "",
        code: "invalid_type",
        message: "Response JSON block could not be parsed.",
      },
    ]);
  }
  return validateJsonExtractionResponseV1(parsed);
}
