import { normalizeCustomStatKind, normalizeCustomTextMaxLength } from "./customStatRuntime";
import type { BetterSimTrackerSettings, CustomStatDefinition, StatKey } from "./types";
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
} from "./jsonExtractionProtocol";

type BuiltInStatDefinitionSeed = {
  label: string;
  behaviorGuidance: string;
  emptySemantics: string;
};

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
    behaviorGuidance: "Track one short internal thought grounded in recent messages. Preserve continuity unless recent messages clearly justify change.",
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
  entityContext: {
    candidateOwners: string[];
    candidateEntities: JsonExtractionRequestEntityCandidate[];
    currentEntityOwnerMap: Record<string, unknown>;
  };
  enabledBuiltInStats: StatKey[];
  settings: Pick<BetterSimTrackerSettings, "customStats">;
  rules?: Partial<JsonExtractionRequestV1["rules"]>;
  outputContract?: Partial<JsonExtractionRequestOutputContract>;
}

function buildBuiltInStatDefinitions(enabledBuiltInStats: StatKey[]): JsonExtractionRequestStatDefinition[] {
  return enabledBuiltInStats.map(stat => {
    const seed = BUILT_IN_STAT_DEFINITIONS[stat];
    return {
      id: stat,
      label: seed.label,
      kind: stat === "mood" || stat === "lastThought" ? "text_short" : "numeric",
      trackCharacters: true,
      trackUser: true,
      globalScope: false,
      includeInInjection: true,
      behaviorGuidance: seed.behaviorGuidance,
      emptySemantics: seed.emptySemantics,
    };
  });
}

function buildCustomStatDefinition(definition: CustomStatDefinition): JsonExtractionRequestStatDefinition {
  const kind = normalizeCustomStatKind(definition.kind);
  const guidance = String(definition.promptOverride ?? definition.behaviorGuidance ?? definition.description ?? "").trim();
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
    behaviorGuidance: guidance || `Extract ${definition.label} while preserving continuity from the recent scene.`,
    emptySemantics: baseEmptySemantics,
  };
}

function splitCustomStatDefinitions(definitions: CustomStatDefinition[] | undefined): {
  customNumeric: JsonExtractionRequestStatDefinition[];
  customNonNumeric: JsonExtractionRequestStatDefinition[];
} {
  const customNumeric: JsonExtractionRequestStatDefinition[] = [];
  const customNonNumeric: JsonExtractionRequestStatDefinition[] = [];
  for (const definition of definitions ?? []) {
    if (!definition.track) continue;
    const built = buildCustomStatDefinition({
      ...definition,
      textMaxLength: normalizeCustomTextMaxLength(definition.textMaxLength),
    });
    if (built.kind === "numeric") {
      customNumeric.push(built);
    } else {
      customNonNumeric.push(built);
    }
  }
  return { customNumeric, customNonNumeric };
}

export function buildJsonExtractionRequestV1(input: BuildJsonExtractionRequestInput): JsonExtractionRequestV1 {
  const builtIn = buildBuiltInStatDefinitions(input.enabledBuiltInStats);
  const { customNumeric, customNonNumeric } = splitCustomStatDefinitions(input.settings.customStats);
  return {
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestType: JSON_EXTRACTION_REQUEST_TYPE,
    task: input.task,
    message: input.message,
    recentHistory: input.recentHistory,
    currentState: input.currentState,
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
      requiredSections: input.outputContract?.requiredSections ?? [
        "result",
        "entityResolution",
        "builtInStats",
        "customStats",
        "customNonNumericStats",
      ],
    },
  };
}

export function serializeJsonExtractionRequestV1(request: JsonExtractionRequestV1): string {
  return JSON.stringify(request, null, 2);
}
