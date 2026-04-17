import { isTrackableAiMessage, isTrackableUserMessage } from "./messageFilter";
import type { STContext } from "./types";

export function validateUserTurnReplayState(input: {
  context: STContext;
  gateActive: boolean;
  gatedMessageIndex: number | null;
  gatedMessageText: string;
  getLastUserMessageIndex: (context: STContext) => number | null;
}): { ok: boolean; reason: string } {
  if (!input.gateActive) return { ok: false, reason: "gate_inactive" };
  if (input.gatedMessageIndex == null) return { ok: false, reason: "missing_message_index" };
  const index = input.gatedMessageIndex;
  if (index < 0 || index >= input.context.chat.length) return { ok: false, reason: "message_index_out_of_range" };
  const message = input.context.chat[index];
  if (!isTrackableUserMessage(message)) return { ok: false, reason: "message_not_user" };
  const currentUserIndex = input.getLastUserMessageIndex(input.context);
  if (currentUserIndex !== index) return { ok: false, reason: "newer_user_message_present" };
  const text = String(message.mes ?? "").trim();
  if (input.gatedMessageText && text !== input.gatedMessageText) {
    return { ok: false, reason: "user_message_changed" };
  }
  const hasAiReplyAfterUser = input.context.chat.slice(index + 1).some(item => isTrackableAiMessage(item));
  if (hasAiReplyAfterUser) return { ok: false, reason: "ai_reply_already_present" };
  return { ok: true, reason: "ok" };
}
