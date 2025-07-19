# Obsidian Vault R2 Sync Worker

This Cloudflare Worker syncs your Obsidian vault to Cloudflare R2 storage with authentication and efficient file management.

## Features

- **Secure sync** with token-based authentication
- **Bulk upload** for efficient syncing
- **Smart sync** - only uploads changed files
- **File deletion** - removes files from R2 that were deleted locally
- **CORS support** for web access
- **File listing** API for browsing vault contents

## Setup

### 1. Configure Authentication

Set the authentication secret in Cloudflare:

```bash
npx wrangler secret put SYNC_TOKEN
# Enter your secret token when prompted
```

### 2. Deploy the Worker

```bash
npm run deploy
```

### 3. Configure Sync Script

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Update the values:
- `VAULT_PATH`: Path to your Obsidian vault
- `WORKER_URL`: Your deployed worker URL (e.g., https://r2-worker.jaradd.workers.dev)
- `SYNC_TOKEN`: Same token as configured in step 1

### 4. Run Initial Sync

For local development:
```bash
npm run sync
```

For production:
```bash
source .env && npm run sync:prod
```

Alternatively, you can pass the token directly:
```bash
SYNC_TOKEN=your-token-here npm run sync:prod
```

## API Endpoints

### Bulk Upload
```
POST /api/sync
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

[
  {
    "path": "notes/example.md",
    "content": "base64-encoded-content",
    "type": "text/markdown",
    "modified": "2024-01-01T00:00:00Z"
  }
]
```

### List Files
```
GET /api/list?prefix=notes/
Authorization: Bearer YOUR_TOKEN
```

### Individual File Operations
```
GET /files/path/to/file.md
PUT /files/path/to/file.md
DELETE /files/path/to/file.md
Authorization: Bearer YOUR_TOKEN
```

### Delete All Files
```
DELETE /api/delete-all
Authorization: Bearer YOUR_TOKEN
```

## Sync Script Options

The sync script supports these environment variables:
- `VAULT_PATH`: Path to your Obsidian vault
- `WORKER_URL`: Worker URL (defaults to http://localhost:8787)
- `SYNC_TOKEN`: Authentication token (must match the Cloudflare secret)
- `BATCH_SIZE`: Number of files to upload at once (default: 50)

## File Types Supported

- Markdown: `.md`
- Text: `.txt`
- Config: `.json`, `.yml`, `.yaml`
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- Documents: `.pdf`, `.csv`
- Excalidraw: `.excalidraw`

## Ignored Folders

- `.obsidian`
- `.trash`
- `node_modules`
- `.git`

## Cost Optimization

This solution is very cost-effective:
- **R2 Storage**: $0.015/GB/month
- **R2 Operations**: $0.36 per million Class A operations
- **Workers**: 100,000 requests/day free tier
- **No egress fees** with R2

For a typical 1GB vault with daily syncs, expect costs under $0.10/month.

## Security Notes

- Always use HTTPS in production
- Keep your `SYNC_TOKEN` secret
- Consider IP allowlisting for additional security
- The worker uses both Bearer and Basic auth schemes

## Automation

You can automate syncing with cron:

```bash
# Add to crontab for hourly sync
0 * * * * cd /path/to/r2-worker && source .env && npm run sync:prod
```

Or use a file watcher for real-time sync.