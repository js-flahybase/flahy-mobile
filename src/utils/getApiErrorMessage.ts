/**
 * User-facing text from common API error shapes (Axios error.response.data):
 * - { message: string }
 * - { error: string }
 * - { errors: [{ message: string }] }
 * - { errors: string[] }
 * - { errors: { field: string[] } } (Laravel-style)
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const err = error as {
    message?: string;
    response?: { data?: unknown };
  };
  const data = err?.response?.data as Record<string, unknown> | undefined;

  if (!data || typeof data !== 'object') {
    const m = err?.message;
    return typeof m === 'string' && m.trim() ? m.trim() : fallback;
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  const errors = data.errors;
  if (Array.isArray(errors)) {
    const parts = errors
      .map((e: unknown) => {
        if (typeof e === 'string') return e.trim();
        if (e && typeof e === 'object' && 'message' in e) {
          const m = (e as { message?: unknown }).message;
          return typeof m === 'string' ? m.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }

  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const parts = Object.values(errors as Record<string, unknown>)
      .flat()
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }

  return fallback;
}
