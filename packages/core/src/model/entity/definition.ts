import type { RelationDefinition, RelationKind } from '../relation/definition.js';

import type { FieldDefinitions } from './field.js';
import type { EntityDisplayDescriptor, EntityFreshnessDescriptor } from './metadata.js';
import type { EntityRefLocatorDeclarations } from './ref/model.js';

export type EntityMapping<TFields extends FieldDefinitions> = {
  tableName: string;
  fieldColumns: Partial<Record<keyof TFields & string, string>>;
};

export type AnyEntityDefinition = {
  kind: 'entity';
  name: string;
  fields: FieldDefinitions;
  __value?: Record<string, unknown>;
  relations: Record<string, RelationDefinition<RelationKind, any>>;
  refLocators: EntityRefLocatorDeclarations;
  identityLocatorName?: string;
  displayMetadata?: EntityDisplayDescriptor;
  freshnessMetadata?: EntityFreshnessDescriptor;
  mapping?: EntityMapping<any>;
};

export type EntityRefLocators<TEntity extends AnyEntityDefinition> = TEntity['refLocators'];
