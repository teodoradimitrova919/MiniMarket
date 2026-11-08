const dates = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dates.format(date);
}
