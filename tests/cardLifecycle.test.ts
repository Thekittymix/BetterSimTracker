import test from "node:test";
import assert from "node:assert/strict";

import { findLastActiveMessageIndex, resolveCardLifecycleState } from "../src/cardLifecycle";

test("card lifecycle archives owners after enough inactive turns", () => {
  const history = [
    { messageIndex: 4, activeCharacters: ["Ashley"] },
    { messageIndex: 6, activeCharacters: ["Blake"] },
    { messageIndex: 8, activeCharacters: ["Raleigh"] },
  ];

  assert.equal(findLastActiveMessageIndex(history, 9, "Ashley"), 4);
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 9,
    currentActiveCharacters: ["Blake"],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  }), "archived");
});

test("card lifecycle keeps recently inactive owners visible as inactive", () => {
  const history = [
    { messageIndex: 4, activeCharacters: ["Ashley"] },
    { messageIndex: 6, activeCharacters: ["Blake"] },
  ];

  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 7,
    currentActiveCharacters: ["Blake"],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  }), "inactive");
});

test("card lifecycle keeps active owners active and disables archive when the toggle is off", () => {
  const history = [
    { messageIndex: 4, activeCharacters: ["Ashley"] },
    { messageIndex: 6, activeCharacters: ["Blake"] },
  ];

  assert.equal(resolveCardLifecycleState({
    ownerName: "Blake",
    currentMessageIndex: 7,
    currentActiveCharacters: ["Blake"],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 1,
  }), "active");

  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 20,
    currentActiveCharacters: ["Blake"],
    history,
    autoArchiveInactiveCards: false,
    archiveInactiveAfterTurns: 1,
  }), "inactive");
});

test("card lifecycle can use registry last-active state when history is empty", () => {
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 12,
    currentActiveCharacters: ["Blake"],
    history: [],
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
    registryState: {
      lastActiveMessageIndex: 10,
      lifecycleState: "inactive",
    },
  }), "inactive");

  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 20,
    currentActiveCharacters: ["Blake"],
    history: [],
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
    registryState: {
      lastActiveMessageIndex: 10,
      lifecycleState: "archived",
    },
  }), "archived");
});

test("card lifecycle honors a manual archived registry state immediately without waiting for auto-archive threshold", () => {
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    currentMessageIndex: 11,
    currentActiveCharacters: ["Blake"],
    history: [],
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 8,
    registryState: {
      lastActiveMessageIndex: 10,
      lifecycleState: "archived",
      archivedAtMessageIndex: 11,
      introducedAtMessageIndex: 0,
    },
  }), "archived");
});

test("card lifecycle manual archived registry state beats current active owner presence on the same message", () => {
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    entityId: "bst_mc_alias:test:ashley",
    currentMessageIndex: 11,
    currentActiveCharacters: ["Ashley", "Blake"],
    currentActiveEntityIds: ["bst_mc_alias:test:ashley"],
    history: [],
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 8,
    registryState: {
      lastActiveMessageIndex: 11,
      lifecycleState: "archived",
      archivedAtMessageIndex: 11,
      introducedAtMessageIndex: 0,
    },
  }), "archived");
});

test("card lifecycle allows a later active message to reactivate an archived registry entry", () => {
  assert.equal(resolveCardLifecycleState({
    ownerName: "Raleigh",
    entityId: "bst_mc_alias:test:raleigh",
    currentMessageIndex: 12,
    currentActiveCharacters: ["Raleigh", "Blake"],
    currentActiveEntityIds: ["bst_mc_alias:test:raleigh"],
    history: [],
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 8,
    registryState: {
      lastActiveMessageIndex: 8,
      lifecycleState: "archived",
      archivedAtMessageIndex: 8,
      introducedAtMessageIndex: 0,
    },
  }), "active");
});

test("card lifecycle ignores pre-introduction active history for registry-backed aliases", () => {
  const history = [
    { messageIndex: 0, activeCharacters: ["Blake"] },
  ];

  assert.equal(resolveCardLifecycleState({
    ownerName: "Blake",
    currentMessageIndex: 2,
    currentActiveCharacters: ["Ashley"],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 1,
    registryState: {
      lastActiveMessageIndex: 0,
      lifecycleState: "inactive",
      introducedAtMessageIndex: 2,
    },
  }), "inactive");
});

test("card lifecycle prefers entity ids over owner spellings when tracking alias continuity", () => {
  const history = [
    {
      messageIndex: 4,
      activeCharacters: ["Ash"],
      activeEntityIds: ["bst_mc_alias:test:ashley"],
    },
  ];

  assert.equal(findLastActiveMessageIndex(history, 8, "Ashley", "bst_mc_alias:test:ashley"), 4);
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    entityId: "bst_mc_alias:test:ashley",
    currentMessageIndex: 5,
    currentActiveCharacters: ["Blake"],
    currentActiveEntityIds: ["bst_mc_alias:test:ashley"],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 2,
  }), "active");
});

test("card lifecycle does not fall back to owner names when a newer entity-aware snapshot belongs to a different entity", () => {
  const history = [
    {
      messageIndex: 4,
      activeCharacters: ["Ashley"],
    },
    {
      messageIndex: 6,
      activeCharacters: ["Ashley"],
      activeEntityIds: ["bst_mc_alias:test:other-ashley"],
    },
  ];

  assert.equal(findLastActiveMessageIndex(history, 8, "Ashley", "bst_mc_alias:test:ashley"), 4);
  assert.equal(resolveCardLifecycleState({
    ownerName: "Ashley",
    entityId: "bst_mc_alias:test:ashley",
    currentMessageIndex: 8,
    currentActiveCharacters: ["Blake"],
    currentActiveEntityIds: [],
    history,
    autoArchiveInactiveCards: true,
    archiveInactiveAfterTurns: 3,
  }), "archived");
});
