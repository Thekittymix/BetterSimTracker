import { USER_TRACKER_KEY } from "./constants";
import type {
  ChatMessage,
  TrackerResolvedEntity,
  TrackerResolvedEntityEvidence,
  TrackerResolvedEntityKind,
} from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeToken(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectMentionedAliases(text: string, aliases: string[]): string[] {
  const normalizedText = normalizeToken(text);
  if (!normalizedText) return [];
  const seen = new Set<string>();
  const mentioned: string[] = [];
  for (const alias of aliases) {
    const value = normalizeToken(alias);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(value)}(?=$|[^A-Za-z0-9])`, "i");
    if (!pattern.test(normalizedText)) continue;
    seen.add(key);
    mentioned.push(value);
  }
  return mentioned;
}

function boundedEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  const lengthDelta = Math.abs(left.length - right.length);
  if (lengthDelta > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) {
      i += 1;
    } else if (right.length > left.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits <= 1;
}

function resolveOwnerNameFallbackFromEntityId(entityId: string): string {
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return "";
  if (normalizedEntityId.startsWith("bst_mc_alias:")) {
    return normalizedEntityId.slice(normalizedEntityId.lastIndexOf(":") + 1);
  }
  if (normalizedEntityId.includes(USER_TRACKER_KEY)) {
    return USER_TRACKER_KEY;
  }
  return "";
}

function isTechnicalResolvedEntityName(name: string, entityId: string): boolean {
  const normalizedName = normalizeToken(name);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedName) return true;
  if (normalizedEntityId && normalizedName === normalizedEntityId) return true;
  return normalizedName.startsWith("bst_");
}

function resolveOwnerNameFromResolvedEntity(entity: TrackerResolvedEntity): string {
  const entityId = normalizeToken(entity.entityId);
  const entityName = normalizeToken(entity.name);
  if (!isTechnicalResolvedEntityName(entityName, entityId)) return entityName;
  return resolveOwnerNameFallbackFromEntityId(entityId) || entityName;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const block = raw.match(/\{[\s\S]*\}/);
    if (!block) return null;
    try {
      return JSON.parse(block[0]);
    } catch {
      return null;
    }
  }
}

export type MultiCharacterResolverCandidate = {
  entityRef: string;
  ownerName: string;
  kind?: TrackerResolvedEntityKind;
  entityId?: string | null;
  avatar?: string | null;
  aliases?: string[];
  lifecycle?: {
    state?: "active" | "inactive" | "archived";
    lastSeenMessageIndex?: number | null;
    lastActiveMessageIndex?: number | null;
  };
};

export type NarrativeEntityCreationProposal = {
  name: string;
  aliases?: string[];
  inScene: boolean;
  inMessage: boolean;
};

export type EntityResolverContinuitySnapshot = {
  lastSceneOwners: string[];
  persistentSceneOwners: string[];
  recentNarrativeEntities: string[];
  recentSourceGroups: Array<{
    label: string;
    members: string[];
  }>;
};

export type MultiCharacterResolutionResult = {
  resolvedEntities: TrackerResolvedEntity[];
  createdEntities: NarrativeEntityCreationProposal[];
  unresolvedMentions: string[];
};

export function wrapEntityResolverPromptAsJsonRequest(input: {
  requestType: "entity_resolution" | "entity_resolution_bootstrap" | "entity_resolution_audit";
  prompt: string;
}): string {
  return JSON.stringify(
    {
      protocolVersion: "bst.entity.resolve.v1",
      requestType: input.requestType,
      task: {
        instruction: "Resolve BetterSimTracker entity scene/message presence from the supplied resolver request.",
        output: "Return the resolver response JSON only.",
      },
      resolverRequest: normalizeToken(input.prompt),
      outputContract: {
        format: "json_only",
        allowMarkdownFences: false,
        allowProse: false,
        requiredSections: ["resolved", "created", "unresolvedMentions"],
      },
    },
    null,
    2,
  );
}

export function shouldAuditCollapsedSourceOwnerResult(input: {
  candidateEntities: MultiCharacterResolverCandidate[];
  result: MultiCharacterResolutionResult | null;
  message: ChatMessage;
  allowNarrativeEntityCreation?: boolean;
}): boolean {
  if (input.allowNarrativeEntityCreation !== true) return false;
  if (!input.result) return false;
  const candidateEntities = input.candidateEntities
    .filter(candidate => normalizeToken(candidate.entityRef) && normalizeToken(candidate.ownerName));
  if (candidateEntities.length !== 1) return false;
  if (!normalizeToken(input.message?.mes)) return false;
  const sourceCandidate = candidateEntities[0];
  const sourceEntityId = normalizeToken(sourceCandidate.entityId);
  const sourceOwnerKey = normalizeLooseKey(sourceCandidate.ownerName);
  const sourceAliasKeys = new Set(
    [sourceCandidate.ownerName, ...(sourceCandidate.aliases ?? [])]
      .map(alias => normalizeLooseKey(alias))
      .filter(Boolean),
  );
  const concreteResolvedSceneCount = input.result.resolvedEntities
    .filter(entity => entity.inScene || entity.inMessage)
    .filter(entity => {
      const entityId = normalizeToken(entity.entityId);
      const entityNameKey = normalizeLooseKey(entity.name);
      if (sourceEntityId && entityId === sourceEntityId) return false;
      if (sourceOwnerKey && entityNameKey === sourceOwnerKey) return false;
      return !sourceAliasKeys.has(entityNameKey);
    })
    .length;
  const createdSceneCount = input.result.createdEntities
    .filter(entity => entity.inScene || entity.inMessage)
    .length;
  return concreteResolvedSceneCount + createdSceneCount <= 1;
}

export function buildCollapsedSourceOwnerAuditPrompt(input: {
  originalPrompt: string;
  previousResponseText: string;
}): string {
  return [
    "SYSTEM:",
    "You are auditing a BetterSimTracker entity resolver response.",
    "The prior response may have collapsed a source owner into a concrete actor without deciding whether that owner is a real single character or a source label for concrete actors in the latest message.",
    "Use the original resolver request below as the source of truth.",
    "First decide from the latest message and recent chat context whether the source owner is a real single character or only a source label.",
    "If the source owner is a real single character, return the same resolver JSON unless another concrete non-user actor is clearly missing from the latest message.",
    "If the source owner is only a source label and the latest message clearly identifies multiple concrete non-user character-like actors, return the complete corrected resolver JSON with those concrete actors represented and do not keep the source owner as an active concrete actor.",
    "If the prior response was already complete, return the same resolver JSON.",
    "Do not invent names. Do not infer from outside the provided request. Do not include the user as a resolved or created entity.",
    "Return strict JSON only with `resolved`, `created`, and `unresolvedMentions`.",
    "",
    "Original resolver request:",
    normalizeToken(input.originalPrompt) || "(empty)",
    "",
    "Prior resolver response to audit:",
    normalizeToken(input.previousResponseText) || "(empty)",
  ].join("\n");
}

export function buildBootstrapEntityUniverseResolverPrompt(input: {
  candidateEntities: MultiCharacterResolverCandidate[];
  contextText: string;
  message: ChatMessage;
}): string {
  const candidateEntities = input.candidateEntities
    .map(candidate => ({
      entityRef: normalizeToken(candidate.entityRef),
      ownerName: normalizeToken(candidate.ownerName),
      kind: candidate.kind === "narrative-entity" || candidate.kind === "persona" ? candidate.kind : "st-character",
      aliases: Array.isArray(candidate.aliases)
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : [],
    }))
    .filter(candidate => candidate.entityRef && candidate.ownerName);
  const contextText = normalizeToken(input.contextText);
  const messageName = normalizeToken(input.message?.name);
  const messageText = normalizeToken(input.message?.mes);
  const messageRole = input.message?.is_user ? "user" : "ai";

  return [
    "SYSTEM:",
    "You are the BetterSimTracker first-message entity resolver.",
    "Resolve the complete first-message entity universe: every concrete named non-user character-like actor explicitly introduced, situated, or physically present in the latest chat message.",
    "Use only the latest message and recent chat context below. Do not use character card, lorebook, or outside knowledge.",
    "The source owner candidate may be a speaker/source label. Return it in `resolved` only if the latest message clearly presents that owner as one real single character.",
    "If the latest message clearly introduces or places concrete non-user actors in the scene, return all of those actors in `created`.",
    "Do not stop after the most recently mentioned actor. Include named hosts, family members, guests, caretakers, babysitters, and other named character-like people when the message introduces them as part of the current scenario.",
    "Omit the user persona even if named in third person; all other concrete named character-like people should be included unless the message clearly says they are only absent/off-screen background.",
    "Do not include the user. Do not create locations, groups, props, roles without names, or vague mentions.",
    "Return strict JSON only with `resolved`, `created`, and `unresolvedMentions`.",
    "",
    "Candidate source owner:",
    JSON.stringify(candidateEntities, null, 2),
    "",
    "Recent chat context:",
    contextText || "(none)",
    "",
    "Latest message metadata:",
    `role: ${messageRole}`,
    `speaker: ${messageName || "(unknown)"}`,
    "Latest message:",
    messageText || "(empty)",
    "",
    "Return STRICT JSON only:",
    "{",
    '  "resolved": [],',
    '  "created": [{ "name": "Character Name", "aliases": [], "inScene": true, "inMessage": true }],',
    '  "unresolvedMentions": []',
    "}",
  ].join("\n");
}

type CandidateMatchKind = "entity_ref" | "entity_id" | "owner_name" | "alias";

type CandidateMatch = {
  candidate: MultiCharacterResolverCandidate;
  matchedBy: CandidateMatchKind;
};

type ParsedResolvedRef = {
  entityRef: string;
  ownerName: string;
  inScene: boolean;
  inMessage: boolean;
  sceneEvidence?: TrackerResolvedEntityEvidence[];
  messageEvidence?: TrackerResolvedEntityEvidence[];
};

function uniqueEvidence(values: TrackerResolvedEntityEvidence[] | undefined): TrackerResolvedEntityEvidence[] | undefined {
  if (!values?.length) return undefined;
  return Array.from(new Set(values));
}

const RESOLVED_ENTITY_EVIDENCE_WEIGHT: Record<TrackerResolvedEntityEvidence, number> = {
  resolver_entity_ref: 1,
  resolver_entity_id: 0.95,
  resolver_owner_name: 0.8,
  resolver_alias: 0.72,
};

export function resolveResolvedEntityConfidence(evidence: TrackerResolvedEntityEvidence[] | undefined): number | undefined {
  const unique = uniqueEvidence(evidence);
  if (!unique?.length) return undefined;
  const total = unique.reduce((sum, item) => sum + (RESOLVED_ENTITY_EVIDENCE_WEIGHT[item] ?? 0), 0);
  return Math.max(0, Math.min(1, Number(total.toFixed(3))));
}

function resolveCandidateMatchEvidence(matchedBy: CandidateMatchKind): TrackerResolvedEntityEvidence {
  switch (matchedBy) {
    case "entity_ref":
      return "resolver_entity_ref";
    case "entity_id":
      return "resolver_entity_id";
    case "owner_name":
      return "resolver_owner_name";
    case "alias":
      return "resolver_alias";
  }
}

function hasExplicitResolverShape(record: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, "resolved")
    || Object.prototype.hasOwnProperty.call(record, "created")
    || Object.prototype.hasOwnProperty.call(record, "unresolvedMentions")
  );
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeToken(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function buildMultiCharacterResolverPrompt(input: {
  candidateEntities: MultiCharacterResolverCandidate[];
  contextText: string;
  message: ChatMessage;
  previousMessage?: ChatMessage | null;
  allowNarrativeEntityCreation?: boolean;
  continuitySnapshot?: EntityResolverContinuitySnapshot | null;
}): string {
  const candidateEntities = input.candidateEntities
    .map(candidate => ({
      entityRef: normalizeToken(candidate.entityRef),
      ownerName: normalizeToken(candidate.ownerName),
      kind: candidate.kind === "narrative-entity" || candidate.kind === "persona" ? candidate.kind : "st-character",
      entityId: normalizeToken(candidate.entityId),
      avatar: normalizeToken(candidate.avatar),
      aliases: Array.isArray(candidate.aliases)
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : [],
      lifecycle: candidate.lifecycle && typeof candidate.lifecycle === "object"
        ? {
            ...(candidate.lifecycle.state === "active" || candidate.lifecycle.state === "inactive" || candidate.lifecycle.state === "archived"
              ? { state: candidate.lifecycle.state }
              : {}),
            ...(Number.isFinite(Number(candidate.lifecycle.lastSeenMessageIndex))
              ? { lastSeenMessageIndex: Number(candidate.lifecycle.lastSeenMessageIndex) }
              : {}),
            ...(Number.isFinite(Number(candidate.lifecycle.lastActiveMessageIndex))
              ? { lastActiveMessageIndex: Number(candidate.lifecycle.lastActiveMessageIndex) }
              : {}),
          }
        : undefined,
    }))
    .filter(candidate => candidate.entityRef && candidate.ownerName);
  const contextText = normalizeToken(input.contextText);
  const previousMessage = input.previousMessage;
  const messageName = normalizeToken(input.message?.name);
  const messageText = normalizeToken(input.message?.mes);
  const messageRole = input.message?.is_user ? "user" : "ai";
  const previousMessageName = normalizeToken(previousMessage?.name);
  const previousMessageText = normalizeToken(previousMessage?.mes);
  const previousMessageRole = previousMessage
    ? (previousMessage.is_user ? "user" : "ai")
    : "";
  const allowNarrativeEntityCreation = input.allowNarrativeEntityCreation === true;
  const continuitySnapshot = input.continuitySnapshot;
  const continuityOwnerKeys = {
    lastScene: new Set((continuitySnapshot?.lastSceneOwners ?? []).map(normalizeLooseKey).filter(Boolean)),
    persistentScene: new Set((continuitySnapshot?.persistentSceneOwners ?? []).map(normalizeLooseKey).filter(Boolean)),
    recentNarrative: new Set((continuitySnapshot?.recentNarrativeEntities ?? []).map(normalizeLooseKey).filter(Boolean)),
  };
  const resolveCandidateContinuityHints = (candidate: typeof candidateEntities[number]): {
    inLastScene?: boolean;
    inPersistentScene?: boolean;
    recentNarrativeEntity?: boolean;
    sourceGroupMembers?: string[];
  } | undefined => {
    if (!continuitySnapshot) return undefined;
    const candidateKeys = [candidate.ownerName, ...(candidate.aliases ?? [])].map(normalizeLooseKey).filter(Boolean);
    const sourceGroupMembers = continuitySnapshot.recentSourceGroups
      .filter(group => {
        const groupKeys = group.members.map(normalizeLooseKey).filter(Boolean);
        return candidateKeys.some(key => groupKeys.includes(key));
      })
      .flatMap(group => group.members);
    const hints = {
      ...(candidateKeys.some(key => continuityOwnerKeys.lastScene.has(key)) ? { inLastScene: true } : {}),
      ...(candidateKeys.some(key => continuityOwnerKeys.persistentScene.has(key)) ? { inPersistentScene: true } : {}),
      ...(candidateKeys.some(key => continuityOwnerKeys.recentNarrative.has(key)) ? { recentNarrativeEntity: true } : {}),
      ...(sourceGroupMembers.length ? { sourceGroupMembers: Array.from(new Set(sourceGroupMembers)) } : {}),
    };
    return Object.keys(hints).length ? hints : undefined;
  };
  const resolveCandidateMentionHints = (candidate: typeof candidateEntities[number]): {
    latestMessageAliases?: string[];
    previousMessageAliases?: string[];
  } | undefined => {
    const aliases = [candidate.ownerName, ...(candidate.aliases ?? [])];
    const latestMessageAliases = collectMentionedAliases(messageText, aliases);
    const previousMessageAliases = collectMentionedAliases(previousMessageText, aliases);
    const hints = {
      ...(latestMessageAliases.length ? { latestMessageAliases } : {}),
      ...(previousMessageAliases.length ? { previousMessageAliases } : {}),
    };
    return Object.keys(hints).length ? hints : undefined;
  };

  return [
    "SYSTEM:",
    "You are the BetterSimTracker entity resolver.",
    "Resolve which already-known entities are present in the scene at the end of the latest message, and which entities this latest message is actively advancing.",
    allowNarrativeEntityCreation
      ? "Resolve known entities from the provided candidate list, and only use `created` for clearly new character-like scene actors that are not already known."
      : "Return only known entities from the provided candidate list. Do not invent IDs or names.",
    "Do not include the user as a resolved entity.",
    "Return strict JSON only.",
    "",
    "Definitions:",
    '- `inScene=true` means the entity is still physically or interactionally present in the active scene frame at the end of the latest message.',
    '- `inMessage=true` means the latest message actively advances that entity in a way that matters for tracking.',
    "- `inMessage` may be true while `inScene` is false if the message shows the entity leaving by the end.",
    "- Silent/background entities may remain `inScene=true`, but must stay `inMessage=false` unless the latest message itself directly advances them.",
    "- Do not keep an entity `inScene=true` just because they are discussed, worried about, or named from elsewhere while remaining off-screen or in another room.",
    "- If the latest message says an entity is elsewhere, resting away from the interaction, or otherwise not entering the current scene frame, treat them as `inScene=false` unless that same message actually brings them back into the scene.",
    "- When the previous user turn addresses one participant to respond while other known entities remain present, keep the scene broad but keep `inMessage=true` only for entities the latest reply actually advances.",
    "- Do not mark an entity `inMessage=true` just because it is named in instructions, listed as present, or silently observing.",
    "- Do not mark an entity `inMessage=true` just because someone talks about them in dialogue or narration while they remain absent from the active interaction.",
    "- If the latest user instruction or AI message makes it clear that no known tracked entity remains in scene, return an empty `resolved` array.",
    "- Use continuity hints as prior-state context: they can preserve likely `inScene=true` for silent/background participants, but the latest message still controls whether an entity leaves, stays off-screen, or becomes `inMessage=true`.",
    "- `inLastScene`, `inPersistentScene`, and `sourceGroupMembers` are not commands to activate everyone; they are continuity evidence to compare against the latest message.",
    "- Candidate `lifecycle` is historical registry context only. An inactive or archived candidate can return only when the latest context clearly brings them back; an active candidate can still become absent if the latest context moves them away.",
    "- Candidate `mentionHints` show exact owner/alias mentions in the latest and previous messages. Mentions are evidence to inspect, not automatic proof of `inScene=true` or `inMessage=true`.",
    "- Before using `created`, compare the proposed name against candidate `ownerName` and `aliases`.",
    "- If a name is a minor spelling, capitalization, punctuation, or transliteration variant of one candidate and the role/context points to the same person, resolve that existing `entityRef` instead of creating a new entity.",
    "- If a near-name match is ambiguous between multiple candidates, do not guess; leave it unresolved unless the latest context clearly identifies one candidate.",
    ...(allowNarrativeEntityCreation
      ? [
          "- Use `created` only for clearly new non-user characters, beings, or scene actors that are distinct, scene-relevant, and not already covered by the known candidate list.",
          "- If the latest message clearly names concrete character-like actors under a source owner label and they are not already separate candidates, return them in `created` instead of leaving the scene collapsed under the source owner.",
          "- `created` entries must use human-readable `name` and optional `aliases` only. Never invent stable IDs.",
          "- Do not create props, objects, containers, furniture, locations, groups, body parts, narrator/user references, pronouns, or ambiguous mentions.",
        ]
      : []),
    "",
    "Examples:",
    '- If the previous user turn addresses Blake as the respondent while Ashley, Garret, and Raleigh remain present, and the latest AI reply only advances Blake, keep Ashley/Garret/Raleigh as `inScene=true, inMessage=false`.',
    '- If the latest AI reply contains only Blake acting/speaking, return Blake with `inMessage=true` and keep Ashley/Garret/Raleigh as `inMessage=false` unless that same reply directly advances them too.',
    '- If a later sentence in the same latest AI reply shows Ashley speaking or taking a meaningful action, Ashley may also become `inMessage=true`.',
    '- If the latest AI reply says Blake is resting in another room and Ashley only talks about Blake from the hallway, Blake should be `inScene=false, inMessage=false` for that hallway scene.',
    "",
    "Candidate entities:",
    JSON.stringify(
      candidateEntities.map(candidate => ({
        entityRef: candidate.entityRef,
        ownerName: candidate.ownerName,
        kind: candidate.kind ?? "st-character",
        aliases: candidate.aliases,
        lifecycle: candidate.lifecycle,
        continuityHints: resolveCandidateContinuityHints(candidate),
        mentionHints: resolveCandidateMentionHints(candidate),
      })),
      null,
      2,
    ),
    "",
    "Recent context:",
    contextText || "(none)",
    "",
    "Previous message metadata:",
    previousMessage
      ? `role: ${previousMessageRole}`
      : "(none)",
    previousMessage
      ? `speaker: ${previousMessageName || "(unknown)"}`
      : "",
    previousMessage
      ? "Previous message:"
      : "",
    previousMessage
      ? (previousMessageText || "(empty)")
      : "",
    "",
    "Continuity snapshot:",
    continuitySnapshot
      ? JSON.stringify(
          {
            lastSceneOwners: continuitySnapshot.lastSceneOwners,
            persistentSceneOwners: continuitySnapshot.persistentSceneOwners,
            recentNarrativeEntities: continuitySnapshot.recentNarrativeEntities,
            recentSourceGroups: continuitySnapshot.recentSourceGroups.map(group => ({
              label: group.label,
              members: group.members,
            })),
          },
          null,
          2,
        )
      : "(none)",
    "",
    "Latest message metadata:",
    `role: ${messageRole}`,
    `speaker: ${messageName || "(unknown)"}`,
    "Latest message:",
    messageText || "(empty)",
    "",
    "Return STRICT JSON only:",
    "{",
    '  "resolved": [',
    '    { "entityRef": "ent1", "inScene": true, "inMessage": true }',
    "  ],",
    allowNarrativeEntityCreation
      ? '  "created": [{ "name": "Forest Spirit", "aliases": ["Spirit"], "inScene": true, "inMessage": true }],'
      : '  "created": [],',
    '  "unresolvedMentions": []',
    "}",
  ].join("\n");
}

export function parseMultiCharacterResolverResponse(
  raw: string,
  candidateEntities: MultiCharacterResolverCandidate[],
): MultiCharacterResolutionResult | null {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!hasExplicitResolverShape(record)) return null;

  const candidateByRef = new Map(
    candidateEntities
      .filter(candidate => normalizeToken(candidate.entityRef))
      .map(candidate => [normalizeToken(candidate.entityRef), candidate] as const),
  );
  const candidateByEntityId = new Map(
    candidateEntities
      .filter(candidate => normalizeToken(candidate.entityId))
      .map(candidate => [normalizeToken(candidate.entityId), candidate] as const),
  );
  const candidateByName = new Map<string, MultiCharacterResolverCandidate>();
  const candidateList = candidateEntities.filter(candidate => normalizeToken(candidate.entityRef) && normalizeToken(candidate.ownerName));
  for (const candidate of candidateEntities) {
    const ownerName = normalizeToken(candidate.ownerName);
    if (ownerName && !candidateByName.has(ownerName.toLowerCase())) {
      candidateByName.set(ownerName.toLowerCase(), candidate);
    }
    for (const alias of candidate.aliases ?? []) {
      const normalizedAlias = normalizeToken(alias).toLowerCase();
      if (normalizedAlias && !candidateByName.has(normalizedAlias)) {
        candidateByName.set(normalizedAlias, candidate);
      }
    }
  }

  const resolveFuzzyCandidateByName = (name: string): MultiCharacterResolverCandidate | null => {
    const nameKey = normalizeLooseKey(name);
    if (!nameKey) return null;
    const matches = new Map<string, MultiCharacterResolverCandidate>();
    for (const candidate of candidateList) {
      const candidateNames = [candidate.ownerName, ...(candidate.aliases ?? [])]
        .map(alias => normalizeLooseKey(alias))
        .filter(Boolean);
      if (!candidateNames.some(candidateKey =>
        candidateKey[0] === nameKey[0] && boundedEditDistanceAtMostOne(candidateKey, nameKey),
      )) {
        continue;
      }
      const matchKey = normalizeToken(candidate.entityId) || normalizeToken(candidate.entityRef) || normalizeToken(candidate.ownerName).toLowerCase();
      if (!matchKey) continue;
      matches.set(matchKey, candidate);
    }
    return matches.size === 1 ? Array.from(matches.values())[0] ?? null : null;
  };

  const resolveCandidate = (item: Record<string, unknown>): CandidateMatch | null => {
    const entityRef = normalizeToken(item.entityRef);
    if (entityRef && candidateByRef.has(entityRef)) {
      const candidate = candidateByRef.get(entityRef) ?? null;
      return candidate ? { candidate, matchedBy: "entity_ref" } : null;
    }
    const entityId = normalizeToken(item.entityId);
    if (entityId && candidateByEntityId.has(entityId)) {
      const candidate = candidateByEntityId.get(entityId) ?? null;
      return candidate ? { candidate, matchedBy: "entity_id" } : null;
    }
    const directName = [
      item.ownerName,
      item.name,
      item.owner,
      item.canonicalName,
      item.alias,
    ]
      .map(value => normalizeToken(value))
      .find(Boolean);
    if (directName) {
      const candidate = candidateByName.get(directName.toLowerCase()) ?? resolveFuzzyCandidateByName(directName);
      if (!candidate) return null;
      const matchedBy: CandidateMatchKind = normalizeToken(candidate.ownerName).toLowerCase() === directName.toLowerCase()
        ? "owner_name"
        : "alias";
      return { candidate, matchedBy };
    }
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const normalizedAlias = normalizeToken(alias).toLowerCase();
        if (!normalizedAlias) continue;
        const candidate = candidateByName.get(normalizedAlias);
        if (candidate) return { candidate, matchedBy: "alias" };
      }
    }
    return null;
  };

  const rawResolved = Array.isArray(record.resolved)
    ? record.resolved
    : (Array.isArray(record.resolvedEntities)
      ? record.resolvedEntities
      : (Array.isArray(record.entities) ? record.entities : []));

  const resolvedRefs: ParsedResolvedRef[] = Array.isArray(rawResolved)
    ? rawResolved
        .map(value => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          const item = value as Record<string, unknown>;
          const matched = resolveCandidate(item);
          const candidate = matched?.candidate;
          const ownerName = normalizeToken(candidate?.ownerName);
          if (!matched || !candidate || !ownerName) return null;
          const matchEvidence = resolveCandidateMatchEvidence(matched.matchedBy);
          const inScene = normalizeBoolean(item.inScene);
          const inMessage = normalizeBoolean(item.inMessage);
          const parsedRef: ParsedResolvedRef = {
            entityRef: normalizeToken(candidate.entityRef),
            ownerName,
            inScene,
            inMessage,
          };
          if (inScene) parsedRef.sceneEvidence = [matchEvidence];
          if (inMessage) parsedRef.messageEvidence = [matchEvidence];
          return parsedRef;
        })
        .filter((value): value is ParsedResolvedRef => Boolean(value))
    : [];

  const seenEntityIds = new Set<string>();
  const resolvedEntities: TrackerResolvedEntity[] = [];
  for (const resolved of resolvedRefs) {
    const candidate = candidateByRef.get(resolved.entityRef) ?? candidateByName.get(resolved.ownerName.toLowerCase());
    const entityId = normalizeToken(candidate?.entityId);
    const name = normalizeToken(candidate?.ownerName);
    if (!candidate || !entityId || !name || seenEntityIds.has(entityId)) continue;
    seenEntityIds.add(entityId);
    resolvedEntities.push({
      entityId,
      kind: candidate.kind ?? "st-character",
      name,
      avatar: normalizeToken(candidate.avatar) || null,
      aliases: Array.isArray(candidate.aliases) && candidate.aliases.length
        ? candidate.aliases.map(alias => normalizeToken(alias)).filter(Boolean)
        : undefined,
      ...(uniqueEvidence(resolved.sceneEvidence) ? { sceneEvidence: uniqueEvidence(resolved.sceneEvidence) } : {}),
      ...(uniqueEvidence(resolved.messageEvidence) ? { messageEvidence: uniqueEvidence(resolved.messageEvidence) } : {}),
      ...(resolveResolvedEntityConfidence(resolved.sceneEvidence) !== undefined
        ? { sceneConfidence: resolveResolvedEntityConfidence(resolved.sceneEvidence) }
        : {}),
      ...(resolveResolvedEntityConfidence(resolved.messageEvidence) !== undefined
        ? { messageConfidence: resolveResolvedEntityConfidence(resolved.messageEvidence) }
        : {}),
      inScene: resolved.inScene,
      inMessage: resolved.inMessage,
    });
  }

  const rawCreated = Array.isArray(record.created)
    ? record.created
    : (Array.isArray(record.createdEntities) ? record.createdEntities : []);
  const createdEntities: NarrativeEntityCreationProposal[] = [];
  const seenCreated = new Set<string>();
  if (Array.isArray(rawCreated)) {
    for (const value of rawCreated) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const name = [
        item.name,
        item.ownerName,
        item.owner,
        item.canonicalName,
      ]
        .map(candidate => normalizeToken(candidate))
        .find(Boolean) ?? "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenCreated.has(key)) continue;
      seenCreated.add(key);
      const aliases = Array.isArray(item.aliases)
        ? Array.from(new Set(item.aliases.map(alias => normalizeToken(alias)).filter(Boolean)))
        : [];
      const hasInScene = Object.prototype.hasOwnProperty.call(item, "inScene");
      const hasInMessage = Object.prototype.hasOwnProperty.call(item, "inMessage");
      const inMessage = hasInMessage ? normalizeBoolean(item.inMessage) : true;
      createdEntities.push({
        name,
        aliases: aliases.length ? aliases : undefined,
        inScene: hasInScene ? normalizeBoolean(item.inScene) : inMessage,
        inMessage,
      });
    }
  }

  const rawUnresolvedMentions = Array.isArray(record.unresolvedMentions)
    ? record.unresolvedMentions
    : (Array.isArray(record.unresolved) ? record.unresolved : []);
  const unresolvedMentions = rawUnresolvedMentions.length
    ? Array.from(new Set(rawUnresolvedMentions.map(value => normalizeToken(value)).filter(Boolean)))
    : [];

  return {
    resolvedEntities,
    createdEntities,
    unresolvedMentions,
  };
}

export function resolveSceneEntityIdsFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inScene) continue;
    const entityId = normalizeToken(entity.entityId);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveMessageEntityIdsFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inMessage) continue;
    const entityId = normalizeToken(entity.entityId);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveSceneOwnersFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inScene) continue;
    const name = resolveOwnerNameFromResolvedEntity(entity);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function resolveMessageOwnersFromResolvedEntities(resolvedEntities: TrackerResolvedEntity[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolvedEntities) {
    if (!entity?.inMessage) continue;
    const name = resolveOwnerNameFromResolvedEntity(entity);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
