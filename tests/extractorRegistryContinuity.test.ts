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
    resolvePreviousCustomNonNumericValue(context, previousByOwner, "Ash", false),
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
    resolvePreviousCustomNonNumericValue(context, previousByOwner, "Ash", true),
    "Wednesday",
  );
});
