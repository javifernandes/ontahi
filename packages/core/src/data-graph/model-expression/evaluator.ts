import { entityRefsEqual, isEntityRef, type AnyEntityRef } from '../ref/index.js';

import type {
  ModelExpression,
  ModelExpressionDependency,
  ModelExpressionProgram,
} from './program.js';

export type ModelExpressionEvaluationContext = {
  inputs?: Readonly<Record<string, unknown>>;
  fields?: Readonly<Record<string, unknown>>;
  relationAggregates?: Readonly<Record<string, { count?: number }>>;
};

export type ModelExpressionEvaluation =
  | { status: 'value'; value: unknown }
  | { status: 'unknown'; missing: readonly ModelExpressionDependency[] };

type NodeEvaluation =
  | { status: 'value'; value: unknown }
  | { status: 'unknown'; missing: ModelExpressionDependency[] };

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const portableRef = (value: unknown): AnyEntityRef | undefined => {
  if (isEntityRef(value)) return value;
  if (value && typeof value === 'object' && 'ref' in value && isEntityRef(value.ref)) {
    return value.ref;
  }
  return undefined;
};

const mergeMissing = (...groups: readonly ModelExpressionDependency[][]) => {
  const seen = new Set<string>();
  return groups.flatMap(group =>
    group.filter(dependency => {
      const key = JSON.stringify(dependency);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
};

const numericValue = (value: unknown, expression: ModelExpression) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Model expression ${expression.kind} expected a finite number.`);
  }
  return value;
};

const booleanValue = (value: unknown, expression: ModelExpression) => {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Model expression ${expression.kind} expected a boolean.`);
  }
  return value;
};

const evaluateNode = (
  expression: ModelExpression,
  context: ModelExpressionEvaluationContext,
): NodeEvaluation => {
  switch (expression.kind) {
    case 'field':
      return context.fields && hasOwn(context.fields, expression.field)
        ? { status: 'value', value: context.fields[expression.field] }
        : { status: 'unknown', missing: [{ kind: 'field', field: expression.field }] };
    case 'input-ref': {
      const input = context.inputs?.[expression.input];
      const ref = portableRef(input);
      return ref
        ? { status: 'value', value: ref }
        : { status: 'unknown', missing: [{ kind: 'input-ref', input: expression.input }] };
    }
    case 'relation-aggregate': {
      const value = context.relationAggregates?.[expression.relation]?.[expression.aggregate];
      return typeof value === 'number'
        ? { status: 'value', value }
        : {
            status: 'unknown',
            missing: [
              {
                kind: 'relation-aggregate',
                relation: expression.relation,
                aggregate: expression.aggregate,
              },
            ],
          };
    }
    case 'arithmetic':
    case 'compare':
    case 'ref-identity': {
      const left = evaluateNode(expression.left, context);
      const right = evaluateNode(expression.right, context);
      if (left.status === 'unknown' || right.status === 'unknown') {
        return {
          status: 'unknown',
          missing: mergeMissing(
            left.status === 'unknown' ? left.missing : [],
            right.status === 'unknown' ? right.missing : [],
          ),
        };
      }
      if (expression.kind === 'arithmetic') {
        return {
          status: 'value',
          value:
            numericValue(left.value, expression.left) - numericValue(right.value, expression.right),
        };
      }
      if (expression.kind === 'compare') {
        return {
          status: 'value',
          value:
            numericValue(left.value, expression.left) <=
            numericValue(right.value, expression.right),
        };
      }
      const leftRef = portableRef(left.value);
      const rightRef = portableRef(right.value);
      if (!leftRef || !rightRef) {
        throw new TypeError('Model Ref identity comparison requires two portable Entity Refs.');
      }
      return { status: 'value', value: entityRefsEqual(leftRef, rightRef) };
    }
    case 'not': {
      const operand = evaluateNode(expression.operand, context);
      return operand.status === 'unknown'
        ? operand
        : {
            status: 'value',
            value: !booleanValue(operand.value, expression.operand),
          };
    }
  }
};

export const evaluateModelExpression = (
  program: ModelExpressionProgram,
  context: ModelExpressionEvaluationContext,
): ModelExpressionEvaluation => evaluateNode(program.expression, context);
