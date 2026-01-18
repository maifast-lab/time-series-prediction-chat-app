/**
 * Formats a number to preserve exact precision.
 * - If integer: returns integer string (e.g. "100")
 * - If float: returns full float string (e.g. "100.1235")
 */
export function formatValue(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toString();
}
