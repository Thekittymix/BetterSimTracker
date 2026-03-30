export function shouldEnableTextShortExpand(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.includes("\n")) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length > 120 || words.length > 18;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTextShortMarkup(options: {
  text: string;
  key: string;
  color: string;
  expanded: boolean;
  title?: string;
}): string {
  const text = options.text;
  const key = options.key;
  const color = options.color;
  const expanded = options.expanded;
  const title = options.title ?? text;
  const expandable = shouldEnableTextShortExpand(text);
  return `
    <div class="bst-text-short-value${expanded ? " bst-text-short-expanded" : ""}" data-bst-text-short-container="1" data-bst-text-short-key="${escapeHtml(key)}" style="--bst-stat-color:${escapeHtml(color)};" title="${escapeHtml(title)}">
      <span class="bst-text-short-value-text">${escapeHtml(text)}</span>
      ${expandable ? `<button type="button" class="bst-text-short-toggle" data-bst-action="toggle-text-short" data-bst-text-short-key="${escapeHtml(key)}" aria-expanded="${String(expanded)}" hidden>${expanded ? "Less" : "More"}</button>` : ""}
    </div>
  `;
}
