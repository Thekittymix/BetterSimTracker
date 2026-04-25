import type { CustomStatDefinition, CustomStatKind, CustomNonNumericStatistics, CustomStatistics, STContext, StatKey } from "./types";
import type { Statistics } from "./types";
import type { TrackerData } from "./types";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
import { normalizeDateTimeValue } from "./dateTime";
import { MAX_CUSTOM_ARRAY_ITEMS, MAX_CUSTOM_ENUM_OPTIONS, normalizeCustomNumericDefaultValue, normalizeNonNumericArrayItems } from "./customStatRuntime";
import {
  resolveTrackerDataEntityOwnerSnapshot,
  resolveTrackerDataLookupValue,
  resolveTrackerEntityIdsForOwners,
} from "./entityRegistry";

export const moodOptions = [
  "Happy",
  "Sad",
  "Angry",
  "Excited",
  "Confused",
  "In Love",
  "Shy",
  "Playful",
  "Serious",
  "Lonely",
  "Hopeful",
  "Anxious",
  "Content",
  "Frustrated",
  "Neutral"
];

export const MAIN_PROMPT = `SYSTEM:
You are a tracker-state extraction engine. Follow the task and protocol exactly.
Do not add commentary or roleplay.`;

export const DEFAULT_UNIFIED_PROMPT_INSTRUCTION = [
  "- Propose incremental changes to tracker state from the recent messages.",
  "- Do NOT rewrite absolute values; provide per-stat deltas.",
  "- Keep updates conservative and realistic.",
  "- It is valid to return 0 or negative deltas if the interaction is neutral or negative.",
  "- Do not reuse the same delta for all stats unless strongly justified by context.",
  "- If lastThought is requested and the latest message directly advances a target with dialogue, action, or emotional reaction, update that target's thought from those latest cues instead of copying the previous tracker thought.",
  "- Preserve lastThought only when recent messages provide no new thought cue for that owner or the owner is only scene-present/background.",
  "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
  "- Only increase desire if the relationship is explicitly romantic/sexual in the recent messages. If the relationship is non-romantic, desire must be 0 or negative. Do not infer romance from affectionate or playful behavior alone.",
].join("\n");

export const DEFAULT_INJECTION_PROMPT_TEMPLATE = [
  "{{header}}",
  "",
  "{{statSemantics}}",
  "",
  "{{behaviorBands}}",
  "",
  "{{reactRules}}",
  "",
  "{{priorityRules}}",
  "",
  "{{lines}}",
  "",
  "{{summarizationNote}}",
].join("\n");

export const UNIFIED_PROMPT_PROTOCOL = `Numeric stats to update ({{numericStats}}):
- Return integer deltas only, each in range -{{maxDelta}}..{{maxDelta}}.

Text stats to update ({{textStats}}):
- mood must be one of: {{moodOptions}}.
- lastThought must be the character's current immediate internal thought after the latest relevant message, in one short sentence.
- For lastThought, do not copy the previous tracker thought when the latest message gives that owner a new dialogue/action/emotional cue.
- Preserve lastThought only when recent messages provide no new thought cue for that owner.

Return STRICT JSON only:
{
  "characters": [
    {
      "name": "Character Name",
      "confidence": 0.0,
      "delta": {
        "affection": 0,
        "trust": 0,
        "desire": 0,
        "connection": 0
      },
      "mood": "Neutral",
      "lastThought": ""
    }
  ]
}

Rules:
- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.
- include one entry for each character name exactly: {{characters}}.
- omit fields for stats that are not requested.
- output JSON only, no commentary.`;

export const DEFAULT_STRICT_RETRY_TEMPLATE = `SYSTEM OVERRIDE:
Return ONLY valid JSON.
No prose. No roleplay. No markdown except optional \`\`\`json fences.
If uncertain, still return best-effort JSON with required keys.

{{basePrompt}}`;

export const DEFAULT_REPAIR_MOOD_TEMPLATE = `SYSTEM OVERRIDE:
Return ONLY valid JSON, no prose, no roleplay.
MANDATORY: include \`mood\` for every character.
Use one of allowed mood labels exactly: {{moodOptions}}.

{{basePrompt}}`;

export const DEFAULT_REPAIR_LAST_THOUGHT_TEMPLATE = `SYSTEM OVERRIDE:
Return ONLY valid JSON, no prose, no roleplay.
MANDATORY: include \`lastThought\` for every character.
Keep it to one short sentence per character.

{{basePrompt}}`;

export const NUMERIC_PROMPT_PROTOCOL = (key: string): string => `Return integer deltas only, each in range -{{maxDelta}}..{{maxDelta}}.

Return STRICT JSON only:
{
  "characters": [
    {
      "name": "Character Name",
      "confidence": 0.0,
      "delta": {
        "${key}": 0
      }
    }
  ]
}

Rules:
- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.
- include one entry for each character name exactly: {{characters}}.
- omit fields for stats that are not requested.
- output JSON only, no commentary.`;

export const MOOD_PROMPT_PROTOCOL = `Return STRICT JSON only:
{
  "characters": [
    {
      "name": "Character Name",
      "confidence": 0.0,
      "mood": "Neutral"
    }
  ]
}

Rules:
- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.
- include one entry for each character name exactly: {{characters}}.
- omit fields for stats that are not requested.
- output JSON only, no commentary.`;

export const LAST_THOUGHT_PROMPT_PROTOCOL = `Return STRICT JSON only:
{
  "characters": [
    {
      "name": "Character Name",
      "confidence": 0.0,
      "lastThought": ""
    }
  ]
}

Rules:
- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.
- lastThought must be the character's current immediate internal thought after the latest relevant message, in one short sentence.
- If the latest message directly advances a target owner through dialogue, action, or emotional reaction, infer that owner's updated thought from those latest cues.
- Do not copy the previous tracker thought for an owner whose current message cues changed.
- Preserve the previous thought only when recent messages provide no new thought cue for that owner.
- include one entry for each character name exactly: {{characters}}.
- omit fields for stats that are not requested.
- output JSON only, no commentary.`;

export const DEFAULT_CUSTOM_NON_NUMERIC_PROTOCOL_TEMPLATE = `Value schema:
{{valueSchemaRules}}

Return STRICT JSON only:
{
  "characters": [
    {
      "name": "Character Name",
      "confidence": 0.0,
      "value": {
        "{{statId}}": {{valueSchemaSample}}
      }
    }
  ]
}

Rules:
- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.
- include one entry for each character name exactly: {{characters}}.
- output JSON only, no commentary.`;

export const DEFAULT_PROTOCOL_UNIFIED = UNIFIED_PROMPT_PROTOCOL;
export const DEFAULT_PROTOCOL_SEQUENTIAL_AFFECTION = NUMERIC_PROMPT_PROTOCOL("affection");
export const DEFAULT_PROTOCOL_SEQUENTIAL_TRUST = NUMERIC_PROMPT_PROTOCOL("trust");
export const DEFAULT_PROTOCOL_SEQUENTIAL_DESIRE = NUMERIC_PROMPT_PROTOCOL("desire");
export const DEFAULT_PROTOCOL_SEQUENTIAL_CONNECTION = NUMERIC_PROMPT_PROTOCOL("connection");
export const DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NUMERIC = NUMERIC_PROMPT_PROTOCOL("{{statId}}");
export const DEFAULT_PROTOCOL_SEQUENTIAL_MOOD = MOOD_PROMPT_PROTOCOL;
export const DEFAULT_PROTOCOL_SEQUENTIAL_LAST_THOUGHT = LAST_THOUGHT_PROMPT_PROTOCOL;
export const DEFAULT_PROTOCOL_SEQUENTIAL_CUSTOM_NON_NUMERIC = DEFAULT_CUSTOM_NON_NUMERIC_PROTOCOL_TEMPLATE;

const buildNumericInstruction = (label: string, key: string): string => [
  `- Propose incremental changes to ${label} from the recent messages.`,
  `- Only update ${key} deltas. Ignore other stats.`,
  "- Keep updates conservative and realistic.",
  "- It is valid to return 0 or negative deltas if the interaction is neutral or negative.",
  "- Do not reuse the same delta for all characters unless strongly justified by context.",
  "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
].join("\n");

export const DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS: Record<StatKey, string> = {
  affection: buildNumericInstruction("AFFECTION", "affection"),
  trust: buildNumericInstruction("TRUST", "trust"),
  desire: [
    "- Propose incremental changes to DESIRE from the recent messages.",
    "- Only update desire deltas. Ignore other stats.",
    "- Keep updates conservative and realistic.",
    "- It is valid to return 0 or negative deltas if the interaction is neutral or negative.",
    "- Do not reuse the same delta for all characters unless strongly justified by context.",
    "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
    "- Only increase desire if the relationship is explicitly romantic/sexual in the recent messages. If the relationship is non-romantic, desire must be 0 or negative. Do not infer romance from affectionate or playful behavior alone.",
  ].join("\n"),
  connection: buildNumericInstruction("CONNECTION", "connection"),
  mood: [
    "- Determine each character's current mood toward the user.",
    "- Choose one mood label from: {{moodOptions}}.",
    "- Keep updates conservative and realistic.",
    "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
  ].join("\n"),
  lastThought: [
    "- Write the character's current immediate internal thought after the latest relevant message.",
    "- If the latest message directly advances a target owner through dialogue, action, or emotional reaction, update that owner's thought from those latest cues.",
    "- Do not copy the previous tracker thought for an owner whose current message cues changed.",
    "- Preserve the previous thought only when recent messages provide no new thought cue for that owner or the owner is only scene-present/background.",
    "- Keep it to one concise sentence grounded in the recent messages.",
    "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
  ].join("\n"),
};

export const DEFAULT_SEQUENTIAL_CUSTOM_NUMERIC_PROMPT_INSTRUCTION = [
  "- Propose incremental changes to {{statLabel}} from the recent messages.",
  "- Only update {{statId}} deltas. Ignore other stats.",
  "- Use the custom stat description to interpret what this stat actually measures.",
  "- Keep updates conservative and realistic.",
  "- It is valid to return 0 or negative deltas if the interaction is neutral or negative.",
  "- Do not reuse the same delta for all characters unless strongly justified by context.",
  "- Use recent messages first; use character cards only to disambiguate when context is unclear.",
].join("\n");

export const DEFAULT_SEQUENTIAL_CUSTOM_NON_NUMERIC_PROMPT_INSTRUCTION = [
  "- Determine the best current value for {{statLabel}} from recent messages.",
  "- Update only {{statId}} and ignore other stats.",
  "- Return one valid value per character using the exact schema for this stat kind.",
  "- Use the custom stat description to interpret what this stat actually measures.",
  "- For array kind, apply item-level updates (add/remove/edit items) and avoid rewriting the entire list unless context clearly requires replacement.",
  "- Keep updates conservative and context-grounded.",
  "- Prefer recent messages first; use character cards only to disambiguate when needed.",
].join("\n");

function commonEnvelope(userName: string, characters: string[]): string {
  return [
    `User: ${userName}`,
    `Characters: ${characters.join(", ")}`,
  ].join("\n");
}

function displayPromptTargetName(userName: string, name: string): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return userName;
  if (trimmed === USER_TRACKER_KEY) return userName;
  if (trimmed === GLOBAL_TRACKER_KEY) return "Global";
  return trimmed;
}

function buildTargetGuidanceBlock(
  userName: string,
  characters: string[],
  preferredCharacterName?: string,
): string {
  const rawCharacters = (characters ?? []).map(name => String(name ?? "").trim()).filter(Boolean);
  const targetNames = Array.from(new Set(rawCharacters.map(name => displayPromptTargetName(userName, name))));
  const allTargetsAreUserOrGlobal = rawCharacters.every(name => name === USER_TRACKER_KEY || name === GLOBAL_TRACKER_KEY);
  const primaryTarget = allTargetsAreUserOrGlobal
    ? displayPromptTargetName(userName, rawCharacters[0] ?? userName)
    : displayPromptTargetName(
        userName,
        resolvePrimaryCharacter(characters, preferredCharacterName),
      );
  return [
    `Primary target: ${primaryTarget}`,
    `Extract updates only for these target owners: ${targetNames.join(", ") || userName}`,
    `Do not assign another character's state to ${primaryTarget} unless the recent messages explicitly attribute it to ${primaryTarget}.`,
  ].join("\n");
}

function buildSnapshotGuidanceBlock(): string {
  return [
    "- CURRENT_STATE is the latest known tracked state before this extraction.",
    "- RECENT_SNAPSHOTS are older saved tracker states for continuity only.",
    "- Snapshot ordering: newest-0 is the most recent prior snapshot; newest-1 is older; larger indexes are older.",
    "- Use RECENT_MESSAGES first, then CURRENT_STATE, then RECENT_SNAPSHOTS for older continuity.",
    "- Do not let an older snapshot override clearer evidence from RECENT_MESSAGES or CURRENT_STATE.",
  ].join("\n");
}

const TARGET_CARD_CONTEXT_HEADER = "Target character card context";
const OTHER_CARD_CONTEXT_HEADER = "Other character cards";
const LEGACY_CARD_CONTEXT_HEADER = "Character cards (use only to disambiguate if recent messages are unclear):";
const LOREBOOK_CONTEXT_HEADER = "Lorebook context (activated; use only to disambiguate if recent messages are unclear):";

function extractPromptContextSection(
  text: string,
  startIndex: number,
  header: string,
  nextIndices: number[],
): string {
  const bodyStart = startIndex + header.length;
  const candidates = nextIndices.filter(index => index > startIndex);
  const nextBoundary = candidates.length ? Math.min(...candidates) : text.length;
  return text.slice(bodyStart, nextBoundary).trim();
}

function splitPromptContextSections(contextText: string): {
  recentMessages: string;
  targetCardContext: string;
  otherCardContext: string;
  lorebookContext: string;
} {
  const text = String(contextText ?? "").trim();
  if (!text) {
    return {
      recentMessages: "",
      targetCardContext: "",
      otherCardContext: "",
      lorebookContext: "",
    };
  }

  const targetIndex = text.indexOf(TARGET_CARD_CONTEXT_HEADER);
  const otherIndex = text.indexOf(OTHER_CARD_CONTEXT_HEADER);
  const legacyCardIndex = text.indexOf(LEGACY_CARD_CONTEXT_HEADER);
  const lorebookIndex = text.indexOf(LOREBOOK_CONTEXT_HEADER);
  const firstSectionIndex = [targetIndex, otherIndex, legacyCardIndex, lorebookIndex]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;

  const recentMessages = (firstSectionIndex >= 0 ? text.slice(0, firstSectionIndex) : text).trim();
  const targetCardContext = targetIndex >= 0
    ? extractPromptContextSection(text, targetIndex, TARGET_CARD_CONTEXT_HEADER, [otherIndex, legacyCardIndex, lorebookIndex])
    : "";
  const structuredOtherCardContext = otherIndex >= 0
    ? extractPromptContextSection(text, otherIndex, OTHER_CARD_CONTEXT_HEADER, [legacyCardIndex, lorebookIndex])
    : "";
  const legacyOtherCardContext = legacyCardIndex >= 0
    ? extractPromptContextSection(text, legacyCardIndex, LEGACY_CARD_CONTEXT_HEADER, [lorebookIndex])
    : "";
  const lorebookContext = lorebookIndex >= 0
    ? extractPromptContextSection(text, lorebookIndex, LOREBOOK_CONTEXT_HEADER, [])
    : "";

  return {
    recentMessages,
    targetCardContext,
    otherCardContext: [structuredOtherCardContext, legacyOtherCardContext].filter(Boolean).join("\n\n").trim(),
    lorebookContext,
  };
}

function renderCustomStatMeaningLine(stat: CustomStatDefinition): string {
  const statId = String(stat.id ?? "").trim();
  const statLabel = String(stat.label ?? "").trim() || statId;
  const statDescription = String(stat.description ?? "").trim() || "No description provided.";
  const statKind = stat.kind ?? "numeric";
  const scope = stat.globalScope ? "global" : "owner-scoped";
  return `- ${statId} (${statLabel}, ${statKind}, ${scope}): ${statDescription}`;
}

function renderSingleCustomStatMeaningBlock(input: {
  statId: string;
  statLabel: string;
  statDescription?: string;
  statKind?: CustomStatKind;
  globalScope?: boolean;
}): string {
  const statId = input.statId.trim();
  const statLabel = input.statLabel.trim() || statId;
  const statDescription = String(input.statDescription ?? "").trim() || "No description provided.";
  const statKind = input.statKind ?? "numeric";
  const scope = input.globalScope ? "global" : "owner-scoped";
  return [
    `- ID: ${statId}`,
    `- Label: ${statLabel}`,
    `- Kind: ${statKind}`,
    `- Scope: ${scope}`,
    `- Meaning: ${statDescription}`,
  ].join("\n");
}

function renderCustomStatMeaningsBlock(stats: CustomStatDefinition[]): string {
  const lines = stats.map(renderCustomStatMeaningLine).filter(Boolean);
  return lines.length ? lines.join("\n") : "- none";
}

function renderPromptContextSections(
  sections: ReturnType<typeof splitPromptContextSections>,
  values: Record<string, string>,
): ReturnType<typeof splitPromptContextSections> {
  return {
    recentMessages: sections.recentMessages ? renderTemplate(sections.recentMessages, values).trim() : "",
    targetCardContext: sections.targetCardContext ? renderTemplate(sections.targetCardContext, values).trim() : "",
    otherCardContext: sections.otherCardContext ? renderTemplate(sections.otherCardContext, values).trim() : "",
    lorebookContext: sections.lorebookContext ? renderTemplate(sections.lorebookContext, values).trim() : "",
  };
}

function bstTagBlock(tag: string, content: string): string {
  const inner = String(content ?? "").trim();
  return [`<${tag}>`, inner, `</${tag}>`].join("\n");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function buildSourcePriorityRule(includeCharacterCards: boolean, includeLorebook: boolean): string {
  if (includeCharacterCards && includeLorebook) {
    return "- Use recent messages first; use character cards and lorebook only to disambiguate when context is unclear.";
  }
  if (includeCharacterCards) {
    return "- Use recent messages first; use character cards only to disambiguate when context is unclear.";
  }
  if (includeLorebook) {
    return "- Use recent messages first; use lorebook only to disambiguate when context is unclear.";
  }
  return "";
}

function resolvePromptExplicitEntityIds(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  ownerName: string,
): string[] {
  const snapshotEntityId = String(resolveTrackerDataEntityOwnerSnapshot(data, ownerName)?.entityId ?? "").trim();
  if (snapshotEntityId) return [snapshotEntityId];
  if (!context) return [];
  return resolveTrackerEntityIdsForOwners(context, [ownerName])
    .map(entityId => String(entityId ?? "").trim())
    .filter(Boolean);
}

function resolveBuiltInNumericValue(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  byOwner: Record<string, unknown> | null | undefined,
  ownerName: string,
): number | undefined {
  if (!byOwner) return undefined;
  const ownerValue = resolveTrackerDataLookupValue({
    context: context ?? null,
    data,
    byOwner,
    ownerName,
    explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
  });
  if (ownerValue === undefined) return undefined;
  const numeric = Number(ownerValue);
  if (!Number.isNaN(numeric)) return numeric;
  return undefined;
}

function resolveBuiltInTextValue(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  byOwner: Record<string, unknown> | null | undefined,
  ownerName: string,
): string | undefined {
  if (!byOwner) return undefined;
  const ownerValue = resolveTrackerDataLookupValue({
    context: context ?? null,
    data,
    byOwner,
    ownerName,
    explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
  });
  if (typeof ownerValue === "string") return ownerValue;
  return undefined;
}

function applySourcePriorityRule(
  instruction: string,
  includeCharacterCards: boolean,
  includeLorebook: boolean,
): string {
  const cleaned = instruction
    .replace(/^- (Use|Prefer) recent messages first; use [^\n]+\.$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [cleaned, buildSourcePriorityRule(includeCharacterCards, includeLorebook)]
    .filter(Boolean)
    .join("\n");
}

function isPromptCharacterCandidate(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== USER_TRACKER_KEY.toLowerCase() && normalized !== GLOBAL_TRACKER_KEY.toLowerCase();
}

function primaryCharacter(characters: string[]): string {
  const first = characters.find(name => typeof name === "string" && isPromptCharacterCandidate(name));
  return first?.trim() || "Character";
}

function resolvePrimaryCharacter(characters: string[], preferredCharacterName?: string): string {
  const preferred = String(preferredCharacterName ?? "").trim();
  if (preferred && isPromptCharacterCandidate(preferred)) {
    const preferredLower = preferred.toLowerCase();
    const matched = characters.find(name => {
      if (typeof name !== "string") return false;
      const trimmed = name.trim();
      return Boolean(trimmed) && trimmed.toLowerCase() === preferredLower;
    });
    if (matched && matched.trim()) return matched.trim();
    return preferred;
  }
  return primaryCharacter(characters);
}

type BuiltInTrackingFlags = {
  trackAffection?: boolean;
  trackTrust?: boolean;
  trackDesire?: boolean;
  trackConnection?: boolean;
  trackMood?: boolean;
  trackLastThought?: boolean;
};

function buildRequestedBuiltInFlags(stats: StatKey[]): BuiltInTrackingFlags {
  return {
    trackAffection: stats.includes("affection"),
    trackTrust: stats.includes("trust"),
    trackDesire: stats.includes("desire"),
    trackConnection: stats.includes("connection"),
    trackMood: stats.includes("mood"),
    trackLastThought: stats.includes("lastThought"),
  };
}

function mergeBuiltInTrackingFlags(
  requested: BuiltInTrackingFlags,
  configured?: BuiltInTrackingFlags,
): BuiltInTrackingFlags {
  return {
    trackAffection: requested.trackAffection === true && configured?.trackAffection !== false,
    trackTrust: requested.trackTrust === true && configured?.trackTrust !== false,
    trackDesire: requested.trackDesire === true && configured?.trackDesire !== false,
    trackConnection: requested.trackConnection === true && configured?.trackConnection !== false,
    trackMood: requested.trackMood === true && configured?.trackMood !== false,
    trackLastThought: requested.trackLastThought === true && configured?.trackLastThought !== false,
  };
}

function buildExtractionSystemPrompt(options: {
  builtInStats?: StatKey[];
}): string {
  const builtInStats = (options.builtInStats ?? []).filter(stat =>
    stat === "affection" || stat === "trust" || stat === "desire" || stat === "connection" || stat === "mood" || stat === "lastThought",
  );
  const uniqueStats = Array.from(new Set(builtInStats));
  const lines = [
    "SYSTEM:",
    "You are a tracker-state extraction engine. Follow the task and protocol exactly.",
  ];

  if (uniqueStats.length) {
    lines.push("Stat meanings:");
    if (uniqueStats.includes("affection")) lines.push("- affection: emotional warmth, fondness, care toward the user");
    if (uniqueStats.includes("trust")) lines.push("- trust: perceived safety/reliability; willingness to be vulnerable");
    if (uniqueStats.includes("desire")) lines.push("- desire: physical/romantic attraction and flirt/sexual tension");
    if (uniqueStats.includes("connection")) lines.push("- connection: felt closeness/bond depth and emotional attunement");
    if (uniqueStats.includes("mood")) lines.push("- mood: immediate emotional tone for this turn");
    if (uniqueStats.includes("lastThought")) lines.push("- lastThought: brief internal thought grounded in recent messages");
  }

  if (uniqueStats.includes("desire")) {
    lines.push("Rule:");
    lines.push("- If the relationship is non-romantic, desire deltas must be 0 or negative.");
    lines.push("- Do not infer romance from affection or playfulness.");
  }

  lines.push("Do not add commentary or roleplay.");
  return lines.join("\n");
}

function applyUnifiedDefaultInstructionGuards(
  instruction: string,
  stats: StatKey[],
): string {
  const hasDesire = stats.includes("desire");
  return instruction
    .split(/\r?\n/g)
    .filter(line => {
      if (hasDesire) return true;
      return !/Only increase desire if the relationship is explicitly romantic\/sexual/i.test(line);
    })
    .join("\n")
    .trim();
}

function buildUnifiedBuiltInProtocol(stats: StatKey[], safeMaxDelta: number, characters: string[]): string {
  const numericStats = stats.filter(stat =>
    stat === "affection" || stat === "trust" || stat === "desire" || stat === "connection",
  );
  const textStats = stats.filter(stat => stat === "mood" || stat === "lastThought");
  const deltaSample = numericStats.length
    ? numericStats.map(key => `        "${key}": 0`).join(",\n")
    : "        ";

  return [
    `Numeric stats to update (${numericStats.length ? numericStats.join(", ") : "none"}):`,
    `- Return integer deltas only, each in range -${safeMaxDelta}..${safeMaxDelta}.`,
    "",
    ...(textStats.length
      ? [
          `Text stats to update (${textStats.join(", ")}):`,
          ...(textStats.includes("mood") ? [`- mood must be one of: ${moodOptions.join(", ")}.`] : []),
          ...(textStats.includes("lastThought") ? [
            "- lastThought must be the character's current immediate internal thought after the latest relevant message, in one short sentence.",
            "- For lastThought, do not copy the previous tracker thought when the latest message gives that owner a new dialogue/action/emotional cue.",
            "- Preserve lastThought only when recent messages provide no new thought cue for that owner.",
          ] : []),
          "",
        ]
      : []),
    "Return STRICT JSON only:",
    "{",
    "  \"characters\": [",
    "    {",
    "      \"name\": \"Character Name\",",
    "      \"confidence\": 0.0,",
    "      \"delta\": {",
    deltaSample,
    "      }",
    ...(textStats.includes("mood") ? ["      ,\"mood\": \"Neutral\""] : []),
    ...(textStats.includes("lastThought") ? ["      ,\"lastThought\": \"\""] : []),
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.",
    `- include one entry for each character name exactly: ${characters.join(", ")}.`,
    "- omit fields for stats that are not requested.",
    "- output JSON only, no commentary.",
  ].join("\n");
}

function renderBuiltInSnapshotChunk(
  stats: {
    affection?: number;
    trust?: number;
    desire?: number;
    connection?: number;
    mood?: string;
    lastThought?: string;
  },
  flags?: BuiltInTrackingFlags,
): string {
  const chunks: string[] = [];
  if (flags?.trackAffection !== false && Number.isFinite(stats.affection)) {
    const value = Number(stats.affection);
    chunks.push(`affection=${Math.max(0, Math.min(100, Math.round(value)))}`);
  }
  if (flags?.trackTrust !== false && Number.isFinite(stats.trust)) {
    const value = Number(stats.trust);
    chunks.push(`trust=${Math.max(0, Math.min(100, Math.round(value)))}`);
  }
  if (flags?.trackDesire !== false && Number.isFinite(stats.desire)) {
    const value = Number(stats.desire);
    chunks.push(`desire=${Math.max(0, Math.min(100, Math.round(value)))}`);
  }
  if (flags?.trackConnection !== false && Number.isFinite(stats.connection)) {
    const value = Number(stats.connection);
    chunks.push(`connection=${Math.max(0, Math.min(100, Math.round(value)))}`);
  }
  if (flags?.trackMood !== false && typeof stats.mood === "string" && stats.mood.trim()) {
    chunks.push(`mood=${stats.mood.trim()}`);
  }
  if (flags?.trackLastThought !== false && typeof stats.lastThought === "string" && stats.lastThought.trim()) {
    chunks.push(`lastThought=${JSON.stringify(stats.lastThought.trim())}`);
  }
  return chunks.join(", ");
}

export function buildPrompt(
  stat: StatKey,
  userName: string,
  characters: string[],
  contextText: string,
): string {
  const envelope = [commonEnvelope(userName, characters), "", "Recent messages:", contextText, ""].join("\n");

  switch (stat) {
    case "affection":
      return `${envelope}
Rate AFFECTION each character feels toward the user on 0-100.
Return JSON object only, keys must be exact character names, values must be numbers.`;
    case "trust":
      return `${envelope}
Rate TRUST each character has toward the user on 0-100.
Return JSON object only, keys must be exact character names, values must be numbers.`;
    case "desire":
      return `${envelope}
Rate DESIRE (physical attraction) each character feels toward the user on 0-100.
Return JSON object only, keys must be exact character names, values must be numbers.`;
    case "connection":
      return `${envelope}
Rate CONNECTION (emotional intimacy) each character has with the user on 0-100.
Return JSON object only, keys must be exact character names, values must be numbers.`;
    case "mood":
      return `${envelope}
Determine each character's current mood toward the user.
Allowed moods: ${moodOptions.join(", ")}.
Return JSON object only, keys must be exact character names, values must be short mood strings.`;
    case "lastThought":
      return `${envelope}
Write a short internal thought (1 sentence) each character has right now.
Return JSON object only, keys must be exact character names, values must be plain strings.`;
    default:
      return envelope;
  }
}

function resolveScopedCustomNumericValue(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  byStat: CustomStatistics | Record<string, Record<string, number>> | null | undefined,
  statId: string,
  ownerName: string,
  globalScope?: boolean,
): number | undefined {
  const byOwner = byStat?.[statId];
  if (!byOwner) return undefined;
  const legacyFallback = (): number | undefined => {
    for (const [owner, value] of Object.entries(byOwner)) {
      if (owner === GLOBAL_TRACKER_KEY) continue;
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  };
  if (globalScope) {
    const globalValue = byOwner[GLOBAL_TRACKER_KEY];
    if (globalValue !== undefined) return Number(globalValue);
    const ownerValue = resolveTrackerDataLookupValue({
      context: context ?? null,
      data,
      byOwner,
      ownerName,
      explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
    });
    if (ownerValue !== undefined) return Number(ownerValue);
    const fallback = legacyFallback();
    if (fallback !== undefined) return fallback;
  }
  const ownerValue = resolveTrackerDataLookupValue({
    context: context ?? null,
    data,
    byOwner,
    ownerName,
    explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
  });
  if (ownerValue !== undefined) return Number(ownerValue);
  return undefined;
}

function resolveScopedCustomNonNumericValue(
  context: STContext | null | undefined,
  data: TrackerData | null | undefined,
  byStat: CustomNonNumericStatistics | null | undefined,
  statId: string,
  ownerName: string,
  globalScope?: boolean,
): unknown {
  const byOwner = byStat?.[statId];
  if (!byOwner) return undefined;
  const legacyFallback = (): unknown => {
    for (const [owner, value] of Object.entries(byOwner)) {
      if (owner === GLOBAL_TRACKER_KEY) continue;
      if (value !== undefined) return value;
    }
    return undefined;
  };
  if (globalScope) {
    const globalValue = byOwner[GLOBAL_TRACKER_KEY];
    if (globalValue !== undefined) return globalValue;
    const ownerValue = resolveTrackerDataLookupValue({
      context: context ?? null,
      data,
      byOwner,
      ownerName,
      explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
    });
    if (ownerValue !== undefined) return ownerValue;
    const fallback = legacyFallback();
    if (fallback !== undefined) return fallback;
  }
  const ownerValue = resolveTrackerDataLookupValue({
    context: context ?? null,
    data,
    byOwner,
    ownerName,
    explicitEntityIds: resolvePromptExplicitEntityIds(context, data, ownerName),
  });
  if (ownerValue !== undefined) return ownerValue;
  return undefined;
}

export function buildUnifiedPrompt(
  stats: StatKey[],
  userName: string,
  characters: string[],
  contextText: string,
  current: Statistics | null,
  history: TrackerData[] = [],
  maxDeltaPerTurn = 15,
  template?: string,
  protocolTemplate?: string,
  preferredCharacterName?: string,
  includeCharacterCardsInPrompt = true,
  includeLorebookInExtraction = true,
  context?: STContext | null,
  currentData?: TrackerData | null,
): string {
  const systemPrompt = buildExtractionSystemPrompt({ builtInStats: stats });
  const envelope = commonEnvelope(userName, characters);
  const char = resolvePrimaryCharacter(characters, preferredCharacterName);
  const targetGuidance = buildTargetGuidanceBlock(userName, characters, preferredCharacterName);
  const snapshotGuidance = buildSnapshotGuidanceBlock();
  const contextSections = renderPromptContextSections(splitPromptContextSections(contextText), {
    user: userName,
    userName,
    char,
    characters: characters.join(", "),
    contextText,
  });
  const numericStats = stats.filter(stat =>
    stat === "affection" || stat === "trust" || stat === "desire" || stat === "connection",
  );
  const textStats = stats.filter(stat => stat === "mood" || stat === "lastThought");

  const requestedFlags = buildRequestedBuiltInFlags(stats);
  const currentLines = characters.map(name => {
    const chunk = renderBuiltInSnapshotChunk({
      affection: resolveBuiltInNumericValue(context, currentData ?? null, current?.affection, name),
      trust: resolveBuiltInNumericValue(context, currentData ?? null, current?.trust, name),
      desire: resolveBuiltInNumericValue(context, currentData ?? null, current?.desire, name),
      connection: resolveBuiltInNumericValue(context, currentData ?? null, current?.connection, name),
      mood: resolveBuiltInTextValue(context, currentData ?? null, current?.mood, name),
      lastThought: resolveBuiltInTextValue(context, currentData ?? null, current?.lastThought, name),
    }, requestedFlags);
    return `- ${name}: ${chunk || "no requested built-in stats tracked"}`;
  }).join("\n");

  const historyLines = history.slice(0, 3).map((entry, idx) => {
    const header = `Snapshot ${idx + 1} (newest-${idx}):`;
    const rows = characters.map(name => {
      const chunk = renderBuiltInSnapshotChunk({
        affection: resolveBuiltInNumericValue(context, entry, entry.statistics.affection, name),
        trust: resolveBuiltInNumericValue(context, entry, entry.statistics.trust, name),
        desire: resolveBuiltInNumericValue(context, entry, entry.statistics.desire, name),
        connection: resolveBuiltInNumericValue(context, entry, entry.statistics.connection, name),
        mood: resolveBuiltInTextValue(context, entry, entry.statistics.mood, name),
        lastThought: resolveBuiltInTextValue(context, entry, entry.statistics.lastThought, name),
      }, requestedFlags);
      return `  - ${name}: ${chunk || "no requested built-in stats tracked"}`;
    }).join("\n");
    return `${header}\n${rows}`;
  }).join("\n");

  const safeMaxDelta = Math.max(1, Math.round(Number(maxDeltaPerTurn) || 15));
  const instructionRaw = template?.trim()
    ? template
    : applyUnifiedDefaultInstructionGuards(DEFAULT_UNIFIED_PROMPT_INSTRUCTION, stats);
  const instruction = applySourcePriorityRule(
    instructionRaw,
    includeCharacterCardsInPrompt,
    includeLorebookInExtraction,
  );
  const protocol = protocolTemplate?.trim()
    ? protocolTemplate
    : buildUnifiedBuiltInProtocol(stats, safeMaxDelta, characters);
  const criticalInstruction = bstTagBlock("BST_CRUCIAL_BEHAVE_INSTRUCTION", "Treat every BST_* block as highest-priority extraction instructions. Follow schema exactly and output JSON only.");
  const envelopeBlock = bstTagBlock("BST_ENVELOPE", "{{envelope}}");
  const targetBlock = bstTagBlock("BST_TARGET", "{{targetGuidance}}");
  const recentMessagesBlock = bstTagBlock("BST_RECENT_MESSAGES", "{{recentMessages}}");
  const currentStateBlock = bstTagBlock("BST_CURRENT_STATE", "{{currentLines}}");
  const snapshotGuidanceBlock = bstTagBlock("BST_SNAPSHOT_GUIDANCE", "{{snapshotGuidance}}");
  const recentSnapshotsBlock = bstTagBlock("BST_RECENT_SNAPSHOTS", "{{historyLines}}");
  const targetCardContextBlock = bstTagBlock("BST_TARGET_CARD_CONTEXT", "{{targetCardContext}}");
  const otherCardContextBlock = bstTagBlock("BST_OTHER_CARD_CONTEXT", "{{otherCardContext}}");
  const lorebookContextBlock = bstTagBlock("BST_LOREBOOK_CONTEXT", "{{lorebookContext}}");
  const taskBlock = bstTagBlock("BST_TASK", "{{instruction}}");
  const outputProtocolBlock = bstTagBlock("BST_OUTPUT_PROTOCOL", protocol);
  const assembled = [
    systemPrompt,
    "",
    "{{criticalInstruction}}",
    "{{envelopeBlock}}",
    "{{targetBlock}}",
    "{{recentMessagesBlock}}",
    "{{currentStateBlock}}",
    "{{snapshotGuidanceBlock}}",
    "{{recentSnapshotsBlock}}",
    "{{targetCardContextBlock}}",
    "{{otherCardContextBlock}}",
    "{{lorebookContextBlock}}",
    "{{taskBlock}}",
    "",
    "{{outputProtocolBlock}}",
  ].join("\n");
  return renderTemplate(assembled, {
    criticalInstruction,
    envelopeBlock,
    targetBlock,
    recentMessagesBlock,
    currentStateBlock,
    snapshotGuidanceBlock,
    recentSnapshotsBlock,
    targetCardContextBlock,
    otherCardContextBlock,
    lorebookContextBlock,
    taskBlock,
    outputProtocolBlock,
    envelope,
    targetGuidance,
    user: userName,
    userName,
    char,
    characters: characters.join(", "),
    contextText,
    recentMessages: contextSections.recentMessages || "- none",
    targetCardContext: contextSections.targetCardContext || "- none",
    otherCardContext: contextSections.otherCardContext || "- none",
    lorebookContext: contextSections.lorebookContext || "- none",
    currentLines,
    historyLines: historyLines || "- none",
    instruction,
    numericStats: numericStats.length ? numericStats.join(", ") : "none",
    textStats: textStats.length ? textStats.join(", ") : "none",
    maxDelta: String(safeMaxDelta),
    moodOptions: moodOptions.join(", "),
  });
}

export function buildUnifiedAllStatsPrompt(input: {
  context?: STContext | null;
  stats: StatKey[];
  customStats: CustomStatDefinition[];
  userName: string;
  characters: string[];
  contextText: string;
  current: Statistics | null;
  currentData?: TrackerData | null;
  currentCustom?: CustomStatistics | null;
  currentCustomNonNumeric?: CustomNonNumericStatistics | null;
  history: TrackerData[];
  maxDeltaPerTurn?: number;
  template?: string;
  preferredCharacterName?: string;
  includeCharacterCardsInPrompt?: boolean;
  includeLorebookInExtraction?: boolean;
  builtInTracking?: BuiltInTrackingFlags;
  customOnlyMode?: boolean;
}): string {
  const unifiedBuiltInStats = [...input.stats];
  const customOnlyMode = input.customOnlyMode === true || unifiedBuiltInStats.length === 0;
  const systemPrompt = buildExtractionSystemPrompt({ builtInStats: customOnlyMode ? [] : unifiedBuiltInStats });
  const envelope = commonEnvelope(input.userName, input.characters);
  const char = resolvePrimaryCharacter(input.characters, input.preferredCharacterName);
  const targetGuidance = buildTargetGuidanceBlock(input.userName, input.characters, input.preferredCharacterName);
  const snapshotGuidance = buildSnapshotGuidanceBlock();
  const contextSections = renderPromptContextSections(splitPromptContextSections(input.contextText), {
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    contextText: input.contextText,
  });
  const safeMaxDelta = Math.max(1, Math.round(Number(input.maxDeltaPerTurn) || 15));
  const instructionRaw = input.template?.trim()
    ? input.template
    : applyUnifiedDefaultInstructionGuards(DEFAULT_UNIFIED_PROMPT_INSTRUCTION, unifiedBuiltInStats);
  const instruction = applySourcePriorityRule(
    instructionRaw,
    Boolean(input.includeCharacterCardsInPrompt),
    Boolean(input.includeLorebookInExtraction),
  );
  const builtInNumeric = input.stats.filter(stat =>
    stat === "affection" || stat === "trust" || stat === "desire" || stat === "connection",
  );
  const builtInText = input.stats.filter(stat => stat === "mood" || stat === "lastThought");
  const customNumeric = input.customStats.filter(stat => (stat.kind ?? "numeric") === "numeric");
  const customNonNumeric = input.customStats.filter(stat => (stat.kind ?? "numeric") !== "numeric");
  const numericDeltaKeys = [...builtInNumeric, ...customNumeric.map(stat => stat.id)];

  const requestedBuiltInFlags = mergeBuiltInTrackingFlags(
    buildRequestedBuiltInFlags(unifiedBuiltInStats),
    input.builtInTracking,
  );
  const customStatMeanings = renderCustomStatMeaningsBlock(input.customStats);
  const currentLines = input.characters.map(name => {
    const chunks: string[] = [];
    const builtInChunk = renderBuiltInSnapshotChunk({
      affection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.affection, name),
      trust: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.trust, name),
      desire: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.desire, name),
      connection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.connection, name),
      mood: resolveBuiltInTextValue(input.context, input.currentData ?? null, input.current?.mood, name),
      lastThought: resolveBuiltInTextValue(input.context, input.currentData ?? null, input.current?.lastThought, name),
    }, requestedBuiltInFlags);
    if (builtInChunk) chunks.push(builtInChunk);
    for (const stat of customNumeric) {
      const customRaw = Number(resolveScopedCustomNumericValue(input.context, input.currentData ?? null, input.currentCustom, stat.id, name, stat.globalScope) ?? stat.defaultValue);
      const customValue = Math.max(0, Math.min(100, Math.round(customRaw)));
      chunks.push(`${stat.id}=${customValue}`);
    }
    for (const stat of customNonNumeric) {
      const kind = stat.kind ?? "text_short";
      const fallback = kind === "boolean"
        ? (typeof stat.defaultValue === "boolean" ? stat.defaultValue : false)
        : kind === "array"
          ? (Array.isArray(stat.defaultValue) ? stat.defaultValue : [])
          : String(stat.defaultValue ?? "");
      const customRaw = resolveScopedCustomNonNumericValue(input.context, input.currentData ?? null, input.currentCustomNonNumeric ?? undefined, stat.id, name, stat.globalScope);
      const customValue = formatCustomNonNumericValue(
        kind,
        customRaw,
        fallback,
        Math.max(20, Math.min(200, Math.round(Number(stat.textMaxLength) || 120))),
        { preserveExplicitEmpty: true },
      );
      const literal = customNonNumericLiteral(customValue);
      chunks.push(`${stat.id}=${literal}`);
    }
    return `- ${name}: ${chunks.join(", ")}`;
  }).join("\n");

  const historyLines = input.history.slice(0, 3).map((entry, idx) => {
    const header = `Snapshot ${idx + 1} (newest-${idx}):`;
    const rows = input.characters.map(name => {
      const chunks: string[] = [];
      const builtInChunk = renderBuiltInSnapshotChunk({
        affection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.affection, name),
        trust: resolveBuiltInNumericValue(input.context, entry, entry.statistics.trust, name),
        desire: resolveBuiltInNumericValue(input.context, entry, entry.statistics.desire, name),
        connection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.connection, name),
        mood: resolveBuiltInTextValue(input.context, entry, entry.statistics.mood, name),
        lastThought: resolveBuiltInTextValue(input.context, entry, entry.statistics.lastThought, name),
      }, requestedBuiltInFlags);
      if (builtInChunk) chunks.push(builtInChunk);
      for (const stat of customNumeric) {
        const customRaw = Number(resolveScopedCustomNumericValue(input.context, entry, entry.customStatistics ?? undefined, stat.id, name, stat.globalScope) ?? stat.defaultValue);
        const customValue = Math.max(0, Math.min(100, Math.round(customRaw)));
        chunks.push(`${stat.id}=${customValue}`);
      }
      for (const stat of customNonNumeric) {
        const kind = stat.kind ?? "text_short";
        const fallback = kind === "boolean"
          ? (typeof stat.defaultValue === "boolean" ? stat.defaultValue : false)
          : kind === "array"
            ? (Array.isArray(stat.defaultValue) ? stat.defaultValue : [])
            : String(stat.defaultValue ?? "");
        const customRaw = resolveScopedCustomNonNumericValue(input.context, entry, entry.customNonNumericStatistics ?? undefined, stat.id, name, stat.globalScope);
        const customValue = formatCustomNonNumericValue(
          kind,
          customRaw,
          fallback,
          Math.max(20, Math.min(200, Math.round(Number(stat.textMaxLength) || 120))),
          { preserveExplicitEmpty: true },
        );
        const literal = customNonNumericLiteral(customValue);
        chunks.push(`${stat.id}=${literal}`);
      }
      return `  - ${name}: ${chunks.join(", ")}`;
    }).join("\n");
    return `${header}\n${rows}`;
  }).join("\n");

  const deltaSample = numericDeltaKeys.length
    ? numericDeltaKeys.map(key => `        "${key}": 0`).join(",\n")
    : "        ";
  const valueSample = customNonNumeric.length
    ? customNonNumeric.map(stat => {
      const kind = stat.kind ?? "text_short";
      if (kind === "boolean") return `        "${stat.id}": false`;
      if (kind === "array") return `        "${stat.id}": []`;
      if (kind === "date_time") return `        "${stat.id}": "2026-03-03 20:15"`;
      return `        "${stat.id}": ""`;
    }).join(",\n")
    : "";

  const nonNumericRules = customNonNumeric.map(stat => {
    const kind = stat.kind ?? "text_short";
    if (kind === "enum_single") {
      const options = Array.isArray(stat.enumOptions)
        ? stat.enumOptions.map(item => String(item ?? "").trim()).filter(Boolean)
        : [];
      return `- ${stat.id} (enum_single): one of [${options.join(", ") || "none"}].`;
    }
    if (kind === "boolean") {
      const trueLabel = String(stat.booleanTrueLabel ?? "enabled").trim() || "enabled";
      const falseLabel = String(stat.booleanFalseLabel ?? "disabled").trim() || "disabled";
      return `- ${stat.id} (boolean): strict true/false (true=${trueLabel}, false=${falseLabel}).`;
    }
    if (kind === "array") {
      const textMaxLen = Math.max(20, Math.min(200, Math.round(Number(stat.textMaxLength) || 120)));
      return `- ${stat.id} (array): JSON array of 0..${MAX_CUSTOM_ARRAY_ITEMS} short strings; each item max ${textMaxLen} chars; prefer item-level add/remove/edit over full-list rewrites.`;
    }
    if (kind === "date_time") {
      const mode = stat.dateTimeMode === "structured" ? "structured" : "timestamp";
      return mode === "structured"
        ? `- ${stat.id} (date_time, structured): prefer semantic update object (absolute/delta/phase), then normalize to YYYY-MM-DD HH:mm (24h); keep progression conservative and avoid backward jumps unless explicit rewind cues.`
        : `- ${stat.id} (date_time, timestamp): strict format YYYY-MM-DD HH:mm (24h); keep progression conservative and consistent with recent context.`;
    }
    const textMaxLen = Math.max(20, Math.min(200, Math.round(Number(stat.textMaxLength) || 120)));
    return `- ${stat.id} (text_short): one concise single-line text, max ${textMaxLen} chars.`;
  }).join("\n");

  const protocol = [
    `${customOnlyMode ? "Custom numeric delta stats to update" : "Numeric delta stats to update"} (${numericDeltaKeys.length ? numericDeltaKeys.join(", ") : "none"}):`,
    `- Return integer deltas only, each in range -${safeMaxDelta}..${safeMaxDelta}.`,
    "",
    ...(customOnlyMode
      ? []
      : [
          `Text stats to update (${builtInText.length ? builtInText.join(", ") : "none"}):`,
          `- mood must be one of: ${moodOptions.join(", ")}.`,
          "- lastThought must be the character's current immediate internal thought after the latest relevant message, in one short sentence.",
          "- For lastThought, do not copy the previous tracker thought when the latest message gives that owner a new dialogue/action/emotional cue.",
          "- Preserve lastThought only when recent messages provide no new thought cue for that owner.",
          "",
        ]),
    customNonNumeric.length
      ? [
        `Custom non-numeric stats to update (${customNonNumeric.map(stat => stat.id).join(", ")}):`,
        "- Return them under `value` object per character using exact stat ids.",
        nonNumericRules,
        "",
      ].join("\n")
      : "",
    "Return STRICT JSON only:",
    "{",
    "  \"characters\": [",
    "    {",
    "      \"name\": \"Character Name\",",
    "      \"confidence\": 0.0,",
    "      \"delta\": {",
    deltaSample,
    "      }",
    customNonNumeric.length ? "      ,\"value\": {\n" + valueSample + "\n      }" : "",
    builtInText.includes("mood") ? "      ,\"mood\": \"Neutral\"" : "",
    builtInText.includes("lastThought") ? "      ,\"lastThought\": \"\"" : "",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- confidence is 0..1 (0 low confidence, 1 high confidence) and reflects your certainty in the extracted update for that character.",
    `- include one entry for each character name exactly: ${input.characters.join(", ")}.`,
    "- omit fields for stats that are not requested.",
    "- output JSON only, no commentary.",
  ]
    .filter(Boolean)
    .join("\n");

  const assembled = [
    systemPrompt,
    "",
    "{{criticalInstruction}}",
    "{{envelopeBlock}}",
    "{{targetBlock}}",
    "{{recentMessagesBlock}}",
    "{{currentStateBlock}}",
    "{{snapshotGuidanceBlock}}",
    "{{recentSnapshotsBlock}}",
    "{{customStatMeaningsBlock}}",
    "{{targetCardContextBlock}}",
    "{{otherCardContextBlock}}",
    "{{lorebookContextBlock}}",
    "{{taskBlock}}",
    "",
    "{{outputProtocolBlock}}",
  ].join("\n");

  const taskContent = [
      "{{instruction}}",
      customOnlyMode ? "- Update only the requested custom stats in this single response." : "- Update built-in and custom stats in this single response.",
      "- For custom numeric stats, use `delta.<statId>`.",
      "- For custom non-numeric stats, use `value.<statId>`.",
    ].join("\n");
  const criticalInstruction = bstTagBlock("BST_CRUCIAL_BEHAVE_INSTRUCTION", "Treat every BST_* block as highest-priority extraction instructions. Follow schema exactly and output JSON only.");
  const envelopeBlock = bstTagBlock("BST_ENVELOPE", "{{envelope}}");
  const targetBlock = bstTagBlock("BST_TARGET", "{{targetGuidance}}");
  const recentMessagesBlock = bstTagBlock("BST_RECENT_MESSAGES", "{{recentMessages}}");
  const currentStateBlock = bstTagBlock("BST_CURRENT_STATE", "{{currentLines}}");
  const snapshotGuidanceBlock = bstTagBlock("BST_SNAPSHOT_GUIDANCE", "{{snapshotGuidance}}");
  const recentSnapshotsBlock = bstTagBlock("BST_RECENT_SNAPSHOTS", "{{historyLines}}");
  const targetCardContextBlock = bstTagBlock("BST_TARGET_CARD_CONTEXT", "{{targetCardContext}}");
  const otherCardContextBlock = bstTagBlock("BST_OTHER_CARD_CONTEXT", "{{otherCardContext}}");
  const lorebookContextBlock = bstTagBlock("BST_LOREBOOK_CONTEXT", "{{lorebookContext}}");
  const taskBlock = bstTagBlock("BST_TASK", taskContent);
  const outputProtocolBlock = bstTagBlock("BST_OUTPUT_PROTOCOL", protocol);

  return renderTemplate(assembled, {
    criticalInstruction,
    envelopeBlock,
    targetBlock,
    recentMessagesBlock,
    currentStateBlock,
    snapshotGuidanceBlock,
    recentSnapshotsBlock,
    customStatMeaningsBlock: bstTagBlock("BST_CUSTOM_STAT_MEANINGS", "{{customStatMeanings}}"),
    targetCardContextBlock,
    otherCardContextBlock,
    lorebookContextBlock,
    taskBlock,
    outputProtocolBlock,
    envelope,
    targetGuidance,
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    contextText: input.contextText,
    recentMessages: contextSections.recentMessages || "- none",
    targetCardContext: contextSections.targetCardContext || "- none",
    otherCardContext: contextSections.otherCardContext || "- none",
    lorebookContext: contextSections.lorebookContext || "- none",
    customStatMeanings,
    currentLines,
    snapshotGuidance,
    historyLines: historyLines || "- none",
    instruction,
  });
}

export function buildSequentialPrompt(
  stat: StatKey,
  userName: string,
  characters: string[],
  contextText: string,
  current: Statistics | null,
  history: TrackerData[] = [],
  maxDeltaPerTurn = 15,
  template?: string,
  protocolTemplate?: string,
  preferredCharacterName?: string,
  includeCharacterCardsInPrompt = true,
  includeLorebookInExtraction = true,
  builtInTracking?: BuiltInTrackingFlags,
  context?: STContext | null,
  currentData?: TrackerData | null,
): string {
  const systemPrompt = buildExtractionSystemPrompt({ builtInStats: [stat] });
  const envelope = commonEnvelope(userName, characters);
  const char = resolvePrimaryCharacter(characters, preferredCharacterName);
  const targetGuidance = buildTargetGuidanceBlock(userName, characters, preferredCharacterName);
  const snapshotGuidance = buildSnapshotGuidanceBlock();
  const contextSections = renderPromptContextSections(splitPromptContextSections(contextText), {
    user: userName,
    userName,
    char,
    characters: characters.join(", "),
    contextText,
  });
  const numericStats = stat === "affection" || stat === "trust" || stat === "desire" || stat === "connection"
    ? [stat]
    : [];
  const textStats = stat === "mood" || stat === "lastThought" ? [stat] : [];

  const currentLines = characters.map(name => {
    const chunk = renderBuiltInSnapshotChunk({
      affection: resolveBuiltInNumericValue(context, currentData ?? null, current?.affection, name),
      trust: resolveBuiltInNumericValue(context, currentData ?? null, current?.trust, name),
      desire: resolveBuiltInNumericValue(context, currentData ?? null, current?.desire, name),
      connection: resolveBuiltInNumericValue(context, currentData ?? null, current?.connection, name),
      mood: resolveBuiltInTextValue(context, currentData ?? null, current?.mood, name),
      lastThought: resolveBuiltInTextValue(context, currentData ?? null, current?.lastThought, name),
    }, builtInTracking);
    return `- ${name}: ${chunk || "no built-in stats tracked"}`;
  }).join("\n");

  const historyLines = history.slice(0, 3).map((entry, idx) => {
    const header = `Snapshot ${idx + 1} (newest-${idx}):`;
    const rows = characters.map(name => {
      const chunk = renderBuiltInSnapshotChunk({
        affection: resolveBuiltInNumericValue(context, entry, entry.statistics.affection, name),
        trust: resolveBuiltInNumericValue(context, entry, entry.statistics.trust, name),
        desire: resolveBuiltInNumericValue(context, entry, entry.statistics.desire, name),
        connection: resolveBuiltInNumericValue(context, entry, entry.statistics.connection, name),
        mood: resolveBuiltInTextValue(context, entry, entry.statistics.mood, name),
        lastThought: resolveBuiltInTextValue(context, entry, entry.statistics.lastThought, name),
      }, builtInTracking);
      return `  - ${name}: ${chunk || "no built-in stats tracked"}`;
    }).join("\n");
    return `${header}\n${rows}`;
  }).join("\n");

  const safeMaxDelta = Math.max(1, Math.round(Number(maxDeltaPerTurn) || 15));
  const instructionRaw = template?.trim()
    ? template
    : DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS[stat] || DEFAULT_UNIFIED_PROMPT_INSTRUCTION;
  const instruction = applySourcePriorityRule(
    instructionRaw,
    includeCharacterCardsInPrompt,
    includeLorebookInExtraction,
  );
  const defaultProtocol = stat === "mood"
    ? MOOD_PROMPT_PROTOCOL
    : stat === "lastThought"
      ? LAST_THOUGHT_PROMPT_PROTOCOL
      : NUMERIC_PROMPT_PROTOCOL(stat);
  const protocol = protocolTemplate?.trim() ? protocolTemplate : defaultProtocol;
  const criticalInstruction = bstTagBlock("BST_CRUCIAL_BEHAVE_INSTRUCTION", "Treat every BST_* block as highest-priority extraction instructions. Follow schema exactly and output JSON only.");
  const envelopeBlock = bstTagBlock("BST_ENVELOPE", "{{envelope}}");
  const targetBlock = bstTagBlock("BST_TARGET", "{{targetGuidance}}");
  const recentMessagesBlock = bstTagBlock("BST_RECENT_MESSAGES", "{{recentMessages}}");
  const currentStateBlock = bstTagBlock("BST_CURRENT_STATE", "{{currentLines}}");
  const snapshotGuidanceBlock = bstTagBlock("BST_SNAPSHOT_GUIDANCE", "{{snapshotGuidance}}");
  const recentSnapshotsBlock = bstTagBlock("BST_RECENT_SNAPSHOTS", "{{historyLines}}");
  const targetCardContextBlock = bstTagBlock("BST_TARGET_CARD_CONTEXT", "{{targetCardContext}}");
  const otherCardContextBlock = bstTagBlock("BST_OTHER_CARD_CONTEXT", "{{otherCardContext}}");
  const lorebookContextBlock = bstTagBlock("BST_LOREBOOK_CONTEXT", "{{lorebookContext}}");
  const taskBlock = bstTagBlock("BST_TASK", "{{instruction}}");
  const outputProtocolBlock = bstTagBlock("BST_OUTPUT_PROTOCOL", protocol);
  const assembled = [
    systemPrompt,
    "",
    "{{criticalInstruction}}",
    "{{envelopeBlock}}",
    "{{targetBlock}}",
    "{{recentMessagesBlock}}",
    "{{currentStateBlock}}",
    "{{snapshotGuidanceBlock}}",
    "{{recentSnapshotsBlock}}",
    "{{targetCardContextBlock}}",
    "{{otherCardContextBlock}}",
    "{{lorebookContextBlock}}",
    "{{taskBlock}}",
    "",
    "{{outputProtocolBlock}}",
  ].join("\n");
  return renderTemplate(assembled, {
    criticalInstruction,
    envelopeBlock,
    targetBlock,
    recentMessagesBlock,
    currentStateBlock,
    snapshotGuidanceBlock,
    recentSnapshotsBlock,
    targetCardContextBlock,
    otherCardContextBlock,
    lorebookContextBlock,
    taskBlock,
    outputProtocolBlock,
    envelope,
    targetGuidance,
    user: userName,
    userName,
    char,
    characters: characters.join(", "),
    contextText,
    recentMessages: contextSections.recentMessages || "- none",
    targetCardContext: contextSections.targetCardContext || "- none",
    otherCardContext: contextSections.otherCardContext || "- none",
    lorebookContext: contextSections.lorebookContext || "- none",
    currentLines,
    snapshotGuidance,
    historyLines: historyLines || "- none",
    instruction,
    numericStats: numericStats.length ? numericStats.join(", ") : "none",
    textStats: textStats.length ? textStats.join(", ") : "none",
    maxDelta: String(safeMaxDelta),
    moodOptions: moodOptions.join(", "),
  });
}

export function buildSequentialCustomNumericPrompt(input: {
  context?: STContext | null;
  statId: string;
  statLabel: string;
  statDescription?: string;
  statDefault: number;
  maxDeltaPerTurn: number;
  userName: string;
  characters: string[];
  contextText: string;
  current: Statistics | null;
  currentData?: TrackerData | null;
  currentCustom?: Record<string, Record<string, number>> | null;
  history: TrackerData[];
  template?: string;
  protocolTemplate?: string;
  preferredCharacterName?: string;
  includeCharacterCardsInPrompt?: boolean;
  includeLorebookInExtraction?: boolean;
  builtInTracking?: BuiltInTrackingFlags;
}): string {
  const systemPrompt = buildExtractionSystemPrompt({ builtInStats: [] });
  const statId = input.statId.trim();
  const statLabel = input.statLabel.trim() || statId;
  const statDescription = String(input.statDescription ?? "").trim();
  const defaultValue = normalizeCustomNumericDefaultValue(input.statDefault);
  const envelope = commonEnvelope(input.userName, input.characters);
  const char = resolvePrimaryCharacter(input.characters, input.preferredCharacterName);
  const targetGuidance = buildTargetGuidanceBlock(input.userName, input.characters, input.preferredCharacterName);
  const snapshotGuidance = buildSnapshotGuidanceBlock();
  const contextSections = renderPromptContextSections(splitPromptContextSections(input.contextText), {
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    contextText: input.contextText,
  });
  const safeMaxDelta = Math.max(1, Math.round(Number(input.maxDeltaPerTurn) || 15));
  const customStatMeaning = renderSingleCustomStatMeaningBlock({
    statId,
    statLabel,
    statDescription,
    statKind: "numeric",
  });

  const currentLines = input.characters.map(name => {
    const builtInChunk = renderBuiltInSnapshotChunk({
      affection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.affection, name),
      trust: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.trust, name),
      desire: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.desire, name),
      connection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.connection, name),
      mood: resolveBuiltInTextValue(input.context, input.currentData ?? null, input.current?.mood, name),
    }, input.builtInTracking);
    const customValueRaw = Number(resolveScopedCustomNumericValue(input.context, input.currentData ?? null, input.currentCustom, statId, name, false) ?? defaultValue);
    const customValue = Math.max(0, Math.min(100, Math.round(customValueRaw)));
    const chunks = [builtInChunk, `${statId}=${customValue}`].filter(Boolean).join(", ");
    return `- ${name}: ${chunks}`;
  }).join("\n");

  const historyLines = input.history.slice(0, 3).map((entry, idx) => {
    const header = `Snapshot ${idx + 1} (newest-${idx}):`;
    const rows = input.characters.map(name => {
      const builtInChunk = renderBuiltInSnapshotChunk({
        affection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.affection, name),
        trust: resolveBuiltInNumericValue(input.context, entry, entry.statistics.trust, name),
        desire: resolveBuiltInNumericValue(input.context, entry, entry.statistics.desire, name),
        connection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.connection, name),
        mood: resolveBuiltInTextValue(input.context, entry, entry.statistics.mood, name),
      }, input.builtInTracking);
      const customValueRaw = Number(resolveScopedCustomNumericValue(input.context, entry, entry.customStatistics ?? undefined, statId, name, false) ?? defaultValue);
      const customValue = Math.max(0, Math.min(100, Math.round(customValueRaw)));
      const chunks = [builtInChunk, `${statId}=${customValue}`].filter(Boolean).join(", ");
      return `  - ${name}: ${chunks}`;
    }).join("\n");
    return `${header}\n${rows}`;
  }).join("\n");

  const instructionTemplate = input.template?.trim() || DEFAULT_SEQUENTIAL_CUSTOM_NUMERIC_PROMPT_INSTRUCTION;
  const instructionRendered = renderTemplate(instructionTemplate, {
    statId,
    statLabel,
    statDescription,
    statDefault: String(defaultValue),
    maxDelta: String(safeMaxDelta),
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    envelope,
    contextText: input.contextText,
  });
  const instruction = applySourcePriorityRule(
    instructionRendered,
    Boolean(input.includeCharacterCardsInPrompt),
    Boolean(input.includeLorebookInExtraction),
  );

  const protocol = input.protocolTemplate?.trim()
    ? renderTemplate(input.protocolTemplate.trim(), {
        statId,
        statLabel,
        statDescription,
        statDefault: String(defaultValue),
        maxDelta: String(safeMaxDelta),
        characters: input.characters.join(", "),
      })
    : NUMERIC_PROMPT_PROTOCOL(statId);
  const criticalInstruction = bstTagBlock("BST_CRUCIAL_BEHAVE_INSTRUCTION", "Treat every BST_* block as highest-priority extraction instructions. Follow schema exactly and output JSON only.");
  const envelopeBlock = bstTagBlock("BST_ENVELOPE", "{{envelope}}");
  const targetBlock = bstTagBlock("BST_TARGET", "{{targetGuidance}}");
  const recentMessagesBlock = bstTagBlock("BST_RECENT_MESSAGES", "{{recentMessages}}");
  const currentStateBlock = bstTagBlock("BST_CURRENT_STATE", "{{currentLines}}");
  const snapshotGuidanceBlock = bstTagBlock("BST_SNAPSHOT_GUIDANCE", "{{snapshotGuidance}}");
  const recentSnapshotsBlock = bstTagBlock("BST_RECENT_SNAPSHOTS", "{{historyLines}}");
  const customStatMeaningBlock = bstTagBlock("BST_CUSTOM_STAT_MEANING", "{{customStatMeaning}}");
  const targetCardContextBlock = bstTagBlock("BST_TARGET_CARD_CONTEXT", "{{targetCardContext}}");
  const otherCardContextBlock = bstTagBlock("BST_OTHER_CARD_CONTEXT", "{{otherCardContext}}");
  const lorebookContextBlock = bstTagBlock("BST_LOREBOOK_CONTEXT", "{{lorebookContext}}");
  const taskBlock = bstTagBlock("BST_TASK", "{{instruction}}");
  const outputProtocolBlock = bstTagBlock("BST_OUTPUT_PROTOCOL", protocol);
  const assembled = [
    systemPrompt,
    "",
    "{{criticalInstruction}}",
    "{{envelopeBlock}}",
    "{{targetBlock}}",
    "{{recentMessagesBlock}}",
    "{{currentStateBlock}}",
    "{{snapshotGuidanceBlock}}",
    "{{recentSnapshotsBlock}}",
    "{{customStatMeaningBlock}}",
    "{{targetCardContextBlock}}",
    "{{otherCardContextBlock}}",
    "{{lorebookContextBlock}}",
    "{{taskBlock}}",
    "",
    "{{outputProtocolBlock}}",
  ].join("\n");

  return renderTemplate(assembled, {
    criticalInstruction,
    envelopeBlock,
    targetBlock,
    recentMessagesBlock,
    currentStateBlock,
    snapshotGuidanceBlock,
    recentSnapshotsBlock,
    customStatMeaningBlock,
    targetCardContextBlock,
    otherCardContextBlock,
    lorebookContextBlock,
    taskBlock,
    outputProtocolBlock,
    envelope,
    targetGuidance,
    user: input.userName,
    userName: input.userName,
    char,
    recentMessages: contextSections.recentMessages || "- none",
    targetCardContext: contextSections.targetCardContext || "- none",
    otherCardContext: contextSections.otherCardContext || "- none",
    lorebookContext: contextSections.lorebookContext || "- none",
    customStatMeaning,
    currentLines,
    snapshotGuidance,
    historyLines: historyLines || "- none",
    instruction,
    maxDelta: String(safeMaxDelta),
    characters: input.characters.join(", "),
  });
}

function customNonNumericLiteral(value: string | boolean | string[]): string {
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return `"${String(value)}"`;
}

function formatCustomNonNumericValue(
  kind: CustomStatKind,
  value: unknown,
  fallback: string | boolean | string[],
  textMaxLen = 120,
  options?: {
    preserveExplicitEmpty?: boolean;
  },
): string | boolean | string[] {
  const preserveExplicitEmpty = options?.preserveExplicitEmpty === true;
  if (kind === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const cleaned = value.trim().toLowerCase();
      if (cleaned === "true") return true;
      if (cleaned === "false") return false;
    }
    return Boolean(fallback);
  }

  if (kind === "array") {
    if (preserveExplicitEmpty && Array.isArray(value) && value.length === 0) return [];
    const items = normalizeNonNumericArrayItems(value, textMaxLen);
    if (items.length) return items;
    const fallbackItems = normalizeNonNumericArrayItems(fallback, textMaxLen);
    return fallbackItems;
  }

  if (kind === "date_time") {
    const normalized = normalizeDateTimeValue(value);
    if (normalized) return normalized;
    if (typeof fallback === "string") {
      const fallbackNormalized = normalizeDateTimeValue(fallback);
      if (fallbackNormalized) return fallbackNormalized;
    }
    return "";
  }

  const text = typeof value === "string" ? value.trim() : "";
  if (preserveExplicitEmpty && typeof value === "string" && !text) return "";
  if (text) return text;
  return typeof fallback === "string" ? fallback : "";
}

function getCustomNonNumericProtocolValues(input: {
  kind: CustomStatKind;
  statId: string;
  allowedValues: string[];
  textMaxLen: number;
  arrayMaxItems: number;
  dateTimeMode?: "timestamp" | "structured";
  trueLabel: string;
  falseLabel: string;
}): { valueSchemaRules: string; valueSchemaSample: string } {
  if (input.kind === "enum_single") {
    const fallback = JSON.stringify(input.allowedValues[0] ?? "state");
    return {
      valueSchemaRules: `- Return one of allowed values exactly: ${input.allowedValues.join(", ")}.`,
      valueSchemaSample: fallback,
    };
  }

  if (input.kind === "boolean") {
    return {
      valueSchemaRules: [
        `- Return strict boolean only for ${input.statId} (true/false).`,
        `- true means: ${input.trueLabel}.`,
        `- false means: ${input.falseLabel}.`,
      ].join("\n"),
      valueSchemaSample: "false",
    };
  }

  if (input.kind === "array") {
    return {
      valueSchemaRules: [
        `- Return a JSON array of strings for ${input.statId}.`,
        `- Array length must be between 0 and ${input.arrayMaxItems}.`,
        `- Each item must be concise and no longer than ${input.textMaxLen} characters.`,
        "- Prefer item-level maintenance (add/remove/edit) over full-list rewrites unless the scene clearly resets the list.",
      ].join("\n"),
      valueSchemaSample: "[\"item one\", \"item two\"]",
    };
  }

  if (input.kind === "date_time") {
    const mode = input.dateTimeMode === "structured" ? "structured" : "timestamp";
    return {
      valueSchemaRules: [
        mode === "structured"
          ? `- Return structured datetime intent for ${input.statId} (absolute and/or delta fields), BST normalizes it to YYYY-MM-DD HH:mm (24h).`
          : `- Return one datetime string for ${input.statId} in exact format YYYY-MM-DD HH:mm (24h).`,
        "- Keep progression conservative and scene-consistent; do not jump backward unless context explicitly rewinds time.",
      ].join("\n"),
      valueSchemaSample: mode === "structured"
        ? "{\"absolute\":\"2026-03-03 20:15\",\"delta_minutes\":5,\"ofDay\":\"Evening\"}"
        : "\"2026-03-03 20:15\"",
    };
  }

  return {
    valueSchemaRules: [
      `- Return one concise single-line text value for ${input.statId}.`,
      `- Maximum length: ${input.textMaxLen} characters.`,
    ].join("\n"),
    valueSchemaSample: "\"\"",
  };
}

function customNonNumericProtocol(input: {
  kind: CustomStatKind;
  statId: string;
  allowedValues: string[];
  textMaxLen: number;
  arrayMaxItems: number;
  dateTimeMode?: "timestamp" | "structured";
  trueLabel: string;
  falseLabel: string;
  template?: string;
}): string {
  const values = getCustomNonNumericProtocolValues(input);
  const protocolTemplate = input.template?.trim() || DEFAULT_CUSTOM_NON_NUMERIC_PROTOCOL_TEMPLATE;
  return renderTemplate(protocolTemplate, {
    statId: input.statId,
    valueSchemaRules: values.valueSchemaRules,
    valueSchemaSample: values.valueSchemaSample,
    allowedValues: input.allowedValues.join(", "),
    textMaxLen: String(input.textMaxLen),
    arrayMaxItems: String(input.arrayMaxItems),
    dateTimeMode: input.dateTimeMode === "structured" ? "structured" : "timestamp",
    booleanTrueLabel: input.trueLabel,
    booleanFalseLabel: input.falseLabel,
  });
}

export function buildSequentialCustomNonNumericPrompt(input: {
  context?: STContext | null;
  statId: string;
  statKind: Exclude<CustomStatKind, "numeric">;
  globalScope?: boolean;
  statLabel: string;
  statDescription?: string;
  statDefault: string | boolean | string[];
  enumOptions?: string[];
  textMaxLength?: number;
  dateTimeMode?: "timestamp" | "structured";
  booleanTrueLabel?: string;
  booleanFalseLabel?: string;
  userName: string;
  characters: string[];
  contextText: string;
  current: Statistics | null;
  currentData?: TrackerData | null;
  currentCustomNonNumeric?: CustomNonNumericStatistics | null;
  history: TrackerData[];
  template?: string;
  protocolTemplate?: string;
  preferredCharacterName?: string;
  includeCharacterCardsInPrompt?: boolean;
  includeLorebookInExtraction?: boolean;
  builtInTracking?: BuiltInTrackingFlags;
}): string {
  const systemPrompt = buildExtractionSystemPrompt({ builtInStats: [] });
  const statId = input.statId.trim();
  const statLabel = input.statLabel.trim() || statId;
  const statDescription = String(input.statDescription ?? "").trim();
  const statKind = input.statKind;
  const enumOptions = Array.isArray(input.enumOptions)
    ? input.enumOptions.map(item => String(item ?? "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_ENUM_OPTIONS)
    : [];
  const textMaxLen = Math.max(20, Math.min(200, Math.round(Number(input.textMaxLength) || 120)));
  const dateTimeMode = input.dateTimeMode === "structured" ? "structured" : "timestamp";
  const trueLabel = String(input.booleanTrueLabel ?? "enabled").trim() || "enabled";
  const falseLabel = String(input.booleanFalseLabel ?? "disabled").trim() || "disabled";
  const envelope = commonEnvelope(input.userName, input.characters);
  const char = resolvePrimaryCharacter(input.characters, input.preferredCharacterName);
  const targetGuidance = buildTargetGuidanceBlock(input.userName, input.characters, input.preferredCharacterName);
  const snapshotGuidance = buildSnapshotGuidanceBlock();
  const contextSections = renderPromptContextSections(splitPromptContextSections(input.contextText), {
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    contextText: input.contextText,
  });

  const defaultFallback = statKind === "boolean"
    ? false
    : statKind === "array"
      ? []
      : "";
  const defaultValue = formatCustomNonNumericValue(statKind, input.statDefault, defaultFallback);
  const defaultLiteral = customNonNumericLiteral(defaultValue);
  const allowedValuesLiteral = enumOptions.join(", ");
  const valueSchema = statKind === "enum_single"
    ? "enum"
    : statKind === "boolean"
      ? "boolean"
      : statKind === "array"
        ? `array<=${MAX_CUSTOM_ARRAY_ITEMS}(item<=${textMaxLen})`
        : statKind === "date_time"
          ? (dateTimeMode === "structured" ? "datetime-structured=>YYYY-MM-DD HH:mm" : "datetime(YYYY-MM-DD HH:mm)")
          : `text<=${textMaxLen}`;
  const customStatMeaning = renderSingleCustomStatMeaningBlock({
    statId,
    statLabel,
    statDescription,
    statKind,
    globalScope: input.globalScope,
  });

  const currentLines = input.characters.map(name => {
    const builtInChunk = renderBuiltInSnapshotChunk({
      affection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.affection, name),
      trust: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.trust, name),
      desire: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.desire, name),
      connection: resolveBuiltInNumericValue(input.context, input.currentData ?? null, input.current?.connection, name),
      mood: resolveBuiltInTextValue(input.context, input.currentData ?? null, input.current?.mood, name),
    }, input.builtInTracking);
    const customRaw = resolveScopedCustomNonNumericValue(
      input.context,
      input.currentData ?? null,
      input.currentCustomNonNumeric ?? undefined,
      statId,
      name,
      input.globalScope,
    );
    const customValue = formatCustomNonNumericValue(statKind, customRaw, defaultValue, textMaxLen, {
      preserveExplicitEmpty: true,
    });
    const customLiteral = customNonNumericLiteral(customValue);
    const chunks = [builtInChunk, `${statId}=${customLiteral}`].filter(Boolean).join(", ");
    return `- ${name}: ${chunks}`;
  }).join("\n");

  const historyLines = input.history.slice(0, 3).map((entry, idx) => {
    const header = `Snapshot ${idx + 1} (newest-${idx}):`;
    const rows = input.characters.map(name => {
      const builtInChunk = renderBuiltInSnapshotChunk({
        affection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.affection, name),
        trust: resolveBuiltInNumericValue(input.context, entry, entry.statistics.trust, name),
        desire: resolveBuiltInNumericValue(input.context, entry, entry.statistics.desire, name),
        connection: resolveBuiltInNumericValue(input.context, entry, entry.statistics.connection, name),
        mood: resolveBuiltInTextValue(input.context, entry, entry.statistics.mood, name),
      }, input.builtInTracking);
      const customRaw = resolveScopedCustomNonNumericValue(
        input.context,
        entry,
        entry.customNonNumericStatistics ?? undefined,
        statId,
        name,
        input.globalScope,
      );
      const customValue = formatCustomNonNumericValue(statKind, customRaw, defaultValue, textMaxLen, {
        preserveExplicitEmpty: true,
      });
      const customLiteral = customNonNumericLiteral(customValue);
      const chunks = [builtInChunk, `${statId}=${customLiteral}`].filter(Boolean).join(", ");
      return `  - ${name}: ${chunks}`;
    }).join("\n");
    return `${header}\n${rows}`;
  }).join("\n");

  const instructionTemplate = input.template?.trim() || DEFAULT_SEQUENTIAL_CUSTOM_NON_NUMERIC_PROMPT_INSTRUCTION;
  const instructionRendered = renderTemplate(instructionTemplate, {
    statId,
    statLabel,
    statDescription,
    statDefault: defaultLiteral,
    maxDelta: "",
    user: input.userName,
    userName: input.userName,
    char,
    characters: input.characters.join(", "),
    envelope,
    contextText: input.contextText,
    statKind,
    allowedValues: allowedValuesLiteral,
    textMaxLen: String(textMaxLen),
    arrayMaxItems: String(MAX_CUSTOM_ARRAY_ITEMS),
    booleanTrueLabel: trueLabel,
    booleanFalseLabel: falseLabel,
    valueSchema,
    dateTimeMode,
  });
  const instruction = applySourcePriorityRule(
    instructionRendered,
    Boolean(input.includeCharacterCardsInPrompt),
    Boolean(input.includeLorebookInExtraction),
  );

  const protocolBlock = bstTagBlock("BST_OUTPUT_PROTOCOL", customNonNumericProtocol({
    kind: statKind,
    statId,
    allowedValues: enumOptions,
    textMaxLen,
    arrayMaxItems: MAX_CUSTOM_ARRAY_ITEMS,
    dateTimeMode,
    trueLabel,
    falseLabel,
    template: input.protocolTemplate,
  }));
  const criticalInstruction = bstTagBlock("BST_CRUCIAL_BEHAVE_INSTRUCTION", "Treat every BST_* block as highest-priority extraction instructions. Follow schema exactly and output JSON only.");
  const envelopeBlock = bstTagBlock("BST_ENVELOPE", "{{envelope}}");
  const targetBlock = bstTagBlock("BST_TARGET", "{{targetGuidance}}");
  const recentMessagesBlock = bstTagBlock("BST_RECENT_MESSAGES", "{{recentMessages}}");
  const currentStateBlock = bstTagBlock("BST_CURRENT_STATE", "{{currentLines}}");
  const snapshotGuidanceBlock = bstTagBlock("BST_SNAPSHOT_GUIDANCE", "{{snapshotGuidance}}");
  const recentSnapshotsBlock = bstTagBlock("BST_RECENT_SNAPSHOTS", "{{historyLines}}");
  const customStatMeaningBlock = bstTagBlock("BST_CUSTOM_STAT_MEANING", "{{customStatMeaning}}");
  const targetCardContextBlock = bstTagBlock("BST_TARGET_CARD_CONTEXT", "{{targetCardContext}}");
  const otherCardContextBlock = bstTagBlock("BST_OTHER_CARD_CONTEXT", "{{otherCardContext}}");
  const lorebookContextBlock = bstTagBlock("BST_LOREBOOK_CONTEXT", "{{lorebookContext}}");
  const taskBlock = bstTagBlock("BST_TASK", "{{instruction}}");
  const assembled = [
    systemPrompt,
    "",
    "{{criticalInstruction}}",
    "{{envelopeBlock}}",
    "{{targetBlock}}",
    "{{recentMessagesBlock}}",
    "{{currentStateBlock}}",
    "{{snapshotGuidanceBlock}}",
    "{{recentSnapshotsBlock}}",
    "{{customStatMeaningBlock}}",
    "{{targetCardContextBlock}}",
    "{{otherCardContextBlock}}",
    "{{lorebookContextBlock}}",
    "{{taskBlock}}",
    "",
    "{{outputProtocolBlock}}",
  ].join("\n");

  return renderTemplate(assembled, {
    criticalInstruction,
    envelopeBlock,
    targetBlock,
    recentMessagesBlock,
    currentStateBlock,
    snapshotGuidanceBlock,
    recentSnapshotsBlock,
    customStatMeaningBlock,
    targetCardContextBlock,
    otherCardContextBlock,
    lorebookContextBlock,
    taskBlock,
    outputProtocolBlock: protocolBlock,
    envelope,
    targetGuidance,
    user: input.userName,
    userName: input.userName,
    char,
    recentMessages: contextSections.recentMessages || "- none",
    targetCardContext: contextSections.targetCardContext || "- none",
    otherCardContext: contextSections.otherCardContext || "- none",
    lorebookContext: contextSections.lorebookContext || "- none",
    customStatMeaning,
    currentLines,
    snapshotGuidance,
    historyLines: historyLines || "- none",
    instruction,
    characters: input.characters.join(", "),
  });
}

export function buildSequentialCustomOverrideGenerationPrompt(input: {
  statId: string;
  statLabel: string;
  statDescription: string;
  statKind?: CustomStatKind;
  dateTimeMode?: "timestamp" | "structured";
  enumOptions?: string[];
  textMaxLength?: number;
  booleanTrueLabel?: string;
  booleanFalseLabel?: string;
}): string {
  const statId = input.statId.trim().toLowerCase();
  const statLabel = input.statLabel.trim();
  const statDescription = input.statDescription.trim();
  const statKind = input.statKind ?? "numeric";
  const enumOptions = Array.isArray(input.enumOptions)
    ? input.enumOptions.map(item => String(item ?? "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_ENUM_OPTIONS)
    : [];
  const textMaxLength = Math.max(20, Math.min(200, Math.round(Number(input.textMaxLength) || 120)));
  const dateTimeMode = input.dateTimeMode === "structured" ? "structured" : "timestamp";
  const trueLabel = String(input.booleanTrueLabel ?? "enabled").trim() || "enabled";
  const falseLabel = String(input.booleanFalseLabel ?? "disabled").trim() || "disabled";
  const middleEnumValue = enumOptions.length
    ? enumOptions[Math.floor((enumOptions.length - 1) / 2)]
    : "";

  const kindRequirements = (() => {
    if (statKind === "numeric") {
      return [
        `- Explicitly say to update only ${statId} deltas and ignore other stats.`,
        "- Allow 0 or negative deltas when context is neutral/negative.",
        `- Include concrete evidence cues for when ${statId} should increase vs decrease.`,
      ];
    }
    if (statKind === "enum_single") {
      const lowValue = enumOptions[0] ?? "low";
      const midValue = middleEnumValue || enumOptions[0] || "medium";
      const highValue = enumOptions[enumOptions.length - 1] ?? "high";
      return [
        `- Explicitly say to update only ${statId} value and ignore other stats.`,
        `- Require output values to be one exact token from: ${enumOptions.join(", ") || "(none provided)"}.`,
        `- Include concrete evidence cues for choosing anchor values \"${lowValue}\", \"${midValue}\", and \"${highValue}\".`,
      ];
    }
    if (statKind === "boolean") {
      return [
        `- Explicitly say to update only ${statId} value and ignore other stats.`,
        `- Require strict boolean output only (true/false), where true=${trueLabel} and false=${falseLabel}.`,
        `- Include concrete evidence cues for switching ${statId} from false->true and true->false.`,
      ];
    }
    if (statKind === "array") {
      return [
        `- Explicitly say to update only ${statId} value and ignore other stats.`,
        `- Require JSON array output of short strings (maximum ${MAX_CUSTOM_ARRAY_ITEMS} items total).`,
        `- Require item-level maintenance: add/remove/edit specific ${statId} items based on evidence.`,
        "- Avoid full-list rewrites unless recent context clearly replaces the whole list.",
      ];
    }
    if (statKind === "date_time") {
      return [
        `- Explicitly say to update only ${statId} value and ignore other stats.`,
        dateTimeMode === "structured"
          ? "- Require structured datetime intent (absolute/delta/ofDay fields) that BST normalizes to YYYY-MM-DD HH:mm."
          : "- Require strict datetime format: YYYY-MM-DD HH:mm (24h).",
        `- Require conservative progression for ${statId}; do not jump backward unless context explicitly rewinds.`,
        "- Require small forward increments when only short in-scene time passes.",
      ];
    }
    return [
      `- Explicitly say to update only ${statId} value and ignore other stats.`,
      `- Require one concise single-line text value (max ${textMaxLength} chars).`,
      `- Include concrete evidence cues for when ${statId} should be kept, changed, or rewritten.`,
    ];
  })();

  return [
    "SYSTEM:",
    "You write instruction text for BetterSimTracker custom sequential extraction.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not add explanations before or after the instruction block.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Custom stat:",
    `- ID: ${statId}`,
    `- Kind: ${statKind}`,
    `- Label: ${statLabel}`,
    `- Description: ${statDescription}`,
    ...(statKind === "enum_single" ? [`- Allowed values: ${enumOptions.join(", ") || "(none provided)"}`] : []),
    ...(statKind === "text_short" ? [`- Text max length: ${textMaxLength}`] : []),
    ...(statKind === "date_time" ? [`- Date/time mode: ${dateTimeMode}`] : []),
    ...(statKind === "date_time" ? ["- Date/time canonical storage: YYYY-MM-DD HH:mm (24h)"] : []),
    ...(statKind === "array" ? [`- Item max length: ${textMaxLength}`, `- Max items: ${MAX_CUSTOM_ARRAY_ITEMS}`] : []),
    ...(statKind === "boolean" ? [`- True label: ${trueLabel}`, `- False label: ${falseLabel}`] : []),
    "",
    "Task:",
    "Write exactly 6 short bullet lines. Every line must start with \"- \".",
    "Write a stat-specific override for this exact stat, not a generic template.",
    "This is extraction instruction text (state update logic), not behavior-reaction guidance.",
    "The instruction must:",
    `- Mention ${statLabel} and ${statId} directly (literal), not macro placeholders.`,
    `- Use the provided description (${statDescription}) to define what evidence should move ${statId}.`,
    ...kindRequirements,
    `- Treat the previous ${statLabel} tracker value as the current known state for continuity.`,
    `- Change ${statId} only when recent messages provide clear evidence of change; otherwise preserve the previous value.`,
    "- Use recent messages as the primary source of change and previous tracker state as the primary source of continuity.",
    `- Use character cards, defaults, and lorebook only when ${statId} is empty, unknown, or genuinely unclear from the recent scene.`,
    `- Never overwrite a known current ${statLabel} value only because background/card text mentions a different baseline state.`,
    "- Keep updates conservative and realistic from recent messages.",
    "- Prefer recent messages first; use character cards only for disambiguation or initial unknown-state recovery.",
    "- Avoid generic filler and keep each bullet actionable.",
    "- Do not write assistant reply-style behavior tips (tone/boundaries/persona).",
    "- Do not mention JSON, response format, confidence math, or this generator prompt.",
    "",
    "Return the 6-line instruction block only.",
  ].join("\n");
}

export function buildCustomStatDescriptionGenerationPrompt(input: {
  statId: string;
  statLabel: string;
  currentDescription: string;
  statKind?: CustomStatKind;
  dateTimeMode?: "timestamp" | "structured";
  enumOptions?: string[];
  textMaxLength?: number;
  booleanTrueLabel?: string;
  booleanFalseLabel?: string;
}): string {
  const statId = input.statId.trim().toLowerCase();
  const statLabel = input.statLabel.trim();
  const currentDescription = input.currentDescription.trim();
  const statKind = input.statKind ?? "numeric";
  const dateTimeMode = input.dateTimeMode === "structured" ? "structured" : "timestamp";
  const enumOptions = Array.isArray(input.enumOptions)
    ? input.enumOptions.map(item => String(item ?? "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_ENUM_OPTIONS)
    : [];
  const textMaxLength = Math.max(20, Math.min(200, Math.round(Number(input.textMaxLength) || 120)));
  const trueLabel = String(input.booleanTrueLabel ?? "enabled").trim() || "enabled";
  const falseLabel = String(input.booleanFalseLabel ?? "disabled").trim() || "disabled";

  return [
    "SYSTEM:",
    "You rewrite custom-stat descriptions for BetterSimTracker.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Custom stat:",
    `- ID: ${statId}`,
    `- Kind: ${statKind}`,
    `- Label: ${statLabel}`,
    `- Current description: ${currentDescription}`,
    ...(statKind === "enum_single" ? [`- Allowed values: ${enumOptions.join(", ") || "(none provided)"}`] : []),
    ...(statKind === "text_short" ? [`- Text max length: ${textMaxLength}`] : []),
    ...(statKind === "date_time" ? [`- Date/time mode: ${dateTimeMode}`] : []),
    ...(statKind === "date_time" ? ["- Canonical storage format: YYYY-MM-DD HH:mm (24h)"] : []),
    ...(statKind === "array" ? [`- Item max length: ${textMaxLength}`, `- Max items: ${MAX_CUSTOM_ARRAY_ITEMS}`] : []),
    ...(statKind === "boolean" ? [`- True label: ${trueLabel}`, `- False label: ${falseLabel}`] : []),
    "",
    "Task:",
    "Rewrite the description into one clear sentence for extraction logic.",
    "Requirements:",
    "- Keep the same meaning but make it precise and practical.",
    "- Focus on what should increase/decrease this stat from conversational evidence.",
    "- Keep it neutral and domain-agnostic (no roleplay flavor text).",
    "- Keep it between 12 and 28 words.",
    "- Avoid placeholders, bullets, quotes, and extra commentary.",
    "",
    "Return exactly one sentence.",
  ].join("\n");
}

export function buildBuiltInSequentialPromptGenerationPrompt(input: {
  stat: "affection" | "trust" | "desire" | "connection" | "mood" | "lastThought";
  currentInstruction: string;
}): string {
  const stat = input.stat;
  const currentInstruction = input.currentInstruction.trim();
  const labelByStat: Record<typeof stat, string> = {
    affection: "Affection",
    trust: "Trust",
    desire: "Desire",
    connection: "Connection",
    mood: "Mood",
    lastThought: "Last Thought",
  };
  const statLabel = labelByStat[stat];
  const statNotesByStat: Record<typeof stat, string[]> = {
    affection: [
      "- Focus on emotional warmth/care signals toward the user.",
      "- Avoid overreacting to one polite line; keep conservative movement.",
    ],
    trust: [
      "- Focus on safety/reliability/vulnerability signals toward the user.",
      "- Distinguish polite compliance from genuine trust increases.",
    ],
    desire: [
      "- Only increase when context is explicitly romantic/sexual.",
      "- Non-romantic context should keep desire flat or lower.",
    ],
    connection: [
      "- Focus on emotional attunement, continuity, and bond depth cues.",
      "- Prefer sustained interaction patterns over one-off phrases.",
    ],
    mood: [
      "- Focus on immediate emotional tone for this turn only.",
      "- Keep mood interpretation anchored to recent explicit cues.",
    ],
    lastThought: [
      "- Focus on one brief internal thought grounded in recent messages.",
      "- Keep it concise, in-character, and tied to immediate context.",
    ],
  };
  const statNotes = statNotesByStat[stat];

  return [
    "SYSTEM:",
    "You write one instruction block for BetterSimTracker sequential extraction.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Target sequential prompt:",
    `- Stat: ${stat} (${statLabel})`,
    "",
    "Current instruction:",
    currentInstruction || "(empty)",
    "",
    "Task:",
    "Rewrite this instruction into a stronger, practical, model-facing version for this stat only.",
    "Output requirements:",
    "- Write exactly 6 short bullet lines.",
    "- Every line must start with \"- \".",
    "- Keep wording concrete and extraction-focused.",
    "- Prioritize recent messages for changes and previous tracker state for continuity; use character cards only for disambiguation.",
    "- Keep updates conservative and realistic.",
    `- Require preserving the current ${statLabel} state unless recent messages clearly justify movement.`,
    ...statNotes,
    "- Do not mention JSON/format/protocol/confidence math/token limits.",
    "- Do not mention this generator prompt or meta instructions.",
    "",
    "Return the 6-line instruction block only.",
  ].join("\n");
}

export function buildCustomStatBehaviorGuidanceGenerationPrompt(input: {
  statId: string;
  statLabel: string;
  statDescription: string;
  currentGuidance?: string;
  statKind?: CustomStatKind;
  dateTimeMode?: "timestamp" | "structured";
  enumOptions?: string[];
  textMaxLength?: number;
  booleanTrueLabel?: string;
  booleanFalseLabel?: string;
}): string {
  const statId = input.statId.trim().toLowerCase();
  const statLabel = input.statLabel.trim();
  const statDescription = input.statDescription.trim();
  const currentGuidance = String(input.currentGuidance ?? "").trim();
  const statKind = input.statKind ?? "numeric";
  const dateTimeMode = input.dateTimeMode === "structured" ? "structured" : "timestamp";
  const enumOptions = Array.isArray(input.enumOptions)
    ? input.enumOptions.map(item => String(item ?? "").trim()).filter(Boolean).slice(0, MAX_CUSTOM_ENUM_OPTIONS)
    : [];
  const textMaxLength = Math.max(20, Math.min(200, Math.round(Number(input.textMaxLength) || 120)));
  const trueLabel = String(input.booleanTrueLabel ?? "enabled").trim() || "enabled";
  const falseLabel = String(input.booleanFalseLabel ?? "disabled").trim() || "disabled";
  const middleEnumValue = enumOptions.length
    ? enumOptions[Math.floor((enumOptions.length - 1) / 2)]
    : "";

  const taskByKind = (() => {
    if (statKind === "numeric") {
      return [
        "Write exactly 5 short bullet lines for this exact stat.",
        "Requirements:",
        "- Each line must start with \"- \".",
        `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
        `- Include one line for LOW ${statId} behavior, one for MEDIUM ${statId}, and one for HIGH ${statId}.`,
        `- Include one line describing evidence that should move ${statId} upward over time.`,
        `- Include one line describing evidence that should move ${statId} downward over time.`,
      ];
    }
    if (statKind === "enum_single") {
      const lowValue = enumOptions[0] ?? "low";
      const midValue = middleEnumValue || enumOptions[0] || "medium";
      const highValue = enumOptions[enumOptions.length - 1] ?? "high";
      return [
        "Write exactly 5 short bullet lines for this exact stat.",
        "Requirements:",
        "- Each line must start with \"- \".",
        `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
        `- Include one behavior line for value \"${lowValue}\", one for \"${midValue}\", and one for \"${highValue}\".`,
        `- Include one line describing cues that should move ${statId} toward higher-value states.`,
        `- Include one line describing cues that should move ${statId} toward lower-value states.`,
      ];
    }
    if (statKind === "boolean") {
      return [
        "Write exactly 5 short bullet lines for this exact stat.",
        "Requirements:",
        "- Each line must start with \"- \".",
        `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
        `- Include one behavior line for ${statId}=true (${trueLabel}) and one for ${statId}=false (${falseLabel}).`,
        `- Include one line describing cues that should switch ${statId} from false to true.`,
        `- Include one line describing cues that should switch ${statId} from true to false.`,
        `- Include one stability line about how to stay consistent with current ${statId} state across nearby turns.`,
      ];
    }
    if (statKind === "array") {
      return [
        "Write exactly 5 short bullet lines for this exact stat.",
        "Requirements:",
        "- Each line must start with \"- \".",
        `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
        `- Treat ${statId} as a list of short items and keep behavior aligned to current list contents.`,
        `- Include one line for add-item cues, one for remove-item cues, and one for edit-item cues.`,
        `- Include one line that enforces incremental updates (item-level maintenance) instead of full-list rewrites.`,
      ];
    }
    if (statKind === "date_time") {
      return [
        "Write exactly 5 short bullet lines for this exact stat.",
        "Requirements:",
        "- Each line must start with \"- \".",
        `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
        dateTimeMode === "structured"
          ? `- Treat ${statId} as current scene date/time using semantic progression cues (absolute/delta/ofDay), normalized by BST.`
          : `- Treat ${statId} as current scene date/time in strict YYYY-MM-DD HH:mm format.`,
        `- Include one line for conservative forward progression cues and one for explicit rewind/flashback cues.`,
        `- Include one line that discourages large time jumps for short scene beats.`,
      ];
    }
    return [
      "Write exactly 5 short bullet lines for this exact stat.",
      "Requirements:",
      "- Each line must start with \"- \".",
      `- Mention ${statId} and ${statLabel} literally at least once across the block.`,
      `- Treat ${statId} as a short current-state note (max ${textMaxLength} chars), then define how replies should adapt to that state.`,
      `- Include one line for open/positive state wording, one for guarded/negative state wording, and one for neutral/unclear state wording.`,
      `- Include one line describing what evidence should strengthen the current ${statId} state.`,
      `- Include one line describing what evidence should weaken or redirect the current ${statId} state.`,
    ];
  })();

  return [
    "SYSTEM:",
    "You write behavior-guidance lines for BetterSimTracker prompt injection.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Custom stat:",
    `- ID: ${statId}`,
    `- Kind: ${statKind}`,
    `- Label: ${statLabel}`,
    `- Description: ${statDescription}`,
    ...(statKind === "enum_single" ? [`- Allowed values: ${enumOptions.join(", ") || "(none provided)"}`] : []),
    ...(statKind === "text_short" ? [`- Text max length: ${textMaxLength}`] : []),
    ...(statKind === "date_time" ? [`- Date/time mode: ${dateTimeMode}`] : []),
    ...(statKind === "date_time" ? ["- Date/time canonical storage: YYYY-MM-DD HH:mm (24h)"] : []),
    ...(statKind === "array" ? [`- Item max length: ${textMaxLength}`, `- Max items: ${MAX_CUSTOM_ARRAY_ITEMS}`] : []),
    ...(statKind === "boolean" ? [`- True label: ${trueLabel}`, `- False label: ${falseLabel}`] : []),
    `- Current guidance: ${currentGuidance || "(empty)"}`,
    "",
    "Task:",
    ...taskByKind,
    `- Keep the guidance anchored to the current ${statLabel} state instead of generic label synonyms.`,
    `- When useful, describe how the model should remain consistent with an already-established ${statId} value across nearby turns.`,
    "- Keep phrasing specific and practical, not generic (avoid \"more/less [label]\" wording).",
    "- Keep wording model-facing, actionable, and neutral (no roleplay narration).",
    "- Focus on reply behavior (tone, initiative, boundaries, detail level), not extraction mechanics.",
    "- Do not instruct parsing/updating/extracting values and do not mention deltas.",
    "- Do not mention JSON, confidence, output schema, or this generator prompt.",
    "",
    "Return only the 5 bullet lines.",
  ].join("\n");
}

export function buildTrackerSummaryGenerationPrompt(input: {
  userName: string;
  activeCharacters: string[];
  characters: string[];
  contextText: string;
  trackerStateLines: string;
  trackedDimensions: string[];
}): string {
  const userName = String(input.userName ?? "").trim() || "User";
  const activeCharacters = input.activeCharacters.filter(Boolean);
  const allCharacters = input.characters.filter(Boolean);
  const contextText = String(input.contextText ?? "").trim() || "(no recent context)";
  const trackerStateLines = String(input.trackerStateLines ?? "").trim() || "- no tracker values available";
  const trackedDimensions = input.trackedDimensions.filter(Boolean);

  return [
    "SYSTEM:",
    "You write a relationship-status summary for a chat system comment.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Goal:",
    "Write a concise descriptive prose summary of the current interpersonal dynamics.",
    "The output will be posted directly in chat as a system-style note.",
    "",
    "Hard rules:",
    "- Do not use numerals or percentages.",
    "- Do not output score labels like affection/trust/desire/connection IDs with values.",
    "- Keep it to 4-6 natural sentences.",
    "- Keep tone neutral and observant, not roleplay dialogue.",
    "- Mention relevant character names naturally.",
    "- Ground the summary in both the recent messages and tracker state.",
    "- Reflect only tracked dimensions listed below; do not invent dimensions that are absent.",
    "",
    "Tracked dimensions (only these):",
    `- ${trackedDimensions.length ? trackedDimensions.join(", ") : "Use only dimensions explicitly present in the tracker snapshot."}`,
    "",
    "Inputs:",
    `- User: ${userName}`,
    `- Active characters: ${activeCharacters.length ? activeCharacters.join(", ") : "none"}`,
    `- All tracked characters: ${allCharacters.length ? allCharacters.join(", ") : "none"}`,
    "",
    "Recent messages:",
    contextText,
    "",
    "Tracker state snapshot:",
    trackerStateLines,
    "",
    "Return only the final prose summary.",
  ].join("\n");
}

export function buildTrackerSummaryNoNumbersRewritePrompt(input: {
  draftSummary: string;
}): string {
  const draftSummary = String(input.draftSummary ?? "").trim();
  return [
    "SYSTEM:",
    "Rewrite the text into clean prose for a chat system comment.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Hard rules:",
    "- Remove all numerals and percentages.",
    "- Keep meaning and tone intact.",
    "- Keep it to 4-6 natural sentences.",
    "- Preserve only dimensions already present in the draft (do not introduce new ones).",
    "",
    "Draft text:",
    draftSummary || "(empty)",
    "",
    "Return only the rewritten prose.",
  ].join("\n");
}

export function buildTrackerSummaryLengthenPrompt(input: {
  draftSummary: string;
}): string {
  const draftSummary = String(input.draftSummary ?? "").trim();
  return [
    "SYSTEM:",
    "Expand the summary into fuller prose for a chat system comment.",
    "Return plain text only.",
    "Do not return JSON.",
    "Do not return markdown code fences.",
    "Do not include any reasoning tags like <think>, <analysis>, or similar.",
    "",
    "Hard rules:",
    "- Keep it to 4-6 natural sentences.",
    "- Do not use numerals or percentages.",
    "- Keep tone neutral and observant, not roleplay dialogue.",
    "- Keep existing meaning, but add useful detail grounded in context.",
    "- Mention relevant character names naturally.",
    "- Preserve only dimensions already present in the draft (do not introduce new ones).",
    "",
    "Draft summary:",
    draftSummary || "(empty)",
    "",
    "Return only the expanded summary.",
  ].join("\n");
}
