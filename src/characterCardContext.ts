import { buildEntitySourceKey, getEntityRegistryEntryByEntityIdForMessage } from "./entityRegistry";
import type { Character, STContext } from "./types";
import { resolveCharacterIdentity, resolveEntityTrackingMode } from "./entityResolution";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNameKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function buildCardHeader(character: Character, duplicateNameCount: number, duplicateIndex: number): string {
  const name = normalizeToken(character?.name) || "Character";
  const avatar = normalizeToken(character?.avatar);
  if (duplicateNameCount <= 1) return `Character Card - ${name}`;
  if (avatar) return `Character Card - ${name} [${avatar}]`;
  return `Character Card - ${name} [variant ${duplicateIndex + 1}]`;
}

function buildCharacterCardChunk(character: Character, duplicateNameCount: number, duplicateIndex: number): string {
  const lines: string[] = [];
  if (character.description) lines.push(`Description: ${character.description}`);
  if (character.personality) lines.push(`Personality: ${character.personality}`);
  if (character.scenario) lines.push(`Scenario: ${character.scenario}`);
  if (!lines.length) return "";
  return `${buildCardHeader(character, duplicateNameCount, duplicateIndex)}\n${lines.join("\n")}`;
}

export function buildCharacterCardsContext(
  context: STContext,
  activeCharacters: string[],
  activeEntityIds: string[] = [],
  entityTrackingMode: "standard" | "multi_character" = "standard",
): string {
  const allCharacters = Array.isArray(context?.characters) ? context.characters : [];
  if (!allCharacters.length) return "";

  const inGroup = Boolean(String(context?.groupId ?? "").trim());
  const focusedCharacterId = Number(context?.characterId);
  const focusedCharacter = !inGroup
    && Number.isFinite(focusedCharacterId)
    && focusedCharacterId >= 0
    && allCharacters[focusedCharacterId]
    ? allCharacters[focusedCharacterId]
    : null;
  const focusedAvatar = normalizeToken(focusedCharacter?.avatar);

  const activeNameKeys = new Set<string>();
  const activeAvatarKeys = new Set<string>();
  const activeSourceKeys = new Set<string>();
  for (const token of activeCharacters) {
    const raw = normalizeToken(token);
    if (!raw) continue;
    activeNameKeys.add(raw.toLowerCase());
    activeAvatarKeys.add(raw);
  }
  for (const entityId of activeEntityIds) {
    const entry = getEntityRegistryEntryByEntityIdForMessage(context, entityId, Number.MAX_SAFE_INTEGER);
    if (!entry) continue;
    const sourceKey = buildEntitySourceKey(entry.sourceName, entry.sourceAvatar);
    if (sourceKey) activeSourceKeys.add(sourceKey);
  }
  if (!activeNameKeys.size && !activeAvatarKeys.size && !activeSourceKeys.size) return "";
  const hasExplicitEntityTargets = activeSourceKeys.size > 0;

  const duplicateNameCounts = new Map<string, number>();
  for (const character of allCharacters) {
    const key = normalizeNameKey(character?.name);
    if (!key) continue;
    duplicateNameCounts.set(key, (duplicateNameCounts.get(key) ?? 0) + 1);
  }

  const duplicateNameIndices = new Map<string, number>();
  const chunks: string[] = [];
  for (const character of allCharacters) {
    const nameKey = normalizeNameKey(character?.name);
    const avatarKey = normalizeToken(character?.avatar);
    const sourceKey = buildEntitySourceKey(
      normalizeToken(character?.name),
      avatarKey || null,
    );
    if (!nameKey && !avatarKey) continue;

    if (focusedAvatar && avatarKey !== focusedAvatar) continue;

    const isActiveByAvatar = !hasExplicitEntityTargets && avatarKey ? activeAvatarKeys.has(avatarKey) : false;
    const isActiveByName = !hasExplicitEntityTargets && nameKey ? activeNameKeys.has(nameKey) : false;
    const isActiveByEntitySource = entityTrackingMode === "multi_character"
      && sourceKey
      && activeSourceKeys.has(sourceKey);
    const isActiveByAlias = !hasExplicitEntityTargets
      && entityTrackingMode === "multi_character"
      && activeCharacters.some(token => {
        const resolved = resolveCharacterIdentity(context, token, resolveEntityTrackingMode({ entityTrackingMode }));
        return Boolean(resolved && normalizeNameKey(resolved.sourceName) === nameKey);
      });
    if (!isActiveByAvatar && !isActiveByName && !isActiveByAlias && !isActiveByEntitySource) continue;

    const duplicateCount = duplicateNameCounts.get(nameKey) ?? 1;
    const duplicateIndex = duplicateNameIndices.get(nameKey) ?? 0;
    duplicateNameIndices.set(nameKey, duplicateIndex + 1);

    const chunk = buildCharacterCardChunk(character, duplicateCount, duplicateIndex);
    if (chunk) chunks.push(chunk);
  }

  if (!chunks.length) return "";
  return `\n\nCharacter cards (use only to disambiguate if recent messages are unclear):\n${chunks.join("\n\n")}`;
}

