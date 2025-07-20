# Cloudflare Worker Scheduling Guide

Your Obsidian vault sync now supports multiple idiomatic Cloudflare scheduling approaches.

## 🎯 Current Setup

✅ **Cron Triggers**: Runs every 4 hours automatically  
✅ **Webhook Integration**: Allows external triggering  
✅ **Manual Sync**: On-demand sync capability

## 📅 Scheduling Options

### 1. **Cron Triggers (Currently Active)**

Your worker now runs automatically every 4 hours using Cloudflare's cron triggers:

```javascript
// In wrangler.jsonc
"triggers": {
  "crons": ["0 */4 * * *"]  // Every 4 hours
}
```

**Pros:**
- ✅ Fully serverless and automatic
- ✅ No local infrastructure needed
- ✅ Reliable Cloudflare scheduling
- ✅ Free tier friendly (6 executions/day)

**Cons:**
- ❌ Can't sync local files directly from worker
- ❌ Requires webhook setup for full functionality

### 2. **Webhook + Local Server (Recommended)**

Set up a local webhook server to receive cron triggers:

```bash
# Start the webhook server
npm run webhook

# Or with custom port
WEBHOOK_PORT=3001 npm run webhook
```

Then configure the webhook URL in Cloudflare:

```bash
# Set the webhook URL as a secret
npx wrangler secret put SYNC_WEBHOOK_URL
# Enter: http://your-public-ip:3001/webhook/sync
```

**Pros:**
- ✅ Automatic scheduling via Cloudflare
- ✅ Full local file access
- ✅ Secure token-based authentication
- ✅ Real-time sync capability

**Cons:**
- ❌ Requires local server running
- ❌ Need public IP or tunnel (ngrok, etc.)

### 3. **Alternative Cron Schedules**

Modify `wrangler.jsonc` for different schedules:

```javascript
"crons": [
  "0 */2 * * *",      // Every 2 hours
  "0 9,17 * * 1-5",   // 9 AM and 5 PM, weekdays only
  "*/30 * * * *",     // Every 30 minutes
  "0 0 * * *"         // Daily at midnight
]
```

### 4. **Cloudflare Queues (Advanced)**

For high-frequency or batch processing:

```javascript
// Add to wrangler.jsonc
"queues": {
  "producers": [
    { "queue": "sync-queue", "binding": "SYNC_QUEUE" }
  ],
  "consumers": [
    { "queue": "sync-queue", "max_batch_size": 10 }
  ]
}
```

## 🚀 Setup Instructions

### Step 1: Deploy Current Configuration

```bash
npm run deploy
```

### Step 2: Set Up Webhook (Optional but Recommended)

1. **Start webhook server:**
   ```bash
   npm run webhook
   ```

2. **Expose to internet** (choose one):
   ```bash
   # Option A: ngrok (easiest)
   ngrok http 3001
   
   # Option B: SSH tunnel
   ssh -R 3001:localhost:3001 your-server.com
   
   # Option C: Configure router port forwarding
   ```

3. **Set webhook URL in Cloudflare:**
   ```bash
   npx wrangler secret put SYNC_WEBHOOK_URL
   # Enter your public URL: https://abc123.ngrok.io/webhook/sync
   ```

### Step 3: Monitor and Test

1. **Check cron logs:**
   ```bash
   npx wrangler tail
   ```

2. **Test webhook manually:**
   ```bash
   curl -X POST http://localhost:3001/webhook/sync \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_SYNC_TOKEN" \
     -d '{"trigger":"manual","timestamp":"2024-01-01T00:00:00Z"}'
   ```

3. **Health check:**
   ```bash
   curl http://localhost:3001/health
   ```

## 📊 Monitoring & Logs

### Cloudflare Dashboard
- Go to Workers & Pages → r2-worker → Metrics
- View cron trigger executions and success rates

### Local Logs
```bash
# Webhook server logs
npm run webhook

# Sync script logs  
npm run sync:prod
```

### Wrangler Tail
```bash
# Real-time worker logs
npx wrangler tail

# Filter for cron events
npx wrangler tail --format=pretty | grep -i cron
```

## 🔧 Troubleshooting

### Cron Not Firing
1. Check `wrangler.jsonc` syntax
2. Verify deployment: `npm run deploy`
3. Check Cloudflare dashboard for errors

### Webhook Not Receiving Calls
1. Verify `SYNC_WEBHOOK_URL` secret is set
2. Check firewall/port forwarding
3. Test with curl locally first

### Sync Failures
1. Check vault path in `.env`
2. Verify R2 bucket permissions
3. Monitor file size limits (10MB max)

## 💡 Best Practices

### For Personal Use (Current Setup)
- ✅ 4-hour cron schedule (balanced)
- ✅ Webhook for immediate sync needs
- ✅ Manual sync for testing

### For Team Use
- Consider 1-2 hour intervals
- Set up monitoring alerts
- Use multiple webhook endpoints

### For High-Frequency Use
- Implement Cloudflare Queues
- Add rate limiting
- Consider Durable Objects for state

## 🎛️ Configuration Options

### Environment Variables
```bash
# Webhook server
WEBHOOK_PORT=3001
SYNC_TOKEN=your-secret-token

# Sync script  
VAULT_PATH=/path/to/vault
WORKER_URL=https://r2-worker.jaradd.workers.dev
BATCH_SIZE=50
```

### Cloudflare Secrets
```bash
npx wrangler secret put SYNC_WEBHOOK_URL
npx wrangler secret put SYNC_TOKEN
```

## 📈 Scaling Considerations

### Current Limits
- **Cron triggers**: 3 per worker (free tier)
- **Execution time**: 30 seconds (free tier)
- **Memory**: 128MB (free tier)

### Upgrade Benefits
- **Paid tier**: 100ms CPU time, 1GB memory
- **More cron triggers**: Up to 5 per worker
- **Longer execution**: 15 minutes max

Your setup is now production-ready with automatic 4-hour syncing! 🎉