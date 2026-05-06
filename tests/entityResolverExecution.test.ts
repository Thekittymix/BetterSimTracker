import test from "node:test";
import assert from "node:assert/strict";

import { executeEntityResolverModelRequest } from "../src/entityResolver";

const abortError = () => new DOMException("Request aborted by user", "AbortError");

test("executeEntityResolverModelRequest rethrows abort from the initial resolver request", async () => {
  let calls = 0;

  await assert.rejects(
    () => executeEntityResolverModelRequest({
      basePrompt: "Resolve the current scene.",
      requestType: "entity_resolution",
      protocolMode: "json",
      candidateEntities: [
        { entityRef: "ent1", ownerName: "Seraphina", entityId: "bst_owner:seraphina|seraphina" },
      ],
      contextText: "Seraphina watches the doorway.",
      message: {
        name: "Seraphina",
        mes: "She keeps watching the doorway.",
        is_user: false,
        is_system: false,
      } as any,
      generate: async () => {
        calls += 1;
        throw abortError();
      },
    }),
    error => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, "AbortError");
      assert.equal(error.message, "Request aborted by user");
      return true;
    },
  );

  assert.equal(calls, 1);
});

test("executeEntityResolverModelRequest rethrows abort from the audit resolver request", async () => {
  const calls: string[] = [];
  let auditStarted = 0;
  let auditCompleted = 0;

  await assert.rejects(
    () => executeEntityResolverModelRequest({
      basePrompt: "Resolve the current scene.",
      requestType: "entity_resolution",
      protocolMode: "json",
      candidateEntities: [
        {
          entityRef: "ent1",
          ownerName: "Shared Card",
          entityId: "bst_owner:shared|shared card",
          aliases: ["Shared Card"],
          kind: "st-character",
        },
      ],
      contextText: "Shared Card: Avery, Blake, and Casey enter the studio together.",
      message: {
        name: "Shared Card",
        mes: "Avery, Blake, and Casey enter the studio together.",
        is_user: false,
        is_system: false,
      } as any,
      allowNarrativeEntityCreation: true,
      generate: async prompt => {
        calls.push(prompt);
        if (calls.length === 1) {
          return {
            text: JSON.stringify({
              resolved: [
                {
                  ownerName: "Shared Card",
                  inScene: true,
                  inMessage: true,
                },
              ],
              created: [
                {
                  name: "Avery",
                  inScene: true,
                  inMessage: true,
                },
              ],
              unresolvedMentions: [],
            }),
          };
        }
        throw abortError();
      },
      onAuditStart: () => {
        auditStarted += 1;
      },
      onAuditResult: () => {
        auditCompleted += 1;
      },
    }),
    error => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, "AbortError");
      return true;
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(auditStarted, 1);
  assert.equal(auditCompleted, 0);
});

test("executeEntityResolverModelRequest converts non-abort resolver failures into a soft model_error result", async () => {
  const result = await executeEntityResolverModelRequest({
    basePrompt: "Resolve the current scene.",
    requestType: "entity_resolution_bootstrap",
    protocolMode: "json",
    candidateEntities: [
      { entityRef: "ent1", ownerName: "Seraphina", entityId: "bst_owner:seraphina|seraphina" },
    ],
    contextText: "Seraphina watches the doorway.",
    message: {
      name: "Seraphina",
      mes: "She keeps watching the doorway.",
      is_user: false,
      is_system: false,
    } as any,
    generate: async () => {
      throw new Error("HTTP 500");
    },
  });

  assert.deepEqual(result, {
    kind: "model_error",
    error: "HTTP 500",
  });
});
