import {
  isReferenceFieldDefinition,
  type AnyEntityDefinition,
  type AnyReferenceFieldDefinition,
} from './definitions.js';
import {
  createEntityRef,
  isEntityRef,
  isEntityRefLocatorValue,
  type EntityRefLocatorValue,
} from './ref.js';
import type { SelectionExpression } from './selection-ast.js';

export type EntityReferenceIdentity = {
  name: string;
  field: string;
};

export const getEntityReferenceIdentity = (
  target: AnyEntityDefinition,
): EntityReferenceIdentity => {
  if ((target as { kind?: string }).kind !== 'entity') {
    throw new Error('Cannot use an unresolved Entity reference at a storage boundary.');
  }
  const identityName = target.identityLocatorName;
  const identity = identityName ? target.refLocators[identityName] : undefined;

  if (!identityName || !identity?.fields || identity.fields.length !== 1) {
    throw new Error(
      `Cannot store a reference to ${target.name}: the target must have a single-field identity.`,
    );
  }

  return { name: identityName, field: identity.fields[0]! };
};

export const getEntityReferenceField = (
  entity: AnyEntityDefinition,
  fieldName: string,
): AnyReferenceFieldDefinition | undefined => {
  const definition = entity.fields[fieldName];
  return definition && isReferenceFieldDefinition(definition) ? definition : undefined;
};

export const lowerEntityReferenceValue = (
  field: AnyReferenceFieldDefinition,
  value: unknown,
): unknown => {
  if (value == null) return value;
  if (!isEntityRef(value) || value.entityName !== field.target.name) {
    throw new Error(`Expected a ${field.target.name} Ref.`);
  }

  const identity = getEntityReferenceIdentity(field.target);
  const identityValue = value.locator[identity.field];
  if (!isEntityRefLocatorValue(identityValue)) {
    throw new Error(
      `Cannot store ${field.target.name} Ref located by ${Object.keys(value.locator).join(', ') || 'no fields'}; ` +
        `the ${identity.name} locator (${identity.field}) is required.`,
    );
  }

  return identityValue;
};

export const liftEntityReferenceValue = (field: AnyReferenceFieldDefinition, value: unknown) => {
  if (value == null) return value;
  if (isEntityRef(value)) {
    if (value.entityName !== field.target.name) {
      throw new Error(`Expected a ${field.target.name} Ref, received ${value.entityName}.`);
    }
    return value;
  }
  if (!isEntityRefLocatorValue(value)) {
    throw new Error(`Cannot create a ${field.target.name} Ref from its stored value.`);
  }

  const identity = getEntityReferenceIdentity(field.target);
  return createEntityRef(field.target, { [identity.field]: value as EntityRefLocatorValue });
};

const mapEntityReferenceRecord = (
  entity: AnyEntityDefinition,
  record: Record<string, unknown>,
  map: (field: AnyReferenceFieldDefinition, value: unknown) => unknown,
) =>
  Object.fromEntries(
    Object.entries(record).map(([fieldName, value]) => {
      const field = getEntityReferenceField(entity, fieldName);
      return [fieldName, field ? map(field, value) : value];
    }),
  );

export const lowerEntityReferenceRecord = (
  entity: AnyEntityDefinition,
  record: Record<string, unknown>,
) => mapEntityReferenceRecord(entity, record, lowerEntityReferenceValue);

export const liftEntityReferenceRecord = (
  entity: AnyEntityDefinition,
  record: Record<string, unknown>,
) => mapEntityReferenceRecord(entity, record, liftEntityReferenceValue);

export const liftEntityReferenceFieldValues = (
  entity: AnyEntityDefinition,
  fieldName: string,
  values: readonly unknown[],
): readonly unknown[] => {
  const field = getEntityReferenceField(entity, fieldName);
  return field ? values.map(value => liftEntityReferenceValue(field, value)) : values;
};

export const normalizeEntityReferenceJoinValue = (
  entity: AnyEntityDefinition,
  fieldName: string,
  value: unknown,
): unknown => {
  const field = getEntityReferenceField(entity, fieldName);
  return field && isEntityRef(value) ? lowerEntityReferenceValue(field, value) : value;
};

export const lowerEntityReferenceSelection = (
  entity: AnyEntityDefinition,
  expression: SelectionExpression,
): SelectionExpression => {
  if (expression.kind === 'predicate') {
    const field = getEntityReferenceField(entity, expression.fieldName);
    if (!field || expression.operator === 'isNull') return expression;
    if (expression.operator === 'in') {
      return {
        ...expression,
        values: expression.values.map(value => lowerEntityReferenceValue(field, value)),
      };
    }
    if (expression.operator !== 'eq') {
      throw new Error(
        `Reference field ${entity.name}.${expression.fieldName} only supports eq, in, and isNull.`,
      );
    }
    return { ...expression, value: lowerEntityReferenceValue(field, expression.value) };
  }

  if (expression.kind === 'and' || expression.kind === 'or') {
    return {
      ...expression,
      operands: expression.operands.map(operand => lowerEntityReferenceSelection(entity, operand)),
    };
  }

  return expression.kind === 'not'
    ? { ...expression, operand: lowerEntityReferenceSelection(entity, expression.operand) }
    : expression;
};
