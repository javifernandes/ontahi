import ts from 'typescript';

import { createTypeScriptSourceFile } from '../operation-contracts/source-parsing.mjs';
import { collectConstDeclarations } from '../operation-contracts/source-resolution.mjs';
import { unwrapExpression } from '../operation-contracts/typescript-ast.mjs';

const fieldExpression = field => ({ kind: 'field', field });
const inputRefExpression = input => ({ kind: 'input-ref', input });
const relationAggregateExpression = relation => ({
  kind: 'relation-aggregate',
  relation,
  aggregate: 'count',
});

const define = expression => ({ version: 1, expression });
const field = fieldName => fieldExpression(fieldName);
const relation = relationName => ({
  count: () => relationAggregateExpression(relationName),
});
const failBuilder = (code, message) => {
  throw Object.assign(new TypeError(message), { code });
};
const ref = inputName => {
  const left = inputRefExpression(inputName);

  return {
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
    expression: left,
  };
};

export const modelExpression = {
  define,
  field,
  relation,
  ref,
  subtract: (left, right) => ({ kind: 'arithmetic', operator: 'subtract', left, right }),
  lte: (left, right) => ({ kind: 'compare', operator: 'lte', left, right }),
  not: operand => ({ kind: 'not', operand }),
};

class ModelExpressionCompileError extends Error {
  constructor(diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

const sourceLocation = (sourceFile, sourcePath, node) => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return { path: sourcePath, line: line + 1, column: character + 1 };
};

const failAt = (context, node, code, message) => {
  throw new ModelExpressionCompileError({
    code,
    message,
    source: sourceLocation(context.sourceFile, context.sourcePath, node),
  });
};

const expressionValue = (semantic, expression) => ({ semantic, expression });

const requireExpression = (compiled, context, node) => {
  if (compiled.expression) return compiled.expression;

  return failAt(
    context,
    node,
    'model_expression_invalid_value',
    'A Relation binding is only valid through a supported aggregate.',
  );
};

const compileIdentifier = (identifier, context) => {
  const symbol = context.parameterSymbols.get(identifier.text);
  if (!symbol) {
    return failAt(
      context,
      identifier,
      'model_expression_unknown_binding',
      `${identifier.text} is not a callback binding with known model semantics.`,
    );
  }

  if (symbol.kind === 'field') {
    return expressionValue('field', fieldExpression(symbol.field));
  }
  if (symbol.kind === 'input-ref') {
    return expressionValue('input-ref', inputRefExpression(symbol.input));
  }
  if (symbol.kind === 'relation') {
    return { semantic: 'relation', relation: symbol.relation };
  }

  return failAt(
    context,
    identifier,
    'model_expression_unknown_symbol_kind',
    `${identifier.text} has unsupported model symbol kind ${String(symbol.kind)}.`,
  );
};

const compileCall = (call, context) => {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return failAt(
      context,
      call.expression,
      'model_expression_unsupported_call',
      'Only Relation.count() and Ref.is(...) calls are supported.',
    );
  }

  const methodName = call.expression.name.text;
  if (methodName !== 'count' && methodName !== 'is') {
    return failAt(
      context,
      call.expression,
      'model_expression_unsupported_call',
      'Only Relation.count() and Ref.is(...) calls are supported.',
    );
  }

  const receiver = compileExpression(call.expression.expression, context);
  if (methodName === 'count') {
    if (receiver.semantic !== 'relation') {
      return failAt(
        context,
        call.expression.expression,
        'model_expression_invalid_receiver',
        'count() requires a Relation binding.',
      );
    }
    if (call.arguments.length !== 0) {
      return failAt(
        context,
        call,
        'model_expression_invalid_arguments',
        'count() does not accept arguments.',
      );
    }

    return expressionValue('number', relationAggregateExpression(receiver.relation));
  }

  if (receiver.semantic !== 'input-ref') {
    return failAt(
      context,
      call.expression.expression,
      'model_expression_invalid_receiver',
      'is(...) requires a Ref binding.',
    );
  }
  if (call.arguments.length !== 1) {
    return failAt(
      context,
      call,
      'model_expression_invalid_arguments',
      'is(...) requires exactly one Ref argument.',
    );
  }

  const right = compileExpression(call.arguments[0], context);
  if (right.semantic !== 'input-ref') {
    return failAt(
      context,
      call.arguments[0],
      'model_expression_invalid_argument',
      'is(...) requires a Ref argument.',
    );
  }

  return expressionValue('boolean', {
    kind: 'ref-identity',
    operator: 'is',
    left: receiver.expression,
    right: right.expression,
  });
};

const binaryOperators = new Map([
  [ts.SyntaxKind.MinusToken, { kind: 'arithmetic', operator: 'subtract', semantic: 'number' }],
  [ts.SyntaxKind.LessThanEqualsToken, { kind: 'compare', operator: 'lte', semantic: 'boolean' }],
]);

const compileBinary = (binary, context) => {
  const operator = binaryOperators.get(binary.operatorToken.kind);
  if (!operator) {
    return failAt(
      context,
      binary.operatorToken,
      'model_expression_unsupported_operator',
      `Operator ${binary.operatorToken.getText(context.sourceFile)} is outside the model expression subset.`,
    );
  }

  const left = compileExpression(binary.left, context);
  const right = compileExpression(binary.right, context);

  return expressionValue(operator.semantic, {
    kind: operator.kind,
    operator: operator.operator,
    left: requireExpression(left, context, binary.left),
    right: requireExpression(right, context, binary.right),
  });
};

const compileExpression = (node, context) => {
  const expression = unwrapExpression(node);
  if (ts.isIdentifier(expression)) return compileIdentifier(expression, context);
  if (ts.isCallExpression(expression)) return compileCall(expression, context);
  if (ts.isBinaryExpression(expression)) return compileBinary(expression, context);

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const operand = compileExpression(expression.operand, context);
    return expressionValue('boolean', {
      kind: 'not',
      operand: requireExpression(operand, context, expression.operand),
    });
  }

  return failAt(
    context,
    expression,
    'model_expression_unsupported_syntax',
    `${ts.SyntaxKind[expression.kind]} is outside the model expression subset.`,
  );
};

const parseParameterSymbols = (arrow, symbols, context) => {
  if (arrow.parameters.length !== 1 || !ts.isObjectBindingPattern(arrow.parameters[0].name)) {
    return failAt(
      context,
      arrow,
      'model_expression_parameter_shape',
      'Model expressions require one destructured parameter.',
    );
  }

  const parameterSymbols = new Map();
  for (const element of arrow.parameters[0].name.elements) {
    if (
      element.dotDotDotToken ||
      element.propertyName ||
      element.initializer ||
      !ts.isIdentifier(element.name)
    ) {
      return failAt(
        context,
        element,
        'model_expression_parameter_binding',
        'Model expression parameters currently support shorthand bindings only.',
      );
    }

    const symbol = symbols[element.name.text];
    if (!symbol) {
      return failAt(
        context,
        element.name,
        'model_expression_unknown_binding',
        `${element.name.text} is not a callback binding with known model semantics.`,
      );
    }
    parameterSymbols.set(element.name.text, symbol);
  }

  return parameterSymbols;
};

const parseDiagnostics = (sourceFile, sourcePath) =>
  sourceFile.parseDiagnostics.map(diagnostic => {
    const node = diagnostic.start === undefined ? sourceFile : { getStart: () => diagnostic.start };
    return {
      code: 'model_expression_source_parse',
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      source: sourceLocation(sourceFile, sourcePath, node),
    };
  });

export const analyzeModelExpressionSource = (
  sourceText,
  { declarationName, sourcePath = 'model-expression.ts', symbols },
) => {
  const sourceFile = createTypeScriptSourceFile(sourceText, sourcePath);
  const sourceDiagnostics = parseDiagnostics(sourceFile, sourcePath);
  if (sourceDiagnostics.length > 0) {
    return { program: undefined, diagnostics: sourceDiagnostics };
  }

  const declaration = collectConstDeclarations(sourceFile).get(declarationName);
  if (!declaration?.initializer) {
    return {
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_declaration_missing',
          message: `No initialized const declaration named ${declarationName} was found.`,
          source: { path: sourcePath, line: 1, column: 1 },
        },
      ],
    };
  }

  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isArrowFunction(initializer)) {
    return {
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_callback_shape',
          message: 'Model expressions must be arrow functions.',
          source: sourceLocation(sourceFile, sourcePath, initializer),
        },
      ],
    };
  }

  const context = { sourceFile, sourcePath };
  try {
    context.parameterSymbols = parseParameterSymbols(initializer, symbols, context);
    if (ts.isBlock(initializer.body)) {
      return failAt(
        context,
        initializer.body,
        'model_expression_block_body',
        'Model expressions must use an expression-bodied arrow function.',
      );
    }

    const compiled = compileExpression(initializer.body, context);
    return {
      program: define(requireExpression(compiled, context, initializer.body)),
      diagnostics: [],
    };
  } catch (error) {
    if (error instanceof ModelExpressionCompileError) {
      return { program: undefined, diagnostics: [error.diagnostic] };
    }
    throw error;
  }
};
