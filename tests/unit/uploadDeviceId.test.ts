import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  generateUploadDeviceId,
  getUploadDeviceId,
  isUploadDeviceId,
  resetUploadDeviceIdMemory,
  UPLOAD_DEVICE_HEADER_NAME,
  UPLOAD_DEVICE_STORAGE_KEY,
  withUploadDeviceHeader,
} from "../../src/lib/uploadDeviceId";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const throwingStorage = {
  getItem(): string | null {
    throw new Error("SecurityError");
  },
  setItem(): void {
    throw new Error("SecurityError");
  },
};

afterEach(() => resetUploadDeviceIdMemory());

describe("generateUploadDeviceId", () => {
  it("uses crypto.randomUUID when available", () => {
    const id = "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b";
    expect(generateUploadDeviceId({ randomUUID: () => id })).toBe(id);
  });

  it("falls back to getRandomValues with v4 version and variant bits", () => {
    const id = generateUploadDeviceId({
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        (array as unknown as Uint8Array).fill(0xff);
        return array;
      },
    });
    expect(isUploadDeviceId(id)).toBe(true);
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("falls back to Math.random without crypto", () => {
    expect(isUploadDeviceId(generateUploadDeviceId(undefined))).toBe(true);
    expect(
      isUploadDeviceId(
        generateUploadDeviceId({
          randomUUID: () => {
            throw new Error("insecure context");
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("getUploadDeviceId", () => {
  it("creates the id once and reuses it from localStorage", () => {
    const local = new MemoryStorage();
    let calls = 0;
    const generate = () => {
      calls += 1;
      return "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b";
    };
    const first = getUploadDeviceId({ localStorage: () => local, generate });
    resetUploadDeviceIdMemory();
    const second = getUploadDeviceId({ localStorage: () => local, generate });
    expect(first).toBe(second);
    expect(local.getItem(UPLOAD_DEVICE_STORAGE_KEY)).toBe(first);
    expect(calls).toBe(1);
  });

  it("replaces a corrupt stored value", () => {
    const local = new MemoryStorage();
    local.setItem(UPLOAD_DEVICE_STORAGE_KEY, "not-a-uuid");
    const id = getUploadDeviceId({ localStorage: () => local });
    expect(isUploadDeviceId(id)).toBe(true);
    expect(local.getItem(UPLOAD_DEVICE_STORAGE_KEY)).toBe(id);
  });

  it("falls back to sessionStorage when localStorage throws", () => {
    const session = new MemoryStorage();
    const id = getUploadDeviceId({
      localStorage: () => throwingStorage,
      sessionStorage: () => session,
    });
    expect(session.getItem(UPLOAD_DEVICE_STORAGE_KEY)).toBe(id);
  });

  it("keeps a stable in-memory id when no storage works", () => {
    const deps = {
      localStorage: () => throwingStorage,
      sessionStorage: () => undefined,
    };
    const first = getUploadDeviceId(deps);
    expect(isUploadDeviceId(first)).toBe(true);
    expect(getUploadDeviceId(deps)).toBe(first);
  });
});

describe("withUploadDeviceHeader", () => {
  it("adds the header and keeps existing headers and options", () => {
    const init = withUploadDeviceHeader(
      { method: "POST", headers: { "Content-Type": "application/json" } },
      "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b",
    );
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(UPLOAD_DEVICE_HEADER_NAME)).toBe(
      "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b",
    );
  });

  it("works without an init", () => {
    const headers = new Headers(
      withUploadDeviceHeader(undefined, "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b").headers,
    );
    expect(headers.has(UPLOAD_DEVICE_HEADER_NAME)).toBe(true);
  });
});

describe("upload call sites send the header, never a URL param", () => {
  function source(path: string): string {
    return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  }

  it("the shared upload page wraps every upload request init", () => {
    const page = source("../../src/components/SharedUploadPage.tsx");
    expect(page).toMatch(
      /return withUploadDeviceHeader\(publicAccessFetchInit\(accessParams, init\)\)/,
    );
  });

  it("the personal upload presign and confirm carry the header", () => {
    const wall = source("../../src/components/sections/MomentWall.tsx");
    expect(wall.match(/withUploadDeviceHeader\(publicAccessFetchInit\(publicAccessForRequests, \{/g)).toHaveLength(2);
  });

  it("no source puts the device id in a query string", () => {
    for (const path of [
      "../../src/components/SharedUploadPage.tsx",
      "../../src/components/sections/MomentWall.tsx",
      "../../src/components/shared-upload/SharedUploadEngine.ts",
      "../../src/lib/apiUrls.ts",
    ]) {
      expect(source(path)).not.toMatch(/device_id|deviceId=|upload_device/i);
    }
  });
});
