// Asset Tracker: rules shared by the page, the Excel reader and the API routes.
// Pure functions, no React and no database. An asset on the page is
//   { id, category, item, brand, specification, quantity, remark, updated_at, updated_by_email }
// one per store and item (public.store_assets joined to its item and category).

export const MAX_QUANTITY = 9999999;
export const MAX_IMPORT_ROWS = 5000;
export const LIMITS = { category: 80, item: 150, brand: 120, specification: 300, remark: 300, store: 80, code: 20 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

/** Text as it is stored: trimmed, inner whitespace collapsed. */
export const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** How two names are compared: no case, no extra spaces. */
export const nameKey = (v) => cleanText(v).toLowerCase();
export const assetKey = (category, item) => `${nameKey(category)}|${nameKey(item)}`;

/** A quantity typed on the page or sent by the import: a whole number from 0 up. Returns a number or null. */
export function cleanQuantity(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_QUANTITY ? n : null;
}

/**
 * Checks one asset (from the form or one import row) and returns it in the stored shape.
 * Returns { asset } or { error }. `names: false` skips category / item (an edit cannot change them).
 */
export function cleanAsset(raw, { names = true } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Asset is missing.' };
  const asset = {};
  if (names) {
    asset.category = cleanText(raw.category);
    asset.item = cleanText(raw.item);
    if (!asset.category) return { error: 'Choose or type a category.' };
    if (!asset.item) return { error: 'Type the item name.' };
    if (asset.category.length > LIMITS.category) return { error: `Category is too long (${LIMITS.category} characters at most).` };
    if (asset.item.length > LIMITS.item) return { error: `Item name is too long (${LIMITS.item} characters at most).` };
  }
  for (const field of ['brand', 'specification', 'remark']) {
    const text = cleanText(raw[field]);
    if (text.length > LIMITS[field]) return { error: `${field[0].toUpperCase()}${field.slice(1)} is too long (${LIMITS[field]} characters at most).` };
    asset[field] = text || null;
  }
  const quantity = cleanQuantity(raw.quantity);
  if (quantity === null) return { error: 'Quantity must be a whole number, 0 or more.' };
  asset.quantity = quantity;
  return { asset };
}

/** A store typed on the page. Returns { store: { name, code } } or { error }. */
export function cleanStore(raw) {
  const name = cleanText(raw?.name);
  const code = cleanText(raw?.code).toUpperCase();
  if (!name) return { error: 'Type the store name.' };
  if (name.length > LIMITS.store) return { error: `Store name is too long (${LIMITS.store} characters at most).` };
  if (code.length > LIMITS.code) return { error: `Store code is too long (${LIMITS.code} characters at most).` };
  return { store: { name, code: code || null } };
}

/** What the API reads back for an asset, and its flat shape for the page. */
export const ASSET_COLUMNS = 'id, brand, specification, quantity, remark, updated_at, updated_by_email, asset_items(id, name, display_order, asset_categories(id, name, display_order))';
export const toAsset = (r) => ({
  id: r.id,
  item_id: r.asset_items?.id || null,
  item: r.asset_items?.name || '',
  category: r.asset_items?.asset_categories?.name || '',
  category_order: r.asset_items?.asset_categories?.display_order ?? 0,
  item_order: r.asset_items?.display_order ?? 0,
  brand: r.brand, specification: r.specification, quantity: Number(r.quantity) || 0, remark: r.remark,
  updated_at: r.updated_at, updated_by_email: r.updated_by_email,
});

/** Register order: category, then item, both in the order they were first entered. */
export const inRegisterOrder = (assets) => [...assets].sort((a, b) => a.category_order - b.category_order || a.category.localeCompare(b.category)
  || a.item_order - b.item_order || a.item.localeCompare(b.item));

/** The dashboard figures for one store. */
export function stats(assets) {
  return {
    types: assets.length,
    quantity: assets.reduce((s, a) => s + a.quantity, 0),
    zeroStock: assets.filter((a) => a.quantity === 0).length,
    categories: new Set(assets.map((a) => nameKey(a.category))).size,
  };
}

/** One row per category: how many items, how many units, how many at zero. */
export function byCategory(assets) {
  const map = new Map();
  inRegisterOrder(assets).forEach((a) => {
    const row = map.get(a.category) || { category: a.category, types: 0, quantity: 0, zeroStock: 0 };
    row.types += 1;
    row.quantity += a.quantity;
    if (a.quantity === 0) row.zeroStock += 1;
    map.set(a.category, row);
  });
  return [...map.values()];
}

/** Search (item, brand, category, specification, remark), category and zero-stock filters together. */
export function filterAssets(assets, { search = '', category = '', zeroOnly = false } = {}) {
  const words = nameKey(search).split(' ').filter(Boolean);
  return assets.filter((a) => {
    if (category && a.category !== category) return false;
    if (zeroOnly && a.quantity !== 0) return false;
    if (words.length === 0) return true;
    const hay = [a.item, a.brand, a.category, a.specification, a.remark].map((v) => nameKey(v)).join(' ');
    return words.every((w) => hay.includes(w));
  });
}
