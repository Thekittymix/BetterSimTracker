export type ThoughtVariant = "bubble" | "panel";

export function hasThoughtOverflow(metrics: {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth?: number;
  clientWidth?: number;
}): boolean {
  const epsilon = 2;
  const verticalOverflow = Number(metrics.scrollHeight) > Number(metrics.clientHeight) + epsilon;
  const horizontalOverflow = Number(metrics.scrollWidth ?? 0) > Number(metrics.clientWidth ?? 0) + epsilon;
  return verticalOverflow || horizontalOverflow;
}

export function resolveThoughtToggleState(metrics: {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth?: number;
  clientWidth?: number;
}, expanded: boolean): {
  overflowing: boolean;
  hidden: boolean;
  ariaExpanded: "true" | "false";
  label: "More" | "Less";
} {
  const overflowing = hasThoughtOverflow(metrics);
  return {
    overflowing,
    hidden: !overflowing,
    ariaExpanded: overflowing && expanded ? "true" : "false",
    label: overflowing && expanded ? "Less" : "More",
  };
}

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
      ${expandable ? `<button type="button" class="bst-expand-toggle bst-thought-toggle" data-bst-action="toggle-thought" data-bst-thought-key="${escapeHtml(key)}" aria-expanded="${String(expanded)}" hidden>${expanded ? "Less" : "More"}</button>` : ""}
    </div>
  `;
}
