import type { CapturedGenerationIntent } from "./runtimeEventHelpers";

export type NormalizedReplayExecution = {
  type: string;
  options: Record<string, unknown>;
  dryRun: boolean;
  forcedAutomaticTrigger: boolean;
  forcedGroupCharacterId: number | null;
  skipReplay: boolean;
  skipReason: string | null;
};

export function executeUserTurnReplay(input: {
  triggerReason: string;
  intent: CapturedGenerationIntent;
  replayValidation: { ok: boolean; reason: string };
  hasGenerate: boolean;
  normalizedReplay: NormalizedReplayExecution;
  pushTrace: (event: string, payload: Record<string, unknown>) => void;
  resetGate: (reason: string) => void;
  onReplay: (normalizedReplay: NormalizedReplayExecution) => void;
}): void {
  if (!input.replayValidation.ok) {
    input.pushTrace("user_gate.replay_skip", {
      reason: input.replayValidation.reason,
      triggerReason: input.triggerReason,
      type: input.intent.type,
    });
    input.resetGate(input.replayValidation.reason);
    return;
  }
  if (!input.hasGenerate) {
    input.pushTrace("user_gate.replay_skip", {
      reason: "context_generate_unavailable",
      triggerReason: input.triggerReason,
      type: input.intent.type,
    });
    input.resetGate("context_generate_unavailable");
    return;
  }
  if (input.normalizedReplay.skipReplay) {
    input.pushTrace("user_gate.replay_skip", {
      reason: input.normalizedReplay.skipReason ?? "replay_guard",
      triggerReason: input.triggerReason,
      type: input.normalizedReplay.type,
      optionKeys: Object.keys(input.normalizedReplay.options),
      forcedAutomaticTrigger: input.normalizedReplay.forcedAutomaticTrigger,
      forcedGroupCharacterId: input.normalizedReplay.forcedGroupCharacterId,
    });
    input.resetGate(input.normalizedReplay.skipReason ?? "replay_guard");
    return;
  }

  input.resetGate("replay_start");
  input.onReplay(input.normalizedReplay);
}
