// Data services publish outcomes without importing Bootstrap or rendering UI.
export const FEEDBACK_EVENT = 'minimarket:operation-feedback';
const reportedErrors = new WeakSet();
export function wasReported(error) {
  return error !== null && typeof error === 'object' && reportedErrors.has(error);
}
export function markReported(error) {
  if (error !== null && typeof error === 'object') reportedErrors.add(error);
}

export async function notifyMutation(operation, { success, error: fallback, errors = {} }) {
  function publish(type, message) {
    if (message && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail: { type, message } }));
    }
  }
  try {
    const result = await operation();
    publish('success', typeof success === 'function' ? success(result) : success);
    return result;
  } catch (error) {
    // Validation belongs at the form. Re-throw the same error for normal callers.
    if (error?.code !== 'VALIDATION_ERROR' && !wasReported(error) && typeof window !== 'undefined') {
      const common = {
        AUTH_REQUIRED: 'Please sign in to continue.',
        '42501': 'You do not have permission to perform this action.',
        NOT_FOUND_OR_FORBIDDEN: 'This item is unavailable or you do not have permission to change it.',
      };
      markReported(error);
      publish('error', errors[error?.code] || common[error?.code] || fallback);
    }
    throw error;
  }
}
