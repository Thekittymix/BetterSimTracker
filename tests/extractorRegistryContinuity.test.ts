import test from "node:test";
import assert from "node:assert/strict";

import { GLOBAL_TRACKER_KEY } from "../src/constants";
import { resolvePreviousCustomNonNumericValue } from "../src/extractorRegistry";
import type { STContext } from "../src/types";

function makeContext(): STContext {
  return {
    chat: [],
    chatMetadata: {
      bstEntityRegistry: {
        entities: {
          "bst_mc_alias:test:ashley": {
            id: "bst_mc_alias:test:ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "test-source",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          ash: "bst_mc_alias:test:ashley",
          ashley: "bst_mc_alias:test:ashley",
        },
      },
    },
    characters: [],
    characterId: 0,
    groupId: null,
    onlineStatus: "connected",
  } as unknown as STContext;
}

test("resolvePreviousCustomNonNumericValue resolves alias-owned previous values through registry lookup names", () => {
  const context = makeContext();
  const previousByOwner = {
    Ashley: "standing near the door",
  };

  assert.equal(
    resolvePreviousCustomNonNumericValue(context, previousByOwner, null, null, "Ash", false),
    "standing near the door",
  );
});

test("resolvePreviousCustomNonNumericValue prefers global value for global-scope stats", () => {
  const context = makeContext();
  const previousByOwner = {
    [GLOBAL_TRACKER_KEY]: "Wednesday",
    Ashley: "Tuesday",
  };

  assert.equal(
    resolvePreviousCustomNonNumericValue(context, previousByOwner, null, null, "Ash", true),
    "Wednesday",
  );
});

test("resolvePreviousCustomNonNumericValue prefers by-entity shadow continuity when available", () => {
  const context = makeContext();
  const previousByOwner = {
    Ashley: "standing near the door",
  };
  const previousByEntityId = {
    "bst_mc_alias:test:ashley": "leaning against the desk",
  };

  assert.equal(
    resolvePreviousCustomNonNumericValue(context, previousByOwner, {
      timestamp: 1,
      activeCharacters: ["Ashley"],
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: { pose: previousByOwner },
      customNonNumericStatisticsByEntityId: { pose: previousByEntityId },
      entityOwnerMap: {
        Ashley: {
          entityId: "bst_mc_alias:test:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceKey: "test-source",
          kind: "multi_character_alias",
        },
      },
    }, previousByEntityId, "Ash", false),
    "leaning against the desk",
  );
});

test("resolvePreviousCustomNonNumericValue keeps same-name fallback scoped to the current entity snapshot", () => {
  const context = makeContext();
  context.chatMetadata = {
    bstEntityRegistry: {
      version: 1,
      entities: {
        "bst_mc_alias:test:ashley": {
          id: "bst_mc_alias:test:ashley",
          ownerName: "Ashley",
          canonicalName: "Ashley",
          aliases: ["Ash"],
          sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
          sourceAvatar: "camp.png",
          sourceKey: "camp",
          kind: "multi_character_alias",
          introducedAtMessageIndex: 0,
          lastSeenMessageIndex: 0,
          lastActiveMessageIndex: 0,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
        "bst_narrative:ashley-current": {
          id: "bst_narrative:ashley-current",
          ownerName: "Ashley Summers",
          canonicalName: "Ashley Summers",
          aliases: ["Ash"],
          sourceName: "Ashley Summers",
          sourceAvatar: null,
          sourceKey: "narrative:bst_narrative:ashley-current",
          kind: "narrative-entity",
          introducedAtMessageIndex: 1,
          lastSeenMessageIndex: 1,
          lastActiveMessageIndex: 1,
          lifecycleState: "active",
          archivedAtMessageIndex: null,
        },
      },
      ownerToEntityId: {
        ash: "bst_mc_alias:test:ashley",
        ashley: "bst_mc_alias:test:ashley",
        "ashley summers": "bst_narrative:ashley-current",
      },
    },
  };

  const previousByOwner = {
    Ashley: "standing near the door",
  };

  assert.equal(
    resolvePreviousCustomNonNumericValue(context, previousByOwner, {
      timestamp: 2,
      activeCharacters: ["Ash"],
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: { pose: previousByOwner },
      entityOwnerMap: {
        Ash: {
          entityId: "bst_narrative:ashley-current",
          ownerName: "Ashley Summers",
          canonicalName: "Ashley Summers",
          aliases: ["Ash"],
          sourceKey: "narrative:bst_narrative:ashley-current",
          kind: "narrative-entity",
        },
      },
    }, null, "Ash", false),
    undefined,
  );
});
