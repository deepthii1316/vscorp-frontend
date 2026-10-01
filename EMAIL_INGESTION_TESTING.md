# Email Ingestion - Complete Testing Checklist

**Quick Reference for verifying everything is working correctly**

---

## **PRE-TESTING: SETUP VERIFICATION** ✓

### Environment Check
```bash
# Verify .env.local has all required variables
grep -E "GMAIL_CLIENT_ID|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN" .env.local

# Expected output:
# GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
# GMAIL_CLIENT_SECRET=xxx
# GMAIL_REFRESH_TOKEN=xxx
```

### Database Check
```sql
-- Verify new tables exist
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'email_attachment_audit'
) as table_exists;

-- Verify upload_audit_log has new columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'upload_audit_log' 
AND column_name IN ('ingestion_source', 'source_email_message_id');
```

### Dependency Check
```bash
# Verify googleapis is installed
npm ls googleapis google-auth-library

# Expected: Found in node_modules
```

---

## **TEST 1: Basic Configuration Check** ✓

**Purpose:** Verify the system is configured and ready

**Steps:**
1. Open browser: `http://localhost:3000/api/email-ingestion/test?action=CONFIG`
2. Verify response shows:
   ```json
   {
     "gmailConfigured": true,
     "emailIngestionEnabled": true,
     "pollIntervalMinutes": 5,
     "labelsToCheck": "INBOX"
   }
   ```

**Success Criteria:**
- ✓ `gmailConfigured` = `true`
- ✓ `emailIngestionEnabled` = `true`
- ✓ No errors in response

**If Failed:**
- Check `.env.local` has all three Gmail variables
- Verify file permissions: `frontend/src/app/api/email-ingestion/`
- Restart dev server: `npm run dev`

---

## **TEST 2: Ingestion Status** ✓

**Purpose:** Check current state of email ingestion system

**Steps:**
1. Visit: `http://localhost:3000/api/email-ingestion/test?action=STATUS`
2. Expect response:
   ```json
   {
     "enabled": true,
     "lastChecked": "2026-09-23T10:00:00Z",
     "pollInterval": 5,
     "statusCounts": {
       "success": 0,
       "failed": 0,
       "duplicate": 0,
       "unknown": 0
     }
   }
   ```

**Success Criteria:**
- ✓ `enabled` = `true`
- ✓ `statusCounts` object present
- ✓ No database errors

---

## **TEST 3: OAuth Information** ✓

**Purpose:** Verify Gmail OAuth is properly configured

**Steps:**
1. Visit: `http://localhost:3000/api/email-ingestion/test?action=OAUTH_INFO`
2. Expect:
   ```json
   {
     "status": "configured",
     "clientIdConfigured": true,
     "clientSecretConfigured": true,
     "refreshTokenConfigured": true
   }
   ```

**Success Criteria:**
- ✓ `status` = `"configured"`
- ✓ All three config flags = `true`

**If Not Configured:**
1. Follow steps in IMPLEMENTATION_GUIDE.md "Part 1: Step 3 (Set Up Gmail OAuth)"
2. Visit the authorization URL
3. Grant permissions
4. Copy refresh token
5. Add to `.env.local`
6. Restart server
7. Re-run this test

---

## **TEST 4: Manual Poll - Real Gmail Test** ✓

**Purpose:** Test with actual emails in your Gmail inbox

**Prerequisites:**
- ✓ Complete Tests 1-3 successfully
- ✓ Have Gmail account with configured credentials
- ✓ Have at least one email in INBOX matching the patterns

**Steps:**

1. **Prepare test email:**
   - Send yourself email with subject: `"Daily Sales Report - Test"`
   - Attach Excel file: `"Day Wise Sales.xlsx"`
   - From same email address (or matching REPORT_EMAIL_FROM_PATTERN)

2. **Trigger poll via UI:**
   - Go to: `http://localhost:3000/upload`
   - Scroll to: "Email Ingestion History" section
   - Click: **"Check Now"** button

3. **Watch for results:**
   ```
   ✓ Poll Complete
   Emails found: 1
   Attachments processed: 1
   Queued: 1 | Failed: 0 | Duplicate: 0 | Unknown: 0
   
   • Day Wise Sales.xlsx: Queued for processing (sales)
   ```

**Success Criteria:**
- ✓ Poll completes without errors
- ✓ Emails found > 0
- ✓ Attachments processed > 0
- ✓ At least one attachment queued
- ✓ Classification shows correct report type
- ✓ Confidence is 60%+ for valid reports

**If Failed - Email Not Found:**
- Check REPORT_EMAIL_FROM_PATTERN (too restrictive?)
- Check REPORT_EMAIL_SUBJECT_PATTERN (too restrictive?)
- Check GMAIL_LABELS_TO_CHECK includes correct label
- Verify email has `.xlsx` attachment
- Try: `REPORT_EMAIL_SUBJECT_PATTERN=.*` (match everything)

**If Failed - Attachment Marked UNKNOWN:**
- Classification confidence too low
- Excel file structure doesn't match expected pattern
- Add more flexible matching to reportClassifier.js
- Or lower confidence threshold from 0.60 to 0.50

---

## **TEST 5: Email Ingestion History UI** ✓

**Purpose:** Verify UI displays ingestion history correctly

**Steps:**

1. Go to: `http://localhost:3000/upload`
2. Scroll to "Email Ingestion History" section
3. Verify visible elements:
   ```
   ✓ "Check Now" button
   ✓ Filter tabs (All, Ingested, Failed, Duplicates)
   ✓ History table with columns:
     - Date
     - File
     - From
     - Type
     - Classification
     - Validation
     - Status
     - Details
   ```

4. Click each filter tab and verify counts update

**Success Criteria:**
- ✓ Table renders without errors
- ✓ Filter tabs work
- ✓ "Check Now" button is clickable
- ✓ Recent attachments appear in table

**If UI Not Showing:**
- Verify EmailIngestionHistory component is imported in upload/page.js
- Check console for JavaScript errors
- Restart dev server

---

## **TEST 6: Database Records** ✓

**Purpose:** Verify data is saved correctly in database

**Steps:**

1. **Check email_attachment_audit table:**
   ```sql
   SELECT 
     attachment_filename,
     detected_report_type,
     classification_confidence,
     processing_status,
     created_at
   FROM email_attachment_audit
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. **Verify each record shows:**
   - ✓ Filename matches attachment
   - ✓ detected_report_type = 'sales', 'account_dsr', 'inventory', or 'unknown'
   - ✓ classification_confidence between 0.0 and 1.0
   - ✓ processing_status = 'success', 'failed', 'duplicate', 'unknown', etc.

3. **Check upload_audit_log for email ingestions:**
   ```sql
   SELECT 
     renamed_file_name,
     report_type,
     ingestion_source,
     status,
     row_count
   FROM upload_audit_log
   WHERE ingestion_source = 'email'
   ORDER BY uploaded_at DESC
   LIMIT 10;
   ```

4. **Verify:**
   - ✓ ingestion_source = 'email'
   - ✓ report_type = 'sales', 'account_dsr', or 'inventory'
   - ✓ status = 'queued' (waiting for pipeline)

**Success Criteria:**
- ✓ Records appear in email_attachment_audit
- ✓ Records appear in upload_audit_log with ingestion_source='email'
- ✓ Data matches what was shown in UI

---

## **TEST 7: Duplicate Detection** ✓

**Purpose:** Verify same attachment is not processed twice

**Steps:**

1. **Send same email twice:**
   - Forward/resend previous test email to yourself
   
2. **Run poll twice:**
   - Click "Check Now" → Should queue attachment
   - Wait 10 seconds
   - Click "Check Now" again → Should mark as DUPLICATE

3. **Check database:**
   ```sql
   SELECT 
     attachment_id,
     file_hash,
     processing_status,
     created_at
   FROM email_attachment_audit
   WHERE file_hash = 'abc123...'
   ORDER BY created_at DESC;
   ```

4. **Verify:**
   - ✓ First record: processing_status = 'success'
   - ✓ Second record: processing_status = 'duplicate'
   - ✓ Both have same file_hash

**Success Criteria:**
- ✓ Duplicate detected
- ✓ Not reprocessed
- ✓ Status marked correctly

---

## **TEST 8: Manual Upload Still Works** ✓

**Purpose:** Ensure email automation didn't break manual uploads

**Steps:**

1. **Go to upload page:** `http://localhost:3000/upload`

2. **Select: "Sales Upload"**

3. **Choose file:** (any sales Excel file)

4. **Click: "Upload to Raw Layer"**

5. **Verify:**
   - ✓ File uploads successfully
   - ✓ Success message appears
   - ✓ File appears in "Recent Uploads"

6. **Check database:**
   ```sql
   SELECT ingestion_source FROM upload_audit_log
   WHERE uploaded_at > now() - interval '5 minutes'
   LIMIT 1;
   ```
   - ✓ Should show: ingestion_source = 'manual'

**Success Criteria:**
- ✓ Manual upload works without errors
- ✓ ingestion_source = 'manual' (not 'email')
- ✓ Manual and email uploads coexist

---

## **TEST 9: Pipeline Processing** ✓

**Purpose:** Verify ingested email attachments process through pipeline

**Steps:**

1. **After queuing email attachments:**
   - Check "Run Processing" section
   - Status should show: "Ready" with pending count

2. **Click: "Run Processing"**

3. **Watch pipeline progress:**
   - Should show 4 stages:
     - ✓ Raw ingest
     - ✓ Dimensions
     - ✓ Facts
     - ✓ Gold tables

4. **Wait for completion (should take 30-60 seconds)**

5. **After completion:**
   - Email ingestion history shows status changed to 'success'
   - row_count populated

6. **Verify data in raw tables:**
   ```sql
   SELECT COUNT(*) FROM raw.sales WHERE ingestion_method = 'email';
   SELECT COUNT(*) FROM raw.account_dsr WHERE ingestion_method = 'email';
   ```

**Success Criteria:**
- ✓ Pipeline completes without errors
- ✓ Rows inserted into raw tables
- ✓ Status changes to 'completed'
- ✓ Row count visible in UI

---

## **TEST 10: Row-Level Deduplication** ✓

**Purpose:** Verify rows don't duplicate if attachment reprocessed

**Steps:**

1. **Simulate re-processing same attachment:**
   - Manually mark in database:
     ```sql
     UPDATE upload_audit_log 
     SET status = 'queued'
     WHERE ingestion_source = 'email'
     AND status = 'completed'
     LIMIT 1;
     ```

2. **Run pipeline again**

3. **Check raw table:**
   ```sql
   SELECT upload_audit_id, source_row_number, COUNT(*) as cnt
   FROM raw.sales
   WHERE upload_audit_id IS NOT NULL
   GROUP BY upload_audit_id, source_row_number
   HAVING COUNT(*) > 1;
   ```

4. **Verify:**
   - ✓ No rows returned (NO DUPLICATES)
   - ✓ Unique constraint prevents re-insertion

**Success Criteria:**
- ✓ No duplicate rows in raw tables
- ✓ Row count stays same after re-processing
- ✓ Constraint violation handled gracefully

---

## **TEST 11: Error Handling** ✓

**Purpose:** Verify graceful handling of errors

**Steps:**

1. **Send invalid Excel file:**
   - Email corrupted Excel file (or text file with .xlsx extension)
   - Run poll

2. **Verify behavior:**
   - Attachment marked as FAILED
   - Error message shows in database
   - Other attachments still process
   - Processing doesn't crash

3. **Send file with missing headers:**
   - Create Excel with no expected columns
   - Run poll

4. **Verify:**
   - Attachment marked as FAILED or SKIPPED
   - Validation error shown
   - Logged in processing_error field

**Success Criteria:**
- ✓ One failure doesn't stop all processing
- ✓ Error messages are descriptive
- ✓ System continues running
- ✓ Admin can see error details

---

## **TEST 12: Statistics & Monitoring** ✓

**Purpose:** Verify statistics endpoint for monitoring

**Steps:**

1. Visit: `http://localhost:3000/api/email-ingestion/test?action=STATS`

2. Verify response includes:
   ```json
   {
     "totalAttachments": 5,
     "byStatus": {...},
     "byType": {...},
     "successRate": 0.80,
     "last24Hours": 3,
     "last7Days": 15
   }
   ```

3. Check values are realistic

**Success Criteria:**
- ✓ Stats endpoint works
- ✓ Counts are accurate
- ✓ Time-based filtering works (24h, 7d)
- ✓ Success rate calculates correctly

---

## **FINAL VERIFICATION SCORECARD**

Print this and check off as you complete each test:

```
TEST 1:  Configuration Check           [ ]
TEST 2:  Ingestion Status              [ ]
TEST 3:  OAuth Information             [ ]
TEST 4:  Manual Poll (Real Gmail)      [ ]
TEST 5:  Email History UI              [ ]
TEST 6:  Database Records              [ ]
TEST 7:  Duplicate Detection           [ ]
TEST 8:  Manual Upload Still Works     [ ]
TEST 9:  Pipeline Processing           [ ]
TEST 10: Row-Level Dedup               [ ]
TEST 11: Error Handling                [ ]
TEST 12: Statistics Monitoring         [ ]

RESULT: [  ] ALL TESTS PASS ✓
```

If all tests pass: **Email ingestion is fully working!** 🎉

If any test fails: Check that specific test section for troubleshooting steps.

---

## **QUICK COMMANDS REFERENCE**

```bash
# Start development server
npm run dev

# Apply database migration
# (Visit Supabase SQL editor and paste migration file)

# Check configuration
curl http://localhost:3000/api/email-ingestion/test?action=CONFIG

# Check status
curl http://localhost:3000/api/email-ingestion/test?action=STATUS

# Get OAuth info
curl http://localhost:3000/api/email-ingestion/test?action=OAUTH_INFO

# Get statistics
curl http://localhost:3000/api/email-ingestion/test?action=STATS

# Get last poll results
curl http://localhost:3000/api/email-ingestion/test?action=LAST_POLL

# Manual poll (requires auth header)
curl -X POST http://localhost:3000/api/email-ingestion/poll \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## **TROUBLESHOOTING QUICK REFERENCE**

| Issue | Solution |
|-------|----------|
| 404 on /api/email-ingestion/* | Restart dev server |
| "Gmail OAuth credentials not configured" | Add GMAIL_* variables to .env.local |
| No emails found | Check labels, patterns, and attachments |
| All attachments UNKNOWN | Improve classification patterns |
| Validation fails | Verify Excel headers match patterns |
| Rows duplicate | Check ON CONFLICT constraint in raw tables |
| Pipeline doesn't run | Ensure GitHub token configured |
| Data not in raw tables | Check pipeline logs in GitHub Actions |

