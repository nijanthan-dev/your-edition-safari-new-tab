import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { STORAGE_KEYS, discardSession, type KVStore } from "../packages/agent-core";

function memoryStore(initial: Record<string, unknown>): KVStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async <T,>(key: string) => data[key] as T | undefined,
    set: async (key, value) => void (data[key] = value),
    remove: async (key) => void delete data[key],
  };
}

describe("discardSession", () => {
  test("deletes the uploads and the session, then forgets both", async () => {
    const deletedFiles: string[] = [];
    const deletedSessions: string[] = [];
    const client = {
      beta: {
        files: { delete: async (id: string) => void deletedFiles.push(id) },
        sessions: {
          retrieve: async () => ({ status: "idle" }),
          delete: async (id: string) => void deletedSessions.push(id),
          events: { send: async () => {} },
        },
      },
    } as unknown as Anthropic;
    const store = memoryStore({
      [STORAGE_KEYS.activeSessionId]: "sesn_1",
      [STORAGE_KEYS.uploadedFileIds]: ["file_a", "file_b"],
    });

    await discardSession(client, store, "sesn_1");

    expect(deletedFiles).toEqual(["file_a", "file_b"]);
    expect(deletedSessions).toEqual(["sesn_1"]);
    expect(store.data[STORAGE_KEYS.activeSessionId]).toBeUndefined();
    expect(store.data[STORAGE_KEYS.uploadedFileIds]).toBeUndefined();
  });

  test("still forgets the session when the API cannot delete it", async () => {
    const client = {
      beta: {
        files: { delete: async () => { throw new Error("gone"); } },
        sessions: { retrieve: async () => { throw new Error("offline"); }, delete: async () => {}, events: { send: async () => {} } },
      },
    } as unknown as Anthropic;
    const store = memoryStore({ [STORAGE_KEYS.activeSessionId]: "sesn_2", [STORAGE_KEYS.uploadedFileIds]: ["f"] });
    await discardSession(client, store, "sesn_2");
    expect(store.data[STORAGE_KEYS.activeSessionId]).toBeUndefined();
  });
});
