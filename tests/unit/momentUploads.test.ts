import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_MOMENT_PRESIGN_MESSAGE,
  getMomentObjectKey,
  mapBatchMomentPresigns,
  normalizeCompletedUploadParts,
  requireMomentUploadPresign,
  requireSharedMultipartUploadStart,
  toCachedMomentPresign,
} from "../../src/lib/momentUploads";

describe("momentUploads", () => {
  it("preserves backend-normalized content_type when caching a presign", () => {
    expect(
      toCachedMomentPresign(
        {
          upload_url: "https://s3.example.com/upload",
          object_key: "moments/event/raw/file.mov",
          s3_key: "legacy-provider-key",
          content_type: "video/quicktime",
        },
        "application/octet-stream",
      ),
    ).toEqual({
      uploadUrl: "https://s3.example.com/upload",
      objectKey: "moments/event/raw/file.mov",
      contentType: "video/quicktime",
    });
  });

  it("accepts camelCase presign responses from adapters", () => {
    expect(
      toCachedMomentPresign(
        {
          uploadUrl: "https://s3.example.com/upload",
          objectKey: "moments/event/raw/file.jpg",
          contentType: "image/jpeg",
        },
        "application/octet-stream",
      ),
    ).toEqual({
      uploadUrl: "https://s3.example.com/upload",
      objectKey: "moments/event/raw/file.jpg",
      contentType: "image/jpeg",
    });
  });

  it("accepts PascalCase presign responses from Go-style adapters", () => {
    expect(
      toCachedMomentPresign(
        {
          UploadURL: " https://s3.example.com/upload ",
          ObjectKey: " moments/event/raw/file.jpg ",
          ContentType: " image/jpeg ",
        },
        "application/octet-stream",
      ),
    ).toEqual({
      uploadUrl: "https://s3.example.com/upload",
      objectKey: "moments/event/raw/file.jpg",
      contentType: "image/jpeg",
    });
  });

  it("falls back to legacy s3_key when object_key is omitted", () => {
    expect(
      getMomentObjectKey({
        s3_key: "moments/event/raw/file.jpg",
      }),
    ).toBe("moments/event/raw/file.jpg");
  });

  it("trims object keys and prefers object_key over legacy s3_key", () => {
    expect(
      getMomentObjectKey({
        object_key: " moments/event/raw/new.jpg ",
        s3_key: "moments/event/raw/old.jpg",
      }),
    ).toBe("moments/event/raw/new.jpg");
  });

  it("falls back when older presign responses omit content_type", () => {
    expect(
      toCachedMomentPresign(
        {
          upload_url: "https://s3.example.com/upload",
          s3_key: "moments/event/raw/file.jpg",
        },
        "image/jpeg",
      ).contentType,
    ).toBe("image/jpeg");
  });

  it("rejects incomplete single-file presign responses with a clear error", () => {
    expect(() =>
      requireMomentUploadPresign(
        { upload_url: "", object_key: "moments/event/raw/file.jpg" },
        "image/jpeg",
      ),
    ).toThrow(INCOMPLETE_MOMENT_PRESIGN_MESSAGE);

    expect(() =>
      requireMomentUploadPresign(
        { upload_url: "https://s3.example.com/upload" },
        "image/jpeg",
      ),
    ).toThrow(INCOMPLETE_MOMENT_PRESIGN_MESSAGE);
  });

  it("normalizes multipart start responses into a safe upload contract", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          upload_id: " upload-1 ",
          s3_key: " moments/event/raw/video.mov ",
          content_type: " video/quicktime ",
          part_urls: [
            { part_number: 1, url: " https://s3.example.com/part-1 " },
            { part_number: 2, url: "https://s3.example.com/part-2" },
          ],
        },
        "video/mp4",
      ),
    ).toEqual({
      uploadId: "upload-1",
      objectKey: "moments/event/raw/video.mov",
      contentType: "video/quicktime",
      partUrls: [
        { part_number: 1, url: "https://s3.example.com/part-1" },
        { part_number: 2, url: "https://s3.example.com/part-2" },
      ],
    });
  });

  it("accepts camelCase multipart start responses", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          uploadId: " upload-1 ",
          objectKey: " moments/event/raw/video.mov ",
          contentType: " video/quicktime ",
          partUrls: [{ part_number: 1, url: " https://s3.example.com/part-1 " }],
        },
        "video/mp4",
      ),
    ).toEqual({
      uploadId: "upload-1",
      objectKey: "moments/event/raw/video.mov",
      contentType: "video/quicktime",
      partUrls: [{ part_number: 1, url: "https://s3.example.com/part-1" }],
    });
  });

  it("normalizes camelCase multipart part fields from JS adapters", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          uploadId: "upload-1",
          objectKey: "moments/event/raw/video.mov",
          contentType: "video/quicktime",
          partUrls: [
            { partNumber: 1, URL: " https://s3.example.com/part-1 " },
            { PartNumber: 2, url: "https://s3.example.com/part-2" },
          ],
        },
        "video/mp4",
      ).partUrls,
    ).toEqual([
      { part_number: 1, url: "https://s3.example.com/part-1" },
      { part_number: 2, url: "https://s3.example.com/part-2" },
    ]);
  });

  it("falls back to multipart aliases when canonical arrays or part numbers are empty", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          upload_id: " ",
          UploadID: " upload-1 ",
          object_key: " ",
          ObjectKey: " moments/event/raw/video.mov ",
          part_urls: [],
          PartURLs: [
            {
              part_number: 0,
              PartNumber: "2",
              url: " ",
              URL: " https://s3.example.com/part-2 ",
            },
            {
              partNumber: "1",
              URL: "https://s3.example.com/part-1",
            },
          ],
        },
        "video/mp4",
      ).partUrls,
    ).toEqual([
      { part_number: 1, url: "https://s3.example.com/part-1" },
      { part_number: 2, url: "https://s3.example.com/part-2" },
    ]);
  });

  it("sorts multipart part URLs and ignores duplicate part numbers", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          upload_id: "upload-1",
          object_key: "moments/event/raw/video.mov",
          part_urls: [
            { part_number: 2, url: "https://s3.example.com/part-2" },
            { part_number: 1, url: "https://s3.example.com/part-1" },
            { part_number: 2, url: "https://s3.example.com/part-2-duplicate" },
          ],
        },
        "video/mp4",
      ).partUrls,
    ).toEqual([
      { part_number: 1, url: "https://s3.example.com/part-1" },
      { part_number: 2, url: "https://s3.example.com/part-2" },
    ]);
  });

  it("accepts PascalCase multipart start responses from Go-style adapters", () => {
    expect(
      requireSharedMultipartUploadStart(
        {
          UploadID: " upload-1 ",
          ObjectKey: " moments/event/raw/video.mov ",
          ContentType: " video/quicktime ",
          PartURLs: [
            { PartNumber: 1, URL: " https://s3.example.com/part-1 " },
          ],
        },
        "video/mp4",
      ),
    ).toEqual({
      uploadId: "upload-1",
      objectKey: "moments/event/raw/video.mov",
      contentType: "video/quicktime",
      partUrls: [{ part_number: 1, url: "https://s3.example.com/part-1" }],
    });
  });

  it("rejects incomplete multipart start responses", () => {
    expect(() =>
      requireSharedMultipartUploadStart(
        {
          upload_id: "upload-1",
          object_key: "moments/event/raw/video.mov",
          part_urls: [],
        },
        "video/mp4",
      ),
    ).toThrow(INCOMPLETE_MOMENT_PRESIGN_MESSAGE);
  });

  it("normalizes completed multipart parts before calling the backend", () => {
    expect(
      normalizeCompletedUploadParts([
        { part_number: 2, etag: " etag-2 " },
        undefined,
        { part_number: 0, etag: "etag-0" },
        { part_number: 1, etag: "etag-1" },
        { part_number: 2, etag: "etag-2-duplicate" },
        { part_number: 3, etag: " " },
      ]),
    ).toEqual([
      { part_number: 1, etag: "etag-1" },
      { part_number: 2, etag: "etag-2" },
    ]);
  });

  it("normalizes completed multipart part aliases before calling the backend", () => {
    expect(
      normalizeCompletedUploadParts([
        { PartNumber: "2", ETag: " etag-2 " },
        { part_number: 0, partNumber: 1, eTag: "etag-1" },
        { partNumber: 3, etag: " " },
      ] as unknown as Parameters<typeof normalizeCompletedUploadParts>[0]),
    ).toEqual([
      { part_number: 1, etag: "etag-1" },
      { part_number: 2, etag: "etag-2" },
    ]);
  });

  it("maps complete batch presign responses by entry id", () => {
    const entries = [
      { id: "file-1", fallback: "image/jpeg" },
      { id: "file-2", fallback: "video/mp4" },
    ];

    const cache = mapBatchMomentPresigns(
      entries,
      {
        urls: [
          { upload_url: "https://s3.example.com/1", object_key: "moments/event/raw/1.jpg" },
          {
            upload_url: "https://s3.example.com/2",
            object_key: "moments/event/raw/2.mov",
            s3_key: "legacy-provider-key",
            content_type: "video/quicktime",
          },
        ],
      },
      (entry) => entry.fallback,
    );

    expect(cache?.get("file-1")).toEqual({
      uploadUrl: "https://s3.example.com/1",
      objectKey: "moments/event/raw/1.jpg",
      contentType: "image/jpeg",
    });
    expect(cache?.get("file-2")?.contentType).toBe("video/quicktime");
  });

  it("maps camelCase batch presign responses", () => {
    const cache = mapBatchMomentPresigns(
      [{ id: "file-1", fallback: "image/jpeg" }],
      {
        URLs: [
          {
            uploadUrl: "https://s3.example.com/1",
            objectKey: "moments/event/raw/1.jpg",
            contentType: "image/jpeg",
          },
        ],
      },
      (entry) => entry.fallback,
    );

    expect(cache?.get("file-1")).toEqual({
      uploadUrl: "https://s3.example.com/1",
      objectKey: "moments/event/raw/1.jpg",
      contentType: "image/jpeg",
    });
  });

  it("falls back to batch URL aliases when canonical URL arrays are empty", () => {
    const cache = mapBatchMomentPresigns(
      [{ id: "file-1", fallback: "image/jpeg" }],
      {
        urls: [],
        URLs: [
          {
            upload_url: "https://s3.example.com/1",
            object_key: "moments/event/raw/1.jpg",
          },
        ],
      },
      (entry) => entry.fallback,
    );

    expect(cache?.get("file-1")).toEqual({
      uploadUrl: "https://s3.example.com/1",
      objectKey: "moments/event/raw/1.jpg",
      contentType: "image/jpeg",
    });
  });

  it("maps PascalCase batch presign responses", () => {
    const cache = mapBatchMomentPresigns(
      [{ id: "file-1", fallback: "image/jpeg" }],
      {
        Urls: [
          {
            UploadUrl: "https://s3.example.com/1",
            ObjectKey: "moments/event/raw/1.jpg",
            ContentType: "image/jpeg",
          },
        ],
      },
      (entry) => entry.fallback,
    );

    expect(cache?.get("file-1")).toEqual({
      uploadUrl: "https://s3.example.com/1",
      objectKey: "moments/event/raw/1.jpg",
      contentType: "image/jpeg",
    });
  });

  it("returns null for incomplete batch responses so callers can fall back", () => {
    const cache = mapBatchMomentPresigns(
      [{ id: "file-1" }, { id: "file-2" }],
      { urls: [{ upload_url: "https://s3.example.com/1", s3_key: "moments/event/raw/1.jpg" }] },
      () => "image/jpeg",
    );

    expect(cache).toBeNull();
  });
});
