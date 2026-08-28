import {
  type AnyEntityDefinition,
  getEntityMapping,
  isDerivedFieldDefinition,
  isReferenceFieldDefinition,
  mapEntity,
  mapRelation,
  resolveHasManyTargetField,
} from './definitions.js';
import { getEntityReferenceIdentity } from './reference-field.js';

export type DataGraphMappingNaming = {
  table: (entityName: string) => string;
  column: (fieldName: string) => string;
};

export type DataGraphMappingOverrides = Record<
  string,
  {
    table?: string;
    columns?: Record<string, string>;
  }
>;

export type ApplyConventionalDataGraphMappingsOptions = {
  entities: readonly AnyEntityDefinition[];
  naming: DataGraphMappingNaming;
  overrides?: DataGraphMappingOverrides;
};

const resolveTargetIdentityField = (target: AnyEntityDefinition) => {
  const identityName = target.identityLocatorName;
  const identity = identityName ? target.refLocators[identityName] : undefined;
  if (identity?.fields?.length === 1) return identity.fields[0]!;
  return 'id' in target.fields ? 'id' : undefined;
};

export const applyConventionalDataGraphMappings = ({
  entities,
  naming,
  overrides = {},
}: ApplyConventionalDataGraphMappingsOptions) => {
  entities.forEach(entity => {
    const override = overrides[entity.name];
    mapEntity(entity).toTable(
      override?.table ?? naming.table(entity.name),
      Object.fromEntries(
        Object.entries(entity.fields)
          .filter(([, fieldDefinition]) => !isDerivedFieldDefinition(fieldDefinition))
          .map(([fieldName, fieldDefinition]) => [
            fieldName,
            override?.columns?.[fieldName] ??
              naming.column(
                isReferenceFieldDefinition(fieldDefinition)
                  ? fieldName.endsWith('Id')
                    ? fieldName
                    : `${fieldName}Id`
                  : fieldName,
              ),
          ]),
      ),
    );

    Object.values(entity.fields)
      .filter(isReferenceFieldDefinition)
      .forEach(referenceField => getEntityReferenceIdentity(referenceField.target));
  });

  entities.forEach(entity => {
    Object.entries(entity.relations).forEach(([relationName, relation]) => {
      if (relation.relationKind === 'hasMany') {
        const sourceIdentityField = resolveTargetIdentityField(entity);
        if (!sourceIdentityField) return;
        const targetField = resolveHasManyTargetField(entity, relation);
        if (!targetField) return;
        const sourceMapping = getEntityMapping(entity);
        const targetMapping = getEntityMapping(relation.target);
        mapRelation(entity, relationName, {
          type: 'one-to-many',
          from: `${sourceMapping.tableName}.${sourceMapping.columns[sourceIdentityField]}`,
          to: `${targetMapping.tableName}.${targetMapping.columns[targetField]}`,
        });
        return;
      }

      if (!relation.sourceField) return;
      const targetIdentityField = resolveTargetIdentityField(relation.target);
      if (!targetIdentityField) {
        throw new Error(
          `Cannot infer ${entity.name}.${relationName}: target ${relation.target.name} has no single-field identity.`,
        );
      }

      const sourceMapping = getEntityMapping(entity);
      const targetMapping = getEntityMapping(relation.target);
      mapRelation(entity, relationName, {
        type: 'many-to-one',
        from: `${sourceMapping.tableName}.${sourceMapping.columns[relation.sourceField]}`,
        to: `${targetMapping.tableName}.${targetMapping.columns[targetIdentityField]}`,
      });
    });
  });
};
