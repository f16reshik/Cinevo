import { HttpError } from '../middleware.js';

export const defaultLayout = {
  rows: [
    { label: 'A', category: 'PREMIUM', cols: 12, gaps: [6] },
    { label: 'B', category: 'PREMIUM', cols: 12, gaps: [6] },
    { label: 'C', category: 'REGULAR', cols: 12, gaps: [6] },
    { label: 'D', category: 'REGULAR', cols: 12, gaps: [6] },
    { label: 'E', category: 'REGULAR', cols: 12, gaps: [6] },
    { label: 'F', category: 'REGULAR', cols: 12, gaps: [6] },
  ],
};

// Returns the list of seat categories used; throws on bad input. Normalises categories to UPPERCASE.
export function validateLayout(layout) {
  const rows = layout?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 40) throw new HttpError(400, 'Layout needs 1-40 rows');
  const labels = new Set();
  const cats = new Set();
  for (const r of rows) {
    if (typeof r.label !== 'string' || !r.label || labels.has(r.label)) throw new HttpError(400, 'Row labels must be unique');
    labels.add(r.label);
    if (!Number.isInteger(r.cols) || r.cols < 1 || r.cols > 40) throw new HttpError(400, `Row ${r.label}: cols must be 1-40`);
    if (typeof r.category !== 'string' || !r.category) throw new HttpError(400, `Row ${r.label}: category required`);
    if (r.gaps && !(Array.isArray(r.gaps) && r.gaps.every((g) => Number.isInteger(g) && g >= 1 && g <= r.cols)))
      throw new HttpError(400, `Row ${r.label}: bad gaps`);
    r.category = r.category.toUpperCase();
    cats.add(r.category);
  }
  return [...cats];
}

// Expand a layout template into one record per seat for a given show.
export function seatsFromLayout(layout, prices, showId) {
  const out = [];
  for (const r of layout.rows) {
    const gaps = new Set(r.gaps || []);
    for (let c = 1; c <= r.cols; c++) {
      if (gaps.has(c)) continue;
      out.push({ showId, row: r.label, number: c, category: r.category, price: prices[r.category] });
    }
  }
  return out;
}
