const sensitiveDiagnosticKey =
  /authorization|cookie|credential|password|secret|^(?:access|api|auth|refresh)?token$/i;

export const redactTodoDiagnosticValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactTodoDiagnosticValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveDiagnosticKey.test(key) ? '[redacted]' : redactTodoDiagnosticValue(item),
    ]),
  );
};
