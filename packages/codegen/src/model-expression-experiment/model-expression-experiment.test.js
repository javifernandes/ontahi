import { describe, expect, it } from 'vitest';

import {
  analyzeModelExpressionSource,
  modelExpression,
} from './model-expression-experiment.test-support.js';

const courseSymbols = {
  capacity: { kind: 'field', field: 'capacity' },
  students: { kind: 'relation', relation: 'students' },
};

const transferSymbols = {
  previousCourse: { kind: 'input-ref', input: 'previousCourse' },
  nextCourse: { kind: 'input-ref', input: 'nextCourse' },
};

const classroomExpressions = [
  {
    name: 'availableSeats',
    sourceText: 'const availableSeats = ({ capacity, students }) => capacity - students.count();',
    symbols: courseSymbols,
    expected: {
      version: 1,
      expression: {
        kind: 'arithmetic',
        operator: 'subtract',
        left: { kind: 'field', field: 'capacity' },
        right: {
          kind: 'relation-aggregate',
          relation: 'students',
          aggregate: 'count',
        },
      },
    },
    build: expression =>
      expression.define(
        expression.subtract(expression.field('capacity'), expression.relation('students').count()),
      ),
  },
  {
    name: 'withinCapacity',
    sourceText: 'const withinCapacity = ({ capacity, students }) => students.count() <= capacity;',
    symbols: courseSymbols,
    expected: {
      version: 1,
      expression: {
        kind: 'compare',
        operator: 'lte',
        left: {
          kind: 'relation-aggregate',
          relation: 'students',
          aggregate: 'count',
        },
        right: { kind: 'field', field: 'capacity' },
      },
    },
    build: expression =>
      expression.define(
        expression.lte(expression.relation('students').count(), expression.field('capacity')),
      ),
  },
  {
    name: 'differentCourses',
    sourceText:
      'const differentCourses = ({ previousCourse, nextCourse }) => !previousCourse.is(nextCourse);',
    symbols: transferSymbols,
    expected: {
      version: 1,
      expression: {
        kind: 'not',
        operand: {
          kind: 'ref-identity',
          operator: 'is',
          left: { kind: 'input-ref', input: 'previousCourse' },
          right: { kind: 'input-ref', input: 'nextCourse' },
        },
      },
    },
    build: expression =>
      expression.define(
        expression.not(expression.ref('previousCourse').is(expression.ref('nextCourse'))),
      ),
  },
];

describe('model expression language experiment', () => {
  it('compiles the three natural Classroom expressions into canonical IR', () => {
    for (const fixture of classroomExpressions) {
      expect(
        analyzeModelExpressionSource(fixture.sourceText, {
          declarationName: fixture.name,
          sourcePath: '/examples/classroom/model.ts',
          symbols: fixture.symbols,
        }),
      ).toEqual({ program: fixture.expected, diagnostics: [] });
    }
  });

  it('builds structurally identical IR through the explicit fallback', () => {
    for (const fixture of classroomExpressions) {
      const analyzed = analyzeModelExpressionSource(fixture.sourceText, {
        declarationName: fixture.name,
        sourcePath: '/examples/classroom/model.ts',
        symbols: fixture.symbols,
      });

      expect(fixture.build(modelExpression)).toEqual(analyzed.program);
    }
  });

  it('makes the explicit Ref builder fail closed for a non-Ref operand', () => {
    let failure;

    try {
      modelExpression.ref('previousCourse').is(modelExpression.field('capacity'));
    } catch (error) {
      failure = error;
    }

    expect({
      name: failure?.name,
      code: failure?.code,
      message: failure?.message,
    }).toEqual({
      name: 'TypeError',
      code: 'model_expression_invalid_argument',
      message: 'is(...) requires a Ref built by modelExpression.ref().',
    });
  });

  it('round-trips every compiled program through JSON', () => {
    for (const fixture of classroomExpressions) {
      const analyzed = analyzeModelExpressionSource(fixture.sourceText, {
        declarationName: fixture.name,
        sourcePath: '/examples/classroom/model.ts',
        symbols: fixture.symbols,
      });

      expect(JSON.parse(JSON.stringify(analyzed.program))).toEqual(fixture.expected);
    }
  });

  it('rejects arbitrary calls with a source-located stable diagnostic', () => {
    const sourceText = 'const invalid = ({ capacity }) =>\n  capacity - Math.random();';

    expect(
      analyzeModelExpressionSource(sourceText, {
        declarationName: 'invalid',
        sourcePath: '/examples/classroom/invalid.ts',
        symbols: courseSymbols,
      }),
    ).toEqual({
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_unsupported_call',
          message: 'Only Relation.count() and Ref.is(...) calls are supported.',
          source: {
            path: '/examples/classroom/invalid.ts',
            line: 2,
            column: 14,
          },
        },
      ],
    });
  });

  it('rejects closure captures instead of serializing their current value', () => {
    const sourceText = 'const minimum = 1;\nconst invalid = ({ capacity }) => capacity - minimum;';

    expect(
      analyzeModelExpressionSource(sourceText, {
        declarationName: 'invalid',
        sourcePath: '/examples/classroom/capture.ts',
        symbols: courseSymbols,
      }),
    ).toEqual({
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_unknown_binding',
          message: 'minimum is not a callback binding with known model semantics.',
          source: {
            path: '/examples/classroom/capture.ts',
            line: 2,
            column: 46,
          },
        },
      ],
    });
  });

  it('rejects unsupported operators before treating their operands as data', () => {
    const sourceText = 'const invalid = ({ capacity }) => capacity + 1;';

    expect(
      analyzeModelExpressionSource(sourceText, {
        declarationName: 'invalid',
        sourcePath: '/examples/classroom/operator.ts',
        symbols: courseSymbols,
      }),
    ).toEqual({
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_unsupported_operator',
          message: 'Operator + is outside the model expression subset.',
          source: {
            path: '/examples/classroom/operator.ts',
            line: 1,
            column: 44,
          },
        },
      ],
    });
  });

  it('rejects block bodies and semantically invalid aggregate receivers', () => {
    const blockBody = 'const invalid = ({ capacity }) => { return capacity; };';
    const invalidReceiver = 'const invalid = ({ capacity }) => capacity.count();';

    expect(
      analyzeModelExpressionSource(blockBody, {
        declarationName: 'invalid',
        sourcePath: '/examples/classroom/block.ts',
        symbols: courseSymbols,
      }),
    ).toEqual({
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_block_body',
          message: 'Model expressions must use an expression-bodied arrow function.',
          source: {
            path: '/examples/classroom/block.ts',
            line: 1,
            column: 35,
          },
        },
      ],
    });
    expect(
      analyzeModelExpressionSource(invalidReceiver, {
        declarationName: 'invalid',
        sourcePath: '/examples/classroom/receiver.ts',
        symbols: courseSymbols,
      }),
    ).toEqual({
      program: undefined,
      diagnostics: [
        {
          code: 'model_expression_invalid_receiver',
          message: 'count() requires a Relation binding.',
          source: {
            path: '/examples/classroom/receiver.ts',
            line: 1,
            column: 35,
          },
        },
      ],
    });
  });
});
