import type { GraphJsonSchema } from '../../data-graph/index.js';
import { isRecord } from '../../value/object.js';

/** Restrict generated refs and selections to concrete values disclosed in this request.
 * This is decoding guidance; canonical validation and fresh scope checks remain mandatory.
 */
export const createModelContextSchema = (context: unknown) => {
  const values = new Map<string, unknown[]>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || visited.has(value)) return;
    visited.add(value);
    if (
      isRecord(value) &&
      (value.kind === 'entity-ref' || value.kind === 'selection') &&
      typeof value.entityName === 'string'
    ) {
      const key = `${value.kind}:${value.entityName}`;
      const existing = values.get(key) ?? [];
      if (!existing.some(candidate => JSON.stringify(candidate) === JSON.stringify(value)))
        existing.push(value);
      values.set(key, existing);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(context);
  const project = (schema: GraphJsonSchema): GraphJsonSchema => {
    const ref = schema['x-ontahi-entity-ref'];
    const selection = schema['x-ontahi-selection'];
    const candidates = ref
      ? values.get(`entity-ref:${ref.entityName}`)
      : selection
        ? values.get(`selection:${selection.entityName}`)
        : undefined;
    if (candidates?.length) return { enum: candidates };
    return {
      ...schema,
      ...(schema.properties
        ? {
            properties: Object.fromEntries(
              Object.entries(schema.properties).map(([key, value]) => [key, project(value)]),
            ),
          }
        : {}),
      ...(schema.items ? { items: project(schema.items) } : {}),
      ...(schema.anyOf ? { anyOf: schema.anyOf.map(project) } : {}),
      ...(schema.$defs
        ? {
            $defs: Object.fromEntries(
              Object.entries(schema.$defs).map(([key, value]) => [key, project(value)]),
            ),
          }
        : {}),
    };
  };
  return project;
};
