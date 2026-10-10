'use client';

// Column sorting for every table in the app: one header control, one behaviour.
//
//   const { sort, onSort, sorted } = useSort();
//   <SortTh k="amount" label="Amount" sort={sort} onSort={onSort} />
//   sorted(rows).map(...)                      // rows keep their original order until a header is clicked
//
// Click a header: largest first (text columns: A to Z) -> click again: the other way -> click a
// third time: back to how the table started. Total rows are never passed to sorted(), so
// they stay at the bottom. Sorting only re-orders what is already on screen; it fetches nothing.

import { useCallback, useState } from 'react';

const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** Rows in the order `sort` asks for. Blank values always go last. No key = original order. */
export function sortRows(rows, sort, get = (r, k) => r[k]) {
  if (!sort || !sort.key) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key), y = get(b, sort.key);
    if (isBlank(x) && isBlank(y)) return 0;
    if (isBlank(x)) return 1;
    if (isBlank(y)) return -1;
    if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    return (x - y) * dir;
  });
}

/** sortRows for an expandable table: the rows inside every group are sorted the same way. */
export function sortTree(nodes, sort, get, childrenKey = 'children') {
  if (!sort || !sort.key) return nodes;
  return sortRows(nodes || [], sort, get).map((n) => ({ ...n, [childrenKey]: sortTree(n[childrenKey] || [], sort, get, childrenKey) }));
}

/** Two-state toggle (always sorted): used where a table has no "original" order to go back to. */
export function nextSort(sort, key, defaultDir = 'desc') {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir };
}

/**
 * Sort state for one table. `textKeys` are columns that start A-to-Z (names, dates shown as text);
 * every other column starts with the largest value first. `initial` pre-sorts the table.
 */
export function useSort({ initial = { key: null, dir: 'desc' }, textKeys = [] } = {}) {
  const [sort, setSort] = useState(initial);
  const onSort = useCallback((key) => {
    setSort((s) => {
      const first = textKeys.includes(key) ? 'asc' : 'desc';
      if (s.key !== key) return { key, dir: first };
      if (s.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
      return initial; // third click: back to how the table started
    });
  }, [textKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useCallback((rows, get) => sortRows(rows || [], sort, get), [sort]);
  return { sort, onSort, sorted, setSort };
}

/** Sortable header cell with up / down arrows; the arrow in use is highlighted. */
export function SortTh({ k, label, sort, onSort, title, className = '', children, ...rest }) {
  const active = sort?.key === k;
  const dir = active ? sort.dir : null;
  return (
    <th {...rest} className={`sort-th${active ? ' active' : ''} ${className}`.trim()} title={title}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-th-btn" onClick={() => onSort(k)}
        aria-label={`Sort by ${typeof label === 'string' ? label : k}${active ? (dir === 'asc' ? ', smallest first' : ', largest first') : ''}`}>
        <span className="sort-th-label">{children ?? label}</span>
        <span className="sort-th-arrows" aria-hidden="true">
          <i className={dir === 'asc' ? 'on' : ''}>▲</i>
          <i className={dir === 'desc' ? 'on' : ''}>▼</i>
        </span>
      </button>
    </th>
  );
}
