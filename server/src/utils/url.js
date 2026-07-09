export function normalizeOptionalUrl(value) {
  if (value == null || String(value).trim() === '') return null;
  const trimmed = String(value).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
