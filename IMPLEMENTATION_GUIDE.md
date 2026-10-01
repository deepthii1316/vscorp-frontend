# Email Ingestion Implementation Guide

Complete guide for setting up, testing, and verifying email-based automatic report ingestion.

---

## **PART 1: PREREQUISITES & SETUP**

### **Step 1: Database Migration**

Apply the new migration to your Supabase database:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Create a new query
3. Copy the contents of `backend/database/migrations/2026_09_23_email_ingestion.sql`
4. Execute the query
5. Verify the new tables appear:
   - `email_attachment_audit`
   - `email_ingestion_state`
6. Check that `upload_audit_log` table has new columns:
   - `ingestion_source`
   - `source_email_message_id`
   - `source_email_sender`
   - `source_email_subject`
   - `source_email_received_at`

### **Step 2: Install Required Dependencies**

In `frontend/` directory:

```bash
npm install google-auth-library googleapis
```

In `backend/worker/pipeline/` directory (if using Python email polling later):

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

### **Step 3: Set Up Gmail OAuth**

#### **3a. Create Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "Virata Retail - Email Ingestion"
3. Enable the Gmail API:
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Desktop application"
   - Download the JSON file
5. Extract from the JSON:
   - `client_id` → `GMAIL_CLIENT_ID`
   - `client_secret` → `GMAIL_CLIENT_SECRET`

#### **3b. Get Gmail Refresh Token**

1. Start your Next.js app: `npm run dev`
2. Visit: `http://localhost:3000/api/email-ingestion/auth?step=1`
3. Follow the returned authorization URL (it's a very long Google login link)
4. Grant permissions for Gmail
5. You'll be redirected to a page showing the refresh token
6. Copy the `refreshToken` value

#### **3c. Add Credentials to .env.local**

Edit `frontend/.env.local`:

```env
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token

# Email detection (regex patterns)
GMAIL_LABELS_TO_CHECK=INBOX,Reports
REPORT_EMAIL_FROM_PATTERN=.*
REPORT_EMAIL_SUBJECT_PATTERN=Daily.*Report|.*Sales.*Report|.*DSR.*
EMAIL_INGESTION_ENABLED=true
```

**Explanation of patterns:**
- `REPORT_EMAIL_FROM_PATTERN`: Matches sender email (e.g., `.*@supplier\.com` for emails from supplier domain)
- `REPORT_EMAIL_SUBJECT_PATTERN`: Matches email subject (e.g., `Daily.*Report` matches "Daily Sales Report")

### **Step 4: Restart Application**

```bash
npm run dev
```

The application should now be ready for email ingestion.

---

## **PART 2: TESTING WITHOUT WAITING FOR REAL EMAILS**

### **Test 1: Manual Poll Endpoint**

**Objective:** Test the email polling logic with real Gmail inbox

1. Make sure you have an email in your Gmail inbox that matches the configured patterns
2. Visit the admin upload page: `http://localhost:3000/upload`
3. Scroll to "Email Ingestion History" section
4. Click **"Check Now"** button
5. Watch the results:
   - ✓ **Success:** Shows emails found, attachments processed, items queued
   - ✗ **Error:** Shows error message (check credentials, labels, patterns)

**Expected flow:**
```
✓ Poll Complete
Emails found: 1
Attachments processed: 3
Queued: 2 | Failed: 1 | Duplicate: 0 | Unknown: 0

• Day Wise Sales.xlsx: Queued for processing (sales)
• Stock Balance.xlsx: Queued for processing (inventory)
• Bill Wise Item.xlsx: Validation failed - Missing required columns
```

### **Test 2: Direct API Call**

Test the email ingestion API endpoint directly:

```bash
# Trigger email polling
curl -X POST http://localhost:3000/api/email-ingestion/poll \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Get JWT token from browser console:
```javascript
const { data } = await supabase.auth.getSession();
console.log(data.session.access_token);
```

### **Test 3: Check Database Records**

After running a poll, verify data in Supabase:

```sql
-- Check email ingestion state
SELECT * FROM public.email_ingestion_state;

-- Check email attachments
SELECT 
  email_attachment_id,
  attachment_filename,
  detected_report_type,
  processing_status,
  created_at
FROM public.email_attachment_audit
ORDER BY created_at DESC
LIMIT 10;

-- Check upload_audit_log entries from email
SELECT 
  renamed_file_name,
  report_type,
  ingestion_source,
  source_email_message_id,
  status,
  row_count
FROM public.upload_audit_log
WHERE ingestion_source = 'email'
ORDER BY uploaded_at DESC;

-- Check raw.sales for ingested data
SELECT COUNT(*) as row_count, ingestion_method
FROM raw.sales
WHERE ingestion_method = 'manual'
GROUP BY ingestion_method;
```

### **Test 4: Upload History UI**

1. Go to upload page: `http://localhost:3000/upload`
2. Scroll to "Email Ingestion History" section
3. Verify:
   - ✓ Table shows recent email attachments
   - ✓ Classification confidence is shown (e.g., 95%, 70%, etc.)
   - ✓ Status badges show: success, failed, duplicate, unknown
   - ✓ File hashes are visible
   - ✓ Sender email and subject are shown
   - ✓ Filter tabs work (All, Ingested, Failed, Duplicates)

### **Test 5: Test Classification Logic**

Create a test file to verify the classifier works on different report types:

Create `test-classification.js`:

```javascript
import { classifyReport } from './src/lib/email/reportClassifier.js';

async function test() {
  // Test sales report
  const sales = await classifyReport(
    './test-files/Day Wise Sales.xlsx',
    'Day Wise Sales.xlsx'
  );
  console.log('Sales classification:', sales);

  // Test DSR report
  const dsr = await classifyReport(
    './test-files/Sep-26 ACC DSR.xlsx',
    'Sep-26 ACC DSR.xlsx'
  );
  console.log('DSR classification:', dsr);

  // Test inventory report
  const inv = await classifyReport(
    './test-files/Stock Balance Report.xlsx',
    'Stock Balance Report.xlsx'
  );
  console.log('Inventory classification:', inv);
}

test();
```

Run: `node test-classification.js`

Expected output:
```
Sales classification: { 
  reportType: 'sales', 
  confidence: 0.95, 
  method: 'filename_strong',
  details: 'Score: 10/15...'
}
```

### **Test 6: Test Validation Logic**

Create `test-validation.js`:

```javascript
import { validateReport, getValidationSummary } from './src/lib/email/reportValidator.js';

async function test() {
  const result = await validateReport('./test-files/Day Wise Sales.xlsx', 'sales');
  console.log(getValidationSummary(result, 'Day Wise Sales.xlsx'));
}

test();
```

Expected output:
```
File: Day Wise Sales.xlsx
Headers: 30
Data rows: 1250
Required columns: 5/5
Valid: YES ✓
```

### **Test 7: End-to-End Workflow**

**Scenario:** New email arrives with 3 attachments

1. Send email to your account with 3 Excel attachments:
   - Sales report (valid)
   - DSR report (valid)
   - Unknown file (invalid)

2. Click "Check Now" on upload page

3. Verify results:
   - ✓ 2 attachments queued
   - ✗ 1 attachment failed validation

4. Check upload_audit_log:
```sql
SELECT renamed_file_name, status, ingestion_source FROM public.upload_audit_log
WHERE ingestion_source = 'email'
ORDER BY uploaded_at DESC LIMIT 3;
```

5. Click "Run Processing" button to trigger pipeline

6. Monitor pipeline progress (should complete in ~30 seconds)

7. Verify data in raw tables:
```sql
SELECT COUNT(*) FROM raw.sales WHERE ingestion_method = 'email';
SELECT COUNT(*) FROM raw.account_dsr WHERE ingestion_method = 'email';
```

---

## **PART 3: VERIFYING DATA INTEGRITY**

### **Duplicate Prevention Test**

**Objective:** Verify same email attachment is not processed twice

1. Send an email with "Sales Report.xlsx" to your inbox
2. Click "Check Now" → Attachment queued, status='queued'
3. Wait for pipeline to complete → status='completed', row_count=X
4. Send the SAME email again (resend or forward)
5. Click "Check Now" again
6. Verify: Attachment marked as DUPLICATE, not reprocessed
7. Check database:
```sql
SELECT attachment_id, processing_status, file_hash
FROM email_attachment_audit
WHERE attachment_filename LIKE '%Sales Report%'
ORDER BY created_at DESC;
-- Expected: First = 'success', Second = 'duplicate'
```

### **Row-Level Deduplication Test**

If same attachment is reprocessed (e.g., after pipeline crash):

1. Check that rows are not duplicated in raw.sales:
```sql
SELECT upload_audit_id, source_row_number, COUNT(*)
FROM raw.sales
WHERE upload_audit_id = 'UUID-HERE'
GROUP BY upload_audit_id, source_row_number
HAVING COUNT(*) > 1;
-- Should return NO rows (unique constraint prevents duplicates)
```

### **Manual Upload Still Works Test**

1. Go to upload page
2. Try manual upload (Sales Upload, Account DSR, Inventory)
3. Verify:
   - ✓ File uploaded successfully
   - ✓ Appears in "Recent Uploads" section
   - ✓ Can run pipeline
   - ✓ Data appears in raw tables

4. Check that manual uploads show `ingestion_source = 'manual'`:
```sql
SELECT renamed_file_name, ingestion_source
FROM upload_audit_log
WHERE uploaded_at > now() - interval '1 hour'
ORDER BY uploaded_at DESC;
```

---

## **PART 4: PRODUCTION SETUP**

### **Enable Automated Polling (Optional)**

To automatically check for emails every N minutes, set up a cron job:

**Option A: Using Node.js cron (development)**

Create `frontend/src/lib/email/emailPollingCron.js`:

```javascript
import cron from 'node-cron';
import { createServerClient } from '@/lib/supabase';

export function startEmailPollingCron() {
  const interval = process.env.EMAIL_INGESTION_POLL_INTERVAL_MINUTES || 5;
  
  // Run every N minutes
  cron.schedule(`*/${interval} * * * *`, async () => {
    console.log('[CRON] Running email ingestion poll');
    try {
      // Call the poll endpoint with service credentials
      // This would need a way to authenticate without user JWT
      // For now, use manual polling or GitHub Actions
    } catch (err) {
      console.error('[CRON] Email ingestion error:', err);
    }
  });
}
```

**Option B: Using GitHub Actions (production recommended)**

Create `.github/workflows/email-ingestion-poll.yml`:

```yaml
name: Email Ingestion Poll

on:
  schedule:
    # Every 5 minutes
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run email ingestion
        run: |
          curl -X POST ${{ secrets.FRONTEND_URL }}/api/email-ingestion/poll \
            -H "Authorization: Bearer ${{ secrets.ADMIN_JWT_TOKEN }}" \
            -H "Content-Type: application/json"
        env:
          FRONTEND_URL: ${{ secrets.FRONTEND_URL }}
```

Add secrets to GitHub repository:
- `FRONTEND_URL`: e.g., https://your-domain.com
- `ADMIN_JWT_TOKEN`: Supabase service role token (or admin JWT)

### **Monitoring & Alerts**

1. **Monitor email ingestion failures:**

```sql
SELECT 
  DATE(created_at) as date,
  processing_status,
  COUNT(*) as count
FROM email_attachment_audit
GROUP BY date, processing_status
ORDER BY date DESC;
```

2. **Alert if no emails processed for 24 hours:**

```sql
SELECT MAX(created_at) as last_ingestion
FROM email_attachment_audit
WHERE processing_status = 'success';
-- If > 24 hours ago, send alert
```

3. **Monitor OAuth token expiration:**

Gmail refresh tokens expire after 6 months of no use. Refresh tokens used here will be renewed automatically on each poll.

---

## **PART 5: TROUBLESHOOTING**

### **Email Ingestion Endpoints Not Found**

**Problem:** GET/POST requests to `/api/email-ingestion/*` return 404

**Solution:**
- Ensure files are created in correct location: `frontend/src/app/api/email-ingestion/`
- Restart development server: `npm run dev`
- Clear `.next` cache: `rm -rf .next`

### **Gmail Authentication Fails**

**Problem:** "Gmail OAuth credentials not configured"

**Solution:**
- Verify `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` are set in `.env.local`
- Restart dev server after editing `.env.local`
- Try re-authorizing: `http://localhost:3000/api/email-ingestion/auth?step=1`

### **No Emails Found**

**Problem:** "Poll complete" but `emailsFound: 0`

**Solution:**
- Check email label: Set `GMAIL_LABELS_TO_CHECK=INBOX` to start with
- Verify sender pattern: `REPORT_EMAIL_FROM_PATTERN=.*` matches all
- Verify subject pattern: `REPORT_EMAIL_SUBJECT_PATTERN=.*` matches all
- Check Gmail has emails with `.xlsx` / `.xls` / `.csv` attachments
- Check inbox for unread emails (search query includes unread by default)

### **Attachments Classified as UNKNOWN**

**Problem:** All attachments marked `detected_report_type: 'unknown'`

**Solution:**
- Attachment filename doesn't match any pattern
- Add more specific patterns to `reportClassifier.js` → `REPORT_PATTERNS`
- Lower confidence threshold in classifier
- Example: If file named "Report_Daily_Sales.xlsx", add pattern `/daily.*sales/i` to sales section

### **Validation Fails**

**Problem:** Attachments queued but validation fails

**Solution:**
- Check required headers match actual Excel headers (case-sensitive patterns)
- Excel file may have merged cells or unusual structure
- Add debug logging to `reportValidator.js` to see which headers found vs expected
- Try uploading same file manually to see if it parses correctly

### **Ingestion Hangs or Very Slow**

**Problem:** Email poll takes >30 seconds

**Solution:**
- Gmail API calls might be slow (network latency)
- Large Excel file parsing slows down classification/validation
- Check network connectivity
- Gmail API rate limits: 250 requests/user/second
- For large attachments (>10MB), consider implementing chunked upload

### **JWT Token Required but Not Available**

**Problem:** "Unauthorized" when calling `/api/email-ingestion/poll`

**Solution:**
- Email ingestion requires admin authentication
- For automated polling, use:
  - GitHub Actions with `ADMIN_JWT_TOKEN` secret
  - Or create a separate service account with Supabase custom JWT
  - Or use Supabase RLS policies to allow service calls

---

## **PART 6: FINAL VERIFICATION CHECKLIST**

- [ ] Database migration applied (new tables created)
- [ ] Dependencies installed (`googleapis`, etc.)
- [ ] Gmail OAuth credentials configured
- [ ] Refresh token obtained and added to `.env.local`
- [ ] Dev server restarted
- [ ] Manual "Check Now" button works on upload page
- [ ] Email ingestion history shows in UI
- [ ] Email with Excel attachments in Gmail inbox
- [ ] Ran manual poll and got expected results
- [ ] Checked `email_attachment_audit` table in Supabase
- [ ] Checked `upload_audit_log` with `ingestion_source='email'`
- [ ] Manual upload still works
- [ ] Duplicate detection works
- [ ] Classification confidence looks reasonable (>60% for valid reports)
- [ ] Run pipeline completes without errors
- [ ] Data appears in raw tables (raw.sales, raw.account_dsr, etc.)
- [ ] Gold tables updated with ingested data
- [ ] Reports on dashboard include data from email ingestion

---

## **WHAT'S WORKING**

✅ **Phase 1:** Project inspection and understanding  
✅ **Phase 2:** Python ingest functions already reusable  
✅ **Phase 3:** Gmail OAuth and email fetching  
✅ **Phase 4:** Report classification (filename + sheets + headers)  
✅ **Phase 5:** Report validation (required columns check)  
✅ **Phase 6:** Database schema (audit tables, RPC functions)  
✅ **Phase 7:** Admin UI (email ingestion history)  
✅ **Phase 8:** Testing mechanisms (manual poll endpoint)  
✅ **Phase 9:** Logging and error tracking  

---

## **NEXT STEPS (OPTIONAL FUTURE ENHANCEMENTS)**

1. **Webhook-based ingestion:** Instead of polling, use Gmail push notifications
2. **Retry mechanism:** Admin interface to retry failed attachments
3. **Email notifications:** Send admin alerts on ingestion failures
4. **Report scheduling:** Auto-send ingested reports to stakeholders
5. **Data quality dashboards:** Show ingestion success rate, row counts, timing
6. **Report matching:** Link email receipt timestamp to which report file
7. **Attachment encryption:** Store email attachments securely
8. **Audit trail:** Full logging of who authorized what, when

---

## **SUPPORT RESOURCES**

- Gmail API Docs: https://developers.google.com/gmail/api/guides
- ExcelJS: https://github.com/exceljs/exceljs
- Supabase RPC: https://supabase.com/docs/guides/database/functions

