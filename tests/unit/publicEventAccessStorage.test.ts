import { describe, expect, it } from "vitest";
import { passwordVerificationSessionKey } from "../../src/lib/accessSessionKeys";
import {
  eventAccessStorageKey,
  readStoredEventAccessToken,
  removeStoredEventAccessToken,
  storeEventAccessToken,
  storeVerifiedEventAccessToken,
} from "../../src/lib/publicEventAccessStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value));
  }
}

const scope = {
  eventsUrl: "https://api.example.com/",
  identifier: "mi-evento",
  accessVersion: "2026-07-09T12:00:00Z",
  invitationToken: "invite-123",
};

describe("publicEventAccessStorage", () => {
  it("stores trimmed access tokens under the hashed public access scope", () => {
    const storage = new MemoryStorage();
    const key = eventAccessStorageKey(scope);

    expect(key).toBe(
      passwordVerificationSessionKey(
        scope.eventsUrl,
        scope.identifier,
        scope.accessVersion,
        scope.invitationToken,
      ),
    );
    expect(storeEventAccessToken(scope, " proof-token ", storage)).toBe(true);
    expect(storage.getItem(key)).toBe("proof-token");
    expect(readStoredEventAccessToken(scope, storage)).toBe("proof-token");
  });

  it("ignores blank and legacy marker values", () => {
    const storage = new MemoryStorage();

    expect(storeEventAccessToken(scope, "   ", storage)).toBe(false);
    expect(readStoredEventAccessToken(scope, storage)).toBe("");

    storage.setItem(eventAccessStorageKey(scope), "1");
    expect(readStoredEventAccessToken(scope, storage)).toBe("");
  });

  it("removes only the scoped access token", () => {
    const storage = new MemoryStorage();
    const otherScope = { ...scope, accessVersion: "2026-07-10T12:00:00Z" };

    storeEventAccessToken(scope, "proof-token", storage);
    storeEventAccessToken(otherScope, "other-proof", storage);

    expect(removeStoredEventAccessToken(scope, storage)).toBe(true);
    expect(readStoredEventAccessToken(scope, storage)).toBe("");
    expect(readStoredEventAccessToken(otherScope, storage)).toBe("other-proof");
  });

  it("persists URL proofs only after backend-verified password access", () => {
    const storage = new MemoryStorage();

    expect(
      storeVerifiedEventAccessToken(
        {
          ...scope,
          accessToken: " proof-from-url ",
          passwordProtected: true,
          passwordVerified: true,
        },
        storage,
      ),
    ).toBe(true);
    expect(readStoredEventAccessToken(scope, storage)).toBe("proof-from-url");

    const previewScope = { ...scope, accessVersion: "preview" };
    expect(
      storeVerifiedEventAccessToken(
        {
          ...previewScope,
          accessToken: "preview-proof",
          passwordProtected: true,
          passwordVerified: true,
          previewAuthorized: true,
        },
        storage,
      ),
    ).toBe(false);
    expect(readStoredEventAccessToken(previewScope, storage)).toBe("");

    const lockedScope = { ...scope, accessVersion: "locked" };
    expect(
      storeVerifiedEventAccessToken(
        {
          ...lockedScope,
          accessToken: "locked-proof",
          passwordProtected: true,
          passwordVerified: false,
        },
        storage,
      ),
    ).toBe(false);
    expect(readStoredEventAccessToken(lockedScope, storage)).toBe("");
  });
});
