import type { AnyEntityDefinition } from '../model/entity/definition.js';
import { isDerivedFieldDefinition } from '../model/entity/field.js';
import { getEntityIdentityLocator } from '../model/entity/ref/identity.js';
import type { RelationDefinition, RelationKind } from '../model/relation/definition.js';

export const mapEntity = <TEntity extends AnyEntityDefinition>(entityDefinition: TEntity) => ({
  toTable: (
    tableName: string,
    fieldColumns: Partial<Record<keyof TEntity['fields'] & string, string>> = {},
  ) => {
    entityDefinition.mapping = {
      tableName,
      fieldColumns,
    };
    return entityDefinition;
  },
});

const parseTableColumnPath = (path: string) => {
  const [tableName, columnName] = path.split('.');
  if (!tableName || !columnName) {
    throw new Error(`Invalid relation mapping path: ${path}`);
  }

  return { tableName, columnName };
};

export const mapRelation = <TEntity extends AnyEntityDefinition>(
  entityDefinition: TEntity,
  relationName: keyof TEntity['relations'] & string,
  input:
    | {
        type: 'one-to-many' | 'many-to-one';
        from: string;
        to: string;
        orderBy?: string;
      }
    | {
        type: 'many-to-many';
        from: string;
        through: { table: string; fromColumn: string; toColumn: string };
        to: string;
      },
) => {
  const relation = entityDefinition.relations[relationName];
  if (!relation) {
    throw new Error(`Unknown relation ${relationName} on entity ${entityDefinition.name}`);
  }

  const from = parseTableColumnPath(input.from);
  const to = parseTableColumnPath(input.to);
  if (input.type === 'many-to-many') {
    if (relation.relationKind !== 'manyToMany') {
      throw new Error(
        `Relation ${entityDefinition.name}.${relationName} is not declared many-to-many.`,
      );
    }
    if (!input.through.table || !input.through.fromColumn || !input.through.toColumn) {
      throw new Error(`Many-to-many relation ${relationName} requires complete through mapping.`);
    }
    relation.mapping = {
      type: input.type,
      fromTable: from.tableName,
      fromColumn: from.columnName,
      throughTable: input.through.table,
      throughFromColumn: input.through.fromColumn,
      throughToColumn: input.through.toColumn,
      toTable: to.tableName,
      toColumn: to.columnName,
    };
  } else {
    if (relation.relationKind === 'manyToMany') {
      throw new Error(
        `Relation ${entityDefinition.name}.${relationName} requires a many-to-many mapping.`,
      );
    }
    if (Boolean(relation.ordered) !== Boolean(input.orderBy)) {
      throw new Error(
        relation.ordered
          ? `Ordered Relation ${entityDefinition.name}.${relationName} requires an orderBy mapping.`
          : `Unordered Relation ${entityDefinition.name}.${relationName} cannot declare an orderBy mapping.`,
      );
    }
    const order = input.orderBy ? parseTableColumnPath(input.orderBy) : undefined;
    if (order && order.tableName !== getEntityMapping(relation.target).tableName) {
      throw new Error(
        `Ordered Relation ${entityDefinition.name}.${relationName} position must be stored on ${getEntityMapping(relation.target).tableName}.`,
      );
    }
    relation.mapping = {
      type: input.type,
      fromTable: from.tableName,
      fromColumn: from.columnName,
      toTable: to.tableName,
      toColumn: to.columnName,
      ...(order ? { orderColumn: order.columnName } : {}),
    };
  }

  return relation;
};

export const resolveColumnNameForEntity = (
  entityDefinition: AnyEntityDefinition,
  fieldName: string,
) => entityDefinition.mapping?.fieldColumns[fieldName] ?? fieldName;

export const resolveFieldNameForEntity = (
  entityDefinition: AnyEntityDefinition,
  columnName: string,
) => {
  const explicitField = Object.entries(entityDefinition.mapping?.fieldColumns ?? {}).find(
    ([, mappedColumnName]) => mappedColumnName === columnName,
  )?.[0];

  return explicitField ?? columnName;
};

export const getEntityMapping = (entityDefinition: AnyEntityDefinition) => ({
  tableName: entityDefinition.mapping?.tableName ?? entityDefinition.name,
  columns: Object.fromEntries(
    Object.entries(entityDefinition.fields)
      .filter(([, fieldDefinition]) => !isDerivedFieldDefinition(fieldDefinition))
      .map(([fieldName]) => [fieldName, resolveColumnNameForEntity(entityDefinition, fieldName)]),
  ),
});

export const resolveHasManyTargetField = (
  sourceEntity: AnyEntityDefinition,
  relation: RelationDefinition,
): string | undefined => {
  if (relation.relationKind !== 'hasMany') return undefined;
  if (relation.targetField) return relation.targetField;

  const sourceMapping = getEntityMapping(sourceEntity);
  const targetMapping = getEntityMapping(relation.target);
  if (relation.mapping) {
    if (
      relation.mapping.fromTable === sourceMapping.tableName &&
      relation.mapping.toTable === targetMapping.tableName
    ) {
      const targetField = resolveFieldNameForEntity(relation.target, relation.mapping.toColumn);
      if (targetField in relation.target.fields) return targetField;
    }
    if (
      relation.mapping.toTable === sourceMapping.tableName &&
      relation.mapping.fromTable === targetMapping.tableName
    ) {
      const targetField = resolveFieldNameForEntity(relation.target, relation.mapping.fromColumn);
      if (targetField in relation.target.fields) return targetField;
    }
  }

  const candidates = [
    ...new Set(
      Object.values(relation.target.relations).flatMap(candidate => {
        if (candidate.relationKind !== 'belongsTo' || candidate.target.name !== sourceEntity.name) {
          return [];
        }
        const candidateFieldName = candidate.sourceField;
        return candidateFieldName && candidateFieldName in relation.target.fields
          ? [candidateFieldName]
          : [];
      }),
    ),
  ];
  return candidates.length === 1 ? candidates[0] : undefined;
};

export const resolveRelationFields = (
  sourceEntity: AnyEntityDefinition,
  relationName: string,
  relationNode: { entity: AnyEntityDefinition },
) => {
  const relationDefinition = sourceEntity.relations[relationName] as
    | RelationDefinition<RelationKind, AnyEntityDefinition>
    | undefined;
  if (!relationDefinition) {
    throw new Error(`Unknown relation ${sourceEntity.name}.${relationName}.`);
  }
  if (relationDefinition.relationKind === 'manyToMany') {
    throw new Error(
      `Many-to-many Relation ${sourceEntity.name}.${relationName} does not use direct Entity fields.`,
    );
  }

  const singleIdentityField = (entityDefinition: AnyEntityDefinition) => {
    const fields = getEntityIdentityLocator(entityDefinition)?.locator.fields;
    return fields?.length === 1 ? fields[0] : undefined;
  };
  const semanticFields =
    relationDefinition.relationKind === 'belongsTo'
      ? {
          sourceField: relationDefinition.sourceField,
          targetField: singleIdentityField(relationDefinition.target),
        }
      : {
          sourceField: singleIdentityField(sourceEntity),
          targetField: resolveHasManyTargetField(sourceEntity, relationDefinition),
        };

  if (semanticFields.sourceField && semanticFields.targetField) {
    return semanticFields as { sourceField: string; targetField: string };
  }

  const mapping = relationDefinition.mapping;

  if (!mapping) {
    throw new Error(`Relation ${sourceEntity.name}.${relationName} is missing mapping metadata.`);
  }

  const fromEntity =
    mapping.fromTable === getEntityMapping(sourceEntity).tableName
      ? sourceEntity
      : relationNode.entity;
  const toEntity = fromEntity === sourceEntity ? relationNode.entity : sourceEntity;

  return {
    sourceField: resolveFieldNameForEntity(fromEntity, mapping.fromColumn),
    targetField: resolveFieldNameForEntity(toEntity, mapping.toColumn),
  };
};
