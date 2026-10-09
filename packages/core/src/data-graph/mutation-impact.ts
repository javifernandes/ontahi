import { hasOwn } from '../value/object.js';

import type { GraphCommandRequest } from './command-protocol.js';
import type { EntityMutationCommand } from './entity-mutation-command.js';
import type { GraphReadRequest } from './read-protocol.js';
import { entityRefsEqual, isEntityRef, type AnyEntityRef } from './ref/index.js';
import type { SelectionAst, SelectionExpression, SelectionPredicate } from './selection-ast.js';
import type { EntityViewAst, ViewNode } from './view.js';

export type CommittedMutationProvenance = 'captured' | 'declared' | 'conservative';

export type CommittedMutation = {
  readonly command: GraphCommandRequest;
  readonly provenance: CommittedMutationProvenance;
};

export type CommittedMutationSet = {
  readonly mutations: readonly CommittedMutation[];
  readonly precision: 'exact' | 'intensional' | 'widened';
};

const isPrimitive = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const areDefinitelyDifferent = (left: unknown, right: unknown): boolean => {
  if (isEntityRef(left) && isEntityRef(right)) return !entityRefsEqual(left, right);
  return isPrimitive(left) && isPrimitive(right) && !Object.is(left, right);
};

const equalityPredicate = (
  expression: SelectionExpression,
): Extract<SelectionPredicate, { operator: 'eq' }> | undefined =>
  expression.kind === 'predicate' && expression.operator === 'eq' ? expression : undefined;

const refConflictsWithPredicate = (
  ref: AnyEntityRef,
  predicate: Extract<SelectionPredicate, { operator: 'eq' }>,
): boolean =>
  hasOwn(ref.locator, predicate.fieldName) &&
  areDefinitelyDifferent(ref.locator[predicate.fieldName], predicate.value);

const conjunctionTerms = (expression: SelectionExpression): readonly SelectionExpression[] =>
  expression.kind === 'and' ? expression.operands.flatMap(conjunctionTerms) : [expression];

const conjunctionIsEmpty = (left: SelectionExpression, right: SelectionExpression): boolean => {
  const terms = [...conjunctionTerms(left), ...conjunctionTerms(right)];

  for (let leftIndex = 0; leftIndex < terms.length; leftIndex += 1) {
    const leftTerm = terms[leftIndex]!;
    const leftPredicate = equalityPredicate(leftTerm);

    for (let rightIndex = leftIndex + 1; rightIndex < terms.length; rightIndex += 1) {
      const rightTerm = terms[rightIndex]!;
      const rightPredicate = equalityPredicate(rightTerm);

      if (
        leftPredicate &&
        rightPredicate &&
        leftPredicate.fieldName === rightPredicate.fieldName &&
        areDefinitelyDifferent(leftPredicate.value, rightPredicate.value)
      ) {
        return true;
      }

      if (
        leftTerm.kind === 'references' &&
        rightPredicate &&
        leftTerm.refs.every(ref => refConflictsWithPredicate(ref, rightPredicate))
      ) {
        return true;
      }

      if (
        rightTerm.kind === 'references' &&
        leftPredicate &&
        rightTerm.refs.every(ref => refConflictsWithPredicate(ref, leftPredicate))
      ) {
        return true;
      }
    }
  }

  return false;
};

const expressionsAreProvablyDisjoint = (
  left: SelectionExpression,
  right: SelectionExpression,
): boolean => {
  if (left.kind === 'none' || right.kind === 'none') return true;
  if (left.kind === 'references' && left.refs.length === 0) return true;
  if (right.kind === 'references' && right.refs.length === 0) return true;

  if (left.kind === 'or') {
    return left.operands.every(operand => expressionsAreProvablyDisjoint(operand, right));
  }
  if (right.kind === 'or') {
    return right.operands.every(operand => expressionsAreProvablyDisjoint(left, operand));
  }

  if (left.kind === 'references' && right.kind === 'references') {
    return left.refs.every(leftRef =>
      right.refs.every(rightRef => !entityRefsEqual(leftRef, rightRef)),
    );
  }

  return conjunctionIsEmpty(left, right);
};

const entityMutationSelection = (command: EntityMutationCommand): SelectionAst => {
  if (command.action === 'create') {
    return {
      kind: 'selection',
      entityName: command.entityName,
      expression: {
        kind: 'and',
        operands: Object.entries(command.values).map(([fieldName, value]) => ({
          kind: 'predicate',
          operator: 'eq',
          fieldName,
          value,
        })),
      },
    };
  }

  return isEntityRef(command.target)
    ? {
        kind: 'selection',
        entityName: command.target.entityName,
        expression: { kind: 'references', refs: [command.target] },
      }
    : command.target;
};

const collectSelectionEntityNames = (selection: SelectionAst, names: Set<string>): void => {
  names.add(selection.entityName);

  const visit = (expression: SelectionExpression): void => {
    if (expression.kind === 'relation-image') {
      collectSelectionEntityNames(expression.source, names);
      return;
    }
    if (expression.kind === 'and' || expression.kind === 'or') {
      expression.operands.forEach(visit);
      return;
    }
    if (expression.kind === 'not') visit(expression.operand);
  };

  visit(selection.expression);
};

const collectViewEntityNames = (node: EntityViewAst | ViewNode, names: Set<string>): void => {
  names.add(node.entity);
  Object.values(node.fields).forEach(field => {
    if (field.kind === 'relation-view') collectViewEntityNames(field.view, names);
  });
};

const readEntityNames = (read: GraphReadRequest): ReadonlySet<string> => {
  const names = new Set<string>();
  collectSelectionEntityNames(read.selection, names);
  if (read.view) collectViewEntityNames(read.view, names);
  return names;
};

const collectPredicateFieldNames = (
  expression: SelectionExpression,
  names: Set<string>,
): boolean => {
  if (expression.kind === 'predicate') {
    names.add(expression.fieldName);
    return true;
  }
  if (expression.kind === 'all' || expression.kind === 'none' || expression.kind === 'references') {
    if (expression.kind === 'references') {
      expression.refs.forEach(ref => Object.keys(ref.locator).forEach(name => names.add(name)));
    }
    return true;
  }
  if (expression.kind === 'and' || expression.kind === 'or') {
    return expression.operands.every(operand => collectPredicateFieldNames(operand, names));
  }
  return false;
};

const updateTouchesReadDependency = (
  command: Extract<EntityMutationCommand, { action: 'update' }>,
  read: GraphReadRequest,
): boolean => {
  if (read.mode !== 'count') return true;

  const dependencyFields = new Set<string>();
  if (!collectPredicateFieldNames(read.selection.expression, dependencyFields)) return true;
  return Object.keys(command.values).some(fieldName => dependencyFields.has(fieldName));
};

/**
 * Returns false only when the mutation and Read can be proven disjoint from their canonical forms.
 * Unsupported command, Selection, and dependency shapes conservatively return true.
 */
export const mayAffectGraphRead = (
  mutation: CommittedMutation,
  read: GraphReadRequest,
): boolean => {
  const command = mutation.command.command;
  if (command.kind !== 'entity-mutation-command') return true;
  if (!readEntityNames(read).has(command.entityName)) return false;

  if (read.selection.entityName !== command.entityName) return true;

  const mutationSelection = entityMutationSelection(command);
  if (expressionsAreProvablyDisjoint(mutationSelection.expression, read.selection.expression)) {
    return false;
  }

  return command.action !== 'update' || updateTouchesReadDependency(command, read);
};
