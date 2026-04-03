import test from "node:test";
import assert from "node:assert/strict";

import { getCachedCharacterCardsContext, getCachedLorebookContext } from "../src/promptContextCache";

test("getCachedCharacterCardsContext reuses the built string when context refs and inputs are unchanged", () => {
  const context = {
    characters: [{ name: "Seraphina", avatar: "seraphina.png" }],
  } as any;
  let builds = 0;

  const first = getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:seraphina"],
    entityTrackingMode: "dynamic_characters",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "context-a";
    },
  });
  const second = getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:seraphina"],
    entityTrackingMode: "dynamic_characters",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "context-b";
    },
  });

  assert.equal(first, "context-a");
  assert.equal(second, "context-a");
  assert.equal(builds, 1);
});

test("getCachedCharacterCardsContext invalidates when character refs or target inputs change", () => {
  const context = {
    characters: [{ name: "Seraphina", avatar: "seraphina.png" }],
  } as any;
  let builds = 0;

  getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:seraphina"],
    entityTrackingMode: "dynamic_characters",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "first";
    },
  });
  context.characters = [{ name: "Seraphina", avatar: "new.png" }];
  getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:seraphina"],
    entityTrackingMode: "dynamic_characters",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "second";
    },
  });
  getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:other"],
    entityTrackingMode: "dynamic_characters",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "third";
    },
  });
  getCachedCharacterCardsContext(context, {
    activeCharacters: ["Seraphina"],
    activeEntityIds: ["bst_narrative:other"],
    entityTrackingMode: "standard",
    preferredCharacterName: "Seraphina",
    build: () => {
      builds += 1;
      return "fourth";
    },
  });

  assert.equal(builds, 4);
});

test("getCachedLorebookContext reuses the built string when lorebook sources and limits are unchanged", () => {
  const context = {
    chatMetadata: { prompt: "a" },
    worldInfo: { prompt: "b" },
    world_info: null,
    lorebook: { prompt: "c" },
  } as any;
  let builds = 0;

  const first = getCachedLorebookContext(context, {
    maxChars: 1200,
    build: () => {
      builds += 1;
      return "lore-a";
    },
  });
  const second = getCachedLorebookContext(context, {
    maxChars: 1200,
    build: () => {
      builds += 1;
      return "lore-b";
    },
  });

  assert.equal(first, "lore-a");
  assert.equal(second, "lore-a");
  assert.equal(builds, 1);
});

test("getCachedLorebookContext invalidates when lorebook refs or limits change", () => {
  const context = {
    chatMetadata: { prompt: "a" },
    worldInfo: { prompt: "b" },
    world_info: null,
    lorebook: { prompt: "c" },
  } as any;
  let builds = 0;

  getCachedLorebookContext(context, {
    maxChars: 1200,
    build: () => {
      builds += 1;
      return "first";
    },
  });
  context.chatMetadata = { prompt: "changed" };
  getCachedLorebookContext(context, {
    maxChars: 1200,
    build: () => {
      builds += 1;
      return "second";
    },
  });
  getCachedLorebookContext(context, {
    maxChars: 2400,
    build: () => {
      builds += 1;
      return "third";
    },
  });

  assert.equal(builds, 3);
});
