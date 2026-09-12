# @repo/storage

Signed upload/download URLs for S3-compatible storage (AWS S3, GCP Cloud Storage, MinIO, etc.).

**Bucket CORS** (minimal, for browser uploads):

```json
[
  {
    "origin": ["https://your-production-domain.com", "http://localhost:3000"],
    "method": ["PUT", "GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```
