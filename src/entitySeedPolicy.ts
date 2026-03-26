import { getEntityRegistryEntryByEntityIdForMessage, getEntityRegistryEntryForMessage } from "./entityRegistry";
import type { STContext } from "./types";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function isNarrativeRuntimeEntityId(entityId: string): boolean {
  return /^bst_narrative:/i.test(normalizeToken(entityId));
}

export function shouldUseConfiguredOwnerDefaults(
  context: STContext | null,
  ownerName: string,
  entityId?: string | null,
): boolean {
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
