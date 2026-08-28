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

type BinaryOperands =
  | { status: 'value'; left: unknown; right: unknown }
  | { status: 'unknown'; missing: ModelExpressionDependency[] };

const evaluateOperands = (
  expression: Extract<ModelExpression, { left: ModelExpression; right: ModelExpression }>,
  context: ModelExpressionEvaluationContext,
): BinaryOperands => {
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
  return { status: 'value', left: left.value, right: right.value };
};

const evaluateArithmetic = (
  expression: Extract<ModelExpression, { kind: 'arithmetic' }>,
  context: ModelExpressionEvaluationContext,
): NodeEvaluation => {
  const operands = evaluateOperands(expression, context);
  return operands.status === 'unknown'
    ? operands
    : {
        status: 'value',
        value:
          numericValue(operands.left, expression.left) -
          numericValue(operands.right, expression.right),
      };
};

const evaluateComparison = (
  expression: Extract<ModelExpression, { kind: 'compare' }>,
  context: ModelExpressionEvaluationContext,
): NodeEvaluation => {
  const operands = evaluateOperands(expression, context);
  return operands.status === 'unknown'
    ? operands
    : {
        status: 'value',
        value:
          numericValue(operands.left, expression.left) <=
          numericValue(operands.right, expression.right),
      };
};

const evaluateRefIdentity = (
  expression: Extract<ModelExpression, { kind: 'ref-identity' }>,
  context: ModelExpressionEvaluationContext,
): NodeEvaluation => {
  const operands = evaluateOperands(expression, context);
  if (operands.status === 'unknown') return operands;
  const leftRef = portableRef(operands.left);
  const rightRef = portableRef(operands.right);
  if (!leftRef || !rightRef) {
    throw new TypeError('Model Ref identity comparison requires two portable Entity Refs.');
  }
  return { status: 'value', value: entityRefsEqual(leftRef, rightRef) };
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
      return evaluateArithmetic(expression, context);
    case 'compare':
      return evaluateComparison(expression, context);
    case 'ref-identity':
      return evaluateRefIdentity(expression, context);
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
