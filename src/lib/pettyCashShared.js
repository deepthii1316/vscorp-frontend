// Petty cash (Uppal Reebok): rules shared by the page, the Excel reader and the API routes.
// Pure functions, no React and no database. A ledger line is
//   { entry_date: 'YYYY-MM-DD', line_no, voucher_no, description, expense, credit, credit_source }
// and the balance is never stored: it is credits − expenses in (entry_date, line_no) order.

export const STORE = 'R1157';
export const STORE_LABEL = 'Uppal Reebok';

// Money in is either cash handed to the store, or till cash used for expenses (the DSR's "CASH USED").
export const CREDIT_SOURCES = { head_office: 'Cash from head office', sale_cash: 'Sale cash used' };
export const creditSourceOf = (description) => (/\bsale\s+cash\b/i.test(description || '') ? 'sale_cash' : 'head_office');

// What the API routes read back for a ledger line (numeric columns arrive as strings).
export const ENTRY_COLUMNS = 'id, entry_date, line_no, voucher_no, description, expense, credit, credit_source, source, edited, updated_at';
export const toEntry = (r) => ({ ...r, expense: Number(r.expense), credit: Number(r.credit) });

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Checks one line from the browser or the Excel reader and returns it in the stored shape.
 * Returns { entry } or { error }. Used server-side before every write.
 */
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Line is missing.' };
  if (!isIsoDate(raw.entry_date)) return { error: 'Date is missing or not a real date.' };
  const amount = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
  const expense = amount(raw.expense), credit = amount(raw.credit);
  if (!Number.isFinite(expense) || !Number.isFinite(credit)) return { error: 'Amount is not a number.' };
  if (expense < 0 || credit < 0) return { error: 'Amounts cannot be negative.' };
  if (expense === 0 && credit === 0) return { error: 'Enter an expense or a credit amount.' };
  if (expense > 99999999 || credit > 99999999) return { error: 'Amount is too large.' };
  const description = String(raw.description ?? '').replace(/\s+/g, ' ').trim();
  if (description.length > 300) return { error: 'Description is too long (300 characters at most).' };
  const voucher = String(raw.voucher_no ?? '').trim();
  if (voucher.length > 20) return { error: 'Voucher number is too long.' };
  let creditSource = null;
  if (credit > 0) creditSource = CREDIT_SOURCES[raw.credit_source] ? raw.credit_source : creditSourceOf(description);
  return {
    entry: {
      entry_date: raw.entry_date,
      voucher_no: voucher || null,
      description,
      expense: round2(expense),
      credit: round2(credit),
      credit_source: creditSource,
    },
  };
}

/** Lines in ledger order, each with the running balance after it. `opening` = balance before the first line. */
export function withBalance(entries, opening = 0) {
  let balance = opening;
  return [...entries]
    .sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.line_no - b.line_no))
    .map((e) => {
      balance = round2(balance + e.credit - e.expense);
      return { ...e, balance };
    });
}

const sum = (list, f) => round2(list.reduce((s, e) => s + f(e), 0));

/** Totals for the lines inside [start, end] (both inclusive, null = open) and the balance carried in. */
export function summarise(entries, start, end) {
  const before = entries.filter((e) => start && e.entry_date < start);
  const inside = entries.filter((e) => (!start || e.entry_date >= start) && (!end || e.entry_date <= end));
  const opening = round2(sum(before, (e) => e.credit) - sum(before, (e) => e.expense));
  const expense = sum(inside, (e) => e.expense);
  const credit = sum(inside, (e) => e.credit);
  const saleCash = sum(inside.filter((e) => e.credit_source === 'sale_cash'), (e) => e.credit);
  return {
    opening, expense, credit, saleCash,
    headOffice: round2(credit - saleCash),
    closing: round2(opening + credit - expense),
    lines: withBalance(inside, opening),
  };
}

/** One row per calendar month: money in, money out and the balance at month end. */
export function monthlySummary(entries) {
  const months = new Map();
  withBalance(entries).forEach((e) => {
    const key = e.entry_date.slice(0, 7);
    const m = months.get(key) || { month: key, credit: 0, saleCash: 0, expense: 0, lines: 0, closing: 0 };
    m.credit = round2(m.credit + e.credit);
    if (e.credit_source === 'sale_cash') m.saleCash = round2(m.saleCash + e.credit);
    m.expense = round2(m.expense + e.expense);
    m.lines += 1;
    m.closing = e.balance;
    months.set(key, m);
  });
  return [...months.values()].map((m) => ({ ...m, headOffice: round2(m.credit - m.saleCash) }));
}

// ─── Entries made in the app (public.petty_cash_expenses) ─────────────────
// draft -> submitted -> approved | rejected. A submitted entry is "reserved": the cash is spoken
// for but not yet taken off the actual balance. Admin approves for Uppal.

export const CATEGORIES = ['Fuel', 'Maintenance', 'Office Supplies', 'Refreshments', 'Travel', 'Utilities', 'Other'];
export const STATUS_LABELS = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
export const PHOTO_KINDS = { voucher: 'Debit voucher', receipt: 'Receipt' };
export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_BUCKET = 'petty-cash';

export const EXPENSE_COLUMNS = 'id, expense_date, category, amount, description, voucher_path, receipt_path, status, rejection_reason, created_by_email, submitted_at, decided_by_email, decided_at, created_at';
// The browser is told whether a photo exists, never where it is stored.
export const toExpense = ({ voucher_path, receipt_path, ...r }) => ({ ...r, amount: Number(r.amount), has_voucher: Boolean(voucher_path), has_receipt: Boolean(receipt_path) });

/** Checks the typed fields of one app entry. Returns { expense } or { error }. Photos are checked by the route. */
export function cleanExpense(raw, { today } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Entry is missing.' };
  if (!isIsoDate(raw.expense_date)) return { error: 'Date is missing or not a real date.' };
  if (today && raw.expense_date > today) return { error: 'The date cannot be in the future.' };
  if (!CATEGORIES.includes(raw.category)) return { error: 'Choose a category.' };
  const amount = Number(raw.amount);
  if (raw.amount === '' || raw.amount === null || raw.amount === undefined || !Number.isFinite(amount)) return { error: 'Amount is not a number.' };
  if (amount <= 0) return { error: 'Amount must be more than zero.' };
  if (amount > 99999999) return { error: 'Amount is too large.' };
  const description = String(raw.description ?? '').replace(/\s+/g, ' ').trim();
  if (!description) return { error: 'Write what the expense was for.' };
  if (description.length > 300) return { error: 'Description is too long (300 characters at most).' };
  return { expense: { expense_date: raw.expense_date, category: raw.category, amount: round2(amount), description } };
}

/** Approved app entries as cash book lines, so they sit in the same ledger as the Excel lines. */
export function approvedAsLines(expenses) {
  return expenses.filter((x) => x.status === 'approved').map((x) => ({
    id: `app-${x.id}`, expense_id: x.id,
    entry_date: x.expense_date, line_no: 1000000 + x.id, voucher_no: null,
    description: `${x.category}: ${x.description}`,
    expense: x.amount, credit: 0, credit_source: null, source: 'app',
    has_voucher: x.has_voucher, has_receipt: x.has_receipt,
  }));
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/**
 * The store's cash position. Balances are ALWAYS all-time (a date filter must never hide cash that
 * is reserved); only `executed` follows the period [start, end].
 *   actual = cash received − Excel expenses − approved app entries
 *   reserved = submitted app entries;  available = actual − reserved
 */
export function position(entries, expenses, targetFloat, { start = null, end = null, today } = {}) {
  const ledger = [...entries, ...approvedAsLines(expenses)];
  const all = summarise(ledger, null, null);
  const period = summarise(ledger, start, end);
  const pending = expenses.filter((x) => x.status === 'submitted');
  const reserved = sum(pending, (x) => x.amount);
  const available = round2(all.closing - reserved);
  const oldest = pending.reduce((m, x) => { const d = (x.submitted_at || x.created_at || '').slice(0, 10); return d && (!m || d < m) ? d : m; }, null);
  return {
    actual: all.closing,
    reserved,
    available,
    pendingCount: pending.length,
    pendingOldestDays: oldest && today ? Math.max(0, daysBetween(oldest, today)) : null,
    pendingShare: all.closing > 0 ? round2((reserved / all.closing) * 100) : null, // reserved as % of actual
    executed: period.expense,
    executedExcel: sum(period.lines.filter((l) => l.source !== 'app'), (l) => l.expense),
    executedApp: sum(period.lines.filter((l) => l.source === 'app'), (l) => l.expense),
    received: period.credit, headOffice: period.headOffice, saleCash: period.saleCash,
    targetFloat,
    refill: round2(Math.max(targetFloat - available, 0)),
    period, ledger,
  };
}
