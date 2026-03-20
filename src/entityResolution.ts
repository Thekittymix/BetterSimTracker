import type { BetterSimTrackerSettings, Character, ChatMessage, STContext } from "./types";

export type EntityTrackingMode = "standard" | "multi_character";

export type ResolvedCharacterIdentity = {
  sourceName: string;
  sourceAvatar: string | null;
  resolvedName: string;
  matchedBy: "source" | "alias";
};

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function stripOuterPunctuation(value: string): string {
  return value
    .replace(/^[\s"'`([{<]+/g, "")
    .replace(/[\s"',.;:!?)}\]>]+$/g, "")
    .trim();
}

function isPlausibleAliasToken(value: string): boolean {
  const candidate = stripOuterPunctuation(value);
  if (!candidate) return false;
  if (candidate.length < 2 || candidate.length > 40) return false;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (!/[A-Za-z]/.test(candidate)) return false;
  if (/^[&/+|,-]+$/.test(candidate)) return false;
  return true;
}

export function extractMultiCharacterAliases(sourceName: string): string[] {
  const raw = normalizeToken(sourceName);
  if (!raw) return [];

  const pipeIndex = raw.indexOf("|");
  const colonIndex = raw.indexOf(":");
  let listSource = "";
  if (pipeIndex >= 0) {
    listSource = raw.slice(pipeIndex + 1);
  } else if (colonIndex >= 0) {
    listSource = raw.slice(colonIndex + 1);
  } else {
    return [];
  }

  const normalizedList = listSource
    .replace(/\s*&\s*/g, ", ")
    .replace(/\s+and\s+/gi, ", ")
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ");
  const parts = normalizedList
    .split(",")
    .map(part => stripOuterPunctuation(part))
    .filter(isPlausibleAliasToken);
  const aliases = uniqueStrings(parts);
  return aliases.length >= 2 ? aliases : [];
}

function getCharacterAliases(character: Character, mode: EntityTrackingMode): string[] {
  const sourceName = normalizeToken(character?.name);
  if (!sourceName) return [];
  if (mode !== "multi_character") return [sourceName];
  const aliases = extractMultiCharacterAliases(sourceName);
  return uniqueStrings([sourceName, ...aliases]);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countAliasMentions(text: string, alias: string): number {
  const escaped = escapeRegex(alias.trim());
  if (!escaped) return 0;
  const pattern = new RegExp(`(^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, "gi");
  let count = 0;
  while (pattern.exec(text)) count += 1;
  return count;
}

function inferMessageAliasSpeaker(messageText: string, aliases: string[]): string | null {
  const text = normalizeToken(messageText);
  if (!text) return null;
  const normalizedText = text.toLowerCase();
  let bestAlias: string | null = null;
  let bestScore = 0;
  let tied = false;

  for (const alias of aliases) {
    const trimmed = normalizeToken(alias);
    if (!trimmed) continue;
    const escaped = escapeRegex(trimmed);
    const startsWithAlias = new RegExp(`^[\\s"'([{-]*${escaped}(?:\\b|['’]s\\b)`, "i").test(text);
    const mentions = countAliasMentions(normalizedText, trimmed.toLowerCase());
    const score = (startsWithAlias ? 100 : 0) + mentions;
    if (score <= 0) continue;
    if (score > bestScore) {
      bestAlias = trimmed;
      bestScore = score;
      tied = false;
      continue;
    }
    if (score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : bestAlias;
}

export function resolveEntityTrackingMode(
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): EntityTrackingMode {
  return settings.entityTrackingMode === "multi_character" ? "multi_character" : "standard";
}

export function resolveCharacterIdentity(
  context: STContext | null,
  ownerName: string,
  mode: EntityTrackingMode,
): ResolvedCharacterIdentity | null {
  const target = normalizeToken(ownerName);
  if (!target || !Array.isArray(context?.characters)) return null;
  const targetKey = normalizeKey(target);

  for (const character of context.characters) {
    const sourceName = normalizeToken(character?.name);
    if (!sourceName) continue;
    const sourceAvatar = normalizeToken(character?.avatar) || null;
    const aliases = getCharacterAliases(character, mode);
    if (!aliases.length) continue;
    if (normalizeKey(sourceName) === targetKey) {
      return { sourceName, sourceAvatar, resolvedName: sourceName, matchedBy: "source" };
    }
    const alias = aliases.find(candidate => normalizeKey(candidate) === targetKey && normalizeKey(candidate) !== normalizeKey(sourceName));
    if (alias) {
      return { sourceName, sourceAvatar, resolvedName: alias, matchedBy: "alias" };
    }
  }

  return null;
}

export function resolveCharacterFromContext(
  context: STContext | null,
  ownerName: string,
  mode: EntityTrackingMode,
): Character | null {
  const resolved = resolveCharacterIdentity(context, ownerName, mode);
  if (!resolved || !Array.isArray(context?.characters)) return null;
  return context.characters.find(character => {
    const sourceName = normalizeToken(character?.name);
    const sourceAvatar = normalizeToken(character?.avatar) || null;
    return normalizeKey(sourceName) === normalizeKey(resolved.sourceName)
      && sourceAvatar === resolved.sourceAvatar;
  }) ?? null;
}

export function collectResolvedCharacterNames(
  context: STContext | null,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  if (!Array.isArray(context?.characters)) return [];
  const mode = settings.entityTrackingMode ?? "standard";
  const names: string[] = [];
  for (const character of context.characters) {
    names.push(...getCharacterAliases(character, mode));
  }
  return uniqueStrings(names);
}

export function resolveMessageScopedActiveCharacters(
  context: STContext | null,
  activeCharacters: string[],
  message: ChatMessage | null | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings);
  if (mode !== "multi_character") return [...activeCharacters];
  if (!message || message.is_user || message.is_system) return [...activeCharacters];

  const messageText = normalizeToken(message.mes);
  if (!messageText) return [...activeCharacters];

  return activeCharacters.map(ownerName => {
    const resolved = resolveCharacterIdentity(context, ownerName, mode);
    if (!resolved) return ownerName;
    if (resolved.matchedBy === "alias") return resolved.resolvedName;
    const source = resolveCharacterFromContext(context, ownerName, mode);
    if (!source) return ownerName;
    const aliases = getCharacterAliases(source, mode)
      .filter(alias => normalizeKey(alias) !== normalizeKey(resolved.sourceName));
    if (!aliases.length) return ownerName;
    return inferMessageAliasSpeaker(messageText, aliases) ?? ownerName;
  });
}
