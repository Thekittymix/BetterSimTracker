import assert from "node:assert/strict";
import test from "node:test";

import { listManageableDynamicCharacters, renderDynamicCharactersDialogMarkup } from "../src/dynamicCharactersPanel";
import { syncEntityRegistryFromRender, setEntityRegistryCardColor, setEntityRegistryLifecycleOverride } from "../src/entityRegistry";
import type { BetterSimTrackerSettings, STContext } from "../src/types";

function makeContext(): STContext {
  return {
    chat: [
      { mes: "hi", name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", is_user: false },
      { mes: "reply", name: "User", is_user: true },
    ],
    chatMetadata: {},
    characters: [
      { name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" },
      { name: "Billie", avatar: "billie.png" },
    ],
  };
}

function makeSettings(mode: BetterSimTrackerSettings["entityTrackingMode"]): BetterSimTrackerSettings {
  return {
    enabled: true,
    maxConcurrentCalls: 1,
    contextMessages: 4,
    connectionProfile: "",
    injectTrackerIntoPrompt: true,
    includeLorebookInExtraction: true,
    useInternalLorebookScanFallback: false,
    lorebookExtractionMaxChars: 2000,
    injectPromptDepth: 0,
    injectionPromptMaxChars: 4000,
    summarizationNoteVisibleForAI: false,
    injectSummarizationNote: false,
    sequentialExtraction: false,
    enableSequentialStatGroups: false,
    maxDeltaPerTurn: 10,
    maxTokensOverride: 0,
    truncationLengthOverride: 0,
    includeCharacterCardsInPrompt: true,
    confidenceDampening: 0,
    moodStickiness: 0,
    strictJsonRepair: true,
    maxRetriesPerStat: 1,
    showLastThought: true,
    collapseCardsByDefault: false,
    showInactive: true,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
    inactiveLabel: "Inactive",
    sceneCardEnabled: true,
    sceneCardPosition: "above_tracker_cards",
    sceneCardLayout: "chips",
    sceneCardTitle: "Scene",
    sceneCardColor: "",
    sceneCardValueColor: "",
    sceneCardShowWhenEmpty: true,
    sceneCardArrayCollapsedLimit: 3,
    sceneCardStatOrder: [],
    sceneCardStatDisplay: {},
    characterCardStatOrder: [],
    autoDetectActive: true,
    autoGenerateTracker: true,
    entityTrackingMode: mode,
    regenerateOnMessageEdit: false,
    generateOnGreetingMessages: false,
    activityLookback: 3,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    lastThoughtPrivate: false,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
    includeUserTrackerInInjection: true,
    builtInNumericStatUi: {
      affection: { showOnCard: true, showInGraph: true, includeInInjection: true },
      trust: { showOnCard: true, showInGraph: true, includeInInjection: true },
      desire: { showOnCard: true, showInGraph: true, includeInInjection: true },
      connection: { showOnCard: true, showInGraph: true, includeInInjection: true },
    },
    moodSource: "bst_images",
    moodExpressionMap: {},
    moodSymbolMap: {},
    stExpressionImageZoom: 1,
    stExpressionImagePositionX: 50,
    stExpressionImagePositionY: 50,
    accentColor: "#66ccff",
    userCardColor: "",
    cardOpacity: 1,
    borderRadius: 16,
    fontSize: 14,
    moodSymbolMinWidth: 40,
    moodSymbolMinHeight: 40,
    moodSymbolBoxRadius: 999,
    moodSymbolFontSize: 24,
    defaultAffection: 50,
    defaultTrust: 50,
    defaultDesire: 50,
    defaultConnection: 50,
    defaultMood: "Neutral",
    debug: false,
    debugFlags: { extraction: false, prompts: false, ui: false, moodImages: false, storage: false },
    includeContextInDiagnostics: false,
    includeGraphInDiagnostics: false,
    promptTemplateUnified: "",
    promptTemplateSequentialAffection: "",
    promptTemplateSequentialTrust: "",
    promptTemplateSequentialDesire: "",
    promptTemplateSequentialConnection: "",
    promptTemplateSequentialCustomNumeric: "",
    promptTemplateSequentialCustomNonNumeric: "",
    promptTemplateSequentialMood: "",
    promptTemplateSequentialLastThought: "",
    builtInBehaviorAffection: "",
    builtInBehaviorTrust: "",
    builtInBehaviorDesire: "",
    builtInBehaviorConnection: "",
    promptTemplateInjection: "",
    unlockProtocolPrompts: false,
    promptProtocolUnified: "",
    promptProtocolSequentialAffection: "",
    promptProtocolSequentialTrust: "",
    promptProtocolSequentialDesire: "",
    promptProtocolSequentialConnection: "",
    promptProtocolSequentialCustomNumeric: "",
    promptProtocolSequentialCustomNonNumeric: "",
    promptProtocolSequentialMood: "",
    promptProtocolSequentialLastThought: "",
    customStats: [],
    characterDefaults: {},
  };
}

test("listManageableDynamicCharacters returns only dynamic registry entries for dynamic mode", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "dynamic_characters",
    messageIndex: 1,
    owners: ["Ashley", "Blake"],
    getLifecycleState: ownerName => ownerName === "Ashley" ? "active" : "inactive",
  });

  const items = listManageableDynamicCharacters(context, makeSettings("dynamic_characters"));
  assert.deepEqual(items.map(item => item.ownerName), ["Ashley", "Blake"]);
  assert.deepEqual(items.map(item => item.lifecycleState), ["active", "inactive"]);
});

test("listManageableDynamicCharacters hides entries in standard mode", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "dynamic_characters",
    messageIndex: 1,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });

  assert.deepEqual(listManageableDynamicCharacters(context, makeSettings("standard")), []);
});

test("listManageableDynamicCharacters includes archived entries and card colors", () => {
  const context = makeContext();
  syncEntityRegistryFromRender({
    context,
    mode: "dynamic_characters",
    messageIndex: 1,
    owners: ["Ashley"],
    getLifecycleState: () => "active",
  });
  const items = listManageableDynamicCharacters(context, makeSettings("dynamic_characters"));
  const ashley = items[0];
  assert.ok(ashley);

  assert.equal(setEntityRegistryCardColor(context, ashley.entityId, "#ABCDEF"), true);
  assert.equal(setEntityRegistryLifecycleOverride(context, ashley.entityId, 1, "archived"), true);

  const refreshed = listManageableDynamicCharacters(context, makeSettings("dynamic_characters"));
  assert.equal(refreshed[0]?.lifecycleState, "archived");
  assert.equal(refreshed[0]?.cardColor, "#abcdef");
});

test("renderDynamicCharactersDialogMarkup reuses BST modal and color input patterns", () => {
  const markup = renderDynamicCharactersDialogMarkup([
    {
      entityId: "bst_mc_alias:camp:ashley",
      ownerName: "Ashley",
      lifecycleState: "active",
      cardColor: "#abcdef",
      kind: "multi_character_alias",
      introducedAtMessageIndex: 0,
      lastSeenMessageIndex: 3,
    },
  ]);

  assert.match(markup, /bst-edit-head bst-surface-header/);
  assert.match(markup, /bst-close-btn/);
  assert.match(markup, /bst-custom-stat-row/);
  assert.match(markup, /bst-custom-stat-flag/);
  assert.match(markup, /bst-dynamic-control-group/);
  assert.match(markup, /bst-dynamic-action-group/);
  assert.match(markup, /bst-color-inputs/);
  assert.match(markup, /bst-custom-stat-toggle bst-custom-stat-toggle-compact/);
  assert.match(markup, /Card Color/);
  assert.match(markup, /Manual override/);
  assert.match(markup, /Auto Color/);
  assert.match(markup, /fa-solid fa-trash/);
  assert.doesNotMatch(markup, /bst-dynamic-color-preview/);
  assert.doesNotMatch(markup, /color-text/);
  assert.doesNotMatch(markup, />Close</);
});

test("renderDynamicCharactersDialogMarkup groups auto-color controls and hides manual picker in auto mode", () => {
  const markup = renderDynamicCharactersDialogMarkup([
    {
      entityId: "bst_mc_alias:camp:blake",
      ownerName: "Blake",
      lifecycleState: "active",
      cardColor: null,
      kind: "multi_character_alias",
      introducedAtMessageIndex: 0,
      lastSeenMessageIndex: 3,
    },
  ]);

  assert.match(markup, /Using automatic BST color/);
  assert.match(markup, /bst-custom-stat-toggle bst-custom-stat-toggle-compact bst-dynamic-auto-toggle is-on/);
  assert.match(markup, /<label class="bst-dynamic-color-field" hidden>/);
  assert.match(markup, /aria-label="Delete dynamic character Blake"/);
  assert.doesNotMatch(markup, /type="text"/);
});
