# Bull MQ Implementation for SoulSync Message Queue System

## Overview

This implementation uses **Bull MQ** (with Redis backend) to create a scalable, resilient job queue system for processing and sending event reminder messages. The system is designed to handle high-volume message generation and delivery with automatic retry logic, dead-letter queue handling, and admin notifications.

## Architecture

### Two-Stage Pipeline

```
┌─────────────────────┐
│  Fetch Today Events │
│                     │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│  Message Generation Queue    │
│  (1 concurrent processor)    │
│  - Generate message via LLM  │
│  - Enqueue for sending       │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Message Sending Queue       │
│  (3 concurrent processors)  │
│  - Send via WhatsApp         │
│  - Store in database         │
└──────────┬───────────────────┘
           │
           ▼
    ✅ Message Sent  OR  ❌ Failed
           │                │
           ▼                ▼
      [SENT]          [DLQ] → [Retry] → [Admin Notify]
```

## File Structure

```
server/src/queues/
├── index.ts                    # Queue initialization & Redis setup
├── types.ts                    # TypeScript interfaces
├── generation.processor.ts     # Message generation job handler
├── sending.processor.ts        # Message sending job handler
├── dlq.handler.ts             # Dead Letter Queue handler
├── admin-notifier.ts          # Admin notification system
└── metrics.ts                 # Queue monitoring & metrics
```

## Key Features

### 1. **Non-Blocking Processing**
- Events are queued immediately and returned to the caller
- Message generation and sending happen in background workers
- Multiple jobs process concurrently (1 for generation, 3 for sending)

### 2. **Automatic Retry with Exponential Backoff**
- Failed jobs automatically retry up to 3 times
- Backoff strategy: 2 second initial delay, exponential increase
- Configurable per queue

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  }
}
```

### 3. **Dead Letter Queue (DLQ)**
- Jobs that fail after all retry attempts are moved to DLQ
- Persistent storage for failed jobs
- Monitoring and admin notifications for DLQ items
- Optional: Store in database for audit trail

### 4. **Admin Notification System**
- Admins notified when jobs fail permanently
- Batch notifications for processing status
- Different severity levels: INFO, WARNING, CRITICAL
- Sent via WhatsApp to registered admin numbers

### 5. **Comprehensive Monitoring**
- Real-time queue metrics via `/api/queue/metrics`
- DLQ inspection via `/api/queue/dlq`
- Health check endpoint at `/api/health`
- Detailed logging throughout the pipeline

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install bull @types/bull redis
```

### 2. Environment Variables

Create or update `.env`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Twilio (for WhatsApp)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

### 3. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or using Homebrew (macOS)
brew services start redis

# Or manually
redis-server
```

### 4. Update Prisma Schema (Optional)

For persistent DLQ storage, add to your schema:

```prisma
model DLQEntry {
  id        String   @id @default(cuid())
  jobId     String   @unique
  jobType   String   // "MESSAGE_GENERATION" | "MESSAGE_SENDING"
  data      Json
  error     String
  attempts  Int
  result    Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## API Endpoints

### 1. Queue Messages for Processing
```
GET http://localhost:4000/
```
**Response:**
```json
{
  "message": "Event messages queued successfully",
  "jobsQueued": 42,
  "jobIds": ["gen-evt123-per456", "gen-evt124-per457", ...]
}
```

### 2. Get Queue Metrics
```
GET http://localhost:4000/api/queue/metrics
```
**Response:**
```json
{
  "status": "OK",
  "metrics": {
    "generation": {
      "waiting": 10,
      "active": 1,
      "completed": 523,
      "failed": 2,
      "delayed": 0
    },
    "sending": {
      "waiting": 15,
      "active": 3,
      "completed": 520,
      "failed": 5,
      "delayed": 0
    },
    "dlq": {
      "total": 7
    }
  }
}
```

### 3. Get DLQ Jobs
```
GET http://localhost:4000/api/queue/dlq?limit=50
```
**Response:**
```json
{
  "status": "OK",
  "dlqJobCount": 3,
  "dlqJobs": [
    {
      "id": "dlq-1234567890-0.123",
      "data": { ... },
      "failedReason": "Failed to send WhatsApp message",
      "attempts": 3,
      "stacktrace": [ ... ],
      "timestamp": "2026-03-04T10:30:00.000Z"
    }
  ]
}
```

### 4. Health Check
```
GET http://localhost:4000/api/health
```
**Response (Healthy):**
```json
{
  "status": "HEALTHY",
  "metrics": { ... }
}
```

**Response (Degraded):**
```json
{
  "status": "DEGRADED",
  "metrics": {
    "generation": { "failed": 150 },
    "sending": { "failed": 200 },
    "dlq": { "total": 600 }
  }
}
```

## Flow Diagram

### Successful Flow
```
Event → Gen Queue → LLM → Send Queue → WhatsApp ✅ → DB (SENT)
```

### Failed Flow with Retries
```
Event → Gen Queue → LLM 
  ↓ (Attempt 1) → FAIL → Wait 2s
  ↓ (Attempt 2) → FAIL → Wait 4s
  ↓ (Attempt 3) → FAIL → Wait 8s
  ↓ (Final) → DLQ → Admin Notification
```

### Message Sending with Partial Failures
```
100 Events → All in Send Queue
  ├─ 97 → WhatsApp ✅ → DB (SENT)
  ├─ 2 → WhatsApp ✅ (Retry 1) → DB (SENT)
  └─ 1 → WhatsApp ❌ (All retries) → DLQ → Admin Alert
```

## Admin Notification Examples

### Job Failure Notification
```
🚨 Message Job Failed (Permanent)

A MESSAGE_SENDING job has failed after 3 attempts and moved to DLQ.

Details:
• Job ID: dlq-1234567890-0.123
• Job Type: MESSAGE_SENDING
• Error: Failed to send WhatsApp message to +919876543210

Timestamp: 2026-03-04T10:30:00.000Z
```

### Batch Failure Notification
```
⚠️ Batch Processing Completed with Failures

Out of 100 jobs, 5 failed and were moved to DLQ.

Details:
• Total Jobs: 100
• Failed Jobs: 5
• Successful Jobs: 95
• Failure Rate: 5.00%
• Sample Errors: [error1, error2, error3]

Timestamp: 2026-03-04T11:00:00.000Z
```

### DLQ Alert
```
⚠️ Dead Letter Queue Alert

There are currently 25 jobs in the DLQ that require manual review.

Details:
• DLQ Count: 25
• Recent Error Types: MESSAGE_SENDING, MESSAGE_GENERATION
• Sample Errors: [error1, error2]

Timestamp: 2026-03-04T12:00:00.000Z
```

## Error Handling

### Generation Failures
- LLM timeouts
- Invalid schema responses
- Database errors
- → Treated as critical, moved to DLQ after retries

### Sending Failures
- WhatsApp API errors
- Network timeouts
- Invalid phone number
- → Stored as FAILED in database after final attempt

## Monitoring & Debugging

### View Queue Status
```bash
# Terminal 1: Watch generation queue
watch -n 1 'curl -s http://localhost:4000/api/queue/metrics | jq .metrics.generation'

# Terminal 2: Watch DLQ
watch -n 5 'curl -s http://localhost:4000/api/queue/dlq | jq .dlqJobCount'
```

### Check Logs
```bash
# Generation logs
grep "\[Message Generation\]" logs/* 

# Sending logs
grep "\[Message Sending\]" logs/*

# DLQ logs
grep "\[DLQ\]" logs/*
```

## Best Practices

1. **Monitor DLQ Size**: Keep DLQ under 50 items; investigate if it grows
2. **Set Concurrency Wisely**: 
   - Generation: 1 (LLM is expensive)
   - Sending: 3-5 (WhatsApp allows concurrent sends)
3. **Configure Backoff**: Exponential backoff prevents thundering herd
4. **Admin Email Alerts**: Integrate with your email system for backup notifications
5. **Periodic Cleanup**: Archive old DLQ entries after investigation
6. **Rate Limiting**: Add WhatsApp rate limiting if hitting API limits

## Scaling Considerations

### For High Volume (100k+ events/day)

1. **Redis Persistence**
   ```
   # In redis.conf
   save 900 1      # Save every 15 minutes if 1 change
   appendonly yes  # Append-only file for durability
   ```

2. **Multiple Workers**
   ```bash
   # Run multiple instances
   node dist/server/server.js &
   node dist/server/worker.js &
   ```

3. **Redis Cluster**
   - Use Redis Cluster for distributed caching
   - Update connection strings

4. **Database Optimization**
   - Add indexes on `people.phoneNumber` and `messages.personId`
   - Consider partitioning messages by date

## Troubleshooting

### Redis Connection Failed
```
Error: ECONNREFUSED 127.0.0.1:6379
→ Start Redis: brew services start redis
```

### Admin Not Receiving Notifications
```
→ Check if admin has whatsappNumber in database
→ Verify Twilio credentials
→ Check logs for sendWhatsAppMessage errors
```

### DLQ Growing Too Fast
```
→ Increase attempts count (default 3)
→ Increase backoff delay (default 2s)
→ Check external service health (LLM, WhatsApp API)
```

### Message Duplication
```
→ Bull has removeOnComplete: true
→ Jobs are deduped by jobId format
→ If still occurring, check database unique constraints
```

## Future Enhancements

- [ ] Bull UI dashboard
- [ ] Database persistence for DLQ
- [ ] Scheduled job retries with human review
- [ ] Message templating system
- [ ] Analytics dashboard
- [ ] Email/SMS fallback for admin notifications
- [ ] Job priority queues
- [ ] Rate limiting per user

---

**Created:** March 2026  
**Framework:** Bull MQ + Redis + Express  
**Status:** Production Ready