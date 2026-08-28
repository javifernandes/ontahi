import type {
  ExplicitOperationCondition,
  PortableOperationConditionRejection,
} from './condition.js';
import type { ModelExpression, ModelExpressionProgram } from './program.js';

type ModelRefBuilder = {
  expression: ModelExpression;
  is: (right: ModelRefBuilder) => ModelExpression;
};

const failBuilder = (code: string, message: string): never => {
  throw Object.assign(new TypeError(message), { code });
};

const ref = (input: string): ModelRefBuilder => {
  const expression: ModelExpression = { kind: 'input-ref', input };

  return {
    expression,
    is: right => {
      if (right?.expression?.kind !== 'input-ref') {
        return failBuilder(
          'model_expression_invalid_argument',
          'is(...) requires a Ref built by modelExpression.ref().',
        );
      }

      return {
        kind: 'ref-identity',
        operator: 'is',
        left: expression,
        right: right.expression,
      };
    },
  };
};

export const modelExpression = {
  define: (expression: ModelExpression): ModelExpressionProgram => ({
    version: 1,
    expression,
  }),
  field: (field: string): ModelExpression => ({ kind: 'field', field }),
  relation: (relation: string) => ({
    count: (): ModelExpression => ({
      kind: 'relation-aggregate',
      relation,
      aggregate: 'count',
    }),
  }),
  ref,
  subtract: (left: ModelExpression, right: ModelExpression): ModelExpression => ({
    kind: 'arithmetic',
    operator: 'subtract',
    left,
    right,
  }),
  lte: (left: ModelExpression, right: ModelExpression): ModelExpression => ({
    kind: 'compare',
    operator: 'lte',
    left,
    right,
  }),
  not: (operand: ModelExpression): ModelExpression => ({ kind: 'not', operand }),
  condition: (
    expression: ModelExpressionProgram,
    options?: { rejection?: PortableOperationConditionRejection },
  ): ExplicitOperationCondition => ({
    kind: 'model-expression.condition',
    expression,
    ...(options?.rejection ? { rejection: options.rejection } : {}),
  }),
};
