import {
  getEntityRegistryEntryByEntityIdForMessage,
  getEntityRegistryEntryForMessage,
  resolveEntityRegistryLookupValue,
} from "./entityRegistry";
import type { STContext } from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function isNarrativeRuntimeEntityId(entityId: string): boolean {
  return /^bst_narrative:/i.test(normalizeToken(entityId));
}

function listSeedLookupNamesForExplicitEntity(
  context: STContext | null,
  ownerName: string,
  entityId?: string | null,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };

  push(ownerName);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return names;

  const entry = getEntityRegistryEntryByEntityIdForMessage(context, normalizedEntityId, Number.MAX_SAFE_INTEGER);
  if (!entry) return names;

  push(entry.ownerName);
  push(entry.canonicalName);
  for (const alias of entry.aliases ?? []) {
    push(alias);
  }
  return names;
}

export function resolveSeededOwnerLookupValue<T>(
  context: STContext | null,
  byOwner: Record<string, T> | null | undefined,
  ownerName: string,
  entityId?: string | null,
): T | undefined {
  if (!byOwner) return undefined;

  for (const lookupName of listSeedLookupNamesForExplicitEntity(context, ownerName, entityId)) {
    const value = byOwner[lookupName];
    if (value !== undefined) return value;
  }

  const normalizedEntityId = normalizeToken(entityId);
  if (normalizedEntityId) {
    return undefined;
  }

  return resolveEntityRegistryLookupValue(context, byOwner, ownerName);
}

export function shouldUseConfiguredOwnerDefaults(
  context: STContext | null,
  ownerName: string,
  entityId?: string | null,
  entityKind?: string | null,
): boolean {
  if (normalizeToken(entityKind).toLowerCase() === "narrative-entity") {
    return false;
  }
  const normalizedEntityId = normalizeToken(entityId);
  if (normalizedEntityId && isNarrativeRuntimeEntityId(normalizedEntityId)) {
    return false;
  }
  if (normalizedEntityId) {
    const byEntityId = getEntityRegistryEntryByEntityIdForMessage(context, normalizedEntityId, Number.MAX_SAFE_INTEGER);
    if (byEntityId?.kind === "narrative-entity") {
      return false;
    }
  }
  const byOwnerName = getEntityRegistryEntryForMessage(context, ownerName, Number.MAX_SAFE_INTEGER);
  return byOwnerName?.kind !== "narrative-entity";
}

export function buildActiveSeedDefaultsPolicy(
  context: STContext | null,
  activeCharacters: string[],
  activeEntityIds: string[] | null | undefined,
): Map<string, boolean> {
  const policy = new Map<string, boolean>();
  for (const [index, ownerName] of activeCharacters.entries()) {
    policy.set(
      ownerName,
      shouldUseConfiguredOwnerDefaults(context, ownerName, activeEntityIds?.[index] ?? null),
    );
  }
  return policy;
}
