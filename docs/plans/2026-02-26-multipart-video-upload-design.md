# S3 Multipart Video Upload — Design Document

**Date:** 2026-02-26
**Status:** Approved

---

## Problem

Video uploads (up to 200MB) are slow because they use a single HTTP PUT to S3. On mobile
connections (5-10 Mbps upload), a 100MB video takes 80-160 seconds. There is no parallelism,
no part-level retry, and the 2-minute XHR timeout can cut the transfer for larger files on
slow connections.

---

## Goal

Reduce perceived and actual video upload time by splitting large video files into 8MB chunks
uploaded in parallel (4 concurrent), using S3 native multipart upload. Small files and images
continue using the existing single-PUT flow unchanged.

---

## Architecture

### Decision: Direct-to-final-path (no staging for multipart)

For the existing single-PUT flow, files land in `moments/uploads/tmp/{uuid}.ext` and are
"promoted" to `moments/{eventID}/raw/{uuid}.ext` via HeadObject + CopyObject + DeleteObject.

For multipart, the backend controls the final key from the start (`/start` endpoint generates
it). Uploading directly to `moments/{eventID}/raw/{uuid}.ext` eliminates the 3-call promotion
step. Orphaned incomplete multipart uploads are cleaned automatically by an S3 lifecycle rule
(`AbortIncompleteMultipartUploads`, TTL = 1 day).

### Threshold

| File type        | Size        | Upload method   |
|-----------------|-------------|-----------------|
| Images          | any         | Single PUT      |
| Videos          | < 10MB      | Single PUT      |
| Videos          | >= 10MB     | S3 Multipart    |

### Part size: 8MB — rationale
- S3 minimum part size is 5MB (except last part).
- 8MB gives ~25 parts for a 200MB video — within S3's 10,000-part limit.
- Balances round-trip overhead vs. parallelism benefit.

### Concurrency: 4 parallel part uploads
- Conservative for mobile network constraints.
- 4 × 8MB = 32MB in flight simultaneously.

---

## Backend Changes

**Project:** `itbem-events-backend` (Go + Echo, WSL at `/var/www/itbem-events-backend`)

### New endpoints (all under `/api/events/:identifier/moments/shared/multipart/`)

#### `POST .../start`

Validates event config (share_uploads_enabled, allow_uploads), calls S3
`CreateMultipartUpload`, signs all part URLs at once (saves round-trips).

```
Request:  { content_type, filename, file_size }
Response: { upload_id, s3_key, part_urls: [{part_number, url}] }
```

S3 key format: `moments/{eventID}/raw/{uuid}.ext`
Part URL TTL: 60 minutes (enough for a slow upload + retries).

#### `POST .../complete`

Calls S3 `CompleteMultipartUpload`, then creates the Moment DB record, queues SQS.
Equivalent to current `ConfirmSharedMoment` but for multipart-uploaded files.

```
Request:  { upload_id, s3_key, content_type, parts: [{part_number, etag}], description }
Response: the created Moment object
```

#### `POST .../abort`

Calls S3 `AbortMultipartUpload`. Called by frontend on error or user cancel.

```
Request:  { upload_id, s3_key }
Response: 200 OK (always — abort failures are non-fatal)
```

### New bucket repository functions

File: `repositories/bucketrepository/BucketRepository.go`

```go
CreateMultipartUpload(key, bucket, contentType string) (uploadID string, err error)
GetPresignedPartURL(key, bucket, uploadID string, partNumber, ttlMin int) (string, error)
CompleteMultipartUpload(key, bucket, uploadID string, parts []CompletedPart) error
AbortMultipartUpload(key, bucket, uploadID string) error

type CompletedPart struct {
    PartNumber int
    ETag       string
}
```

### IAM permissions required (already likely present, verify)

- `s3:CreateMultipartUpload`
- `s3:UploadPart`
- `s3:CompleteMultipartUpload`
- `s3:AbortMultipartUpload`
- `s3:ListMultipartUploads`

---

## Frontend Changes

**Project:** `cafetton-casero` (Astro + React)
**File:** `src/components/SharedUploadPage.tsx`

### New constants

```typescript
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB
const PART_SIZE           = 8 * 1024 * 1024;  // 8MB
const PART_CONCURRENCY    = 4;
```

### Upload dispatch logic

```typescript
const useMultipart = entry.isVideo && entry.file.size > MULTIPART_THRESHOLD;
useMultipart ? await uploadMultipart(entry, isFirst) : await uploadSinglePut(entry, isFirst);
```

`uploadSinglePut` = current `uploadOne` logic, extracted verbatim.

### `uploadMultipart` function

1. POST `.../multipart/start` → `{ upload_id, s3_key, part_urls }`
2. Split file: `file.slice(i * PART_SIZE, (i+1) * PART_SIZE)` for each part
3. Run parts through pool of `PART_CONCURRENCY` workers
4. Each worker: XHR PUT to part URL, timeout 10min, reads `ETag` from response header
5. Track progress: `bytesUploadedPerPart[]` → `sum / file.size * 90` → update UI
6. POST `.../multipart/complete` → 90-100% progress
7. On any error: POST `.../multipart/abort`, then throw for error UI

### Progress UX

- `0-90%`: actual bytes transferred (sum across parts)
- `90-100%`: complete + DB + SQS
- Subtitle: "Subiendo parte 3/12..." during part uploads

### ETag extraction

```typescript
const etag = xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag") ?? "";
```

Note: S3 returns ETag in quotes (`"abc123"`). Pass as-is to `/complete`.

---

## Error Handling

| Scenario                         | Behavior                                          |
|----------------------------------|---------------------------------------------------|
| Part fails (network error)       | Retry up to 2× with 1s/2s backoff, then abort    |
| All retries exhausted            | POST `/abort`, show error to user                 |
| `/complete` fails                | POST `/abort`, show error                         |
| User cancels mid-upload          | Abort XHRs + POST `/abort`                        |
| `/abort` itself fails            | Ignore — S3 lifecycle rule cleans up after 1 day  |

---

## S3 Lifecycle Rule (ops task)

Add to bucket: abort incomplete multipart uploads for `moments/*/raw/*` prefix after 1 day.

```json
{
  "ID": "AbortIncompleteMultipartMoments",
  "Filter": { "Prefix": "moments/" },
  "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 },
  "Status": "Enabled"
}
```

---

## Testing

- **Backend unit tests**: CreateMultipartUpload, CompleteMultipartUpload, AbortMultipartUpload
  handlers with mocked S3 client.
- **Frontend unit tests**: part-size calculation, progress aggregation, single-PUT fallback
  for files below threshold.
- **Manual integration**: 50MB video + 150MB video from mobile + desktop.

---

## Out of Scope

- Quick wins (XHR timeout increase, staging removal for single-PUT, UX decoupling) — can be
  added separately, do not block this feature.
- Personal invitation upload flow — same changes can be applied later.
- HEIC conversion before upload.
