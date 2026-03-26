# UI System

Last verified commit: `000d643`

## Settings Surface

- The `Extraction` section exposes `Entity Tracking Mode` with:
  - `Standard`
  - `Multi-Character (Experimental)`
  - `Dynamic Entities (Experimental)`
- `Dynamic Entities` reuses the existing multi-character lifecycle controls rather than introducing a separate card-behavior model.

Primary implementation: `src/ui.ts`, `src/settingsPanel.ts`, `src/characterPanel.ts`.

## UI Surfaces

- In-chat tracker root and per-message card groups.
- Loading/progress states during extraction.
- Tracker action row (collapse/retrack/summarize/edit/graph).
- Settings modal with section drawers and wizards.
- Graph modal.
- Character defaults panel in ST advanced definitions.
- Persona defaults panel in ST persona management.

## Shared Surface Contract

BST modal and panel surfaces should reuse one consistent shell language instead of creating one-off controls per screen.

- Shared header contract:
  - title + subtitle stack on the left
  - action group on the right
  - close actions reuse normal BST button classes
  - settings modal header keeps one left accent source only; section accents should not visually bleed into header chrome
- Shared footer contract:
  - modal footers span the full surface width visually
  - footer actions reuse the same button families as the header/body
- Shared disclosure contract:
  - primary drawers and nested subdrawers both use the same circular chevron affordance
  - collapsed disclosure state points right; expanded disclosure state points down
  - subdrawers keep a neutral accent instead of the primary section accent
- Shared control contract:
  - checkboxes and toggles should come from the same BST control family
  - action buttons should reuse existing BST button classes instead of introducing one-off chrome

## Tracker Cards

Per character card can render:

- built-in numeric bars
- mood and last thought
- custom numeric values
- custom non-numeric chips

Optional Scene card can render:

- global-scoped custom non-numeric stats (`globalScope: true`)
- configurable placement (`above_tracker_cards` / `above_message`)
- configurable layout (`chips` / `rows`)
- configurable explicit ordering (manual up/down order list)
- per-stat display editor (visibility, label/color override, layout override, value style, hide-empty behavior, text clamp, array collapse limit)
- configurable title and color overrides
- configurable array chips collapse threshold
- global stats are hidden from owner cards while Scene card is enabled (no duplicate rendering)

Ordering/visibility:

- active characters first
- inactive rendering controlled by settings
- historical snapshot remains attached to original message index
- user card display name resolves from the current user/persona label (not the internal `__bst_user__` key)

## Loading State

Two distinct UI states:

- post-generation waiting state (scheduled extraction delay)
- active extraction state (progress + stop button)
- optional edit-trigger regeneration (gated by `Regenerate Tracker After Message Edit` setting)

Stop action cancels active extraction run and in-flight generation handles.

If extraction stops/fails before first tracker save for the target message, UI renders an inline recovery card with:

- exact skip/error reason text
- action button (`Retry Tracker` or `Generate Tracker`)

## Manual Edit Flow (Latest Snapshot Per Role)

1. User opens edit modal from the latest tracked card for that role (`AI` cards or `User` card).
2. UI validates and normalizes payload.
3. `index.ts` applies edit payload to latest snapshot maps.
4. Snapshot is written and chat save is triggered.
5. UI re-renders with updated values.

Supports:

- numeric built-ins
- mood
- lastThought
- custom numeric
- custom non-numeric

## Settings Modal

Major sections:

- Setup
- Extraction
- Context Sources
- User Tracking
- Prompt Injection
- Tracking Schema
- Display
- Prompts
- Diagnostics

Key capabilities:

- live auto-save behavior
- prompt template editing
- per-stat built-in management wizard
- custom stat wizard (`Add`, `Edit`, `Clone`, `Remove`) grouped under Tracking Schema
- custom stat JSON actions (`Import JSON` + per-stat `Export JSON` from stat row)
- AI helper buttons for prompt/description/guidance generation
- scene card controls in Display section drawer (enable/position/layout/title/colors/empty-state + Scene Stat Studio for order/per-stat display)
- owner card stat order controls in Display section drawer (manual up/down ordering for built-in + custom non-global stat rows)

## Custom Stat Wizard

Kind-aware steps and fields:

- basics (`id`, `label`, `description`, `kind`)
- kind-specific constraints (`enum options`, `boolean labels`, `text max length`, `array item limits`)
- tracking/display/injection toggles
- owner privacy toggle (`privateToOwner`)
- optional sequential override
- optional behavior guidance

Soft-remove semantics:

- stat definition removed from active config
- historical payload kept

## Graph Modal

Features:

- window selector (`30/60/120/all`)
- smoothing toggle
- multi-series rendering from enabled graph stats

Custom non-numeric stats are not graphed in current implementation.

## Character Defaults Panel

Provides per-character defaults and mood asset controls.

- numeric defaults
- custom numeric defaults
- custom non-numeric defaults
- optional card color override
- optional user card color override (global display setting)
- mood source controls
- mood image upload/delete
- ST expression mapping and framing options

## Persona Mood Panel

Provides per-persona mood controls inside SillyTavern Persona Management.

- per-persona mood source override
- per-mood BST image upload/delete for user tracker card mood rendering
- sprite-backed storage for uploaded persona mood images

## Accessibility and UX Notes

- reduced-motion aware animations
- responsive layout behavior for smaller screens
- compact controls for high-density tracker cards
- explicit help lines/tooltips for advanced options
- mobile portrait edit modal uses safe-area aware top anchoring and viewport height limits to prevent clipped/off-screen form controls
- edit modal uses top-layer dialog mounting when available (with fallback), so it stays above SillyTavern overlays on mobile
