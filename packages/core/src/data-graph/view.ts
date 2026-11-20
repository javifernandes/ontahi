import type {
  EntityViewShape,
  InferEntityViewShapeFromParts,
  RecursiveEntityViewDefinition,
} from '../model/query/view.js';

import type {
  AnyEntityDefinition,
  EntityViewConfig,
  EntityViewDefinition,
  FieldDefinitions,
  GraphSchemaFields,
  RelationDefinition,
  RelationKind,
} from './definitions.js';

export * from '../model/query/view.js';

export interface EntityViewFactory<
  TEntity extends AnyEntityDefinition,
  TFields extends FieldDefinitions = TEntity['fields'],
  TRelations extends Record<string, RelationDefinition<RelationKind, any>> = TEntity['relations'],
> {
  <TViewName extends string, const TShape extends EntityViewShape<TEntity>>(
    viewName: TViewName,
    shape: TShape,
  ): RecursiveEntityViewDefinition<
    TEntity,
    TShape,
    InferEntityViewShapeFromParts<TFields, TRelations, TShape>
  >;
  <
    TViewName extends string,
    TViewFields extends GraphSchemaFields = {},
    TOmit extends readonly (keyof TEntity['fields'] & string)[] = readonly [],
  >(
    viewName: TViewName,
    config?: EntityViewConfig<TEntity, TViewFields, TOmit>,
  ): EntityViewDefinition<TEntity, TViewName, TViewFields, TOmit>;
}
