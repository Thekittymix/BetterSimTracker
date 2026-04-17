import test from "node:test";
import assert from "node:assert/strict";

import { validateUserTurnReplayState } from "../src/userTurnReplayPolicy";
import type { ChatMessage, STContext } from "../src/types";

function makeContext(chat: ChatMessage[]): STContext {
  return { chat };
}

test("validateUserTurnReplayState allows replay only for the latest unchanged user message without an AI reply after it", () => {
  const context = makeContext([
    { is_user: true, mes: "Hi" },
    { is_user: false, is_system: false, mes: "Old AI" },
    { is_user: true, mes: "Latest user" },
  ]);

  const result = validateUserTurnReplayState({
    context,
    gateActive: true,
    gatedMessageIndex: 2,
    gatedMessageText: "Latest user",
    getLastUserMessageIndex: ctx => ctx.chat.length - 1,
  });

  assert.deepEqual(result, { ok: true, reason: "ok" });
});

test("validateUserTurnReplayState blocks replay when an AI reply already exists after the gated user message", () => {
  const context = makeContext([
    { is_user: true, mes: "User turn" },
    { is_user: false, is_system: false, mes: "AI reply" },
  ]);

  const result = validateUserTurnReplayState({
    context,
    gateActive: true,
    gatedMessageIndex: 0,
    gatedMessageText: "User turn",
    getLastUserMessageIndex: () => 0,
  });

  assert.deepEqual(result, { ok: false, reason: "ai_reply_already_present" });
});

test("validateUserTurnReplayState blocks replay when a newer user message exists or the gated message changed", () => {
  const newerUserContext = makeContext([
    { is_user: true, mes: "Older user" },
    { is_user: true, mes: "Newer user" },
  ]);
  const changedTextContext = makeContext([
    { is_user: true, mes: "Edited text" },
  ]);

  const newerUser = validateUserTurnReplayState({
    context: newerUserContext,
    gateActive: true,
    gatedMessageIndex: 0,
    gatedMessageText: "Older user",
    getLastUserMessageIndex: () => 1,
  });
  const changedText = validateUserTurnReplayState({
    context: changedTextContext,
    gateActive: true,
    gatedMessageIndex: 0,
    gatedMessageText: "Original text",
    getLastUserMessageIndex: () => 0,
  });

  assert.deepEqual(newerUser, { ok: false, reason: "newer_user_message_present" });
  assert.deepEqual(changedText, { ok: false, reason: "user_message_changed" });
});
