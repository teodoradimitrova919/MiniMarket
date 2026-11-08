export function serviceError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

export function databaseError(error, action, messages = {}) {
  const code = error?.code || 'REQUEST_FAILED';
  const defaults = {
    '23505': 'This record already exists.',
    '23503': 'A related record is missing or still in use.',
    '23514': 'The supplied values do not meet the database requirements.',
    '23502': 'A required value is missing.',
    '42501': 'You do not have permission to perform this action.',
    PGRST301: 'Your session is invalid. Please sign in again.',
  };
  return serviceError(`${action}: ${messages[code] || defaults[code] || 'The request failed. Please try again.'}`, code, error);
}

export async function runQuery(query, action, messages) {
  let response;
  try {
    response = await query;
  } catch (error) {
    throw databaseError(error, action, messages);
  }
  if (response.error) throw databaseError(response.error, action, messages);
  return response.data;
}

export function requireRecord(record, label) {
  if (!record) throw serviceError(`${label} was not found or you do not have permission to change it.`, 'NOT_FOUND_OR_FORBIDDEN');
  return record;
}
