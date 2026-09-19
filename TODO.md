# TODO — Virata Retail rebrand (remaining)

GitHub repo renaming (`vscorp-frontend` / `vscorp-backend`) is **on hold** —
revisit later, since it touches Vercel's Git connection, `GITHUB_REPO_NAME`
everywhere, and `backend/worker/pipeline/.env`. Do that as its own pass.

The items below don't depend on the repo rename and can be done any time.

## 1. Email domain (`@vscorp.in`)
- File: `src/lib/email/config.js` (~15 addresses)
- Get the confirmed list of new mailboxes from IT first — don't guess new
  addresses from names. Sending to a dead address silently drops the report.
- Send a test email to yourself before sending to the full distribution list.

## 2. Login password + storage key
- File: `src/lib/auth.jsx`
  - `password: 'vscorp2026'` → new password
  - `STORAGE_KEY = 'vscorp_auth_v1'` → e.g. `virata_auth_v1`
    (renaming this logs everyone out once, on next deploy)
- File: `src/app/login/page.js` line ~77 — remove the commented-out
  credentials hint line.
- Longer-term: the password is hardcoded and shipped in client JS
  (visible in devtools/bundle). Move login to Supabase Auth for real
  security — flagged separately, not just a rename.

## 3. SQL advisory lock name
- `backend/database/migrations/2026_09_18_reliable_processing.sql` line 94:
  `hashtext('vs-corp-processing-run')`
- Don't edit that file in place — the function it defines is already live
  in Supabase. Instead add a new migration that does
  `CREATE OR REPLACE FUNCTION public.claim_processing_run …` with
  `'virata-retail-processing-run'`, and run it when no processing run is
  active. Cosmetic only — safe to skip indefinitely.

## 4. Docs reference
- `backend/docs/CLAUDE.md` line ~151 references
  `VS Corp _ Build Instructions _ Database.docx`.
- Rename the actual file, then update the line to match.

## 5. Folder rename
- `E:\1drive\vs-corp` → `E:\1drive\virata-retail` (stop dev servers + close
  VS Code windows first; OneDrive will re-sync).
- Update `.claude/settings.json` line 10 (`e:/1drive/vs-corp/frontend` path).

## 6. Final sweep
Once everything above is done, confirm nothing's left:
```powershell
cd E:\1drive\virata-retail
Get-ChildItem -Recurse -File -Exclude package-lock.json |
  Where-Object { $_.FullName -notmatch 'node_modules|\.next|\.git\\|\.venv' } |
  Select-String -Pattern 'vs[ _.-]?corp|vscorp' | Select-Object Path,LineNumber,Line
```
Then `npm run build`, commit + push both repos, and do one real upload +
processing run end to end.
