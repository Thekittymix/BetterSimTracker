import type { STContext } from "./types";

type ChatPersistContext = Pick<STContext, "saveChat" | "saveChatDebounced"> | null | undefined;
type MetadataChatPersistContext = Pick<STContext, "saveMetadataDebounced" | "saveChat" | "saveChatDebounced"> | null | undefined;

export async function persistChatNow(context: ChatPersistContext): Promise<void> {
  if (!context) return;
  if (!context.saveChat) {
    context.saveChatDebounced?.();
    return;
  }
  try {
    await context.saveChat();
  } catch (error) {
    context.saveChatDebounced?.();
    throw error;
  }
}

export async function persistChatNowBestEffort(context: ChatPersistContext): Promise<void> {
  try {
    await persistChatNow(context);
  } catch {
    // Best-effort persistence should not surface save failures to the caller.
  }
}

export async function persistMetadataAndChatNowBestEffort(context: MetadataChatPersistContext): Promise<void> {
  context?.saveMetadataDebounced?.();
  await persistChatNowBestEffort(context);
}
