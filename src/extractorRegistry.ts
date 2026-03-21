import { GLOBAL_TRACKER_KEY } from "./constants";
import { resolveEntityRegistryLookupValue } from "./entityRegistry";
import type { STContext } from "./types";

export function resolvePreviousCustomNonNumericValue(
  registryContext: STContext | null,
  previousByOwner: Record<string, unknown> | null | undefined,
  ownerName: string,
  globalScope = false,
): unknown {
  if (!previousByOwner) return undefined;
  if (globalScope) {
    return previousByOwner[GLOBAL_TRACKER_KEY] ?? resolveEntityRegistryLookupValue(registryContext, previousByOwner, ownerName);
  }
  return resolveEntityRegistryLookupValue(registryContext, previousByOwner, ownerName);
}
