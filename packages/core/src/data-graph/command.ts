import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import type { SelectionExpression } from './selection-ast.js';

export type GraphCommandOperation = 'insert' | 'insert_many' | 'upsert' | 'update' | 'delete';

export type GraphUpsertOptions<TEntity extends AnyEntityDefinition = AnyEntityDefinition> = {
  conflictOn: readonly (keyof InferEntityRecord<TEntity['fields']> & string)[];
  strategy: 'ignore' | 'merge';
};

export type GraphCommandSpec<
  TEntity extends AnyEntityDefinition = AnyEntityDefinition,
  TPayload = unknown,
  TResult = void,
> = {
  kind: 'command';
  name?: string;
  operation: GraphCommandOperation;
  root: TEntity;
  selection: SelectionExpression;
  payload?: TPayload;
  upsert?: GraphUpsertOptions<TEntity>;
  returning?: readonly (keyof InferEntityRecord<TEntity['fields']> & string)[];
  cardinality?: 'one' | 'many';
};

export class GraphCommand<TEntity extends AnyEntityDefinition, TPayload = unknown, TResult = void> {
  constructor(protected readonly spec: GraphCommandSpec<TEntity, TPayload, TResult>) {}

  named(name: string): this {
    return new GraphCommand({
      ...this.spec,
      name,
    }) as this;
  }

  build(): GraphCommandSpec<TEntity, TPayload, TResult> {
    return this.spec;
  }

  pipe<TValue>(fn: (command: this) => TValue): TValue {
    return fn(this);
  }
}
