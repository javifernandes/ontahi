import { hasOwn } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';
import type { SelectionExpression } from './selection-ast.js';

/** Resolve names from receiver-owned definitions, never from join metadata supplied in an AST. */
export const resolveSelectionRelation = (
  target: AnyEntityDefinition,
  image: Extract<SelectionExpression, { kind: 'relation-image' }>,
  entities: readonly AnyEntityDefinition[],
) => {
  const pending = [...entities, target];
  const seen = new Set<AnyEntityDefinition>();
  let source: AnyEntityDefinition | undefined;
  while (pending.length) {
    const entity = pending.pop()!;
    if (seen.has(entity)) continue;
    seen.add(entity);
    if (entity.name === image.source.entityName) {
      if (source && source !== entity)
        throw new TypeError(`Ambiguous Selection entity ${entity.name}.`);
      source = entity;
    }
    pending.push(...Object.values(entity.relations).map(relation => relation.target));
  }
  if (!source)
    throw new TypeError(
      `Unknown Selection source entity ${image.source.entityName}; provide its model definition.`,
    );
  const relation = hasOwn(source.relations, image.relationName)
    ? source.relations[image.relationName]
    : undefined;
  if (!relation || relation.target.name !== target.name) {
    throw new TypeError(
      `Relation ${source.name}.${image.relationName} does not target ${target.name}.`,
    );
  }
  return source;
};
