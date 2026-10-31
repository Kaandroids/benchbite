// Reading JSON whose shape is not known, as a model's output or a saved message's parts.

/** Whether a value is a JSON object, not null or an array. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
