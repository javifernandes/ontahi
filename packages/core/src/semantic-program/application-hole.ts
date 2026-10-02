export type ApplicationHole = {
  readonly kind: 'hole';
  readonly id: string;
};

export const applicationHole = (id: string): ApplicationHole => {
  if (id.length === 0) throw new Error('Application Hole id must not be empty.');
  return { kind: 'hole', id };
};

export const isApplicationHole = (value: unknown): value is ApplicationHole =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'hole' &&
  'id' in value &&
  typeof value.id === 'string' &&
  value.id.length > 0;
