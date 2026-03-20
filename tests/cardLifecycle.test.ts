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
