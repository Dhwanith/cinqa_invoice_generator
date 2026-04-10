export function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return date;
}

export function getFinancialYearLabel(value) {
  const date = toDate(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

export function addDays(value, days) {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function formatDisplayDate(value) {
  const date = toDate(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}