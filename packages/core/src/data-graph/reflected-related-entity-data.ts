import { Effect } from 'effect';

import type { AnyEntityDefinition } from './definitions.js';
import {
  describeReflectedEntityDisplay,
  type ReflectedRelatedEntityDataReader,
} from './reflection.js';
import { createRuntimeBoundDataGraphApi } from './runtime-bound-api.js';
import type { DataGraphExecutionRuntime } from './runtime.js';
import { Selection } from './selection-value.js';

const reflectedPageSizeOptions = [1, 10, 25, 50, 100] as const;

export const createRuntimeReflectedRelatedEntityDataReader = ({
  createRuntime,
  getEntities,
}: {
  createRuntime: () => DataGraphExecutionRuntime<any, any, any, any>;
  getEntities: () => readonly AnyEntityDefinition[];
}): ReflectedRelatedEntityDataReader => ({
  readRelatedEntityData: async query => {
    const entities = getEntities();
    const sourceEntity = entities.find(entity => entity.name === query.sourceEntityName);
    const targetEntity = entities.find(entity => entity.name === query.targetEntityName);
    if (!sourceEntity || query.source.entityName !== sourceEntity.name) {
      throw new Error(`Unknown graph Entity: ${query.sourceEntityName}`);
    }
    if (!targetEntity) throw new Error(`Unknown graph Entity: ${query.targetEntityName}`);

    const graph = createRuntimeBoundDataGraphApi(createRuntime);
    const source = graph.bindSelection(Selection.references(sourceEntity, [query.source as never]));
    const target = graph.bindSelectionEntity(targetEntity);
    const through = query.relationName.split('.').at(-1) ?? query.relationName;
    const rows = (await Effect.runPromise(
      target.relatedTo(source as never, { through }).resolveEntityRows(),
    )) as Array<Record<string, unknown>>;
    const page = Number.isInteger(query.page) && query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      reflectedPageSizeOptions.find(option => option === query.pageSize) ??
      reflectedPageSizeOptions[2];
    const offset = (page - 1) * pageSize;
    const pageRows = rows.slice(offset, offset + pageSize);

    return {
      entityName: targetEntity.name,
      columns: Object.entries(targetEntity.fields).map(([field, definition]) => ({
        field,
        type: definition.fieldType,
        ...(definition.valueType ? { valueType: definition.valueType } : {}),
        nullable: Boolean(definition.nullable),
      })),
      display: describeReflectedEntityDisplay(targetEntity),
      rows: pageRows,
      page,
      pageSize,
      totalCount: rows.length,
      hasPreviousPage: page > 1,
      hasNextPage: offset + pageRows.length < rows.length,
    };
  },
});
