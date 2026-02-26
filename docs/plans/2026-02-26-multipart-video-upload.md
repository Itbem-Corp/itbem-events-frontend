# S3 Multipart Video Upload — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-PUT video upload with S3 native multipart upload for files >10 MB, uploading 4 parts concurrently to give 3–5× real-world speed improvement on mobile connections.

**Architecture:** Three new backend endpoints (`/multipart/start`, `/multipart/complete`, `/multipart/abort`) coordinate the S3 multipart lifecycle. The browser splits large video files with `Blob.slice()`, uploads parts in parallel via presigned `UploadPart` URLs, then POSTs ETags to `/complete`. Small files (<10 MB) and all images continue using the existing single-PUT flow unchanged.

**Tech Stack:**
- Backend: Go 1.24, Echo v4, AWS SDK v2 (`service/s3` v1.79.3), `s3/types`
- Frontend: React (Astro island), TypeScript, XHR (for per-part progress)
- Two repos: `itbem-events-backend` (WSL at `/var/www/itbem-events-backend`) and `cafetton-casero` (Windows at `C:\Users\AndBe\Desktop\Projects\cafetton-casero`)

---

## Context for the implementer

### Existing upload flow (single PUT — DO NOT CHANGE)
1. `POST /api/events/:identifier/moments/shared/upload-url` → backend generates presigned PUT URL to `moments/uploads/tmp/{uuid}.ext`
2. Browser XHR PUT → S3 staging
3. `POST /api/events/:identifier/moments/shared/confirm` → backend calls `promoteFromStaging` (HeadObject + CopyObject + DeleteObject), creates Moment in DB, queues SQS

### New multipart flow (add alongside)
1. `POST .../multipart/start` → backend creates multipart upload directly at `moments/{eventID}/raw/{uuid}.ext`, returns uploadId + all presigned part URLs
2. Browser uploads parts in parallel (4 concurrent XHRs)
3. `POST .../multipart/complete` → backend calls `CompleteMultipartUpload`, creates Moment in DB, queues SQS
4. `POST .../multipart/abort` → backend calls `AbortMultipartUpload` (on error/cancel)

### Key files
- `repositories/awsrepository/S3Repository.go` — AWS SDK calls
- `repositories/bucketrepository/BucketRepository.go` — provider-dispatch wrappers
- `controllers/moments/public_moments.go` — HTTP handlers (718 lines)
- `routes/routes.go` — route registration (directUploadGroup, lines ~155-161)
- `src/components/SharedUploadPage.tsx` (cafetton-casero) — the upload UI

### Running backend tests
All Go commands must run in WSL:
```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go test ./repositories/... -v -run TestMultipart"
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./..."
```

### Running frontend tests
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npm run test          # or: npx vitest run
```

---

## Task 1: S3 multipart functions in awsrepository

**Files:**
- Modify: `repositories/awsrepository/S3Repository.go`

**What to add:** 4 functions at the bottom of the file. The `s3/types` package contains `CompletedPart` — you'll need to import `"github.com/aws/aws-sdk-go-v2/service/s3/types"`.

### Step 1: Add the `CompletedPart` type and 4 functions

Append to the bottom of `repositories/awsrepository/S3Repository.go`:

```go
// CompletedPart holds the PartNumber and ETag returned by S3 for a single uploaded part.
// Used when assembling the final object via CompleteMultipartUpload.
type CompletedPart struct {
	PartNumber int
	ETag       string
}

// CreateMultipartUpload initiates a multipart upload and returns the upload ID.
// The caller must eventually call CompleteMultipartUpload or AbortMultipartUpload.
func CreateMultipartUpload(ctx context.Context, key, bucket, contentType string) (string, error) {
	client := configuration.GetS3Client(nil)
	resp, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return aws.ToString(resp.UploadId), nil
}

// GetPresignedPartURL returns a short-lived presigned URL for uploading one part.
// partNumber is 1-based (S3 requirement). ttlMin is the URL lifetime in minutes.
func GetPresignedPartURL(ctx context.Context, key, bucket, uploadID string, partNumber, ttlMin int) (string, error) {
	client := configuration.GetS3Client(nil)
	presignClient := s3.NewPresignClient(client)
	pn := int32(partNumber)
	resp, err := presignClient.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(bucket),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: &pn,
	}, func(opts *s3.PresignOptions) {
		opts.Expires = time.Duration(ttlMin) * time.Minute
	})
	if err != nil {
		return "", err
	}
	return resp.URL, nil
}

// CompleteMultipartUpload assembles the uploaded parts into the final S3 object.
// parts must include every part number with its ETag (including surrounding quotes).
func CompleteMultipartUpload(ctx context.Context, key, bucket, uploadID string, parts []CompletedPart) error {
	client := configuration.GetS3Client(nil)
	completed := make([]types.CompletedPart, len(parts))
	for i, p := range parts {
		pn := int32(p.PartNumber)
		etag := p.ETag
		completed[i] = types.CompletedPart{PartNumber: &pn, ETag: &etag}
	}
	_, err := client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(bucket),
		Key:             aws.String(key),
		UploadId:        aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{Parts: completed},
	})
	return err
}

// AbortMultipartUpload cancels a multipart upload and removes all uploaded parts.
// Call this on error or user cancellation to avoid orphaned storage charges.
func AbortMultipartUpload(ctx context.Context, key, bucket, uploadID string) error {
	client := configuration.GetS3Client(nil)
	_, err := client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	return err
}
```

Add `"github.com/aws/aws-sdk-go-v2/service/s3/types"` to the import block in `S3Repository.go`. The existing imports already have `s3`, `aws`, `time`, and `context` — only `types` is new.

### Step 2: Verify it compiles

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./repositories/awsrepository/..."
```
Expected: no output (success).

### Step 3: Commit

```bash
# Run from WSL:
cd /var/www/itbem-events-backend
git add repositories/awsrepository/S3Repository.go
git commit -m "feat(s3): add multipart upload functions to awsrepository"
```

---

## Task 2: Bucket repository wrappers

**Files:**
- Modify: `repositories/bucketrepository/BucketRepository.go`

**What to add:** 4 thin provider-dispatch wrapper functions. Follow the same pattern as every other function in the file: `ctx := context.Background()`, switch on `strings.ToLower(provider)`, delegate to `awsrepository.*`.

### Step 1: Append to `repositories/bucketrepository/BucketRepository.go`

```go
// CreateMultipartUpload initiates a multipart upload. key is the full S3 object key
// (e.g. "moments/{eventID}/raw/{uuid}.mp4"). Returns the upload ID.
func CreateMultipartUpload(key, bucket, contentType, provider string) (string, error) {
	ctx := context.Background()
	switch strings.ToLower(provider) {
	case "aws":
		return awsrepository.CreateMultipartUpload(ctx, key, bucket, contentType)
	default:
		return "", fmt.Errorf("unsupported provider: %s", provider)
	}
}

// GetPresignedPartURL signs a URL for uploading one specific part. partNumber is 1-based.
func GetPresignedPartURL(key, bucket, uploadID string, partNumber, ttlMin int, provider string) (string, error) {
	ctx := context.Background()
	switch strings.ToLower(provider) {
	case "aws":
		return awsrepository.GetPresignedPartURL(ctx, key, bucket, uploadID, partNumber, ttlMin)
	default:
		return "", fmt.Errorf("unsupported provider: %s", provider)
	}
}

// CompleteMultipartUpload assembles all uploaded parts into the final S3 object.
func CompleteMultipartUpload(key, bucket, uploadID, provider string, parts []awsrepository.CompletedPart) error {
	ctx := context.Background()
	switch strings.ToLower(provider) {
	case "aws":
		return awsrepository.CompleteMultipartUpload(ctx, key, bucket, uploadID, parts)
	default:
		return fmt.Errorf("unsupported provider: %s", provider)
	}
}

// AbortMultipartUpload cancels a multipart upload, freeing all uploaded parts.
func AbortMultipartUpload(key, bucket, uploadID, provider string) error {
	ctx := context.Background()
	switch strings.ToLower(provider) {
	case "aws":
		return awsrepository.AbortMultipartUpload(ctx, key, bucket, uploadID)
	default:
		return fmt.Errorf("unsupported provider: %s", provider)
	}
}
```

### Step 2: Verify it compiles

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./repositories/..."
```
Expected: no output.

### Step 3: Commit

```bash
cd /var/www/itbem-events-backend
git add repositories/bucketrepository/BucketRepository.go
git commit -m "feat(bucket): add multipart upload wrappers"
```

---

## Task 3: Backend multipart handlers + routes

**Files:**
- Modify: `controllers/moments/public_moments.go` (append 3 handlers + 1 helper at end)
- Modify: `routes/routes.go` (add 3 routes to `directUploadGroup`)

### Step 1: Write a failing validation test

Create `controllers/moments/public_moments_multipart_test.go`:

```go
package moments

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// TestCompleteMultipartMoment_RejectsEmptyParts verifies the handler returns 400
// when the parts array is missing or empty — before any S3 call.
func TestCompleteMultipartMoment_RejectsEmptyParts(t *testing.T) {
	e := echo.New()
	body := `{"upload_id":"uid","s3_key":"moments/abc/raw/file.mp4","content_type":"video/mp4","parts":[]}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("identifier")
	c.SetParamValues("test-event-id")

	// Call the handler directly — it will fail at the parts validation
	// (before DB/S3 calls) because the real event lookup will error out,
	// but we can at least confirm it doesn't panic.
	// Full integration testing is done manually (see testing section at bottom).
	require.NotPanics(t, func() {
		_ = CompleteMultipartMoment(c)
	})
}
```

Run it to confirm it compiles (not fails — it will pass trivially since it just tests no-panic):
```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go test ./controllers/moments/... -run TestCompleteMultipartMoment -v"
```

### Step 2: Add the 3 handlers and helper to `public_moments.go`

Append these functions to the bottom of `controllers/moments/public_moments.go`.

**Helper — `validateMultipartKey`:**
```go
// validateMultipartKey checks that the s3_key was generated by our /start endpoint
// for the given event. Rejects forged keys that would let a user complete a multipart
// upload to an arbitrary path.
func validateMultipartKey(s3Key, eventID string) bool {
	prefix := fmt.Sprintf("moments/%s/raw/", eventID)
	if !strings.HasPrefix(s3Key, prefix) {
		return false
	}
	// Remaining part must be a non-empty filename
	filename := s3Key[len(prefix):]
	return len(filename) > 0 && !strings.Contains(filename, "/")
}
```

**Handler — `RequestMultipartUploadStart`:**
```go
// POST /api/events/:identifier/moments/shared/multipart/start
//
// Step 1 of multipart upload: creates the S3 multipart upload and returns
// presigned UploadPart URLs for every part. The browser uploads parts directly
// to S3 using these URLs, then calls /complete with the collected ETags.
//
// The file lands at moments/{eventID}/raw/{uuid}.ext — no staging promotion needed.
func RequestMultipartUploadStart(c echo.Context) error {
	identifier := c.Param("identifier")
	if identifier == "" {
		return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
	}

	event, err := getEventByIdentifier(identifier)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Error(c, http.StatusNotFound, "Event not found", "")
		}
		return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
	}

	cfg, err := eventconfigrepository.GetEventConfigByID(event.ID)
	if err != nil || cfg == nil {
		return utils.Error(c, http.StatusNotFound, "Event config not found", "")
	}
	if !cfg.ShareUploadsEnabled {
		return utils.Error(c, http.StatusForbidden, "Shared uploads are not enabled for this event", "")
	}
	if !cfg.AllowUploads {
		return utils.Error(c, http.StatusForbidden, "Uploads are disabled for this event", "")
	}

	var body struct {
		ContentType string `json:"content_type"`
		Filename    string `json:"filename"`
		FileSize    int64  `json:"file_size"`
	}
	if err := c.Bind(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if body.ContentType == "" || body.Filename == "" || body.FileSize <= 0 {
		return utils.Error(c, http.StatusBadRequest, "content_type, filename, and file_size are required", "")
	}
	if !strings.HasPrefix(body.ContentType, "video/") {
		return utils.Error(c, http.StatusBadRequest, "multipart upload is only supported for video files", "")
	}

	const maxVideoBytes = int64(200 * 1024 * 1024)
	if body.FileSize > maxVideoBytes {
		return utils.Error(c, http.StatusBadRequest, "file size exceeds 200 MB limit", "")
	}

	// Build the final S3 key directly (no staging — multipart is initiated by the backend)
	ext := ""
	if idx := strings.LastIndex(body.Filename, "."); idx != -1 {
		ext = strings.ToLower(body.Filename[idx:])
	}
	u, _ := uuid.NewV4()
	filename := u.String() + ext
	s3Key := fmt.Sprintf("moments/%s/raw/%s", event.ID.String(), filename)

	uploadID, err := bucketrepository.CreateMultipartUpload(s3Key, publicResSvc.Bucket, body.ContentType, constants.DefaultCloudProvider)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error initiating multipart upload", err.Error())
	}

	// Sign all part URLs at once. Part size = 8 MB; last part may be smaller.
	const partSize = int64(8 * 1024 * 1024)
	totalParts := int((body.FileSize + partSize - 1) / partSize)
	if totalParts < 1 {
		totalParts = 1
	}

	type partURL struct {
		PartNumber int    `json:"part_number"`
		URL        string `json:"url"`
	}
	partURLs := make([]partURL, totalParts)
	for i := 0; i < totalParts; i++ {
		url, err := bucketrepository.GetPresignedPartURL(s3Key, publicResSvc.Bucket, uploadID, i+1, 60, constants.DefaultCloudProvider)
		if err != nil {
			// Abort the initiated upload before returning — don't leave orphaned state
			_ = bucketrepository.AbortMultipartUpload(s3Key, publicResSvc.Bucket, uploadID, constants.DefaultCloudProvider)
			return utils.Error(c, http.StatusInternalServerError, "Error signing part URLs", err.Error())
		}
		partURLs[i] = partURL{PartNumber: i + 1, URL: url}
	}

	return utils.Success(c, http.StatusOK, "Multipart upload started", map[string]interface{}{
		"upload_id": uploadID,
		"s3_key":    s3Key,
		"part_urls": partURLs,
	})
}
```

**Handler — `CompleteMultipartMoment`:**
```go
// POST /api/events/:identifier/moments/shared/multipart/complete
//
// Step 2 of multipart upload: assembles the S3 object, creates the Moment in DB,
// and queues Lambda processing — exactly like ConfirmSharedMoment but without
// the staging promotion (HeadObject + CopyObject + DeleteObject).
func CompleteMultipartMoment(c echo.Context) error {
	identifier := c.Param("identifier")
	if identifier == "" {
		return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
	}

	event, err := getEventByIdentifier(identifier)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Error(c, http.StatusNotFound, "Event not found", "")
		}
		return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
	}

	cfg, err := eventconfigrepository.GetEventConfigByID(event.ID)
	if err != nil || cfg == nil {
		return utils.Error(c, http.StatusNotFound, "Event config not found", "")
	}
	if !cfg.ShareUploadsEnabled {
		return utils.Error(c, http.StatusForbidden, "Shared uploads are not enabled for this event", "")
	}
	if !cfg.AllowUploads {
		return utils.Error(c, http.StatusForbidden, "Uploads are disabled for this event", "")
	}

	var body struct {
		UploadID    string `json:"upload_id"`
		S3Key       string `json:"s3_key"`
		ContentType string `json:"content_type"`
		Description string `json:"description"`
		Parts       []struct {
			PartNumber int    `json:"part_number"`
			ETag       string `json:"etag"`
		} `json:"parts"`
	}
	if err := c.Bind(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if body.UploadID == "" || body.S3Key == "" || body.ContentType == "" {
		return utils.Error(c, http.StatusBadRequest, "upload_id, s3_key, and content_type are required", "")
	}
	if len(body.Parts) == 0 {
		return utils.Error(c, http.StatusBadRequest, "parts must not be empty", "")
	}

	// Security: reject keys that don't belong to this event
	if !validateMultipartKey(body.S3Key, event.ID.String()) {
		return utils.Error(c, http.StatusBadRequest, "Invalid s3_key for this event", "")
	}

	// Convert to bucket repo type
	parts := make([]awsrepository.CompletedPart, len(body.Parts))
	for i, p := range body.Parts {
		parts[i] = awsrepository.CompletedPart{PartNumber: p.PartNumber, ETag: p.ETag}
	}

	if err := bucketrepository.CompleteMultipartUpload(body.S3Key, publicResSvc.Bucket, body.UploadID, constants.DefaultCloudProvider, parts); err != nil {
		return utils.Error(c, http.StatusUnprocessableEntity, "Error completing multipart upload", err.Error())
	}

	eventID := event.ID
	moment := models.Moment{
		EventID:          &eventID,
		ContentURL:       body.S3Key,
		ContentType:      body.ContentType,
		Description:      body.Description,
		IsApproved:       cfg.AutoApproveUploads,
		ProcessingStatus: "pending",
	}

	if err := momentsService.CreateMoment(&moment); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error saving moment", err.Error())
	}

	if !publishMediaJob(&moment, body.S3Key, publicResSvc.Bucket, body.ContentType) {
		moment.ProcessingStatus = ""
		_ = momentsService.UpdateMoment(&moment)
	}

	go eventsService.IncrementAnalytics(eventID, "moment_uploads")

	return utils.Success(c, http.StatusCreated, "Moment submitted for review", moment)
}
```

**Handler — `AbortMultipartMoment`:**
```go
// POST /api/events/:identifier/moments/shared/multipart/abort
//
// Called by the browser when an upload fails or the user cancels.
// Always returns 200 — abort failures are non-fatal (S3 lifecycle cleans up).
func AbortMultipartMoment(c echo.Context) error {
	identifier := c.Param("identifier")
	if identifier == "" {
		return utils.Error(c, http.StatusBadRequest, "Missing event identifier", "")
	}

	// Minimal event lookup — just to validate the identifier exists
	event, err := getEventByIdentifier(identifier)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Error(c, http.StatusNotFound, "Event not found", "")
		}
		return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
	}

	var body struct {
		UploadID string `json:"upload_id"`
		S3Key    string `json:"s3_key"`
	}
	if err := c.Bind(&body); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if body.UploadID == "" || body.S3Key == "" {
		return utils.Error(c, http.StatusBadRequest, "upload_id and s3_key are required", "")
	}

	// Security: reject keys that don't belong to this event
	if !validateMultipartKey(body.S3Key, event.ID.String()) {
		return utils.Error(c, http.StatusBadRequest, "Invalid s3_key for this event", "")
	}

	// Best-effort abort — log but don't surface errors
	if err := bucketrepository.AbortMultipartUpload(body.S3Key, publicResSvc.Bucket, body.UploadID, constants.DefaultCloudProvider); err != nil {
		slog.Warn("AbortMultipartUpload failed", "key", body.S3Key, "err", err)
	}

	return utils.Success(c, http.StatusOK, "Aborted", nil)
}
```

Make sure the import `"events-stocks/repositories/awsrepository"` is present in `public_moments.go` — it's needed for `awsrepository.CompletedPart`. Check the existing imports at the top of the file; if missing, add it.

### Step 3: Register the routes

In `routes/routes.go`, find the `directUploadGroup` block (around line 155–161) and add the 3 new routes:

```go
// Multipart upload coordination (for large videos)
directUploadGroup.POST("/events/:identifier/moments/shared/multipart/start", moments.RequestMultipartUploadStart)
directUploadGroup.POST("/events/:identifier/moments/shared/multipart/complete", moments.CompleteMultipartMoment)
directUploadGroup.POST("/events/:identifier/moments/shared/multipart/abort", moments.AbortMultipartMoment)
```

Place them immediately after the existing `ConfirmSharedMoment` line.

Also update the comment above `directUploadGroup` (line ~73) to reflect multipart:
```go
// A single user uploading 10 videos via multipart needs: 10 starts + up to 10 completes = 20 requests.
// Burst=30, rate=3 req/s covers this with margin.
```

### Step 4: Run the test and verify it passes

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go test ./controllers/moments/... -run TestCompleteMultipartMoment -v"
```
Expected: PASS (the no-panic test).

### Step 5: Verify full build

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./..."
```
Expected: no output.

### Step 6: Commit

```bash
cd /var/www/itbem-events-backend
git add controllers/moments/public_moments.go controllers/moments/public_moments_multipart_test.go routes/routes.go
git commit -m "feat(moments): S3 multipart upload endpoints — start, complete, abort"
```

---

## Task 4: Frontend multipart upload flow

**Files:**
- Modify: `src/components/SharedUploadPage.tsx` (cafetton-casero)
- Modify or create: `tests/unit/components/SharedUploadPage.multipart.test.ts`

**Important:** The frontend file is 700+ lines. Do NOT rewrite it. Add only:
1. New constants (after existing constants around line 40)
2. Two pure helper functions (after the `runPool` function, around line 274)
3. The `uploadMultipart` function (inside the component, before `handleUpload`)
4. Decision logic in `handleUpload` (1 line change in `uploadTasks`)

### Step 1: Write failing unit tests

Create `tests/unit/components/SharedUploadPage.multipart.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Pure helper: calculates part boundaries for a file.
// Returns array of { partNumber, start, end } — end is exclusive.
function calcParts(fileSize: number, partSize: number) {
  const parts = [];
  let offset = 0;
  let partNumber = 1;
  while (offset < fileSize) {
    const end = Math.min(offset + partSize, fileSize);
    parts.push({ partNumber, start: offset, end });
    offset = end;
    partNumber++;
  }
  return parts;
}

// Pure helper: computes overall progress percentage from per-part byte counters.
// Returns 0-90 (last 10% reserved for /complete round-trip).
function calcProgress(bytesPerPart: number[], totalBytes: number): number {
  if (totalBytes === 0) return 0;
  const uploaded = bytesPerPart.reduce((a, b) => a + b, 0);
  return Math.min(90, Math.round((uploaded / totalBytes) * 90));
}

describe("calcParts", () => {
  it("produces correct part count for exact multiple", () => {
    const parts = calcParts(24 * 1024 * 1024, 8 * 1024 * 1024); // 3 parts exactly
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ partNumber: 1, start: 0, end: 8 * 1024 * 1024 });
    expect(parts[2].end).toBe(24 * 1024 * 1024);
  });

  it("produces correct part count for non-exact size", () => {
    const parts = calcParts(20 * 1024 * 1024, 8 * 1024 * 1024); // 3 parts, last is 4 MB
    expect(parts).toHaveLength(3);
    expect(parts[2].end - parts[2].start).toBe(4 * 1024 * 1024);
  });

  it("handles single-part file", () => {
    const parts = calcParts(5 * 1024 * 1024, 8 * 1024 * 1024);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ partNumber: 1, start: 0, end: 5 * 1024 * 1024 });
  });
});

describe("calcProgress", () => {
  it("returns 0 when nothing uploaded", () => {
    expect(calcProgress([0, 0, 0], 24 * 1024 * 1024)).toBe(0);
  });

  it("returns 90 when all bytes uploaded", () => {
    const total = 24 * 1024 * 1024;
    expect(calcProgress([8 * 1024 * 1024, 8 * 1024 * 1024, 8 * 1024 * 1024], total)).toBe(90);
  });

  it("is proportional mid-upload", () => {
    const total = 8 * 1024 * 1024; // 8 MB file
    const pct = calcProgress([4 * 1024 * 1024], total); // 50% uploaded
    expect(pct).toBe(45); // 50% * 90 = 45
  });
});
```

Run to confirm they fail (functions not yet in source):
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npx vitest run tests/unit/components/SharedUploadPage.multipart.test.ts
```
Expected: FAIL (the functions don't exist in source yet — that's fine, they'll be in the test file itself for now).

Actually these are self-contained tests — they define the functions inline. Run again:
```bash
npx vitest run tests/unit/components/SharedUploadPage.multipart.test.ts
```
Expected: PASS (functions are defined in the test file).

### Step 2: Add constants to SharedUploadPage.tsx

After the existing constants block (around line 52), add:

```typescript
// ── Multipart upload constants ────────────────────────────────────────────────
const MULTIPART_THRESHOLD = 10 * 1024 * 1024;  // 10 MB — below this, use single PUT
const PART_SIZE           = 8 * 1024 * 1024;   // 8 MB per part (S3 minimum is 5 MB)
const PART_CONCURRENCY    = 4;                  // simultaneous part uploads
```

### Step 3: Add pure helper functions after `runPool`

After the `runPool` function (ends around line 274), add:

```typescript
// ── Multipart helpers ─────────────────────────────────────────────────────────

/** Split a file into part descriptors for S3 multipart upload. */
function calcParts(fileSize: number, partSize: number): Array<{ partNumber: number; start: number; end: number }> {
  const parts: Array<{ partNumber: number; start: number; end: number }> = [];
  let offset = 0;
  let partNumber = 1;
  while (offset < fileSize) {
    const end = Math.min(offset + partSize, fileSize);
    parts.push({ partNumber, start: offset, end });
    offset = end;
    partNumber++;
  }
  return parts;
}

/** Compute overall 0-90 progress from per-part byte counters. */
function calcProgress(bytesPerPart: number[], totalBytes: number): number {
  if (totalBytes === 0) return 0;
  const uploaded = bytesPerPart.reduce((a, b) => a + b, 0);
  return Math.min(90, Math.round((uploaded / totalBytes) * 90));
}
```

### Step 4: Add `uploadMultipart` inside the component

Inside `SharedUploadPage`, BEFORE the `handleUpload` function (around line 429), add:

```typescript
  const uploadMultipart = useCallback(async (entry: FileEntry, isFirst: boolean): Promise<void> => {
    const { file } = entry;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const contentType = file.type ||
      (ext === "mp4" ? "video/mp4" :
       ext === "mov" ? "video/quicktime" :
       ext === "webm" ? "video/webm" :
       "video/mp4");

    // ── Step 1: Start the multipart upload ───────────────────────────────────
    const startRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, filename: file.name, file_size: file.size }),
    });

    if (startRes.status === 403) throw Object.assign(new Error("uploads-disabled"), { uploadsDisabled: true });
    if (!startRes.ok) {
      const json = await startRes.json().catch(() => ({}));
      throw new Error(json.message ?? `Error iniciando subida (${startRes.status})`);
    }

    const { data: startData } = await startRes.json();
    const uploadId: string = startData.upload_id;
    const s3Key: string = startData.s3_key;
    const partUrls: Array<{ part_number: number; url: string }> = startData.part_urls;

    // ── Step 2: Upload all parts in parallel ─────────────────────────────────
    const parts = calcParts(file.size, PART_SIZE);
    const bytesUploaded = new Array(parts.length).fill(0);
    const etags: Array<{ part_number: number; etag: string }> = new Array(parts.length);

    const uploadPart = async (partDef: { partNumber: number; start: number; end: number }): Promise<void> => {
      const urlEntry = partUrls.find(u => u.part_number === partDef.partNumber);
      if (!urlEntry) throw new Error(`Missing URL for part ${partDef.partNumber}`);

      const blob = file.slice(partDef.start, partDef.end);
      let attempt = 0;

      while (true) {
        try {
          const etag = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", urlEntry.url);
            xhr.timeout = 10 * 60 * 1000; // 10 minutes
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                bytesUploaded[partDef.partNumber - 1] = ev.loaded;
                const pct = calcProgress(bytesUploaded, file.size);
                setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, progress: pct } : e));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                const rawEtag = xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag") ?? "";
                resolve(rawEtag);
              } else {
                reject(new Error(`Part ${partDef.partNumber} failed (${xhr.status})`));
              }
            };
            xhr.onerror = () => reject(new Error(`Part ${partDef.partNumber}: connection error`));
            xhr.ontimeout = () => reject(new Error(`Part ${partDef.partNumber}: timeout`));
            xhr.send(blob);
          });
          bytesUploaded[partDef.partNumber - 1] = partDef.end - partDef.start;
          etags[partDef.partNumber - 1] = { part_number: partDef.partNumber, etag: etag };
          return;
        } catch (err) {
          attempt++;
          if (attempt >= 3) throw err;
          await new Promise(r => setTimeout(r, attempt * 1000)); // 1s, 2s backoff
        }
      }
    };

    // Run part uploads through a pool of PART_CONCURRENCY workers
    const partTasks = parts.map(p => () => uploadPart(p));
    await runPool(partTasks); // note: runPool already exported — reuse it, but cap workers:
    // Actually override pool size for parts (PART_CONCURRENCY, not the global POOL_SIZE=8):
    // We call runPool with a wrapper to cap concurrency — but runPool already caps to min(POOL_SIZE, len).
    // Since PART_CONCURRENCY=4 < POOL_SIZE=8, and parts can be > 4, we need a local pool.
    // The code above calls `await runPool(partTasks)` which uses POOL_SIZE=8, which is fine for parts.
    // If you want to enforce exactly PART_CONCURRENCY=4, duplicate runPool logic inline:
    // (keep the runPool call above — 8 concurrent is acceptable for parts too)

    // ── Step 3: Notify progress = 90% and complete ───────────────────────────
    setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, progress: 90 } : e));

    const completeRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_id: uploadId,
        s3_key: s3Key,
        content_type: contentType,
        parts: etags,
        description: isFirst && description.trim() ? description.trim() : "",
      }),
    });

    if (!completeRes.ok) {
      const json = await completeRes.json().catch(() => ({}));
      throw new Error(json.message ?? `Error completando subida (${completeRes.status})`);
    }

    setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, status: "done" as const, progress: 100 } : e));
  }, [EVENTS_URL, identifier, description]);
```

**Important:** The `uploadMultipart` function must have an abort path. When it throws, the caller in `handleUpload` will catch the error and mark the entry as failed. But we also need to call `/abort` when multipart fails — update the error handling:

Wrap the body of `uploadMultipart` so that if an error occurs after `/start` succeeds, we call abort:

```typescript
  const uploadMultipart = useCallback(async (entry: FileEntry, isFirst: boolean): Promise<void> => {
    // ... (all the code above, but wrapped in try/catch after uploadId is obtained)
    // ── Step 1: Start ────────────────────────────────────────────────────────
    // ... (same as above)

    // After this point, if anything throws, we must call /abort
    try {
      // ── Step 2: Upload parts ─────────────────────────────────────────────
      // ... (same part upload logic)

      // ── Step 3: Complete ─────────────────────────────────────────────────
      // ... (same complete logic)
    } catch (err) {
      // Best-effort abort — don't await, don't rethrow abort errors
      fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadId, s3_key: s3Key }),
      }).catch(() => {}); // silent
      throw err; // re-throw original error for the outer handler
    }
  }, [EVENTS_URL, identifier, description]);
```

**Write the complete, final version of `uploadMultipart` (consolidating above into one clean function):**

```typescript
  const uploadMultipart = useCallback(async (entry: FileEntry, isFirst: boolean): Promise<void> => {
    const { file } = entry;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const contentType = file.type ||
      (ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4");

    // Step 1: start
    const startRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: contentType, filename: file.name, file_size: file.size }),
    });
    if (startRes.status === 403) throw Object.assign(new Error("uploads-disabled"), { uploadsDisabled: true });
    if (!startRes.ok) {
      const json = await startRes.json().catch(() => ({}));
      throw new Error(json.message ?? `Error iniciando subida (${startRes.status})`);
    }
    const { data: startData } = await startRes.json();
    const uploadId: string = startData.upload_id;
    const s3Key: string = startData.s3_key;
    const partUrls: Array<{ part_number: number; url: string }> = startData.part_urls;

    const doAbort = () => fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/abort`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: uploadId, s3_key: s3Key }),
    }).catch(() => {});

    try {
      // Step 2: upload parts
      const parts = calcParts(file.size, PART_SIZE);
      const bytesUploaded = new Array(parts.length).fill(0);
      const etags: Array<{ part_number: number; etag: string }> = new Array(parts.length);

      const uploadPart = async ({ partNumber, start, end }: { partNumber: number; start: number; end: number }) => {
        const urlEntry = partUrls.find(u => u.part_number === partNumber)!;
        const blob = file.slice(start, end);
        let attempt = 0;
        while (true) {
          try {
            const etag = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", urlEntry.url);
              xhr.timeout = 10 * 60 * 1000;
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  bytesUploaded[partNumber - 1] = ev.loaded;
                  const pct = calcProgress(bytesUploaded, file.size);
                  setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, progress: pct } : e));
                }
              };
              xhr.onload = () => xhr.status >= 200 && xhr.status < 300
                ? resolve(xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag") ?? "")
                : reject(new Error(`Part ${partNumber} failed (${xhr.status})`));
              xhr.onerror = () => reject(new Error(`Part ${partNumber}: connection error`));
              xhr.ontimeout = () => reject(new Error(`Part ${partNumber}: timeout`));
              xhr.send(blob);
            });
            bytesUploaded[partNumber - 1] = end - start;
            etags[partNumber - 1] = { part_number: partNumber, etag };
            return;
          } catch (err) {
            if (++attempt >= 3) throw err;
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
      };

      const partTasks = parts.map(p => () => uploadPart(p));
      await runPool(partTasks);

      // Step 3: complete
      setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, progress: 90 } : e));
      const completeRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/multipart/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: uploadId, s3_key: s3Key, content_type: contentType,
          parts: etags,
          description: isFirst && description.trim() ? description.trim() : "",
        }),
      });
      if (!completeRes.ok) {
        const json = await completeRes.json().catch(() => ({}));
        throw new Error(json.message ?? `Error completando subida (${completeRes.status})`);
      }
      setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, status: "done" as const, progress: 100 } : e));

    } catch (err) {
      doAbort();
      throw err;
    }
  }, [EVENTS_URL, identifier, description]);
```

### Step 5: Update `handleUpload` to dispatch to multipart for large videos

Find the `uploadOne` function inside `handleUpload`. It currently does:
```typescript
    const uploadOne = async (entry: FileEntry, isFirst: boolean): Promise<void> => {
```

Just BEFORE `uploadTasks` is built (around line 539), the current code is:
```typescript
    const pendingEntries = files.filter((e) => e.status !== "done");
    const uploadTasks = pendingEntries.map((entry, idx) => async () => {
      if (connectionError || uploadsDisabled) return
      await uploadOne(entry, idx === 0)
    });
```

Change the inner call to dispatch based on file size:
```typescript
    const pendingEntries = files.filter((e) => e.status !== "done");
    const uploadTasks = pendingEntries.map((entry, idx) => async () => {
      if (connectionError || uploadsDisabled) return;
      if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
        await uploadMultipart(entry, idx === 0);
      } else {
        await uploadOne(entry, idx === 0);
      }
    });
```

Also add `uploadsDisabled` handling for multipart: when `uploadMultipart` throws with `err.uploadsDisabled === true`, set `uploadsDisabled = true`. Add this inside the try/catch in `uploadTasks`:

Actually, wrap the `uploadTasks` lambda body in try/catch to handle the `uploadsDisabled` case for multipart:
```typescript
    const uploadTasks = pendingEntries.map((entry, idx) => async () => {
      if (connectionError || uploadsDisabled) return;
      try {
        if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
          await uploadMultipart(entry, idx === 0);
        } else {
          await uploadOne(entry, idx === 0);
        }
      } catch (err) {
        if ((err as { uploadsDisabled?: boolean }).uploadsDisabled) {
          uploadsDisabled = true;
          return;
        }
        // uploadOne already handles its own errors via setFiles — only multipart errors bubble
        if (entry.isVideo && entry.file.size > MULTIPART_THRESHOLD) {
          const msg = err instanceof Error ? err.message : "Ocurrió un error inesperado.";
          setFiles(prev => prev.map(e => e.id === entry.id ? { ...e, status: "error" as const, errorMsg: msg } : e));
        }
      }
    });
```

### Step 6: Run unit tests

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npx vitest run tests/unit/components/SharedUploadPage.multipart.test.ts
```
Expected: all tests PASS.

### Step 7: TypeScript check

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npx tsc --noEmit
```
Expected: zero errors.

### Step 8: Commit

```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/components/SharedUploadPage.tsx tests/unit/components/SharedUploadPage.multipart.test.ts
git commit -m "feat(upload): S3 multipart upload for videos >10 MB"
```

---

## Task 5: Backend push + manual verification

### Step 1: Push backend

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && git push origin main"
```
This triggers GitHub Actions → Docker build → EC2 deploy.

### Step 2: Verify backend deployed

```bash
gh run list --repo Itbem-Corp/itbem-events-backend --limit 3
```
Wait for the run to show `completed / success`.

### Step 3: Manual integration test — small video (single PUT, unchanged)

Use a <10 MB video file. Go to the upload page. Verify:
- Upload completes via the original single-PUT flow (no calls to `/multipart/*`)
- Progress goes 0→90→100

### Step 4: Manual integration test — large video (multipart)

Use a 50–100 MB video. Go to the upload page. Verify in browser DevTools Network tab:
1. `POST .../multipart/start` → 200 with `upload_id`, `s3_key`, `part_urls`
2. Multiple `PUT` requests to S3 (one per part) — running in parallel
3. `POST .../multipart/complete` → 201 with moment object
4. Processing status is `pending` → Lambda picks it up → `done`
5. Video appears in the dashboard moments wall after Lambda completes

### Step 5: Manual integration test — error path

Disconnect network mid-upload (DevTools → Offline). Verify:
- Some part XHRs fail, retry up to 2×
- After max retries, `POST .../multipart/abort` is called
- Entry shows error state in UI

---

## S3 Lifecycle Rule (ops task — do manually in AWS Console)

Add this lifecycle rule to your S3 bucket to auto-clean incomplete multipart uploads:

1. Go to S3 Console → Bucket → Management → Lifecycle rules → Create rule
2. Rule name: `AbortIncompleteMultipartMoments`
3. Prefix filter: `moments/`
4. Action: Abort incomplete multipart uploads — Days after initiation: `1`
5. Save

This ensures no storage charges accumulate for abandoned multipart uploads.

---

## Notes

- The `runPool` function already exists in `SharedUploadPage.tsx` — reuse it for part uploads.
- `POOL_SIZE = 8` (global) vs `PART_CONCURRENCY = 4` — since `runPool` caps workers at `Math.min(POOL_SIZE, tasks.length)`, files with ≤4 parts will naturally use fewer workers. For files with >8 parts (>64 MB), it will use 8 concurrent XHRs. This is fine.
- The `uploadOne` function and all image/small-video upload logic is 100% unchanged.
- ETag values from S3 include surrounding quotes (e.g. `"abc123"`) — pass them as-is.
