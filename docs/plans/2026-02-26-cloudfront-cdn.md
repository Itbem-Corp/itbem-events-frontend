# CloudFront CDN (prod + staging) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Serve all event media (photos, videos, thumbnails) through CloudFront CDN at `cdn.eventiapp.com.mx` (prod) and `cdn-staging.eventiapp.com.mx` (staging) instead of directly from S3.

**Architecture:** Two CloudFront distributions sit in front of their respective private S3 buckets using Origin Access Control (OAC). The backend's `GetS3URL` function is updated to return CDN URLs instead of S3 URLs. Existing DB records with old S3 URLs are rewritten dynamically at serve time — no DB migration. Frontend projects (Astro + Next.js) pick up CDN URLs automatically since they consume the API.

**Tech Stack:** AWS CloudFront, ACM (us-east-1), S3 (us-east-2), Route 53, Go backend (Echo), AWS CLI via WSL Ubuntu.

---

## Constants (used throughout all tasks)

```
DOMAIN=eventiapp.com.mx
HOSTED_ZONE=Z027193822RHE6EKO9B2Q
BUCKET_PROD=itbem-events-bucket-prod
BUCKET_STAGING=itbem-events-bucket-staging
REGION=us-east-2
CDN_PROD=cdn.eventiapp.com.mx
CDN_STAGING=cdn-staging.eventiapp.com.mx
BACKEND_DIR=/var/www/itbem-events-backend
```

All AWS CLI commands run via:
```bash
wsl -d Ubuntu -e bash -c "<command>"
```

---

### Task 1: ACM Certificates (prod + staging, us-east-1)

CloudFront requires certificates in `us-east-1` regardless of bucket region.

**Files:** None (AWS infrastructure only)

**Step 1: Request prod certificate**

```bash
wsl -d Ubuntu -e bash -c "aws acm request-certificate \
  --domain-name cdn.eventiapp.com.mx \
  --validation-method DNS \
  --region us-east-1 \
  --output json | python3 -c \"import json,sys; print(json.load(sys.stdin)['CertificateArn'])\""
```

Save the ARN — you'll need it in Task 3. Call it `CERT_ARN_PROD`.

**Step 2: Request staging certificate**

```bash
wsl -d Ubuntu -e bash -c "aws acm request-certificate \
  --domain-name cdn-staging.eventiapp.com.mx \
  --validation-method DNS \
  --region us-east-1 \
  --output json | python3 -c \"import json,sys; print(json.load(sys.stdin)['CertificateArn'])\""
```

Save as `CERT_ARN_STAGING`.

**Step 3: Get DNS validation records for prod cert**

```bash
wsl -d Ubuntu -e bash -c "aws acm describe-certificate \
  --certificate-arn <CERT_ARN_PROD> \
  --region us-east-1 \
  --output json | python3 -c \"
import json,sys
cert=json.load(sys.stdin)['Certificate']
for opt in cert['DomainValidationOptions']:
  rv=opt.get('ResourceRecord',{})
  if rv:
    print('Name:', rv['Name'])
    print('Value:', rv['Value'])
\""
```

Note the `Name` and `Value` — these are the CNAME records to add.

**Step 4: Create Route 53 validation record for prod**

```bash
wsl -d Ubuntu -e bash -c "aws route53 change-resource-record-sets \
  --hosted-zone-id Z027193822RHE6EKO9B2Q \
  --change-batch '{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"<CNAME_NAME_FROM_STEP_3>\",
        \"Type\": \"CNAME\",
        \"TTL\": 300,
        \"ResourceRecords\": [{\"Value\": \"<CNAME_VALUE_FROM_STEP_3>\"}]
      }
    }]
  }' 2>&1"
```

**Step 5: Create Route 53 validation record for staging**

Repeat Steps 3-4 for `CERT_ARN_STAGING`.

**Step 6: Wait for both certs to reach ISSUED status**

```bash
wsl -d Ubuntu -e bash -c "aws acm wait certificate-validated \
  --certificate-arn <CERT_ARN_PROD> \
  --region us-east-1 && echo 'prod ISSUED'"

wsl -d Ubuntu -e bash -c "aws acm wait certificate-validated \
  --certificate-arn <CERT_ARN_STAGING> \
  --region us-east-1 && echo 'staging ISSUED'"
```

Expected: both print "ISSUED" within 1-5 minutes.

---

### Task 2: Staging S3 Bucket

**Files:** None (AWS infrastructure only)

**Step 1: Create staging bucket**

```bash
wsl -d Ubuntu -e bash -c "aws s3api create-bucket \
  --bucket itbem-events-bucket-staging \
  --region us-east-2 \
  --create-bucket-configuration LocationConstraint=us-east-2 2>&1 && echo OK"
```

**Step 2: Block public access (both buckets will be private, accessed only via OAC)**

```bash
wsl -d Ubuntu -e bash -c "aws s3api put-public-access-block \
  --bucket itbem-events-bucket-staging \
  --public-access-block-configuration \
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false' 2>&1 && echo OK"
```

Note: `BlockPublicPolicy=false` allows us to set the OAC bucket policy in Task 4.

**Step 3: Copy CORS rules to staging**

```bash
wsl -d Ubuntu -e bash -c "aws s3api put-bucket-cors \
  --bucket itbem-events-bucket-staging \
  --cors-configuration '{
    \"CORSRules\": [
      {
        \"AllowedHeaders\": [\"*\"],
        \"AllowedMethods\": [\"GET\"],
        \"AllowedOrigins\": [\"*\"],
        \"MaxAgeSeconds\": 3000
      },
      {
        \"AllowedHeaders\": [\"Content-Type\",\"Content-Length\",\"x-amz-acl\"],
        \"AllowedMethods\": [\"PUT\"],
        \"AllowedOrigins\": [
          \"https://eventiapp.com.mx\",
          \"https://www.eventiapp.com.mx\",
          \"http://localhost:4321\",
          \"http://localhost:3000\"
        ],
        \"MaxAgeSeconds\": 3000
      }
    ]
  }' 2>&1 && echo OK"
```

**Step 4: Copy lifecycle rules to staging**

```bash
wsl -d Ubuntu -e bash -c "aws s3api put-bucket-lifecycle-configuration \
  --bucket itbem-events-bucket-staging \
  --lifecycle-configuration '{
    \"Rules\": [
      {
        \"ID\": \"expire-unconfirmed-uploads\",
        \"Filter\": {\"Prefix\": \"moments/uploads/tmp/\"},
        \"Expiration\": {\"Days\": 1},
        \"Status\": \"Enabled\"
      },
      {
        \"ID\": \"AbortIncompleteMultipartMoments\",
        \"Filter\": {\"Prefix\": \"moments/\"},
        \"AbortIncompleteMultipartUpload\": {\"DaysAfterInitiation\": 1},
        \"Status\": \"Enabled\"
      }
    ]
  }' 2>&1 && echo OK"
```

---

### Task 3: CloudFront OAC + Distributions

Requires: Task 1 (certs ISSUED), Task 2 (staging bucket exists).

**Files:** None (AWS infrastructure only)

**Step 1: Create OAC for prod**

```bash
wsl -d Ubuntu -e bash -c "aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    \"Name\": \"itbem-oac-prod\",
    \"Description\": \"OAC for itbem-events-bucket-prod\",
    \"SigningProtocol\": \"sigv4\",
    \"SigningBehavior\": \"always\",
    \"OriginAccessControlOriginType\": \"s3\"
  }' --output json 2>&1 | python3 -c \"import json,sys; print(json.load(sys.stdin)['OriginAccessControl']['Id'])\""
```

Save as `OAC_ID_PROD`.

**Step 2: Create OAC for staging**

Same command with `Name: itbem-oac-staging`. Save as `OAC_ID_STAGING`.

**Step 3: Create prod CloudFront distribution**

```bash
wsl -d Ubuntu -e bash -c "aws cloudfront create-distribution \
  --distribution-config '{
    \"CallerReference\": \"itbem-cdn-prod-1\",
    \"Comment\": \"Prod CDN for itbem-events-bucket-prod\",
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3-prod\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"ResponseHeadersPolicyId\": \"60669652-455b-4ae9-85a4-c4c02393f86c\",
      \"Compress\": true,
      \"AllowedMethods\": {
        \"Quantity\": 2,
        \"Items\": [\"GET\", \"HEAD\"],
        \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\", \"HEAD\"]}
      }
    },
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"s3-prod\",
        \"DomainName\": \"itbem-events-bucket-prod.s3.us-east-2.amazonaws.com\",
        \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"},
        \"OriginAccessControlId\": \"<OAC_ID_PROD>\"
      }]
    },
    \"Aliases\": {\"Quantity\": 1, \"Items\": [\"cdn.eventiapp.com.mx\"]},
    \"ViewerCertificate\": {
      \"ACMCertificateArn\": \"<CERT_ARN_PROD>\",
      \"SSLSupportMethod\": \"sni-only\",
      \"MinimumProtocolVersion\": \"TLSv1.2_2021\"
    },
    \"HttpVersion\": \"http2and3\",
    \"Enabled\": true,
    \"PriceClass\": \"PriceClass_All\"
  }' --output json 2>&1 | python3 -c \"
import json,sys
d=json.load(sys.stdin)['Distribution']
print('ID:', d['Id'])
print('Domain:', d['DomainName'])
\""
```

Save `CF_DOMAIN_PROD` (e.g., `d1abc123.cloudfront.net`) and `CF_DIST_ID_PROD`.

Note on cache policy IDs used (AWS managed):
- `658327ea...` = `CachingOptimized` (aggressive TTL, good for media)
- `60669652...` = `CORS-with-preflight-and-SecurityHeadersPolicy`

**Step 4: Create staging CloudFront distribution**

Same command substituting:
- `CallerReference`: `itbem-cdn-staging-1`
- `Comment`: `Staging CDN for itbem-events-bucket-staging`
- `Id`: `s3-staging`
- `DomainName`: `itbem-events-bucket-staging.s3.us-east-2.amazonaws.com`
- `OriginAccessControlId`: `<OAC_ID_STAGING>`
- `Aliases`: `cdn-staging.eventiapp.com.mx`
- `ACMCertificateArn`: `<CERT_ARN_STAGING>`

Save `CF_DOMAIN_STAGING` and `CF_DIST_ID_STAGING`.

---

### Task 4: S3 Bucket Policies + Route 53 Records

Requires: Task 3 (distributions created, have `CF_DIST_ID_PROD`, `CF_DIST_ID_STAGING`, `CF_DOMAIN_PROD`, `CF_DOMAIN_STAGING`).

**Step 1: Bucket policy for prod (allow CloudFront OAC)**

```bash
wsl -d Ubuntu -e bash -c "aws s3api put-bucket-policy \
  --bucket itbem-events-bucket-prod \
  --policy '{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Sid\": \"AllowCloudFrontOAC\",
      \"Effect\": \"Allow\",
      \"Principal\": {\"Service\": \"cloudfront.amazonaws.com\"},
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::itbem-events-bucket-prod/*\",
      \"Condition\": {
        \"StringEquals\": {
          \"AWS:SourceArn\": \"arn:aws:cloudfront::752279076974:distribution/<CF_DIST_ID_PROD>\"
        }
      }
    }]
  }' 2>&1 && echo OK"
```

**Step 2: Bucket policy for staging**

Same command substituting `itbem-events-bucket-staging` and `CF_DIST_ID_STAGING`.

**Step 3: Route 53 A record (alias) for cdn.eventiapp.com.mx**

```bash
wsl -d Ubuntu -e bash -c "aws route53 change-resource-record-sets \
  --hosted-zone-id Z027193822RHE6EKO9B2Q \
  --change-batch '{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"cdn.eventiapp.com.mx\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
          \"DNSName\": \"<CF_DOMAIN_PROD>\",
          \"EvaluateTargetHealth\": false
        }
      }
    }]
  }' 2>&1 && echo OK"
```

Note: `Z2FDTNDATAQYW2` is the fixed CloudFront hosted zone ID (same for all CloudFront distributions globally).

**Step 4: Route 53 A record for cdn-staging.eventiapp.com.mx**

Same command with `cdn-staging.eventiapp.com.mx` and `CF_DOMAIN_STAGING`.

**Step 5: Verify DNS propagation**

```bash
wsl -d Ubuntu -e bash -c "nslookup cdn.eventiapp.com.mx 8.8.8.8 2>&1 | grep 'Address' | tail -1"
wsl -d Ubuntu -e bash -c "nslookup cdn-staging.eventiapp.com.mx 8.8.8.8 2>&1 | grep 'Address' | tail -1"
```

Expected: CNAME resolving to a CloudFront IP.

---

### Task 5: Backend — CDN URL support

**Files:**
- Modify: `repositories/awsrepository/S3Repository.go:42-43`
- Modify: `configuration/configuration.go` or closest env-loading file (to expose `CDN_BASE_URL`)
- Modify: `controllers/moments/` — API response rewrite helper
- Modify: `.env` — add `CDN_BASE_URL`

**Step 1: Read the current GetS3URL and env-loading code**

```bash
wsl -d Ubuntu -e bash -c "sed -n '38,48p' /var/www/itbem-events-backend/repositories/awsrepository/S3Repository.go"
wsl -d Ubuntu -e bash -c "grep -rn 'os.Getenv\|viper\|godotenv\|CDN\|BUCKET' /var/www/itbem-events-backend/configuration/ | head -20"
```

**Step 2: Update GetS3URL to use CDN_BASE_URL env var**

In `S3Repository.go`, replace:
```go
func GetS3URL(bucket, key string) string {
    return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", bucket, key)
}
```

With:
```go
func GetS3URL(bucket, key string) string {
    if base := os.Getenv("CDN_BASE_URL"); base != "" {
        return base + "/" + key
    }
    return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", bucket, key)
}
```

Add `"os"` to imports if not already present.

**Step 3: Add dynamic rewrite helper for existing DB records**

Existing records in DB have URLs like `https://itbem-events-bucket-prod.s3.amazonaws.com/{key}`.
When `CDN_BASE_URL` is set, rewrite on the fly at serve time.

In `repositories/awsrepository/S3Repository.go`, add after `GetS3URL`:
```go
// RewriteToCDN rewrites a stored S3 URL to the CDN base URL.
// If CDN_BASE_URL is not set, the original URL is returned unchanged.
// Handles both path-style (s3.amazonaws.com/bucket/key) and
// virtual-hosted-style (bucket.s3.amazonaws.com/key) S3 URLs.
func RewriteToCDN(rawURL string) string {
    base := os.Getenv("CDN_BASE_URL")
    if base == "" || rawURL == "" {
        return rawURL
    }
    // Virtual-hosted: https://<bucket>.s3.amazonaws.com/<key>
    //             or: https://<bucket>.s3.<region>.amazonaws.com/<key>
    u, err := url.Parse(rawURL)
    if err != nil {
        return rawURL
    }
    host := u.Hostname()
    if !strings.Contains(host, ".s3.") && !strings.HasSuffix(host, ".amazonaws.com") {
        return rawURL // already a CDN URL or unknown format — leave alone
    }
    return base + "/" + strings.TrimPrefix(u.Path, "/")
}
```

Add imports: `"net/url"`, `"strings"` (if not present).

**Step 4: Apply RewriteToCDN in Moment API response**

Find where Moment objects are serialized and returned. The key fields are `ContentURL` and `ThumbnailURL` on the `models.Moment` struct.

Search:
```bash
wsl -d Ubuntu -e bash -c "grep -rn 'ContentURL\|ThumbnailURL\|content_url\|thumbnail_url' /var/www/itbem-events-backend/controllers/ | grep -v test | head -20"
```

Option A — if there's a response DTO/mapper, apply `RewriteToCDN` there.
Option B — if Moment is returned directly as JSON, add a `MarshalJSON` method or middleware.

**Recommended approach — add a helper function in controllers:**

In `controllers/moments/` create `cdn_helpers.go`:
```go
package moments

import "events-stocks/repositories/awsrepository"

// rewriteMomentURLs rewrites S3 URLs in a moment to CDN URLs.
// Safe to call even when CDN_BASE_URL is not set (no-op).
func rewriteMomentURLs(m *models.Moment) {
    m.ContentURL   = awsrepository.RewriteToCDN(m.ContentURL)
    m.ThumbnailURL = awsrepository.RewriteToCDN(m.ThumbnailURL)
}
```

Then call `rewriteMomentURLs(&moment)` (or a slice loop) before every JSON response in:
- `ListMomentsForEvent` (dashboard)
- `ListApprovedForWallHandler` (public wall)
- `ConfirmSharedMoment` (returns created moment)
- `CompleteMultipartMoment` (returns created moment)
- Any other handler returning Moment objects

Search for all handlers:
```bash
wsl -d Ubuntu -e bash -c "grep -rn 'c\.JSON\|utils\.Success' /var/www/itbem-events-backend/controllers/moments/ | grep -v test | head -30"
```

**Step 5: Add CDN_BASE_URL to backend .env**

```bash
wsl -d Ubuntu -e bash -c "echo 'CDN_BASE_URL=https://cdn.eventiapp.com.mx' >> /var/www/itbem-events-backend/.env && grep CDN /var/www/itbem-events-backend/.env"
```

**Step 6: Add to .env.example**

```bash
wsl -d Ubuntu -e bash -c "echo 'CDN_BASE_URL=https://cdn.eventiapp.com.mx' >> /var/www/itbem-events-backend/.env.example"
```

**Step 7: Build and test**

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go build ./... 2>&1"
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go test ./repositories/awsrepository/... -v -run TestRewriteToCDN 2>&1"
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && go test ./controllers/moments/... -v -run TestValidateMultipartKey 2>&1"
```

**Step 8: Write unit tests for RewriteToCDN**

In `repositories/awsrepository/S3Repository_test.go` (create if not exists):
```go
package awsrepository_test

import (
    "os"
    "testing"
    "events-stocks/repositories/awsrepository"
)

func TestRewriteToCDN(t *testing.T) {
    tests := []struct {
        name     string
        cdnBase  string
        input    string
        expected string
    }{
        {
            name:     "no CDN set — returns original",
            cdnBase:  "",
            input:    "https://itbem-events-bucket-prod.s3.amazonaws.com/moments/123/raw/abc.mp4",
            expected: "https://itbem-events-bucket-prod.s3.amazonaws.com/moments/123/raw/abc.mp4",
        },
        {
            name:     "virtual-hosted S3 URL rewritten",
            cdnBase:  "https://cdn.eventiapp.com.mx",
            input:    "https://itbem-events-bucket-prod.s3.amazonaws.com/moments/123/raw/abc.mp4",
            expected: "https://cdn.eventiapp.com.mx/moments/123/raw/abc.mp4",
        },
        {
            name:     "regional S3 URL rewritten",
            cdnBase:  "https://cdn.eventiapp.com.mx",
            input:    "https://itbem-events-bucket-prod.s3.us-east-2.amazonaws.com/moments/123/raw/abc.jpg",
            expected: "https://cdn.eventiapp.com.mx/moments/123/raw/abc.jpg",
        },
        {
            name:     "already CDN URL — left alone",
            cdnBase:  "https://cdn.eventiapp.com.mx",
            input:    "https://cdn.eventiapp.com.mx/moments/123/raw/abc.jpg",
            expected: "https://cdn.eventiapp.com.mx/moments/123/raw/abc.jpg",
        },
        {
            name:     "empty URL — returns empty",
            cdnBase:  "https://cdn.eventiapp.com.mx",
            input:    "",
            expected: "",
        },
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            os.Setenv("CDN_BASE_URL", tc.cdnBase)
            defer os.Unsetenv("CDN_BASE_URL")
            got := awsrepository.RewriteToCDN(tc.input)
            if got != tc.expected {
                t.Errorf("got %q, want %q", got, tc.expected)
            }
        })
    }
}
```

**Step 9: Commit**

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && git add -A && git commit -m 'feat(cdn): CDN URL support — GetS3URL + RewriteToCDN + moment response rewrite'"
```

---

### Task 6: End-to-end verification + push

**Step 1: Smoke test CDN serving an existing file**

First, find a key that exists in the prod bucket:
```bash
wsl -d Ubuntu -e bash -c "aws s3 ls s3://itbem-events-bucket-prod/moments/ --recursive | head -3"
```

Then test the CDN URL:
```bash
wsl -d Ubuntu -e bash -c "curl -sI 'https://cdn.eventiapp.com.mx/<key-from-above>' | grep -E 'HTTP|x-cache|content-type'"
```

Expected: `HTTP/2 200`, `x-cache: Hit from cloudfront` on second request.

**Step 2: Verify staging CDN**

```bash
wsl -d Ubuntu -e bash -c "curl -sI 'https://cdn-staging.eventiapp.com.mx/' | grep -E 'HTTP|cf-ray'"
```

Expected: CloudFront response (even if 403 — S3 returns 403 for root path, that's fine).

**Step 3: Push backend to main**

```bash
wsl -d Ubuntu -e bash -c "cd /var/www/itbem-events-backend && git push origin main 2>&1"
```

**Step 4: EC2 deploy check**

```bash
wsl -d Ubuntu -e bash -c "ssh -o StrictHostKeyChecking=no ubuntu@<EC2_IP> 'cd /var/www/itbem-events-backend && git pull && sudo systemctl restart itbem-events && systemctl status itbem-events --no-pager | tail -3' 2>&1"
```

**Step 5: Verify live API returns CDN URLs**

```bash
curl -s "https://eventiapp.com.mx/api/events/<some-identifier>/moments" | python3 -c "import json,sys; moments=json.load(sys.stdin); print(moments[0].get('content_url','') if moments else 'no moments')"
```

Expected: URL starts with `https://cdn.eventiapp.com.mx/`.

---

## Out of scope

- CloudFront invalidation on file updates (media doesn't change after Lambda processes it)
- WAF rules on CloudFront (can be added later)
- Staging environment EC2 + separate backend deploy pipeline
