import { EXTENSION_KEY } from "./constants";
import type { BetterSimTrackerSettings, Character, STContext } from "./types";
import { collectResolvedCharacterNames, resolveCharacterFromContext, resolveCharacterIdentity, resolveEntityTrackingMode } from "./entityResolution";
import { isTrackableAiMessage } from "./messageFilter";

const MANUAL_INACTIVE_METADATA_KEY = "bstManualInactiveCharacters";
type ManualInactiveOverrideMap = Record<string, number>;

function getGroupCharacters(context: STContext): Character[] {
  if (!context.groupId || !context.groups || !context.characters) return [];
  const group = context.groups.find(g => g.id === context.groupId);
  if (!group?.members?.length) return [];

  const disabled = new Set(group.disabled_members ?? []);
  return context.characters.filter(
    character => character.avatar && group.members?.includes(character.avatar) && !disabled.has(character.avatar),
  );
}

function getSingleCharacter(context: STContext): Character[] {
  if (!context.characters || context.characterId === undefined) return [];
  const character = context.characters[context.characterId];
  return character ? [character] : [];
}

function pushUniqueName(target: string[], seen: Set<string>, raw: unknown): void {
  const name = String(raw ?? "").trim();
  if (!name) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(name);
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

function collectActivityNamesFromMessage(
  context: STContext,
  message: STContext["chat"][number] | undefined,
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
  allNamesSet: Set<string>,
): string[] {
  if (!message?.name || !isTrackableAiMessage(message)) return [];
  const speaker = String(message.name ?? "").trim();
  if (!speaker) return [];
  const mode = resolveEntityTrackingMode(settings);
  if (mode !== "multi_character") {
    return allNamesSet.has(speaker) ? [speaker] : [];
  }

  const resolved = resolveCharacterIdentity(context, speaker, mode);
  if (!resolved) {
    return allNamesSet.has(speaker) ? [speaker] : [];
  }
  if (resolved.matchedBy === "alias") {
    return allNamesSet.has(resolved.resolvedName) ? [resolved.resolvedName] : [];
  }

  const source = resolveCharacterFromContext(context, speaker, mode);
  if (!source) {
    return allNamesSet.has(speaker) ? [speaker] : [];
  }

  const aliases = collectResolvedCharacterNames(
    { ...context, characters: [source] },
    { entityTrackingMode: mode },
  ).filter(name => name.toLowerCase() !== resolved.sourceName.toLowerCase());
  const visibleAliases = aliases.filter(alias => allNamesSet.has(alias));
  if (visibleAliases.length >= 2) return visibleAliases;
  const text = String(message.mes ?? "").trim().toLowerCase();
  const mentionedAliases = visibleAliases.filter(alias =>
    countAliasMentions(text, alias.toLowerCase()) > 0,
  );
  if (mentionedAliases.length) return mentionedAliases;
  return allNamesSet.has(speaker) ? [speaker] : [];
}

export function getAllTrackedCharacterNames(
  context: STContext,
  settings?: Pick<BetterSimTrackerSettings, "entityTrackingMode">,
): string[] {
  const mode = resolveEntityTrackingMode(settings ?? { entityTrackingMode: "standard" });
  const groupCharacters = getGroupCharacters(context);
  if (context.groupId) {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const character of groupCharacters) {
      pushUniqueName(merged, seen, character.name);
      for (const alias of collectResolvedCharacterNames({ ...context, characters: [character] }, { entityTrackingMode: mode })) {
        pushUniqueName(merged, seen, alias);
      }
    }
    const fromChat = Array.from(
      new Set(
        context.chat
          .filter(message => isTrackableAiMessage(message))
          .map(message => String(message.name ?? "").trim())
          .filter(Boolean),
      ),
    );
    for (const name of fromChat) {
      pushUniqueName(merged, seen, name);
    }
    if (merged.length) {
      return merged;
    }
  }

  const single = getSingleCharacter(context);
  if (single.length) {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const character of single) {
      pushUniqueName(merged, seen, character.name);
      for (const alias of collectResolvedCharacterNames({ ...context, characters: [character] }, { entityTrackingMode: mode })) {
        pushUniqueName(merged, seen, alias);
      }
    }
    return merged;
  }

  return context.name2 ? [context.name2] : [];
}

export function getActiveCharacterNames(
  context: STContext,
  settings: BetterSimTrackerSettings,
): string[] {
  return resolveActiveCharacterAnalysis(context, settings).activeCharacters;
}

function normalizeManualInactiveOverrideMap(raw: unknown, fallbackIndex: number): ManualInactiveOverrideMap {
  const out: ManualInactiveOverrideMap = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const name = String(item ?? "").trim();
      if (!name) continue;
      out[name] = fallbackIndex;
    }
    return out;
  }
  if (!raw || typeof raw !== "object") return out;
  for (const [owner, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = String(owner ?? "").trim();
    if (!name) continue;
    const parsed = Number(value);
    out[name] = Number.isFinite(parsed) ? parsed : fallbackIndex;
  }
  return out;
}

function persistManualInactiveOverrideMap(
  context: STContext,
  overrides: ManualInactiveOverrideMap,
): void {
  if (!context.chatMetadata || typeof context.chatMetadata !== "object") {
    context.chatMetadata = {};
  }
  if (Object.keys(overrides).length) {
    context.chatMetadata[MANUAL_INACTIVE_METADATA_KEY] = overrides;
  } else {
    delete context.chatMetadata[MANUAL_INACTIVE_METADATA_KEY];
  }
  context.saveMetadataDebounced?.();
  context.saveChatDebounced?.();
}

function readManualInactiveOverrideMap(context: STContext): ManualInactiveOverrideMap {
  const fallbackIndex = Math.max(0, context.chat.length - 1);
  const normalized = normalizeManualInactiveOverrideMap(
    context.chatMetadata?.[MANUAL_INACTIVE_METADATA_KEY],
    fallbackIndex,
  );
  const settingsMode = (context.extensionSettings?.[EXTENSION_KEY] as Partial<BetterSimTrackerSettings> | undefined)?.entityTrackingMode;
  const allTracked = getAllTrackedCharacterNames(context, { entityTrackingMode: settingsMode === "multi_character" ? "multi_character" : "standard" });
  const canonicalByLower = new Map(allTracked.map(name => [name.toLowerCase(), name] as const));
  const out: ManualInactiveOverrideMap = {};
  for (const [name, value] of Object.entries(normalized)) {
    const canonical = canonicalByLower.get(name.toLowerCase());
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

export function readManualInactiveCharacters(context: STContext): string[] {
  return Object.keys(readManualInactiveOverrideMap(context));
}

export function clearManualInactiveCharacters(context: STContext | null): void {
  if (!context?.chatMetadata || typeof context.chatMetadata !== "object") return;
  if (!Object.prototype.hasOwnProperty.call(context.chatMetadata, MANUAL_INACTIVE_METADATA_KEY)) return;
  delete context.chatMetadata[MANUAL_INACTIVE_METADATA_KEY];
  context.saveMetadataDebounced?.();
  context.saveChatDebounced?.();
}

export function setManualInactiveCharacter(
  context: STContext,
  character: string,
  inactive: boolean,
): string[] {
  const target = String(character ?? "").trim();
  if (!target) return readManualInactiveCharacters(context);
  const existing = readManualInactiveOverrideMap(context);
  const next = new Map<string, number>(Object.entries(existing));
  if (inactive) {
    next.set(target, Math.max(0, context.chat.length - 1));
  } else {
    for (const key of Array.from(next.keys())) {
      if (key.toLowerCase() === target.toLowerCase()) next.delete(key);
    }
  }
  const materialized = Object.fromEntries(next.entries());
  persistManualInactiveOverrideMap(context, materialized);
  const settingsMode = (context.extensionSettings?.[EXTENSION_KEY] as Partial<BetterSimTrackerSettings> | undefined)?.entityTrackingMode;
  const ordered = getAllTrackedCharacterNames(context, { entityTrackingMode: settingsMode === "multi_character" ? "multi_character" : "standard" });
  const materializedNames = ordered.filter(name => Object.prototype.hasOwnProperty.call(materialized, name));
  const leftovers = Object.keys(materialized).filter(name => !materializedNames.includes(name));
  if (leftovers.length) materializedNames.push(...leftovers);
  return materializedNames;
}

export function resolveActiveCharacterAnalysis(
  context: STContext,
  settings: BetterSimTrackerSettings,
  input?: {
    targetMessageIndex?: number;
  },
): {
  allCharacterNames: string[];
  activeCharacters: string[];
  reasons: Record<string, string>;
  lookback: number;
  manualInactiveCharacters: string[];
} {
  const targetMessageIndex = Math.min(
    Math.max(0, Number.isFinite(input?.targetMessageIndex) ? Math.trunc(input!.targetMessageIndex as number) : context.chat.length - 1),
    Math.max(0, context.chat.length - 1),
  );
  const scopedChat = context.chat.slice(0, targetMessageIndex + 1);
  const scopedContext: STContext = {
    ...context,
    chat: scopedChat,
  };
  const allNames = getAllTrackedCharacterNames(context, settings);
  const allNamesSet = new Set(allNames);
  const lookback = Math.max(1, settings.activityLookback);
  const reasons: Record<string, string> = {};
  const manualInactiveOverrides = readManualInactiveOverrideMap(scopedContext);
  const lastSpokeAtOverall = new Map<string, number>();
  for (let i = 0; i < scopedChat.length; i += 1) {
    const message = scopedChat[i];
    for (const name of collectActivityNamesFromMessage(scopedContext, message, settings, allNamesSet)) {
      lastSpokeAtOverall.set(name, i);
    }
  }
  let manualOverridesChanged = false;
  for (const [name, overrideIndex] of Object.entries(manualInactiveOverrides)) {
    const lastSpokeAt = lastSpokeAtOverall.get(name);
    if (lastSpokeAt == null) continue;
    if (lastSpokeAt > overrideIndex) {
      delete manualInactiveOverrides[name];
      manualOverridesChanged = true;
    }
  }
  if (manualOverridesChanged) {
    persistManualInactiveOverrideMap(context, manualInactiveOverrides);
  }
  const manualInactiveCharacters = Object.keys(manualInactiveOverrides)
    .filter(name => allNamesSet.has(name));
  const manualInactiveSet = new Set(manualInactiveCharacters.map(name => name.toLowerCase()));
  if (!settings.autoDetectActive) {
    const activeCharacters = allNames.filter(name => !manualInactiveSet.has(name.toLowerCase()));
    for (const name of allNames) {
      reasons[name] = manualInactiveSet.has(name.toLowerCase())
        ? "manual inactive override"
        : "autoDetectActive disabled";
    }
    return { allCharacterNames: allNames, activeCharacters, reasons, lookback, manualInactiveCharacters };
  }

  const recentMessages = scopedChat.slice(-lookback);
  const seen = new Set<string>();

  for (const message of recentMessages) {
    for (const name of collectActivityNamesFromMessage(scopedContext, message, settings, allNamesSet)) {
      seen.add(name);
      reasons[name] = `spoke in last ${lookback} messages`;
    }
  }

  // Keep recently-speaking characters active for longer even if they miss a few turns.
  // This prevents "off-screen" flips in scenes where one character is temporarily silent.
  const persistenceWindow = lookback + 2;
  if (persistenceWindow > lookback) {
    const persistenceStart = Math.max(0, scopedChat.length - persistenceWindow);
    const lastSpokeAt = new Map<string, number>();
    for (let i = persistenceStart; i < scopedChat.length; i += 1) {
      const message = scopedChat[i];
      for (const name of collectActivityNamesFromMessage(scopedContext, message, settings, allNamesSet)) {
        lastSpokeAt.set(name, i);
      }
    }
    for (const name of allNames) {
      if (seen.has(name)) continue;
      const index = lastSpokeAt.get(name);
      if (index == null) continue;
      const turnsAgo = Math.max(0, scopedChat.length - 1 - index);
      const turnsWord = turnsAgo === 1 ? "message" : "messages";
      seen.add(name);
      reasons[name] = `activity persistence: spoke ${turnsAgo} ${turnsWord} ago`;
    }
  }

  const maxDepartureScan = Math.max(6, lookback * 3);
  const scanStart = Math.max(0, scopedChat.length - maxDepartureScan);
  const scanSlice = scopedChat.slice(scanStart);

  const hasDepartureCue = (text: string, name: string): boolean => {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    const target = name.toLowerCase().trim();
    if (!normalized || !target || !normalized.includes(target)) return false;
    const departureVerbs = [
      "went",
      "goes",
      "left",
      "leaves",
      "walked",
      "walks",
      "ran",
      "returns",
      "returned",
      "headed",
      "moved",
      "retreated",
      "stayed in",
      "stays in",
      "is in",
    ];
    const departurePlaces = [
      "away",
      "out",
      "back",
      "home",
      "room",
      "bedroom",
      "upstairs",
      "downstairs",
      "outside",
      "bathroom",
      "hallway",
      "kitchen",
      "garden",
      "her room",
      "his room",
      "their room",
    ];
    const hasVerb = departureVerbs.some(verb => normalized.includes(verb));
    const hasPlace = departurePlaces.some(place => normalized.includes(place));
    return hasVerb && hasPlace;
  };

  for (const name of allNames) {
    let lastDepartureIndex = -1;
    for (let i = 0; i < scanSlice.length; i += 1) {
      const msg = scanSlice[i];
      if (!msg.is_user || msg.is_system) continue;
      const text = String(msg.mes ?? "");
      if (!text.trim()) continue;
      if (hasDepartureCue(text, name)) {
        lastDepartureIndex = scanStart + i;
      }
    }
    if (lastDepartureIndex < 0) continue;

    let spokeAfterDeparture = false;
    for (let i = lastDepartureIndex + 1; i < scopedChat.length; i += 1) {
      const msg = scopedChat[i];
      if (!isTrackableAiMessage(msg)) continue;
      if (String(msg.name ?? "").trim() === name) {
        spokeAfterDeparture = true;
        break;
      }
    }
    if (!spokeAfterDeparture) {
      seen.delete(name);
      reasons[name] = `departure cue at message ${lastDepartureIndex}, no speech after`;
    } else {
      reasons[name] = `departure cue at message ${lastDepartureIndex}, but spoke later`;
    }
  }

  if (seen.size === 0) {
    const visible = allNames.filter(name => {
      let lastDepartureIndex = -1;
      for (let i = 0; i < scanSlice.length; i += 1) {
        const msg = scanSlice[i];
        if (!msg.is_user || msg.is_system) continue;
        const text = String(msg.mes ?? "");
        if (!text.trim()) continue;
        if (hasDepartureCue(text, name)) {
          lastDepartureIndex = scanStart + i;
        }
      }
      if (lastDepartureIndex < 0) return true;
      for (let i = lastDepartureIndex + 1; i < scopedChat.length; i += 1) {
        const msg = scopedChat[i];
        if (!isTrackableAiMessage(msg)) continue;
        if (String(msg.name ?? "").trim() === name) {
          reasons[name] = `fallback visibility: spoke after departure cue at ${lastDepartureIndex}`;
          return true;
        }
      }
      reasons[name] = `fallback visibility: hidden after departure cue at ${lastDepartureIndex}`;
      return false;
    });
    const active = visible.length ? visible : allNames;
    for (const name of active) {
      if (!reasons[name]) reasons[name] = "fallback: include all tracked characters";
    }
    const filteredActive = active.filter(name => !manualInactiveSet.has(name.toLowerCase()));
    for (const name of manualInactiveCharacters) {
      reasons[name] = "manual inactive override";
    }
    return { allCharacterNames: allNames, activeCharacters: filteredActive, reasons, lookback, manualInactiveCharacters };
  }
  const activeCharacters = Array.from(seen).filter(name => !manualInactiveSet.has(name.toLowerCase()));
  for (const name of manualInactiveCharacters) {
    reasons[name] = "manual inactive override";
  }
  for (const name of allNames) {
    if (!reasons[name]) {
      reasons[name] = activeCharacters.includes(name)
        ? `no departure cue; included by recent activity window (${lookback})`
        : `not seen in recent activity window (${lookback})`;
    }
  }
  return { allCharacterNames: allNames, activeCharacters, reasons, lookback, manualInactiveCharacters };
}

export function buildRecentContext(
  context: STContext,
  messageCount: number,
  targetMessageIndex?: number,
): string {
  const safeTargetIndex = Number.isFinite(targetMessageIndex)
    ? Math.min(Math.max(0, Math.trunc(targetMessageIndex as number)), Math.max(0, context.chat.length - 1))
    : context.chat.length - 1;
  const scopedChat = context.chat.slice(0, safeTargetIndex + 1);
  const chunk = scopedChat.slice(-Math.max(1, messageCount));
  return chunk
    .map(message => {
      if (!message.is_user && !isTrackableAiMessage(message)) return null;
      const speaker = message.is_user ? context.name1 ?? "User" : message.name ?? "Character";
      return `${speaker}: ${message.mes}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}
