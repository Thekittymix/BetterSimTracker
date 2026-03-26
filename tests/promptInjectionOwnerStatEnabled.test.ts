import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/promptInjection";
import { USER_TRACKER_KEY } from "../src/constants";
import type { BetterSimTrackerSettings, STContext } from "../src/types";
import { defaultSettings } from "../src/settings";

const isOwnerStatEnabled = __testables.isOwnerStatEnabled;

function baseSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    characterDefaults: {},
  };
}

test("isOwnerStatEnabled reads character statEnabled map", () => {
  const settings = baseSettings();
  settings.characterDefaults = {
    "avatar:sera.png": {
      statEnabled: {
        affection: false,
      },
    },
  };
  const context = {
    characters: [{ name: "Seraphina", avatar: "sera.png" }],
  } as unknown as STContext;

  assert.equal(isOwnerStatEnabled(context, settings, "Seraphina", "affection"), false);
  assert.equal(isOwnerStatEnabled(context, settings, "Seraphina", "trust"), true);
});

test("isOwnerStatEnabled reads persona-scoped user statEnabled map", () => {
  const settings = baseSettings();
  settings.characterDefaults = {
    "avatar:persona:p1.png": {
      statEnabled: {
        mood: false,
      },
    },
  };
  const context = {
    name1: "User",
    user_avatar: "p1.png",
  } as unknown as STContext;

  assert.equal(isOwnerStatEnabled(context, settings, USER_TRACKER_KEY, "mood"), false);
  assert.equal(isOwnerStatEnabled(context, settings, USER_TRACKER_KEY, "lastThought"), true);
});

test("isOwnerStatEnabled resolves alias owners against multi-character source card defaults", () => {
  const settings = baseSettings();
  settings.entityTrackingMode = "dynamic_characters";
  settings.characterDefaults = {
    "avatar:camp.png": {
      statEnabled: {
        mood: false,
      },
    },
  };
  const context = {
    characters: [
      {
        name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
        avatar: "camp.png",
      },
    ],
  } as unknown as STContext;

  assert.equal(isOwnerStatEnabled(context, settings, "Ashley", "mood"), false);
  assert.equal(isOwnerStatEnabled(context, settings, "Ashley", "lastThought"), true);
});

test("isOwnerStatEnabled ignores character defaults for registry-backed narrative entities", () => {
  const settings = baseSettings();
  settings.entityTrackingMode = "dynamic_characters";
  settings.characterDefaults = {
    "Forest Spirit": {
      statEnabled: {
        mood: false,
      },
    },
  };
  const context = {
    name1: "User",
    characters: [],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_narrative:forest-spirit": {
            id: "bst_narrative:forest-spirit",
            ownerName: "Forest Spirit",
            canonicalName: "Forest Spirit",
            aliases: ["Spirit"],
            sourceName: "Forest Spirit",
            sourceAvatar: null,
            sourceKey: "narrative:bst_narrative:forest-spirit",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          "forest spirit": "bst_narrative:forest-spirit",
        },
      },
    },
  } as unknown as STContext;

  assert.equal(isOwnerStatEnabled(context, settings, "Forest Spirit", "mood"), true);
});

test("isOwnerStatEnabled prefers explicit narrative entity ids over colliding owner-name defaults", () => {
  const settings = baseSettings();
  settings.entityTrackingMode = "dynamic_characters";
  settings.characterDefaults = {
    "avatar:blake.png": {
      statEnabled: {
        mood: false,
      },
    },
  };
  const context = {
    name1: "User",
    characters: [{ name: "Blake", avatar: "blake.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_owner:blake.png|blake": {
            id: "bst_owner:blake.png|blake",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: [],
            sourceName: "Blake",
            sourceAvatar: "blake.png",
            sourceKey: "blake.png|blake",
            kind: "owner",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          blake: "bst_owner:blake.png|blake",
        },
      },
    },
  } as unknown as STContext;

  assert.equal(isOwnerStatEnabled(context, settings, "Blake", "mood"), false);
  assert.equal(
    isOwnerStatEnabled(context, settings, "Blake", "mood", "bst_narrative:blake-shadow"),
    true,
  );
});
