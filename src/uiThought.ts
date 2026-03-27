export type ThoughtVariant = "bubble" | "panel";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function shouldEnableThoughtExpand(text: string, variant: ThoughtVariant): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.includes("\n")) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const minLength = variant === "bubble" ? 110 : 80;
  const minWordCount = variant === "bubble" ? 18 : 12;
  return normalized.length > minLength || words.length > minWordCount;
}

export function renderThoughtMarkup(
  text: string,
  key: string,
  variant: ThoughtVariant,
  expanded: boolean,
): string {
  const expandable = shouldEnableThoughtExpand(text, variant);
  const containerClass = variant === "bubble" ? "bst-mood-bubble" : "bst-thought";
  const textClass = variant === "bubble" ? "bst-mood-bubble-text" : "bst-thought-text";
  return `
    <div class="${containerClass}${expanded ? " bst-thought-expanded" : ""}" data-bst-thought-container="1" data-bst-thought-key="${escapeHtml(key)}">
      <span class="${textClass}">${escapeHtml(text)}</span>
      ${expandable ? `<button class="bst-thought-toggle" data-bst-action="toggle-thought" data-bst-thought-key="${escapeHtml(key)}" aria-expanded="${String(expanded)}">${expanded ? "Less thought" : "More thought"}</button>` : ""}
    </div>
  `;
}
