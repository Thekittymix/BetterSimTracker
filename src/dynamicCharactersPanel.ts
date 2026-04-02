import {
  deleteEntityRegistryEntry,
  getEntityRegistryLifecycleStateForEntityIdForMessage,
  readEntityRegistry,
  setEntityRegistryCardColor,
  setEntityRegistryLifecycleOverride,
} from "./entityRegistry";
import type {
  BetterSimTrackerSettings,
  STContext,
  TrackerEntityLifecycleState,
  TrackerEntityRegistryEntry,
} from "./types";
import {
  EDIT_STATS_DIALOG_CLASS,
  EDIT_STATS_MODAL_CLASS,
  ensureStyles,
  escapeHtml,
  getStableAutoCardColor,
  normalizeHexColor,
} from "./ui";

const OPTION_ID = "bst-option-dynamic-characters";
const DIALOG_ID = "bst-dynamic-characters-dialog";
const STYLE_ID = "bst-dynamic-characters-style";

export type DynamicCharactersManagerItem = {
  entityId: string;
  ownerName: string;
  lifecycleState: TrackerEntityLifecycleState;
  cardColor: string | null;
  kind: TrackerEntityRegistryEntry["kind"];
  introducedAtMessageIndex: number;
  lastSeenMessageIndex: number;
};

function ensurePanelStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.bst-dynamic-dialog.bst-edit-dialog {
  z-index: 2147483647;
}
.bst-dynamic-dialog-modal.bst-edit-modal {
  width: min(860px, calc(100vw - 20px));
  display: grid;
  gap: 12px;
}
.bst-dynamic-list {
  display: grid;
  gap: 10px;
}
.bst-dynamic-item.bst-custom-stat-row {
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
}
.bst-dynamic-item-main.bst-custom-stat-main {
  gap: 4px;
  min-width: 0;
}
.bst-dynamic-item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bst-dynamic-item-actions.bst-custom-stat-actions {
  min-width: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.bst-dynamic-control-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
}
.bst-dynamic-color-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(241, 246, 255, 0.92);
}
.bst-dynamic-color-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.bst-dynamic-auto-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bst-dynamic-color-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bst-dynamic-color-field .bst-color-inputs {
  margin-top: 0;
}
.bst-dynamic-color-field .bst-color-inputs input[type="color"] {
  width: 40px;
  min-width: 40px;
  height: 30px;
}
.bst-dynamic-color-field[hidden] {
  display: none !important;
}
.bst-dynamic-action-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.bst-dynamic-auto-toggle {
  justify-content: flex-start;
}
.bst-dynamic-action-inline .bst-btn {
  min-height: 32px;
  padding: 5px 10px;
}
.bst-dynamic-action-inline .bst-icon-btn {
  width: 32px;
  height: 32px;
  min-width: 32px !important;
}
.bst-dynamic-delete-btn {
  min-width: 32px;
}
.bst-dynamic-empty {
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  opacity: 0.82;
  background: rgba(6, 10, 18, 0.44);
}
@media (max-width: 760px) {
  .bst-dynamic-item.bst-custom-stat-row {
    align-items: stretch;
  }
  .bst-dynamic-item-actions.bst-custom-stat-actions {
    margin-left: 0;
    justify-content: flex-start;
  }
  .bst-dynamic-control-group {
    width: 100%;
    justify-content: flex-start;
  }
}
`;
  document.head.appendChild(style);
}

export function resolveDynamicCharactersManagerMessageIndex(context: STContext | null): number | null {
  if (!context?.chat?.length) return null;
  for (let index = context.chat.length - 1; index >= 0; index -= 1) {
    const message = context.chat[index] as { is_system?: boolean } | null | undefined;
    if (message?.is_system) continue;
    return index;
  }
  return null;
}

function lifecycleRank(state: TrackerEntityLifecycleState): number {
  if (state === "active") return 0;
  if (state === "inactive") return 1;
  return 2;
}

function statusLabel(state: TrackerEntityLifecycleState): string {
  if (state === "active") return "Active";
  if (state === "inactive") return "Inactive";
  return "Archived";
}

function seenSummary(item: DynamicCharactersManagerItem): string {
  return `Seen #${item.introducedAtMessageIndex} · Last #${item.lastSeenMessageIndex}`;
}

function colorInputValue(cardColor: string | null): string {
  return normalizeHexColor(cardColor) ?? "#66ccff";
}

function resolveDisplayedCardColor(item: DynamicCharactersManagerItem): string {
  return normalizeHexColor(item.cardColor) ?? normalizeHexColor(getStableAutoCardColor(item.ownerName)) ?? "#66ccff";
}

function resolveAutoColorEnabled(item: DynamicCharactersManagerItem): boolean {
  return !item.cardColor;
}

export function listManageableDynamicCharacters(
  context: STContext | null,
  settings: BetterSimTrackerSettings | null,
): DynamicCharactersManagerItem[] {
  if (!context || !settings || settings.entityTrackingMode !== "dynamic_characters") return [];
  const registry = readEntityRegistry(context);
  const messageIndex = resolveDynamicCharactersManagerMessageIndex(context);
  if (messageIndex == null) return [];
  return Object.values(registry.entities)
    .filter(entry => entry.kind !== "owner")
    .filter(entry => entry.introducedAtMessageIndex <= messageIndex)
    .map(entry => {
      const lifecycle = getEntityRegistryLifecycleStateForEntityIdForMessage(context, entry.id, messageIndex);
      const lifecycleState = lifecycle?.archivedAtMessageIndex != null
        ? "archived"
        : entry.lifecycleState;
      return {
        entityId: entry.id,
        ownerName: entry.ownerName,
        lifecycleState,
        cardColor: normalizeHexColor(entry.cardColor),
        kind: entry.kind,
        introducedAtMessageIndex: entry.introducedAtMessageIndex,
        lastSeenMessageIndex: entry.lastSeenMessageIndex,
      };
    })
    .sort((a, b) => {
      const stateDelta = lifecycleRank(a.lifecycleState) - lifecycleRank(b.lifecycleState);
      if (stateDelta !== 0) return stateDelta;
      if (a.ownerName !== b.ownerName) return a.ownerName.localeCompare(b.ownerName);
      return a.entityId.localeCompare(b.entityId);
    });
}

async function persistManualRegistryMutation(context: STContext): Promise<void> {
  context.saveMetadataDebounced?.();
  context.saveChatDebounced?.();
  try {
    await context.saveChat?.();
  } catch {
    // Ignore save failures here; runtime UI already updated locally.
  }
}

export function renderDynamicCharactersDialogMarkup(items: DynamicCharactersManagerItem[]): string {
  return `
    <div class="bst-edit-head bst-surface-header">
      <div class="bst-surface-header-copy">
        <div class="bst-surface-title">Dynamic Characters</div>
        <div class="bst-surface-subtitle">Manage archive state and card color for this chat's dynamic characters.</div>
      </div>
      <div class="bst-surface-actions">
        <button type="button" class="bst-btn bst-btn-soft bst-close-btn" data-bst-dynamic-action="close" aria-label="Close dynamic characters manager">&times;</button>
      </div>
    </div>
    <div class="bst-dynamic-list">
      ${items.length ? items.map(item => `
        <div class="bst-dynamic-item bst-custom-stat-row" data-bst-dynamic-entity="${escapeHtml(item.entityId)}">
          <div class="bst-dynamic-item-main bst-custom-stat-main">
            <div class="bst-dynamic-item-title-row bst-custom-stat-title">
              <span>${escapeHtml(item.ownerName)}</span>
              <span class="bst-custom-stat-flag">${escapeHtml(statusLabel(item.lifecycleState))}</span>
            </div>
            <div class="bst-custom-stat-meta">${escapeHtml(seenSummary(item))}</div>
          </div>
          <div class="bst-dynamic-item-actions bst-custom-stat-actions">
            <div class="bst-dynamic-control-group" data-bst-dynamic-color-group>
              <span class="bst-dynamic-color-label">Card color</span>
              <div class="bst-dynamic-color-inline">
                <button type="button" class="bst-custom-stat-toggle bst-custom-stat-toggle-compact bst-dynamic-auto-toggle ${resolveAutoColorEnabled(item) ? "is-on" : "is-off"}" data-bst-dynamic-action="toggle-auto-color" data-bst-dynamic-entity="${escapeHtml(item.entityId)}" aria-pressed="${resolveAutoColorEnabled(item) ? "true" : "false"}" title="${resolveAutoColorEnabled(item) ? "Auto color is on" : "Auto color is off"}">
                  <span class="bst-custom-stat-toggle-pill" aria-hidden="true"></span>
                  <span class="bst-custom-stat-toggle-label">Auto color</span>
                </button>
                <label class="bst-dynamic-color-field" ${resolveAutoColorEnabled(item) ? "hidden" : ""} aria-label="Manual color for ${escapeHtml(item.ownerName)}">
                  <div class="bst-color-inputs">
                    <input type="color" value="${escapeHtml(resolveDisplayedCardColor(item))}" data-bst-dynamic-action="color" data-bst-dynamic-entity="${escapeHtml(item.entityId)}" aria-label="Manual color for ${escapeHtml(item.ownerName)}">
                  </div>
                </label>
              </div>
            </div>
            <div class="bst-dynamic-control-group bst-dynamic-action-inline" data-bst-dynamic-actions>
              <button type="button" class="bst-btn bst-btn-soft" data-bst-dynamic-action="${item.lifecycleState === "archived" ? "restore" : "archive"}" data-bst-dynamic-entity="${escapeHtml(item.entityId)}">${item.lifecycleState === "archived" ? "Restore" : "Archive"}</button>
              <button type="button" class="bst-btn bst-btn-danger bst-icon-btn bst-dynamic-delete-btn" data-bst-dynamic-action="delete" data-bst-dynamic-entity="${escapeHtml(item.entityId)}" aria-label="Delete dynamic character ${escapeHtml(item.ownerName)}" title="Delete dynamic character">
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      `).join("") : `<div class="bst-dynamic-empty">No dynamic characters are currently tracked in this chat.</div>`}
    </div>
  `;
}

export function initDynamicCharactersPanel(input: {
  getContext: () => STContext | null;
  getSettings: () => BetterSimTrackerSettings | null;
  onStateChanged: () => void;
}): { sync: () => void } {
  ensureStyles();
  ensurePanelStyles();

  const closeDialog = (): void => {
    const dialog = document.getElementById(DIALOG_ID) as HTMLDialogElement | null;
    if (!dialog) return;
    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        // ignore
      }
    }
    dialog.remove();
  };

  const renderDialog = (): void => {
    closeDialog();
    const context = input.getContext();
    const settings = input.getSettings();
    const items = listManageableDynamicCharacters(context, settings);
    if (!context || !settings || settings.entityTrackingMode !== "dynamic_characters") return;

    const dialog = document.createElement("dialog");
    dialog.id = DIALOG_ID;
    dialog.className = `${EDIT_STATS_DIALOG_CLASS} bst-dynamic-dialog`;
    dialog.innerHTML = `
      <div class="${EDIT_STATS_MODAL_CLASS} bst-dynamic-dialog-modal">
        ${renderDynamicCharactersDialogMarkup(items)}
      </div>
    `;

    dialog.addEventListener("click", async event => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-bst-dynamic-action]");
      const action = String(target?.getAttribute("data-bst-dynamic-action") ?? "").trim();
      if (!action) return;
      if (action === "close") {
        closeDialog();
        return;
      }
      const entityId = String(target?.getAttribute("data-bst-dynamic-entity") ?? "").trim();
      const liveContext = input.getContext();
      if (!liveContext || !entityId) return;
      const messageIndex = resolveDynamicCharactersManagerMessageIndex(liveContext);
      if (messageIndex == null) return;
      let changed = false;
      if (action === "archive") {
        changed = setEntityRegistryLifecycleOverride(liveContext, entityId, messageIndex, "archived");
      } else if (action === "restore") {
        changed = setEntityRegistryLifecycleOverride(liveContext, entityId, messageIndex, "inactive");
      } else if (action === "toggle-auto-color") {
        const liveItem = listManageableDynamicCharacters(liveContext, input.getSettings())
          .find(item => item.entityId === entityId);
        if (!liveItem) return;
        changed = resolveAutoColorEnabled(liveItem)
          ? setEntityRegistryCardColor(liveContext, entityId, resolveDisplayedCardColor(liveItem))
          : setEntityRegistryCardColor(liveContext, entityId, null);
      } else if (action === "delete") {
        changed = deleteEntityRegistryEntry(liveContext, entityId);
      }
      if (changed) {
        await persistManualRegistryMutation(liveContext);
        input.onStateChanged();
        renderDialog();
      }
    });

    dialog.addEventListener("change", async event => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      const liveContext = input.getContext();
      const entityId = String(target.getAttribute("data-bst-dynamic-entity") ?? "").trim();
      if (!liveContext || !entityId) return;
      const action = String(target.getAttribute("data-bst-dynamic-action") ?? "").trim();
      if (action === "color") {
        if (setEntityRegistryCardColor(liveContext, entityId, target.value)) {
          await persistManualRegistryMutation(liveContext);
          input.onStateChanged();
          renderDialog();
        }
      }
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  };

  const sync = (): void => {
    const menu = document.querySelector("#options .options-content") as HTMLElement | null;
    if (!menu) return;
    let option = document.getElementById(OPTION_ID) as HTMLAnchorElement | null;
    if (!option) {
      option = document.createElement("a");
      option.id = OPTION_ID;
      option.innerHTML = `
        <i class="fa-lg fa-solid fa-people-group"></i>
        <span>Dynamic Characters</span>
      `;
      menu.appendChild(option);
      option.addEventListener("click", event => {
        event.preventDefault();
        const optionsRoot = document.getElementById("options");
        if (optionsRoot instanceof HTMLElement) {
          optionsRoot.style.display = "none";
        }
        renderDialog();
      });
    }
    const items = listManageableDynamicCharacters(input.getContext(), input.getSettings());
    option.style.display = items.length ? "" : "none";
  };

  document.addEventListener("click", event => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("#options_button")) return;
    window.setTimeout(() => sync(), 0);
  });

  return { sync };
}
