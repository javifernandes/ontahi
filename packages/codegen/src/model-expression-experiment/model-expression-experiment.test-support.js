export { analyzeModelExpressionSource } from '../model-expression/compiler.mjs';

const fieldExpression = field => ({ kind: 'field', field });
const inputRefExpression = input => ({ kind: 'input-ref', input });
const relationAggregateExpression = relation => ({
  kind: 'relation-aggregate',
  relation,
  aggregate: 'count',
});
const failBuilder = (code, message) => {
  throw Object.assign(new TypeError(message), { code });
};
const ref = input => {
  const left = inputRefExpression(input);
  return {
    expression: left,
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
        left,
        right: right.expression,
      };
    },
  };
};

export const modelExpression = {
  define: expression => ({ version: 1, expression }),
  field: fieldExpression,
  relation: relation => ({ count: () => relationAggregateExpression(relation) }),
  ref,
  subtract: (left, right) => ({ kind: 'arithmetic', operator: 'subtract', left, right }),
  lte: (left, right) => ({ kind: 'compare', operator: 'lte', left, right }),
  not: operand => ({ kind: 'not', operand }),
};
