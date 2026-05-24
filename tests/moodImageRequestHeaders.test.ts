import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";

import { __testables as characterPanelTestables } from "../src/characterPanel";
import { __testables as personaPanelTestables } from "../src/personaPanel";
import type { BetterSimTrackerSettings, MoodLabel, STContext } from "../src/types";

type FetchCall = {
  url: string;
  init: RequestInit;
};

const csrfHeader = "fresh-csrf-token";
const staleCsrfHeader = "stale-csrf-token";
const mood = "Happy" as MoodLabel;

function makeContext(): STContext {
  return {
    chat: [],
    csrf_token: staleCsrfHeader,
    getRequestHeaders: () => ({
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfHeader,
    }),
  };
}

function makeSettings(): BetterSimTrackerSettings {
  return { debug: false } as BetterSimTrackerSettings;
}

function makeFile(): File {
  return new File(["image-bytes"], "happy.png", { type: "image/png" });
}

function installSpriteFetchMock(t: TestContext, calls: FetchCall[]): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.startsWith("/api/sprites/get")) {
      return {
        ok: true,
        json: async () => ({
          sprites: [{ label: "bst_mood_happy", path: "/sprites/happy.png" }],
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

for (const [surface, helpers, ownerName] of [
  ["character", characterPanelTestables, "Seraphina"],
  ["persona", personaPanelTestables, "bst_persona_user"],
] as const) {
  test(`${surface} mood image upload sends current CSRF header without JSON Content-Type`, async t => {
    const calls: FetchCall[] = [];
    installSpriteFetchMock(t, calls);

    const path = await helpers.uploadMoodImage(makeContext(), makeSettings(), ownerName, mood, makeFile());

    assert.equal(path, "/sprites/happy.png");
    const uploadCall = calls.find(call => call.url === "/api/sprites/upload");
    assert.ok(uploadCall, "expected upload request");
    const headers = uploadCall.init.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], csrfHeader);
    assert.equal(headers["Content-Type"], undefined);
    assert.ok(uploadCall.init.body instanceof FormData);
    assert.equal(calls.some(call => {
      const requestHeaders = call.init.headers as Record<string, string> | undefined;
      return requestHeaders?.["X-CSRF-Token"] === staleCsrfHeader;
    }), false);
  });

  test(`${surface} mood image delete sends current ST JSON request headers`, async t => {
    const calls: FetchCall[] = [];
    installSpriteFetchMock(t, calls);

    await helpers.deleteMoodImage(makeContext(), makeSettings(), ownerName, mood);

    const deleteCall = calls.find(call => call.url === "/api/sprites/delete");
    assert.ok(deleteCall, "expected delete request");
    const headers = deleteCall.init.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], csrfHeader);
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(typeof deleteCall.init.body, "string");
    assert.match(String(deleteCall.init.body), /bst_mood_happy/);
  });
}
