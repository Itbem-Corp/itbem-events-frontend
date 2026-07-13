import { describe, expect, it } from "vitest";
import {
  decrementUploadQuota,
  getSelectableUploadSlots,
  getSelectableUploadSlotsWithPending,
  getUploadDisplayLimit,
  readUploadQuota,
  reconcileUploadQuotaRemaining,
} from "../../src/lib/uploadQuota";

describe("uploadQuota", () => {
  it("reads the backend public upload quota payload", () => {
    expect(
      readUploadQuota({
        uploads_limit: "5",
        uploads_remaining: 2.9,
        uploads_used: -1,
      }),
    ).toEqual({
      limit: 5,
      remaining: 2,
      used: 0,
    });
  });

  it("reads the backend upload limit error payload", () => {
    expect(
      readUploadQuota({
        already_uploaded: true,
        uploads_limit: 3,
        uploads_used: 5,
        uploads_remaining: 0,
      }),
    ).toEqual({
      limit: 3,
      remaining: 0,
      used: 5,
    });
  });

  it("reads upload quota from backend APIResponse data", () => {
    expect(
      readUploadQuota({
        status: 429,
        message: "Upload limit reached",
        data: {
          already_uploaded: true,
          uploads_limit: 3,
          uploads_used: 5,
          uploads_remaining: 0,
        },
      }),
    ).toEqual({
      limit: 3,
      remaining: 0,
      used: 5,
    });
  });

  it("reads upload quota aliases from camel and Pascal cased payloads", () => {
    expect(
      readUploadQuota({
        uploadsLimit: "4",
        uploadsRemaining: "2",
        uploadsUsed: 1.8,
      }),
    ).toEqual({
      limit: 4,
      remaining: 2,
      used: 1,
    });

    expect(
      readUploadQuota({
        status: 429,
        message: "Upload limit reached",
        data: {
          UploadsLimit: 6,
          UploadsRemaining: 0,
          UploadsUsed: "6",
        },
      }),
    ).toEqual({
      limit: 6,
      remaining: 0,
      used: 6,
    });
  });

  it("falls back to later quota aliases when canonical fields are null", () => {
    expect(
      readUploadQuota({
        uploads_limit: null,
        UploadsLimit: "5",
        uploads_remaining: undefined,
        UploadsRemaining: "2",
        uploads_used: null,
        UploadsUsed: "3",
      }),
    ).toEqual({
      limit: 5,
      remaining: 2,
      used: 3,
    });
  });

  it("falls back to later quota aliases when canonical envelope fields are blank", () => {
    expect(
      readUploadQuota({
        status: 429,
        message: "Upload limit reached",
        data: " ",
        Data: {
          uploads_limit: " ",
          UploadsLimit: "8",
          uploads_remaining: " ",
          UploadsRemaining: "4",
          uploads_used: " ",
          UploadsUsed: "4",
        },
      }),
    ).toEqual({
      limit: 8,
      remaining: 4,
      used: 4,
    });
  });

  it("reads quota metadata attached to presign upload responses", () => {
    expect(
      readUploadQuota({
        upload_url: "https://s3.example.com/file",
        object_key: "moments/event/raw/file.jpg",
        uploads_limit: 7,
        uploads_used: 4,
        uploads_remaining: 3,
      }),
    ).toEqual({
      limit: 7,
      remaining: 3,
      used: 4,
    });

    expect(
      readUploadQuota({
        urls: [{ upload_url: "https://s3.example.com/file" }],
        uploadsLimit: 5,
        uploadsUsed: 2,
        uploadsRemaining: 3,
      }),
    ).toEqual({
      limit: 5,
      remaining: 3,
      used: 2,
    });
  });

  it("falls back to batch slots when quota is not available", () => {
    expect(
      getSelectableUploadSlots({
        currentBatchCount: 3,
        reservedQuotaCount: 3,
        perBatchLimit: 10,
        quotaRemaining: null,
      }),
    ).toBe(7);
  });

  it("caps selectable files by remaining backend quota", () => {
    expect(
      getSelectableUploadSlots({
        currentBatchCount: 2,
        reservedQuotaCount: 2,
        perBatchLimit: 10,
        quotaRemaining: 4,
      }),
    ).toBe(2);
  });

  it("reserves in-flight selections against batch and backend quota", () => {
    expect(
      getSelectableUploadSlotsWithPending({
        currentBatchCount: 2,
        reservedQuotaCount: 2,
        pendingSelectionCount: 3,
        perBatchLimit: 10,
        quotaRemaining: 6,
      }),
    ).toBe(1);
  });

  it("decrements known quota after successful uploads", () => {
    expect(decrementUploadQuota(3, 2)).toBe(1);
    expect(decrementUploadQuota(1, 3)).toBe(0);
    expect(decrementUploadQuota(null, 3)).toBeNull();
  });

  it("uses backend quota without letting stale parallel responses increase remaining slots", () => {
    expect(reconcileUploadQuotaRemaining(null, 7)).toBe(7);
    expect(reconcileUploadQuotaRemaining(7, 6)).toBe(6);
    expect(reconcileUploadQuotaRemaining(6, 7)).toBe(6);
    expect(reconcileUploadQuotaRemaining(6, null)).toBe(6);
  });

  it("uses the smaller display limit between batch and quota", () => {
    expect(getUploadDisplayLimit(10, null)).toBe(10);
    expect(getUploadDisplayLimit(10, 4)).toBe(4);
    expect(getUploadDisplayLimit(10, 0)).toBe(0);
  });
});
