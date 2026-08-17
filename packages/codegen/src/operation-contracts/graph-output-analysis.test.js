import { describe, expect, it } from 'vitest';

import {
  deriveGraphOutputFromSchemaNode,
  isGraphOutputSchemaCall,
  toClientGraphOutputText,
} from './graph-output-analysis.mjs';
import { createTypeScriptSourceFile } from './source-parsing.mjs';
import { createSchemaContext } from './source-resolution.mjs';

const createContext = (sourceText, options = {}) => {
  const sourceFile = createTypeScriptSourceFile(sourceText, options.sourcePath);
  return createSchemaContext({
    sourceFile,
    sourcePath: options.sourcePath,
    resolveImportSource: options.resolveImportSource,
  });
};

const initializerNamed = (context, name) => context.declarations.get(name)?.initializer;

const deriveNamed = (context, name) =>
  deriveGraphOutputFromSchemaNode(initializerNamed(context, name), context);

describe('graph output analysis', () => {
  it('recognizes both graph output spellings and rewrites app references for clients', () => {
    const context = createContext(`
      const direct = graphOutput.schema(Entity, descriptor);
      const appQualified = app.graph.output.schema(Entity, app.graph.output.entity(Related));
      const other = graphOutput.entity(Entity);
    `);

    expect(isGraphOutputSchemaCall(initializerNamed(context, 'direct').expression)).toBe(true);
    expect(isGraphOutputSchemaCall(initializerNamed(context, 'appQualified').expression)).toBe(true);
    expect(isGraphOutputSchemaCall(initializerNamed(context, 'other').expression)).toBe(false);
    expect(toClientGraphOutputText('app.graph.output.array(app.graph.output.entity(Note))')).toBe(
      'graphOutput.array(graphOutput.entity(Note))',
    );
  });

  it('derives nested object, array, optional, nullable, entity, and schema descriptors', () => {
    const context = createContext(`
      const Output = graphSchema.object({
        comments: graphSchema.array(
          graphSchema.nullable(graphOutput.entity(Comment, graphSchema.object({
            author: graphOutput.entity(Author),
          }))),
        ),
        owner: graphSchema.optional(User.view('summary', {
          fields: { manager: app.graph.output.entity(Manager) },
        })),
        explicit: graphOutput.schema(Note, app.graph.output.array(graphOutput.entity(Tag))),
        scalar: graphSchema.string(),
        method() {},
      });
    `);

    expect(deriveNamed(context, 'Output')).toEqual({
      kind: 'object',
      fieldEntries: expect.any(Array),
      fieldsText:
        '{ comments: graphOutput.array(graphOutput.nullable(graphOutput.entity(Comment, { author: graphOutput.entity(Author) }))), owner: graphOutput.optional(graphOutput.entity(User, { manager: graphOutput.entity(Manager) })), explicit: graphOutput.array(graphOutput.entity(Tag)) }',
      text:
        'graphOutput.object({ comments: graphOutput.array(graphOutput.nullable(graphOutput.entity(Comment, { author: graphOutput.entity(Author) }))), owner: graphOutput.optional(graphOutput.entity(User, { manager: graphOutput.entity(Manager) })), explicit: graphOutput.array(graphOutput.entity(Tag)) })',
    });
  });

  it('unwraps transparent schema helpers, named schemas, and lazy callbacks', () => {
    const context = createContext(`
      const Leaf = graphOutput.entity(LeafEntity);
      const ExpressionLazy = graphSchema.lazy('ExpressionLazy', () => Leaf);
      const BlockLazy = graphSchema.lazy('BlockLazy', function () {
        const ignored = true;
        return graphSchema.describe(graphSchema.present(Leaf), 'leaf');
      });
      const Output = graphSchema.object({
        defaulted: graphSchema.default(Leaf, null),
        transformed: graphSchema.transform(Leaf, value => value),
        refined: graphSchema.refine(Leaf, Boolean),
        named: graphSchema.named('Leaf', Leaf),
        expressionLazy: ExpressionLazy,
        blockLazy: BlockLazy,
      });
    `);

    const descriptor = deriveNamed(context, 'Output');
    expect(descriptor.kind).toBe('object');
    expect(descriptor.fieldEntries.map(([name, field]) => [name, field.text])).toEqual([
      ['defaulted', 'graphOutput.entity(LeafEntity)'],
      ['transformed', 'graphOutput.entity(LeafEntity)'],
      ['refined', 'graphOutput.entity(LeafEntity)'],
      ['named', 'graphOutput.entity(LeafEntity)'],
      ['expressionLazy', 'graphOutput.entity(LeafEntity)'],
      ['blockLazy', 'graphOutput.entity(LeafEntity)'],
    ]);
  });

  it('merges compatible union fields and omits conflicting ones', () => {
    const context = createContext(`
      const First = graphSchema.object({
        common: graphOutput.entity(Common),
        conflict: graphOutput.entity(FirstEntity),
      });
      const Second = graphSchema.object({
        common: graphOutput.entity(Common),
        conflict: graphOutput.entity(SecondEntity),
        secondOnly: graphOutput.entity(SecondOnly),
      });
      const Third = graphSchema.object({ conflict: graphOutput.entity(ThirdEntity) });
      const Union = graphSchema.union([First, graphSchema.string(), Second, Third]);
      const Discriminated = graphSchema.discriminatedUnion('kind', [First, Second]);
    `);

    for (const name of ['Union', 'Discriminated']) {
      expect(deriveNamed(context, name)?.text).toBe(
        'graphOutput.object({ common: graphOutput.entity(Common), secondOnly: graphOutput.entity(SecondOnly) })',
      );
    }
  });

  it('resolves local and imported declarations without recursing through cycles', () => {
    const resolveImportSource = (_sourcePath, importPath) =>
      importPath === './shared'
        ? {
            sourcePath: '/app/shared.ts',
            sourceText: `
              export const Shared = graphSchema.array(graphOutput.entity(SharedEntity));
            `,
          }
        : undefined;
    const context = createContext(
      `
        import { Shared } from './shared';
        const Alias = Shared;
        const Output = graphSchema.object({ shared: Alias });
        const CycleA = CycleB;
        const CycleB = CycleA;
        const MissingAlias = Missing;
      `,
      { sourcePath: '/app/main.ts', resolveImportSource },
    );

    expect(deriveNamed(context, 'Output')?.text).toBe(
      'graphOutput.object({ shared: graphOutput.array(graphOutput.entity(SharedEntity)) })',
    );
    expect(deriveNamed(context, 'Output')?.text).toContain('SharedEntity');
    expect(deriveNamed(context, 'CycleA')).toBeUndefined();
    expect(deriveNamed(context, 'MissingAlias')).toBeUndefined();
  });

  it('returns no descriptor for malformed or unsupported schema expressions', () => {
    const context = createContext(`
      const Empty = graphSchema.object({ scalar: graphSchema.string() });
      const MissingObjectFields = graphSchema.object();
      const MissingArrayItem = graphSchema.array();
      const MissingOptionalItem = graphSchema.optional();
      const MissingEntity = graphOutput.entity();
      const MissingSchemaDescriptor = graphOutput.schema(Entity);
      const MissingValueFields = value('MissingValueFields');
      const InvalidUnion = graphSchema.union(notAnArray);
      const InvalidLazy = graphSchema.lazy('Invalid', notAFunction);
      const EmptyLazy = graphSchema.lazy('Empty', () => {});
      const ViewWithoutConfig = Entity.view('summary');
      const ViewWithoutObjectFields = Entity.view('summary', { fields: notAnObject });
      const UnsupportedCallee = factory()();
      const Literal = 'not a schema';
    `);

    for (const name of [
      'Empty',
      'MissingObjectFields',
      'MissingArrayItem',
      'MissingOptionalItem',
      'MissingEntity',
      'MissingSchemaDescriptor',
      'MissingValueFields',
      'InvalidUnion',
      'InvalidLazy',
      'EmptyLazy',
      'UnsupportedCallee',
    ]) {
      expect(deriveNamed(context, name)).toBeUndefined();
    }
    expect(deriveNamed(context, 'ViewWithoutConfig')?.text).toBe('graphOutput.entity(Entity)');
    expect(deriveNamed(context, 'ViewWithoutObjectFields')?.text).toBe(
      'graphOutput.entity(Entity)',
    );
    expect(deriveNamed(context, 'Literal')).toBeUndefined();
    expect(deriveGraphOutputFromSchemaNode(undefined, context)).toBeUndefined();
  });

  it('derives fields from named Value and ValueOf definitions', () => {
    const context = createContext(`
      const ValueOutput = value('ValueOutput', { item: graphOutput.entity(Item) });
      const ValueOfOutput = valueOf('ValueOfOutput', { item: graphOutput.entity(Item) });
    `);

    for (const name of ['ValueOutput', 'ValueOfOutput']) {
      expect(deriveNamed(context, name)?.text).toBe(
        'graphOutput.object({ item: graphOutput.entity(Item) })',
      );
    }
  });

  it('unwraps TypeScript-only expression wrappers before deriving descriptors', () => {
    const context = createContext(`
      const AsExpression = graphOutput.entity(Entity) as unknown;
      const Parenthesized = (graphOutput.entity(Entity));
      const Satisfies = graphOutput.entity(Entity) satisfies unknown;
      const TypeAssertion = <unknown>graphOutput.entity(Entity);
    `);

    for (const name of ['AsExpression', 'Parenthesized', 'Satisfies', 'TypeAssertion']) {
      expect(deriveNamed(context, name)?.text).toBe('graphOutput.entity(Entity)');
    }
  });
});
