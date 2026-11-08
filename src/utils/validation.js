function invalid(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  throw error;
}

export function validateText(value, label) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`);
  return value.trim();
}

export function validateId(value, label = 'ID') {
  const id = validateText(value, label);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    invalid(`${label} must be a valid UUID.`);
  }
  return id;
}

export function validatePrice(value) {
  if (!['number', 'string'].includes(typeof value)) invalid('Price must be a non-negative number.');
  const text = String(value).trim();
  // Match numeric(12,2); reject empty values, coercion, NaN, and silent rounding.
  if (!/^\d+(\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) > 9999999999.99) {
    invalid('Price must be between 0 and 9,999,999,999.99 with at most two decimal places.');
  }
  return Number(text);
}

function optionalText(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string') invalid(`${label} must be text.`);
  return value.trim() || null;
}

export function validateListing(data, { partial = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('Listing data is required.');
  const result = {};
  const fields = {
    title: (value) => validateText(value, 'Title'),
    category_id: (value) => validateId(value, 'Category selection'),
    price: validatePrice,
    description: (value) => optionalText(value, 'Description'),
    image_url: (value) => optionalText(value, 'Image URL'),
  };
  for (const [field, validate] of Object.entries(fields)) {
    if (Object.hasOwn(data, field)) result[field] = validate(data[field]);
    else if (!partial && ['title', 'category_id', 'price'].includes(field)) validate(undefined);
  }
  if (!Object.keys(result).length) invalid('Provide at least one editable listing field.');
  // IDs, owner_id, timestamps, and unknown fields never enter the write payload.
  return result;
}
