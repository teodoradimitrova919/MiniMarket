const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function formatPrice(value) {
  return euros.format(Number(value));
}
