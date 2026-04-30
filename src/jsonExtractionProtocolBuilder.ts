import { MAX_CUSTOM_ARRAY_ITEMS, normalizeCustomStatKind, normalizeCustomTextMaxLength } from "./customStatRuntime";
import { buildCustomNonNumericProtocolGuidance } from "./prompts";
import type { BetterSimTrackerSettings, CustomStatDefinition, StatKey } from "./types";
import { GLOBAL_TRACKER_KEY } from "./constants";
import type {
  JsonExtractionRequestEntityCandidate,
  JsonExtractionRequestHistoryEntry,
  JsonExtractionRequestOutputContract,
  JsonExtractionRequestStatDefinition,
  JsonExtractionRequestTask,
  JsonExtractionRequestV1,
} from "./jsonExtractionProtocol";
import {
  JSON_EXTRACTION_PROTOCOL_VERSION,
  JSON_EXTRACTION_REQUEST_TYPE,
  JSON_EXTRACTION_STATS_RESPONSE_TYPE,
} from "./jsonExtractionProtocol";

type BuiltInStatDefinitionSeed = {
  label: string;
  behaviorGuidance: string;
  emptySemantics: string;
};

type JsonPromptSettings = Pick<
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
>;

const BUILT_IN_STAT_DEFINITIONS: Record<StatKey, BuiltInStatDefinitionSeed> = {
  affection: {
    label: "Affection",
    behaviorGuidance: "Track emotional warmth, fondness, and care toward the user. Preserve continuity unless recent messages clearly justify change.",
    emptySemantics: "Omitted owner means no extracted affection value for that owner in this response.",
  },
  trust: {
    label: "Trust",
    behaviorGuidance: "Track perceived safety and reliability toward the user. Preserve continuity unless recent messages clearly justify change.",
    emptySemantics: "Omitted owner means no extracted trust value for that owner in this response.",
  },
  desire: {
    label: "Desire",
    behaviorGuidance: "Track physical or romantic attraction and tension. Preserve continuity unless recent messages clearly justify change.",
    emptySemantics: "Omitted owner means no extracted desire value for that owner in this response.",
  },
  connection: {
    label: "Connection",
    behaviorGuidance: "Track felt closeness, bond depth, and emotional attunement. Preserve continuity unless recent messages clearly justify change.",
    emptySemantics: "Omitted owner means no extracted connection value for that owner in this response.",
  },
  mood: {
    label: "Mood",
    behaviorGuidance: "Track the current emotional tone for the turn. Preserve continuity unless recent messages clearly justify change.",
    emptySemantics: "Omitted owner means no extracted mood value for that owner in this response. Empty string is invalid.",
  },
  lastThought: {
    label: "Last Thought",
    behaviorGuidance: "Track the current immediate internal thought after the latest relevant message. Update directly advanced owners from latest dialogue/action/emotional cues; rewrite spoken dialogue into private subtext instead of repeating it verbatim; preserve continuity only when recent messages provide no new thought cue.",
    emptySemantics: "Omitted owner means no extracted lastThought value for that owner in this response. Empty string is invalid.",
  },
};

export interface BuildJsonExtractionRequestInput {
  task: JsonExtractionRequestTask;
  message: {
    speaker: string;
    isUser: boolean;
    isSystem: boolean;
    text: string;
  };
  recentHistory: JsonExtractionRequestHistoryEntry[];
  currentState: JsonExtractionRequestV1["currentState"];
  contextSources?: JsonExtractionRequestV1["contextSources"];
  entityContext: {
    candidateOwners: string[];
    candidateEntities: JsonExtractionRequestEntityCandidate[];
    currentEntityOwnerMap: Record<string, unknown>;
  };
  enabledBuiltInStats: StatKey[];
  settings: JsonPromptSettings;
  rules?: Partial<JsonExtractionRequestV1["rules"]>;
  outputContract?: Partial<JsonExtractionRequestOutputContract>;
  responseContractMode?: "tracker" | "stats";
}

function trimPrompt(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveBuiltInTemplate(settings: JsonPromptSettings, stat: StatKey): string {
  if (!settings.sequentialExtraction) {
    return trimPrompt(settings.promptTemplateUnified);
  }
  if (stat === "affection") return trimPrompt(settings.promptTemplateSequentialAffection);
  if (stat === "trust") return trimPrompt(settings.promptTemplateSequentialTrust);
  if (stat === "desire") return trimPrompt(settings.promptTemplateSequentialDesire);
  if (stat === "connection") return trimPrompt(settings.promptTemplateSequentialConnection);
  if (stat === "mood") return trimPrompt(settings.promptTemplateSequentialMood);
  return trimPrompt(settings.promptTemplateSequentialLastThought);
}

function resolveBuiltInProtocol(settings: JsonPromptSettings, stat: StatKey): string {
  if (!settings.sequentialExtraction) {
    return trimPrompt(settings.promptProtocolUnified);
  }
  if (stat === "affection") return trimPrompt(settings.promptProtocolSequentialAffection);
  if (stat === "trust") return trimPrompt(settings.promptProtocolSequentialTrust);
  if (stat === "desire") return trimPrompt(settings.promptProtocolSequentialDesire);
  if (stat === "connection") return trimPrompt(settings.promptProtocolSequentialConnection);
  if (stat === "mood") return trimPrompt(settings.promptProtocolSequentialMood);
  return trimPrompt(settings.promptProtocolSequentialLastThought);
}

function resolveCustomTemplateFallback(settings: JsonPromptSettings, definition: CustomStatDefinition): string {
  if (!settings.sequentialExtraction) {
    return trimPrompt(settings.promptTemplateUnified);
  }
  const kind = normalizeCustomStatKind(definition.kind);
  return kind === "numeric"
    ? trimPrompt(settings.promptTemplateSequentialCustomNumeric)
    : trimPrompt(settings.promptTemplateSequentialCustomNonNumeric);
}

function resolveCustomProtocol(settings: JsonPromptSettings, definition: CustomStatDefinition, candidateOwners: string[]): string {
  const kind = normalizeCustomStatKind(definition.kind);
  if (kind !== "numeric") {
    const template = !settings.sequentialExtraction
      ? trimPrompt(settings.promptProtocolUnified)
      : trimPrompt(settings.promptProtocolSequentialCustomNonNumeric);
    return buildCustomNonNumericProtocolGuidance({
      kind,
      statId: definition.id,
      allowedValues: Array.isArray(definition.enumOptions) ? definition.enumOptions : [],
      textMaxLen: normalizeCustomTextMaxLength(definition.textMaxLength),
      arrayMaxItems: MAX_CUSTOM_ARRAY_ITEMS,
      dateTimeMode: definition.dateTimeMode === "structured" ? "structured" : "timestamp",
      trueLabel: String(definition.booleanTrueLabel ?? "enabled").trim() || "enabled",
      falseLabel: String(definition.booleanFalseLabel ?? "disabled").trim() || "disabled",
      template,
      characters: candidateOwners.join(", "),
      globalScope: definition.globalScope === true,
      directValuePayload: true,
    });
  }
  if (!settings.sequentialExtraction) {
    return trimPrompt(settings.promptProtocolUnified);
  }
  return trimPrompt(settings.promptProtocolSequentialCustomNumeric);
}

function buildBuiltInStatDefinitions(settings: JsonPromptSettings, enabledBuiltInStats: StatKey[]): JsonExtractionRequestStatDefinition[] {
  return enabledBuiltInStats.map(stat => {
    const seed = BUILT_IN_STAT_DEFINITIONS[stat];
    const behaviorGuidance = resolveBuiltInTemplate(settings, stat) || seed.behaviorGuidance;
    const protocolGuidance = resolveBuiltInProtocol(settings, stat);
    return {
      id: stat,
      label: seed.label,
      kind: stat === "mood" || stat === "lastThought" ? "text_short" : "numeric",
      trackCharacters: true,
      trackUser: true,
      globalScope: false,
      includeInInjection: true,
      behaviorGuidance,
      ...(protocolGuidance ? { protocolGuidance } : {}),
      emptySemantics: seed.emptySemantics,
    };
  });
}

function buildCustomStatDefinition(
  settings: JsonPromptSettings,
  definition: CustomStatDefinition,
  candidateOwners: string[],
): JsonExtractionRequestStatDefinition {
  const kind = normalizeCustomStatKind(definition.kind);
  const guidance = trimPrompt(
    definition.promptOverride
    ?? definition.behaviorGuidance
    ?? definition.description
    ?? resolveCustomTemplateFallback(settings, definition),
  );
  const protocolGuidance = resolveCustomProtocol(settings, definition, candidateOwners);
  const baseEmptySemantics = kind === "array"
    ? "Empty array means known empty, not unknown."
    : kind === "text_short"
      ? "Empty string is an explicit empty text value only if the stat kind allows it; omitted owner means no extracted value."
      : "Omitted owner means no extracted value for that owner in this response.";

  return {
    id: definition.id,
    label: definition.label,
    kind,
    trackCharacters: definition.trackCharacters !== false,
    trackUser: definition.trackUser !== false,
    globalScope: definition.globalScope === true,
    includeInInjection: definition.includeInInjection === true,
    ...(kind === "date_time" ? { dateTimeMode: definition.dateTimeMode === "structured" ? "structured" as const : "timestamp" as const } : {}),
    behaviorGuidance: guidance || `Extract ${definition.label} while preserving continuity from the recent scene.`,
    ...(protocolGuidance ? { protocolGuidance } : {}),
    emptySemantics: baseEmptySemantics,
  };
}

function splitCustomStatDefinitions(
  settings: JsonPromptSettings,
  definitions: CustomStatDefinition[] | undefined,
  candidateOwners: string[],
): {
  customNumeric: JsonExtractionRequestStatDefinition[];
  customNonNumeric: JsonExtractionRequestStatDefinition[];
} {
  const customNumeric: JsonExtractionRequestStatDefinition[] = [];
  const customNonNumeric: JsonExtractionRequestStatDefinition[] = [];
  for (const definition of definitions ?? []) {
    if (!definition.track) continue;
    const built = buildCustomStatDefinition(settings, {
      ...definition,
      textMaxLength: normalizeCustomTextMaxLength(definition.textMaxLength),
    }, candidateOwners);
    if (built.kind === "numeric") {
      customNumeric.push(built);
    } else {
      customNonNumeric.push(built);
    }
  }
  return { customNumeric, customNonNumeric };
}

function exampleValueForStat(definition: JsonExtractionRequestStatDefinition): unknown {
  if (definition.kind === "numeric") {
    return {
      delta: 3,
      confidence: 0.8,
    };
  }
  const withConfidence = (value: unknown): Record<string, unknown> => ({
    value,
    confidence: 0.8,
  });
  if (definition.kind === "boolean") return withConfidence(true);
  if (definition.kind === "array") return withConfidence(["value"]);
  if (definition.kind === "date_time") {
    return definition.dateTimeMode === "structured"
      ? withConfidence({ ofDay: "Evening" })
      : withConfidence("2026-03-07 20:00");
  }
  if (definition.id === "mood") return withConfidence("calm");
  if (definition.id === "lastThought") return withConfidence("short thought");
  return withConfidence("value");
}

function uniqueOwnerKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function buildStatResponseSchema(
  definitions: JsonExtractionRequestStatDefinition[],
  candidateOwners: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ownerKeys = uniqueOwnerKeys(candidateOwners);
  for (const definition of definitions) {
    const valueOwners = definition.globalScope ? [GLOBAL_TRACKER_KEY] : ownerKeys;
    const values: Record<string, unknown> = {};
    for (const owner of valueOwners) {
      values[owner] = exampleValueForStat(definition);
    }
    out[definition.id] = {
      ...values,
    };
  }
  return out;
}

function buildResponseSchema(input: {
  builtIn: JsonExtractionRequestStatDefinition[];
  customNumeric: JsonExtractionRequestStatDefinition[];
  customNonNumeric: JsonExtractionRequestStatDefinition[];
  candidateOwners: string[];
}): Record<string, unknown> {
  const exampleOwnerName = uniqueOwnerKeys(input.candidateOwners)[0] ?? "";
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    responseType: "tracker_extraction_result",
    result: {
      status: "ok",
    },
    entityResolution: {
      sceneOwners: ["Owner still in the active scene"],
      messageOwners: ["Owner directly advanced by the current message"],
      resolvedEntities: [
        {
          entityId: "stable entity id or empty when unavailable",
          ownerName: exampleOwnerName,
          kind: "owner | multi_character_alias | narrative-entity | st-character | persona",
          aliases: exampleOwnerName ? [exampleOwnerName] : [],
          inScene: true,
          inMessage: true,
        },
      ],
    },
    builtInStats: buildStatResponseSchema(input.builtIn, input.candidateOwners),
    customStats: buildStatResponseSchema(input.customNumeric, input.candidateOwners),
    customNonNumericStats: buildStatResponseSchema(input.customNonNumeric, input.candidateOwners),
  };
}

function buildStatsResponseSchema(input: {
  builtIn: JsonExtractionRequestStatDefinition[];
  customNumeric: JsonExtractionRequestStatDefinition[];
  customNonNumeric: JsonExtractionRequestStatDefinition[];
  candidateOwners: string[];
}): Record<string, unknown> {
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    responseType: JSON_EXTRACTION_STATS_RESPONSE_TYPE,
    result: {
      status: "ok",
    },
    builtInStats: buildStatResponseSchema(input.builtIn, input.candidateOwners),
    customStats: buildStatResponseSchema(input.customNumeric, input.candidateOwners),
    customNonNumericStats: buildStatResponseSchema(input.customNonNumeric, input.candidateOwners),
  };
}

export function buildJsonExtractionRequestV1(input: BuildJsonExtractionRequestInput): JsonExtractionRequestV1 {
  const builtIn = buildBuiltInStatDefinitions(input.settings, input.enabledBuiltInStats);
  const { customNumeric, customNonNumeric } = splitCustomStatDefinitions(
    input.settings,
    input.settings.customStats,
    input.entityContext.candidateOwners,
  );
  const defaultResponseSchema = input.responseContractMode === "stats"
    ? buildStatsResponseSchema({ builtIn, customNumeric, customNonNumeric, candidateOwners: input.entityContext.candidateOwners })
    : buildResponseSchema({ builtIn, customNumeric, customNonNumeric, candidateOwners: input.entityContext.candidateOwners });
  const defaultRequiredSections = input.responseContractMode === "stats"
    ? [
        "result",
        "builtInStats",
        "customStats",
        "customNonNumericStats",
      ]
    : [
        "result",
        "entityResolution",
        "builtInStats",
        "customStats",
        "customNonNumericStats",
      ];
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestType: JSON_EXTRACTION_REQUEST_TYPE,
    task: input.task,
    message: input.message,
    recentHistory: input.recentHistory,
    currentState: input.currentState,
    contextSources: input.contextSources ?? {
      characterCards: "",
      activatedLorebook: "",
    },
    entityContext: input.entityContext,
    statDefinitions: {
      builtIn,
      customNumeric,
      customNonNumeric,
    },
    rules: {
      taskInstruction: input.rules?.taskInstruction ?? "Extract tracker state for the current message.",
      sourcePriority: input.rules?.sourcePriority ?? {
        recentMessages: 1,
        previousTrackerState: 2,
        characterCards: 3,
        activatedLorebook: 4,
      },
      continuityRules: input.rules?.continuityRules ?? [
        "Preserve current scene continuity unless recent evidence shows a real change.",
        "Keep background participants inScene when recent context says they remain present.",
        "For every numeric stat, return delta plus confidence. Delta must be an integer. Delta is the signed change from the previous tracker value, not the final absolute value.",
        "For every non-numeric stat, return value plus confidence. If evidence is weak, lower confidence instead of inventing a change.",
      ],
      entityRules: input.rules?.entityRules ?? [
        "inScene and inMessage are distinct.",
        "Mention-only references do not imply scene presence.",
        "inMessage true implies inScene true.",
      ],
      emptyValueRules: input.rules?.emptyValueRules ?? [
        "Empty array means known empty, not unknown.",
        "Omitted stat field means no value was provided for that field in the response.",
      ],
    },
    outputContract: {
      format: "json_only",
      allowMarkdownFences: input.outputContract?.allowMarkdownFences ?? false,
      allowProse: input.outputContract?.allowProse ?? false,
      requiredSections: input.outputContract?.requiredSections ?? defaultRequiredSections,
      responseSchema: input.outputContract?.responseSchema ?? defaultResponseSchema,
    },
  };
}

export function buildJsonExtractionStatsOutputContract(input: {
  builtIn: JsonExtractionRequestStatDefinition[];
  customNumeric: JsonExtractionRequestStatDefinition[];
  customNonNumeric: JsonExtractionRequestStatDefinition[];
  candidateOwners?: string[];
}): JsonExtractionRequestOutputContract {
  return {
    format: "json_only",
    allowMarkdownFences: false,
    allowProse: false,
    requiredSections: [
      "result",
      "builtInStats",
      "customStats",
      "customNonNumericStats",
    ],
    responseSchema: buildStatsResponseSchema({ ...input, candidateOwners: input.candidateOwners ?? [] }),
  };
}

export function serializeJsonExtractionRequestV1(request: JsonExtractionRequestV1): string {
  return JSON.stringify(request, null, 2);
}
