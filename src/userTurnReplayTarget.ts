export type GroupReplayTargetResolutionInput = {
  currentForcedChar: number | null;
  enabledIndices: number[];
  resolvedSceneOwnerIndices: number[] | null;
  lastAiCharacterIndex: number | null;
  currentCharacterId: number | null;
};

export type GroupReplayTargetResolution = {
  forceChid: number | null;
  skipReplay: boolean;
  skipReason: string | null;
  source:
    | "resolved_scene_empty"
    | "resolved_scene_current_forced"
    | "resolved_scene_single"
    | "resolved_scene_multi"
    | "existing_force"
    | "last_ai"
    | "current_character"
    | "first_enabled"
    | "none";
};

function uniqueIntegerList(values: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function resolveGroupReplayTarget(input: GroupReplayTargetResolutionInput): GroupReplayTargetResolution {
  const enabled = uniqueIntegerList(input.enabledIndices);
  const isEnabled = (value: number | null): value is number =>
    value != null && Number.isInteger(value) && enabled.includes(value);

  if (Array.isArray(input.resolvedSceneOwnerIndices)) {
    const resolved = uniqueIntegerList(input.resolvedSceneOwnerIndices.filter(value => enabled.includes(value)));
    if (!resolved.length) {
      return {
        forceChid: null,
        skipReplay: true,
        skipReason: "group_replay_no_scene_owner",
        source: "resolved_scene_empty",
      };
    }
    if (isEnabled(input.currentForcedChar) && resolved.includes(input.currentForcedChar)) {
      return {
        forceChid: input.currentForcedChar,
        skipReplay: false,
        skipReason: null,
        source: "resolved_scene_current_forced",
      };
    }
    if (resolved.length === 1) {
      return {
        forceChid: resolved[0],
        skipReplay: false,
        skipReason: null,
        source: "resolved_scene_single",
      };
    }
    return {
      forceChid: null,
      skipReplay: false,
      skipReason: null,
      source: "resolved_scene_multi",
    };
  }

  if (isEnabled(input.currentForcedChar)) {
    return {
      forceChid: input.currentForcedChar,
      skipReplay: false,
      skipReason: null,
      source: "existing_force",
    };
  }
  if (isEnabled(input.lastAiCharacterIndex)) {
    return {
      forceChid: input.lastAiCharacterIndex,
      skipReplay: false,
      skipReason: null,
      source: "last_ai",
    };
  }
  if (isEnabled(input.currentCharacterId)) {
    return {
      forceChid: input.currentCharacterId,
      skipReplay: false,
      skipReason: null,
      source: "current_character",
    };
  }
  if (enabled.length) {
    return {
      forceChid: enabled[0],
      skipReplay: false,
      skipReason: null,
      source: "first_enabled",
    };
  }
  return {
    forceChid: null,
    skipReplay: true,
    skipReason: "group_replay_no_resolved_target",
    source: "none",
  };
}
