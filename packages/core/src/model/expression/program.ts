export type ModelFieldExpression = {
  kind: 'field';
  field: string;
};

export type ModelInputRefExpression = {
  kind: 'input-ref';
  input: string;
};

export type ModelRelationAggregateExpression = {
  kind: 'relation-aggregate';
  relation: string;
  aggregate: 'count';
};

export type ModelArithmeticExpression = {
  kind: 'arithmetic';
  operator: 'subtract';
  left: ModelExpression;
  right: ModelExpression;
};

export type ModelCompareExpression = {
  kind: 'compare';
  operator: 'lte';
  left: ModelExpression;
  right: ModelExpression;
};

export type ModelRefIdentityExpression = {
  kind: 'ref-identity';
  operator: 'is';
  left: ModelExpression;
  right: ModelExpression;
};

export type ModelNotExpression = {
  kind: 'not';
  operand: ModelExpression;
};

export type ModelExpression =
  | ModelFieldExpression
  | ModelInputRefExpression
  | ModelRelationAggregateExpression
  | ModelArithmeticExpression
  | ModelCompareExpression
  | ModelRefIdentityExpression
  | ModelNotExpression;

export type ModelExpressionProgram = {
  version: 1;
  expression: ModelExpression;
};

export type ModelExpressionDependency =
  | { kind: 'field'; field: string }
  | { kind: 'input-ref'; input: string }
  | { kind: 'relation-aggregate'; relation: string; aggregate: 'count' };

const assertName: (value: unknown, description: string) => asserts value is string = (
  value,
  description,
) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${description} must be a non-empty string.`);
  }
};

export const assertModelExpression: (
  value: unknown,
) => asserts value is ModelExpression = value => {
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    throw new TypeError('Model expression must be an object with a supported kind.');
  }

  const expression = value as Record<string, unknown>;
  switch (expression.kind) {
    case 'field':
      assertName(expression.field, 'Model Field expression field');
      return;
    case 'input-ref':
      assertName(expression.input, 'Model input Ref expression input');
      return;
    case 'relation-aggregate':
      assertName(expression.relation, 'Model Relation aggregate relation');
      if (expression.aggregate !== 'count') {
        throw new TypeError('Model Relation aggregate must use count.');
      }
      return;
    case 'arithmetic':
      if (expression.operator !== 'subtract') {
        throw new TypeError('Model arithmetic expression must use subtract.');
      }
      assertModelExpression(expression.left);
      assertModelExpression(expression.right);
      return;
    case 'compare':
      if (expression.operator !== 'lte') {
        throw new TypeError('Model comparison expression must use lte.');
      }
      assertModelExpression(expression.left);
      assertModelExpression(expression.right);
      return;
    case 'ref-identity':
      if (expression.operator !== 'is') {
        throw new TypeError('Model Ref identity expression must use is.');
      }
      assertModelExpression(expression.left);
      assertModelExpression(expression.right);
      return;
    case 'not':
      assertModelExpression(expression.operand);
      return;
    default:
      throw new TypeError(`Unsupported Model expression kind ${String(expression.kind)}.`);
  }
};

export const assertModelExpressionProgram: (
  value: unknown,
) => asserts value is ModelExpressionProgram = value => {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Model expression program must be an object.');
  }

  const program = value as Record<string, unknown>;
  if (program.version !== 1) {
    throw new TypeError(`Unsupported Model expression version ${String(program.version)}.`);
  }
  assertModelExpression(program.expression);
};

const dependencyKey = (dependency: ModelExpressionDependency) =>
  dependency.kind === 'field'
    ? `field:${dependency.field}`
    : dependency.kind === 'input-ref'
      ? `input-ref:${dependency.input}`
      : `relation-aggregate:${dependency.relation}:${dependency.aggregate}`;

export const collectModelExpressionDependencies = (
  program: ModelExpressionProgram,
): ModelExpressionDependency[] => {
  const dependencies: ModelExpressionDependency[] = [];
  const seen = new Set<string>();
  const add = (dependency: ModelExpressionDependency) => {
    const key = dependencyKey(dependency);
    if (!seen.has(key)) {
      seen.add(key);
      dependencies.push(dependency);
    }
  };
  const visit = (expression: ModelExpression) => {
    switch (expression.kind) {
      case 'field':
        add({ kind: 'field', field: expression.field });
        return;
      case 'input-ref':
        add({ kind: 'input-ref', input: expression.input });
        return;
      case 'relation-aggregate':
        add({
          kind: 'relation-aggregate',
          relation: expression.relation,
          aggregate: expression.aggregate,
        });
        return;
      case 'arithmetic':
      case 'compare':
      case 'ref-identity':
        visit(expression.left);
        visit(expression.right);
        return;
      case 'not':
        visit(expression.operand);
    }
  };

  assertModelExpressionProgram(program);
  visit(program.expression);
  return dependencies;
};
