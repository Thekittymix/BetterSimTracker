import type { Character, EntityTrackingMode, STContext } from "./types";

type CharacterCardsContextCacheEntry = {
  contextRef: STContext;
  charactersRef: Character[] | null;
  activeCharactersKey: string;
  activeEntityIdsKey: string;
  entityTrackingMode: EntityTrackingMode;
  preferredCharacterName: string;
  value: string;
};

type LorebookContextCacheEntry = {
  contextRef: STContext;
  chatMetadataRef: unknown;
  worldInfoRef: unknown;
  world_infoRef: unknown;
  lorebookRef: unknown;
  maxChars: number;
  maxCap: number;
  value: string;
};

function normalizeListKey(values: string[]): string {
  return values.map(value => String(value ?? "").trim()).join("\u001f");
}

const characterCardsContextCache = new Map<string, CharacterCardsContextCacheEntry>();
const lorebookContextCache = new WeakMap<STContext, LorebookContextCacheEntry>();

export function getCachedCharacterCardsContext(
  context: STContext,
  input: {
    activeCharacters: string[];
    activeEntityIds: string[];
    entityTrackingMode: EntityTrackingMode;
    preferredCharacterName?: string;
    build: () => string;
  },
): string {
  const activeCharactersKey = normalizeListKey(input.activeCharacters);
  const activeEntityIdsKey = normalizeListKey(input.activeEntityIds);
  const preferredCharacterName = String(input.preferredCharacterName ?? "").trim();
  const cacheKey = [
    activeCharactersKey,
    activeEntityIdsKey,
    input.entityTrackingMode,
    preferredCharacterName,
  ].join("|#|");
  const existing = characterCardsContextCache.get(cacheKey);
  if (
    existing &&
    existing.contextRef === context &&
    existing.charactersRef === (Array.isArray(context.characters) ? context.characters : null) &&
    existing.activeCharactersKey === activeCharactersKey &&
    existing.activeEntityIdsKey === activeEntityIdsKey &&
    existing.entityTrackingMode === input.entityTrackingMode &&
    existing.preferredCharacterName === preferredCharacterName
  ) {
    return existing.value;
  }

  const value = input.build();
  characterCardsContextCache.set(cacheKey, {
    contextRef: context,
    charactersRef: Array.isArray(context.characters) ? context.characters : null,
    activeCharactersKey,
    activeEntityIdsKey,
    entityTrackingMode: input.entityTrackingMode,
    preferredCharacterName,
    value,
  });
  return value;
}

export function getCachedLorebookContext(
  context: STContext,
  input: {
    maxChars: number;
    maxCap?: number;
    build: () => string;
  },
): string {
  const maxCap = Number.isFinite(input.maxCap) ? Number(input.maxCap) : 12000;
  const existing = lorebookContextCache.get(context);
  if (
    existing &&
    existing.contextRef === context &&
    existing.chatMetadataRef === context.chatMetadata &&
    existing.worldInfoRef === context.worldInfo &&
    existing.world_infoRef === context.world_info &&
    existing.lorebookRef === context.lorebook &&
    existing.maxChars === input.maxChars &&
    existing.maxCap === maxCap
  ) {
    return existing.value;
  }

  const value = input.build();
  lorebookContextCache.set(context, {
    contextRef: context,
    chatMetadataRef: context.chatMetadata,
    worldInfoRef: context.worldInfo,
    world_infoRef: context.world_info,
    lorebookRef: context.lorebook,
    maxChars: input.maxChars,
    maxCap,
    value,
  });
  return value;
}
