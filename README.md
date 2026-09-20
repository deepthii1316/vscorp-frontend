# Virata Retail - Uppal Reebok Web App

Web app for the Uppal Reebok store: upload retail data, read the **Sales Reports**, explore the **Master Dashboard**, and email reports.
The data pipeline and database live in the separate **backend** repository.

## What it does

| Screen | Path | Purpose |
|---|---|---|
| Data Upload | `/upload` | Upload Sales, Account DSR and Inventory Excel files, then press **Process** |
| Upload History / Data Coverage | `/upload-history`, `/data-coverage` | See what was uploaded and which dates are covered |
| Sales Reports | `/reebok-reports` | 8 report tables, Excel download, **Send Test** / **Send to All** email |
| Master Dashboard | `/master-dashboard` | Overview: KPIs, trend, division split, payment modes, month-on-month, filters |

## Tech stack

Next.js 15 (App Router) - React 19 - JavaScript - Supabase (Postgres + Storage) - Recharts - ExcelJS - html2canvas - Nodemailer - lucide-react

## Quick start

Prerequisites: **Node.js 22.15 or newer** (the dev script uses `--use-system-ca`), and a Supabase project already set up with the backend.

```bash
npm install
cp .env.example .env.local     # Windows PowerShell: Copy-Item .env.example .env.local
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / run |

There are no automated tests yet, and ESLint is not configured (`npm run lint` will ask to set it up).

## Environment variables (`.env.local`)

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (browser safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side data access. **Secret, never expose.** |
| `GITHUB_TOKEN` | Token with *Actions: write*, used to start the processing workflow |
| `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` | The repository that contains `.github/workflows/run-pipeline.yml`, i.e. the **backend** repo |
| `SMTP_USER`, `SMTP_PASS` | Gmail address and app password for sending reports |
| `SMTP_ALLOW_SELF_SIGNED` | Optional, local only (`true`) if antivirus breaks the mail connection. Ignored in production. |

## How the pieces fit

```
Upload page --> /api/upload --> Supabase Storage + upload_audit_log (queued)
Process button --> /api/process --> GitHub Actions (backend) --> raw --> staging --> gold tables
Reports + Dashboard --> /api/reports/* --> gold tables --> screen / Excel / email images
```

## Project structure

```
src/
  app/
    upload/, upload-history/, data-coverage/   Upload flow
    reebok-reports/                            Sales Reports page
    master-dashboard/                          Dashboard page
    api/upload, api/process                    Upload + start processing
    api/reports/reebok-sales | reebok-export | reebok-send   Report HTML, Excel, email
    api/reports/master-dashboard               Dashboard data
  components/    UI pieces (charts, filters, sidebar, upload widgets)
  lib/
    email/reebokReportModel.js   Report layout, defined ONCE (screen, Excel and email all use it)
    email/reebokHelpers.js       KPI formulas and monthly targets
    email/reebokExcel.js         Excel workbook builder
    email/config.js              Email recipients
    masterDashboardShared.js     Dashboard calculations and date filters
    auth.jsx                     Login (see Known limitations)
public/
  REEBOOK_KPI_DEFINITIONS.md     KPI formulas and business rules
```

## Rules worth knowing

- **NSV** is the sum of *Taxable Amount*. **MD %** = (MRP - NSV) / MRP. **YTD** is the calendar year.
- **Targets:** ₹14,00,000 a month by default, ₹8,00,000 for September 2026. To change a month, edit `MONTHLY_TARGET_OVERRIDES` in `src/lib/email/reebokHelpers.js`.
- **Achievement % colours are relative:** lowest is red, highest is green (no fixed cut-offs).
- **Change a report table** in `reebokReportModel.js` only. The screen, the Excel and the email images follow automatically.
- **Email recipients** are in `src/lib/email/config.js`.
- Full definitions: `public/REEBOOK_KPI_DEFINITIONS.md`.

## Deployment

Any Node host works (built for Vercel). Set all environment variables, run `npm run build`, then `npm start`.
Serverless request bodies are limited to about 4.5 MB, so the email route caps images plus Excel at 4.3 MB.

## Troubleshooting

- **"self-signed certificate" errors:** caused by antivirus or proxy HTTPS scanning. `npm run dev` already trusts the system certificates. For mail only, set `SMTP_ALLOW_SELF_SIGNED=true` locally.
- **Weird build errors while developing:** do not run `npm run build` while `npm run dev` is running (they share the `.next` folder). Stop the server, delete `.next`, start again.
- **"This exact file has already been uploaded":** duplicate protection (matched by file hash).

## Known limitations

- Login uses a fixed list of users in code (temporary, until Supabase Auth is merged), and the API routes do not check the session yet.
- `api/reports/kpi-dashboard*`, `api/reports/master-dashboard/merch` and three `lib/email/build*` / `colorScale` files are leftovers from an earlier project and are not used by the current screens.
