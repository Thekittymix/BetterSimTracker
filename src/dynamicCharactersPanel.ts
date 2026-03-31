import {
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
import { ensureStyles, escapeHtml, normalizeHexColor } from "./ui";

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
.bst-dynamic-dialog {
  width: min(680px, calc(100vw - 32px));
  max-width: min(680px, calc(100vw - 32px));
  border: 1px solid rgba(168, 203, 245, 0.24);
  border-radius: 18px;
  padding: 0;
  background:
    radial-gradient(circle at top left, rgba(103, 168, 255, 0.15), transparent 34%),
    linear-gradient(180deg, rgba(16, 21, 33, 0.98), rgba(12, 17, 28, 0.98));
  color: #f3f5f9;
  box-shadow: 0 28px 80px rgba(0,0,0,0.55);
}
.bst-dynamic-dialog::backdrop {
  background: rgba(4, 8, 14, 0.66);
  backdrop-filter: blur(2px);
}
.bst-dynamic-dialog-body {
  padding: 18px 18px 16px;
  display: grid;
  gap: 12px;
}
.bst-dynamic-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.bst-dynamic-dialog-title {
  font-size: 17px;
  font-weight: 700;
}
.bst-dynamic-dialog-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(220, 235, 255, 0.74);
}
.bst-dynamic-dialog-close {
  flex: 0 0 auto;
}
.bst-dynamic-list {
  display: grid;
  gap: 10px;
}
.bst-dynamic-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(188, 212, 242, 0.22);
  background: rgba(255,255,255,0.04);
}
.bst-dynamic-item-main {
  min-width: 0;
  display: grid;
  gap: 8px;
}
.bst-dynamic-item-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.bst-dynamic-item-name {
  font-size: 14px;
  font-weight: 700;
  color: #f7fbff;
}
.bst-dynamic-item-meta {
  font-size: 12px;
  color: rgba(220, 235, 255, 0.72);
}
.bst-dynamic-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.bst-dynamic-color-preview {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
}
.bst-dynamic-color-picker {
  width: 32px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.06);
  cursor: pointer;
}
.bst-dynamic-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
.bst-dynamic-color-picker::-webkit-color-swatch,
.bst-dynamic-color-picker::-moz-color-swatch {
  border: 0;
  border-radius: 999px;
}
.bst-dynamic-empty {
  padding: 18px 16px;
  border-radius: 16px;
  border: 1px dashed rgba(188, 212, 242, 0.26);
  color: rgba(220, 235, 255, 0.78);
  background: rgba(255,255,255,0.03);
  font-size: 13px;
}
`;
  document.head.appendChild(style);
}

function latestMessageIndex(context: STContext): number {
  return Math.max(0, context.chat.length - 1);
}

function lifecycleRank(state: TrackerEntityLifecycleState): number {
  if (state === "active") return 0;
  if (state === "inactive") return 1;
  return 2;
}

export function listManageableDynamicCharacters(
  context: STContext | null,
  settings: BetterSimTrackerSettings | null,
): DynamicCharactersManagerItem[] {
  if (!context || !settings || settings.entityTrackingMode !== "dynamic_characters") return [];
  const registry = readEntityRegistry(context);
  const messageIndex = latestMessageIndex(context);
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

function statusLabel(state: TrackerEntityLifecycleState): string {
  if (state === "active") return "Active";
  if (state === "inactive") return "Inactive";
  return "Archived";
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
    dialog.className = "bst-dynamic-dialog";
    dialog.innerHTML = `
      <div class="bst-dynamic-dialog-body">
        <div class="bst-dynamic-dialog-header">
          <div>
            <div class="bst-dynamic-dialog-title">Dynamic Characters</div>
            <div class="bst-dynamic-dialog-subtitle">Manage archive state and card color for this chat's dynamic characters.</div>
          </div>
          <button type="button" class="bst-btn bst-btn-soft bst-dynamic-dialog-close" data-bst-dynamic-action="close">Close</button>
        </div>
        <div class="bst-dynamic-list">
          ${items.length ? items.map(item => `
            <div class="bst-dynamic-item" data-bst-dynamic-entity="${escapeHtml(item.entityId)}">
              <div class="bst-dynamic-item-main">
                <div class="bst-dynamic-item-title-row">
                  <span class="bst-dynamic-item-name">${escapeHtml(item.ownerName)}</span>
                  <span class="bst-status ${item.lifecycleState === "active" ? "bst-status-active" : (item.lifecycleState === "inactive" ? "bst-status-inactive" : "bst-status-archived")}">${escapeHtml(statusLabel(item.lifecycleState))}</span>
                </div>
                <div class="bst-dynamic-item-meta">Introduced at message #${item.introducedAtMessageIndex} · Last seen #${item.lastSeenMessageIndex}</div>
              </div>
              <div class="bst-dynamic-item-actions">
                <span class="bst-dynamic-color-preview" style="background:${escapeHtml(item.cardColor ?? "#1f2028")};"></span>
                <input class="bst-dynamic-color-picker" type="color" value="${escapeHtml(item.cardColor ?? "#1f2028")}" data-bst-dynamic-action="color" data-bst-dynamic-entity="${escapeHtml(item.entityId)}" aria-label="Card color for ${escapeHtml(item.ownerName)}">
                <button type="button" class="bst-btn bst-btn-soft" data-bst-dynamic-action="auto-color" data-bst-dynamic-entity="${escapeHtml(item.entityId)}">Auto</button>
                <button type="button" class="bst-btn ${item.lifecycleState === "archived" ? "bst-btn-soft" : "bst-btn-danger"}" data-bst-dynamic-action="${item.lifecycleState === "archived" ? "restore" : "archive"}" data-bst-dynamic-entity="${escapeHtml(item.entityId)}">${item.lifecycleState === "archived" ? "Restore" : "Archive"}</button>
              </div>
            </div>
          `).join("") : `<div class="bst-dynamic-empty">No dynamic characters are currently tracked in this chat.</div>`}
        </div>
      </div>
    `;

    dialog.addEventListener("click", event => {
      const target = event.target as HTMLElement | null;
      const action = String(target?.getAttribute("data-bst-dynamic-action") ?? "").trim();
      if (!action) return;
      if (action === "close") {
        closeDialog();
        return;
      }
      const entityId = String(target?.getAttribute("data-bst-dynamic-entity") ?? "").trim();
      const liveContext = input.getContext();
      if (!liveContext || !entityId) return;
      const messageIndex = latestMessageIndex(liveContext);
      let changed = false;
      if (action === "archive") {
        changed = setEntityRegistryLifecycleOverride(liveContext, entityId, messageIndex, "archived");
      } else if (action === "restore") {
        changed = setEntityRegistryLifecycleOverride(liveContext, entityId, messageIndex, "inactive");
      } else if (action === "auto-color") {
        changed = setEntityRegistryCardColor(liveContext, entityId, null);
      }
      if (changed) {
        input.onStateChanged();
        renderDialog();
      }
    });

    dialog.addEventListener("change", event => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.getAttribute("data-bst-dynamic-action") !== "color") return;
      const liveContext = input.getContext();
      const entityId = String(target.getAttribute("data-bst-dynamic-entity") ?? "").trim();
      if (!liveContext || !entityId) return;
      if (setEntityRegistryCardColor(liveContext, entityId, target.value)) {
        input.onStateChanged();
        renderDialog();
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
