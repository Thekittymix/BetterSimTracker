# Data Model

Last verified commit: `000d643`

## Core Type Contracts

Defined in `src/types.ts`.

### Built-In Keys

- Numeric: `affection`, `trust`, `desire`, `connection`
- Text: `mood`, `lastThought`

### Custom Stat Kinds

- `numeric`
- `enum_single`
- `boolean`
- `text_short`
- `array`
- `date_time`

### Tracker Payload (`TrackerData`)

`TrackerData` contains:

- `activeCharacters: string[]`
- `statistics`
  - `affection`, `trust`, `desire`, `connection` as number maps by character
  - `mood`, `lastThought` as text maps by character
- `customStatistics` (numeric custom values)
- `customNonNumericStatistics` (enum/boolean/text/array custom values)

## Settings Schema (`BetterSimTrackerSettings`)

Key groups:

- Runtime toggles:
  - `enabled`
  - `entityTrackingMode`
    - `standard`
    - `dynamic_characters`
  - `sequentialExtraction`
  - `injectTrackerIntoPrompt`
  - `lastThoughtPrivate`
- Extraction controls:
  - `maxConcurrentCalls`
  - `contextMessages`
  - `maxDeltaPerTurn`
  - `strictJsonRepair`
  - `maxRetriesPerStat`
- Scaling controls:
  - `confidenceDampening`
  - `moodStickiness`
- Prompt templates:
  - unified
  - sequential built-ins
  - sequential custom numeric
  - sequential custom non-numeric
  - injection template
- Custom stat definitions:
  - `customStats: CustomStatDefinition[]`
- Display controls:
  - graph settings
  - card style settings
  - optional `userCardColor` override
  - scene card settings (`sceneCardEnabled`, `sceneCardPosition`, `sceneCardLayout`, `sceneCardTitle`, `sceneCardColor`, `sceneCardValueColor`, `sceneCardShowWhenEmpty`, `sceneCardArrayCollapsedLimit`, `sceneCardStatOrder`, `sceneCardStatDisplay`)
  - character card stat row ordering (`characterCardStatOrder`)
  - mood source/mapping/frame settings

Sanitization is centralized in `src/settings.ts`.

## Entity Resolution / Registry Contracts

- `TrackerResolvedEntity.kind` can be:
  - `st-character`
  - `persona`
  - `narrative-entity`
- `TrackerData.entityResolution.resolvedEntities` remains entity-first and is the runtime source of truth for scene/message entity scope.
- `TrackerData.entityOwnerMap` is a projection/materialization layer for owner-facing lookups, not the source of truth for resolver identity.
- In `dynamic_characters` mode, new narrative entities receive runtime-owned IDs (for example `bst_narrative:*`) and are then synchronized into chat-scoped registry entries with `kind: narrative-entity`.
- Narrative entities do not inherit ST character/persona defaults as part of bootstrap seeding; known ST owners keep the existing defaults pipeline, while narrative entities use the generic narrative seed path and then continue from persisted tracker state.
- Narrative entities also bypass owner-specific runtime default reads such as `trackerEnabled`, `statEnabled`, mood-source overrides, and per-owner card styling; those overrides remain scoped to known ST owners/personas only.

## Custom Stat Definition (`CustomStatDefinition`)

Common fields:

- `id`
- `kind`
- `label`
- `description`
- `track`
- `trackCharacters`
- `trackUser`
- `privateToOwner`
- `showOnCard`
- `showInGraph`
- `includeInInjection`
- `color`
- `promptOverride` (legacy alias accepted: `sequentialPromptTemplate`)
- `behaviorGuidance`

Kind-specific fields:

- `numeric`: `defaultValue`, `maxDeltaPerTurn`
- `enum_single`: `defaultValue`, `enumOptions[]`
- `boolean`: `defaultValue`, `booleanTrueLabel`, `booleanFalseLabel`
- `text_short`: `defaultValue`, `textMaxLength`
- `array`: `defaultValue` (`string[]`), `textMaxLength` (per-item limit), max `30` items
- `date_time`: `defaultValue` (timestamp string), `dateTimeMode` (`timestamp`/`structured`)

## Persistence Surfaces

Implemented in `src/storage.ts` and `src/index.ts` orchestration.

- Message-level tracker payloads (primary history source).
- Chat-level latest payload cache/fallback.
- Metadata/local fallback for recovery and diagnostics continuity.
- Debug record store with optional context/prompt capture.

## Merge and Fallback Rules

When extraction omits values:

- Built-in stats merge from previous snapshot/defaults.
- Custom numeric and non-numeric values merge independently.
- Mood/lastThought preserve prior values when no new value is parsed.

Helper functions:

- `mergeStatisticsWithFallback`
- `mergeCustomStatisticsWithFallback`
- `mergeCustomNonNumericStatisticsWithFallback`

## Diagnostics Shape (`DeltaDebugRecord`)

Contains:

- `rawModelOutput`
- `promptText` (optional, if context-in-diagnostics enabled)
- `contextText` (optional)
- `parsed` section
  - confidences
  - built-in deltas
  - custom numeric/non-numeric
  - mood/lastThought
- `applied` section
- `meta` section
  - `statsRequested`
  - `requests[]` transport metadata
  - parsed/applied counts
  - extraction mode
  - retry flags
- trace tail arrays

## Versioning Constraints

Repo policy requires synchronized version fields:

- `package.json`
- `manifest.json`

Dev format:

- `<latest_release>-dev.x`

Release format:

- `X.Y.Z`
