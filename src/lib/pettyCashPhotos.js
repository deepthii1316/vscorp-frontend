// Petty cash photos (debit voucher + receipt) in the private `petty-cash` bucket. Server only:
// used by the /api/petty-cash/expenses routes with the service-role client. The browser never
// sees a storage path, only short-lived signed links from the photo route.

import { PHOTO_BUCKET, PHOTO_TYPES, PHOTO_MAX_BYTES, PHOTO_KINDS, STORE } from '@/lib/pettyCashShared';

const isFile = (f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0;

// The first bytes must really be the image type the browser claims.
function looksLike(type, b) {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === 'image/webp') return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

/**
 * Reads the two photo fields of a multipart form. Returns { photos: { voucher?, receipt? } } where
 * each is { buffer, type, ext }, or { error }. A field left out is simply absent.
 */
export async function readPhotos(form) {
  const photos = {};
  for (const kind of Object.keys(PHOTO_KINDS)) {
    const file = form.get(kind);
    if (!isFile(file)) continue;
    const label = PHOTO_KINDS[kind];
    if (!PHOTO_TYPES[file.type]) return { error: `${label} photo must be a JPG, PNG or WebP image.` };
    if (file.size > PHOTO_MAX_BYTES) return { error: `${label} photo is too large (4 MB at most).` };
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLike(file.type, buffer)) return { error: `${label} photo is not a valid image file.` };
    photos[kind] = { buffer, type: file.type, ext: PHOTO_TYPES[file.type] };
  }
  return { photos };
}

/** Stores one photo and returns its path. Throws on failure. */
export async function storePhoto(supabase, expenseId, kind, photo) {
  const path = `${STORE}/${expenseId}/${kind}-${Date.now()}.${photo.ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo.buffer, { contentType: photo.type, upsert: false });
  if (error) throw new Error(`Could not save the ${PHOTO_KINDS[kind].toLowerCase()} photo: ${error.message}`);
  return path;
}

/** Best-effort removal; a leftover file is harmless (private bucket), a failed request is not worth failing for. */
export async function removePhotos(supabase, paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove(list);
  } catch (err) {
    console.error('Could not remove petty cash photos:', err);
  }
}

/** Today's date in India, 'YYYY-MM-DD' (the store's calendar day, not the server's). */
export const todayInIndia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
