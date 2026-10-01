# Email Ingestion - Quick Start Guide

**Get email-based report ingestion working in 30 minutes**

---

## **5-MINUTE SETUP**

### **Step 1: Apply Database Migration**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. SQL Editor → New Query
3. Copy entire content from: `backend/database/migrations/2026_09_23_email_ingestion.sql`
4. Paste and execute
5. ✅ Done

### **Step 2: Install Dependencies**
```bash
cd frontend
npm install google-auth-library googleapis
```

### **Step 3: Set Up Gmail OAuth** (10 minutes)

**3a. Create Google Cloud Project:**
- Visit: https://console.cloud.google.com/
- New Project → "Virata Retail"
- Search "Gmail API" → Enable
- Credentials → Create OAuth 2.0 (Desktop app)
- Download JSON file
- Extract:
  - `client_id` → Copy this
  - `client_secret` → Copy this

**3b. Get Refresh Token:**
1. Start dev server: `npm run dev`
2. Visit: `http://localhost:3000/api/email-ingestion/auth?step=1`
3. Click the long Google authorization link
4. Grant permissions
5. Copy the `refreshToken` from response

**3c. Add to .env.local:**
```env
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-secret
GMAIL_REFRESH_TOKEN=your-token

GMAIL_LABELS_TO_CHECK=INBOX
REPORT_EMAIL_FROM_PATTERN=.*
REPORT_EMAIL_SUBJECT_PATTERN=.*
EMAIL_INGESTION_ENABLED=true
```

### **Step 4: Restart & Verify**
```bash
npm run dev
```

---

## **5-MINUTE TESTING**

### **Test 1: Check Config**
```bash
curl http://localhost:3000/api/email-ingestion/test?action=CONFIG
# Should show: "gmailConfigured": true
```

### **Test 2: Manual Poll**
1. Send email to yourself with:
   - Subject: "Daily Sales Report"
   - Attach: `Day Wise Sales.xlsx` (any sales Excel file)
2. Visit: `http://localhost:3000/upload`
3. Scroll to "Email Ingestion History"
4. Click **"Check Now"**
5. Should show:
   ```
   ✓ Poll Complete
   Emails found: 1
   Attachments processed: 1
   Queued: 1
   ```

### **Test 3: Check Database**
```sql
SELECT attachment_filename, detected_report_type, processing_status
FROM email_attachment_audit
ORDER BY created_at DESC LIMIT 1;
-- Should show your attachment with processing_status='queued'
```

### **Test 4: Run Pipeline**
1. On upload page, click "Run Processing"
2. Watch pipeline complete (30-60 seconds)
3. Email ingestion history shows status='success'

### **Test 5: Verify Data**
```sql
SELECT COUNT(*) FROM raw.sales WHERE ingestion_method = 'email';
-- Should show row count from your attachment
```

---

## **WHAT'S WORKING**

✅ **Gmail Integration** - OAuth authentication, email fetching  
✅ **Report Classification** - Detects sales/DSR/inventory with confidence  
✅ **Validation** - Checks headers and data before ingestion  
✅ **Duplicate Detection** - Won't reprocess same file  
✅ **Database Tracking** - Full audit trail of each attachment  
✅ **Admin UI** - Email ingestion history on upload page  
✅ **Manual Poll Trigger** - "Check Now" button to test anytime  
✅ **Existing Upload** - Manual uploads still work 100%  
✅ **Pipeline Integration** - Uses existing ingest functions  

---

## **HOW TO USE**

### **Automated Email Ingestion**
1. Emails with Excel attachments arrive in Gmail
2. Admin clicks "Check Now" (or set up GitHub Actions cron)
3. System detects, classifies, validates automatically
4. Files queued and pipeline processes them
5. Data appears in raw tables and dashboards
6. Admin sees complete history and any errors

### **Manual Upload Still Works**
1. Go to upload page
2. Select report type
3. Choose file
4. Click upload
5. Works exactly as before

---

## **MONITORING INGESTION**

### **Health Check Endpoints**
```bash
# Is everything configured?
curl http://localhost:3000/api/email-ingestion/test?action=CONFIG

# Current status
curl http://localhost:3000/api/email-ingestion/test?action=STATUS

# Recent activity
curl http://localhost:3000/api/email-ingestion/test?action=LAST_POLL

# Statistics
curl http://localhost:3000/api/email-ingestion/test?action=STATS
```

### **View Email Ingestions in Database**
```sql
-- All ingestions
SELECT attachment_filename, detected_report_type, processing_status, 
       classification_confidence, created_at
FROM email_attachment_audit
ORDER BY created_at DESC LIMIT 20;

-- Failures only
SELECT attachment_filename, processing_error, created_at
FROM email_attachment_audit
WHERE processing_status = 'failed'
ORDER BY created_at DESC;

-- Duplicates (same file sent twice)
SELECT attachment_filename, file_hash, processing_status, created_at
FROM email_attachment_audit
WHERE file_hash IN (
  SELECT file_hash FROM email_attachment_audit 
  GROUP BY file_hash HAVING COUNT(*) > 1
)
ORDER BY file_hash, created_at DESC;
```

### **Upload History UI**
1. Go to: `http://localhost:3000/upload`
2. Scroll to: "Email Ingestion History"
3. See: All email ingestions with:
   - Filename
   - Sender email
   - Report type (detected)
   - Classification confidence
   - Validation status
   - Processing status
4. Filter by: All, Ingested, Failed, Duplicates

---

## **TROUBLESHOOTING**

### **No emails found**
- Verify email has Excel attachment (.xlsx, .xls, or .csv)
- Check subject matches pattern (default: any)
- Check sender matches pattern (default: any)
- Try: `REPORT_EMAIL_FROM_PATTERN=.*` (match all)

### **Attachment marked UNKNOWN**
- Filename doesn't match any pattern
- Add more flexible patterns to `REPORT_PATTERNS` in reportClassifier.js
- Or lower confidence threshold
- Check if Excel structure is valid

### **Validation fails**
- Excel doesn't have required columns
- Try uploading same file manually to test
- Check expected headers in reportValidator.js
- Look for error message in database

### **Duplicate issue**
- If same email processed twice:
  - Check file hash in database (should be identical)
  - Second attempt should mark as DUPLICATE
  - This is working correctly!

### **Pipeline doesn't run**
- Ensure GitHub token configured
- Check GitHub Actions logs
- Or click "Run Processing" manually

---

## **CONFIGURATION REFERENCE**

| Variable | Example | Purpose |
|----------|---------|---------|
| GMAIL_CLIENT_ID | xxx.apps.googleusercontent.com | OAuth credential |
| GMAIL_CLIENT_SECRET | xxx | OAuth credential |
| GMAIL_REFRESH_TOKEN | xxx | Persistent auth token |
| GMAIL_LABELS_TO_CHECK | INBOX,Reports | Which Gmail labels to monitor |
| REPORT_EMAIL_FROM_PATTERN | .* or .*@supplier.com | Sender filter (regex) |
| REPORT_EMAIL_SUBJECT_PATTERN | .* or Daily.* | Subject filter (regex) |
| EMAIL_INGESTION_ENABLED | true/false | Enable/disable feature |
| EMAIL_INGESTION_POLL_INTERVAL_MINUTES | 5 | Check Gmail every N minutes |

---

## **FILES CREATED**

**New Services:**
- `frontend/src/lib/gmail/gmailService.js`
- `frontend/src/lib/email/reportClassifier.js`
- `frontend/src/lib/email/reportValidator.js`

**New API Routes:**
- `frontend/src/app/api/email-ingestion/poll/route.js` ← Main endpoint
- `frontend/src/app/api/email-ingestion/auth/route.js` ← OAuth setup
- `frontend/src/app/api/email-ingestion/test/route.js` ← Testing/debugging

**New UI Component:**
- `frontend/src/components/EmailIngestionHistory.js` ← Admin dashboard

**Database:**
- `backend/database/migrations/2026_09_23_email_ingestion.sql` ← Schema

**Documentation:**
- `IMPLEMENTATION_GUIDE.md` ← Complete setup
- `EMAIL_INGESTION_TESTING.md` ← 12-test checklist
- `EMAIL_INGESTION_ARCHITECTURE.md` ← Technical deep dive
- `QUICKSTART_EMAIL_INGESTION.md` ← This file

---

## **VERIFICATION CHECKLIST**

```
[ ] Migration applied to Supabase
[ ] Dependencies installed
[ ] Gmail OAuth credentials obtained
[ ] .env.local configured with Gmail variables
[ ] Dev server running
[ ] Config endpoint returns gmailConfigured=true
[ ] Sent test email with Excel attachment
[ ] Clicked "Check Now" and got results
[ ] Email ingestion history shows attachment
[ ] Database records visible
[ ] Pipeline completed without errors
[ ] Data appeared in raw tables
[ ] Manual upload still works
[ ] All tests passing
```

**If all checked:** ✅ **Email ingestion is ready!**

---

## **NEXT: Advanced Setup (Optional)**

### **Automated Polling**
Add GitHub Actions to check emails every 5 minutes automatically:
- Create `.github/workflows/email-ingestion-poll.yml`
- Configure schedule: `*/5 * * * *`
- Add ADMIN_JWT_TOKEN secret
- See EMAIL_INGESTION_ARCHITECTURE.md for details

### **Production Deployment**
- Use production Gmail OAuth credentials
- Secure environment variables in deployment platform
- Enable monitoring and alerts
- Configure admin team access
- Set up runbook for troubleshooting

### **Custom Report Patterns**
Modify `REPORT_PATTERNS` in `reportClassifier.js` to match your exact:
- File naming conventions
- Excel sheet names
- Column headers
- Row structure

---

## **SUPPORT**

**Questions?** Check these in order:

1. **Quick answers:** Scroll "Troubleshooting" above
2. **Setup details:** Read `IMPLEMENTATION_GUIDE.md`
3. **All 12 tests:** See `EMAIL_INGESTION_TESTING.md`
4. **Architecture:** Read `EMAIL_INGESTION_ARCHITECTURE.md`
5. **Code:** Look at service files in `frontend/src/lib/`

**Common Issues:**
- 404 on /api/email-ingestion/poll → Restart dev server
- Gmail auth fails → Check .env.local variables
- No emails found → Verify email has .xlsx and matches patterns
- Unknown report type → Increase confidence threshold or improve patterns

---

## **YOU'RE ALL SET! 🎉**

You now have fully automated email-based report ingestion with:
- ✅ Automatic Excel report detection
- ✅ Smart classification with confidence scoring
- ✅ Validation before database insertion
- ✅ Duplicate prevention
- ✅ Complete audit trail
- ✅ Admin dashboard visibility
- ✅ Full backwards compatibility with manual uploads

Enjoy automated reporting! 📧📊

