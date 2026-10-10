# Gmail Automation Setup Guide

This guide explains how to set up and configure the automated email report uploading system.

## Overview

The system automatically fetches daily reports from `virata.operations@gmail.com` and uploads them without interfering with manual uploads.

**Key Features:**
- ✅ Automatic email monitoring and attachment extraction
- ✅ Duplicate prevention using file hashing
- ✅ Separate tracking for auto vs. manual uploads
- ✅ Full audit logging
- ✅ Daily scheduling
- ✅ Health monitoring

---

## Step 1: Set Up Gmail API

### 1.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "Virata Reports Automation"
3. Enable these APIs:
   - Gmail API
   - Google Drive API (optional, for future expansion)

### 1.2 Create OAuth 2.0 Credentials

1. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
2. Select **Desktop application** (or Web application for production)
3. Download the JSON file - save it securely
4. From the JSON, extract:
   - `client_id`
   - `client_secret`

### 1.3 Get Refresh Token

Run this script to get the refresh token:

```bash
node scripts/get-gmail-refresh-token.js
```

This will:
1. Open a browser to Google login
2. Ask for permissions
3. Print the refresh token
4. Save it to `.env.local`

---

## Step 2: Configure Environment Variables

Create/update `.env.local`:

```env
# Gmail Automation
GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Auto-upload schedule (cron format, optional)
AUTO_UPLOAD_SCHEDULE=0 6 * * * # Daily at 6 AM
```

---

## Step 3: Database Schema Updates

Run these migrations to add automation tracking:

```sql
-- Add auto-upload specific columns to upload_audit_log
ALTER TABLE upload_audit_log ADD COLUMN (
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'gmail_automation')),
  email_date DATE,
  email_id TEXT UNIQUE,
  auto_upload_attempt BOOLEAN DEFAULT false
);

-- Create index for deduplication checks
CREATE INDEX idx_upload_audit_sha256_source_date 
ON upload_audit_log(file_sha256, source, uploaded_at);

-- Create automation logs table (optional, for detailed job logs)
CREATE TABLE auto_upload_logs (
  id BIGSERIAL PRIMARY KEY,
  job_run_id TEXT UNIQUE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  total_emails INT DEFAULT 0,
  uploaded_count INT DEFAULT 0,
  skipped_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status TEXT CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Step 4: Test the Setup

### 4.1 Health Check

```bash
curl -X GET http://localhost:3000/api/reports/auto-upload/status?action=health
```

Expected response:
```json
{
  "timestamp": "2026-10-10T06:00:00Z",
  "gmailConnected": true,
  "databaseConnected": true,
  "storageConnected": true,
  "healthy": true,
  "errors": []
}
```

### 4.2 Manual Trigger

```bash
curl -X POST http://localhost:3000/api/reports/auto-upload \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

This will immediately fetch emails and upload reports.

### 4.3 Check Status

```bash
curl -X GET http://localhost:3000/api/reports/auto-upload/status?action=status \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

---

## Step 5: Set Up Cloud Scheduler (Production)

### 5.1 Using Google Cloud Scheduler

1. Go to **Cloud Scheduler** in Google Cloud Console
2. Create a new job:
   - **Name**: `virata-daily-auto-upload`
   - **Frequency**: `0 6 * * *` (6 AM daily)
   - **Timezone**: Asia/Kolkata
   - **Type**: HTTP

3. Configure the HTTP request:
   - **URL**: `https://your-domain.com/api/reports/auto-upload`
   - **Method**: POST
   - **Auth**: Add OIDC token
   - **Service account**: Create one with permission to call your API

### 5.2 Using Node.js Scheduler (Self-hosted)

```javascript
// In your main server file
import cron from 'node-cron';
import { runDailyAutoUpload } from '@/jobs/dailyAutoUpload';
import { getGmailClient } from '@/lib/gmail/gmailServiceFactory';

// Schedule daily at 6 AM
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ Running scheduled auto-upload job');
  const gmailAuth = await getGmailClient();
  const result = await runDailyAutoUpload(gmailAuth);
  console.log('Job result:', result.summary);
});
```

---

## Step 6: Monitor & Maintain

### 6.1 View Upload Logs

```sql
-- Recent auto-uploads
SELECT 
  original_file_name,
  uploaded_at,
  status,
  source
FROM upload_audit_log
WHERE source = 'gmail_automation'
ORDER BY uploaded_at DESC
LIMIT 20;

-- Today's stats
SELECT 
  source,
  status,
  COUNT(*) as count
FROM upload_audit_log
WHERE DATE(uploaded_at) = CURRENT_DATE
GROUP BY source, status;
```

### 6.2 Handle Failures

Common issues and fixes:

| Issue | Solution |
|-------|----------|
| `Gmail credentials not configured` | Check `.env.local` has all 3 keys |
| `Refresh token expired` | Run `scripts/get-gmail-refresh-token.js` again |
| `Duplicate detected` | This is normal - same file uploaded same day |
| `No unread emails` | Check if emails were marked as read |

### 6.3 Admin Dashboard

View upload status in the admin panel:
- **Manual Uploads**: Tracked as `source='manual'`
- **Auto Uploads**: Tracked as `source='gmail_automation'`
- **Duplicates**: Prevented by SHA-256 hash check
- **Failures**: Logged with error messages for debugging

---

## How It Works

### Upload Flow

```
Gmail (virata.operations@gmail.com)
    ↓
[Check for unread emails]
    ↓
[Download attachments]
    ↓
[Classify report type]
    ↓
[Calculate SHA-256 hash]
    ↓
[Check for duplicates]
    ├─ If duplicate → Skip & log
    ├─ If new → Upload & log
    └─ If failed → Log error
```

### Deduplication Logic

- **File Hash**: Same file = same SHA-256
- **Time Window**: Check only today's uploads
- **Source Separate**: Manual and auto uploads tracked separately
- **Result**: No double-uploads, clean audit trail

### Manual Upload Not Affected

Manual uploads:
- Go through existing `/api/upload` endpoint
- Marked as `source='manual'` in audit log
- Don't conflict with auto-uploads
- Can happen anytime, same-day or different day

---

## Troubleshooting

### Test Gmail Connection

```javascript
import { initializeGmailClient, fetchUnreadEmails } from '@/lib/gmail/automationService';

const auth = initializeGmailClient(credentials);
const emails = await fetchUnreadEmails(auth, 1);
console.log('Unread emails:', emails.length);
```

### Test File Hash Deduplication

```javascript
import { calculateFileHash, checkDuplicateUpload } from '@/lib/deduplicationService';

const hash = calculateFileHash(fileBuffer);
const duplicate = await checkDuplicateUpload(hash, 'gmail_automation');
console.log('Is duplicate?', !!duplicate);
```

### View Job Logs

```javascript
import { getTodayUploadStats } from '@/lib/deduplicationService';

const stats = await getTodayUploadStats('gmail_automation');
console.log(stats);
// { date: '2026-10-10', successful: 5, failed: 0, source: 'gmail_automation' }
```

---

## Security Considerations

1. **Credentials**: Store in `.env.local`, never commit to git
2. **Token Refresh**: Handled automatically by OAuth2 client
3. **Rate Limiting**: Gmail API has limits - implement backoff if needed
4. **Audit Trail**: All uploads logged with source and timestamp
5. **Access Control**: Auto-upload endpoint requires admin role

---

## Next Steps

1. ✅ Set up Gmail API credentials
2. ✅ Add environment variables
3. ✅ Run database migrations
4. ✅ Test health check
5. ✅ Set up Cloud Scheduler or cron job
6. ✅ Monitor first few days
7. ✅ Configure alerts for failures

---

## Support

For issues:
1. Check logs in `upload_audit_log` table
2. Verify environment variables are set
3. Test manually with `/api/reports/auto-upload` endpoint
4. Review Gmail API scopes and permissions

For questions about manual uploads not being affected, see:
- Source column in `upload_audit_log`
- Only auto-uploads are marked as `source='gmail_automation'`
- Manual uploads continue to work independently
