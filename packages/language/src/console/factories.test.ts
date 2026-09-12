import { entity, field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
  editConsoleLimit,
  editConsoleOrderBy,
  reflectSelectionLanguageEntity,
} from '../index.js';

const User = withSelectionFactories(
  entity('User', {
    id: field.id(),
    company: field.string(),
    active: field.boolean(),
    role: field.enum(['admin', 'reader']),
  }),
  {
    company: {
      version: 1,
      input: graphSchema.object({ name: field.nonEmptyString({ trim: true }) }),
      scalarInput: 'name',
      template: { kind: 'predicate', fieldName: 'company', operator: 'eq', input: 'name' },
    },
    role: {
      version: 1,
      input: graphSchema.object({ role: field.enum(['admin', 'reader']) }),
      scalarInput: 'role',
      template: { kind: 'predicate', fieldName: 'role', operator: 'eq', input: 'role' },
    },
    active: {
      version: 1,
      input: graphSchema.object({ enabled: field.boolean() }),
      scalarInput: 'enabled',
      template: { kind: 'predicate', fieldName: 'active', operator: 'eq', input: 'enabled' },
    },
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
  },
);
const application = JSON.parse(
  JSON.stringify({ entities: [reflectSelectionLanguageEntity(User)] }),
);

describe('Console Selection factories', () => {
  it.each(['ts', 'declarative'] as const)(
    'intersects multiple %s factories and preserves authoring through conversion and modifiers',
    dialect => {
      const source =
        dialect === 'ts'
          ? 'User.by({ company: "ACME" }).by({ role: { role: "admin" } }).by({ identity: { id: "u1" } }).where(active = true).many()'
          : 'User by company "ACME" and by role { role: "admin" } and by identity { id: "u1" } where active = true many';
      const result = analyzeConsoleDocument(source, application, { dialect });
      expect(result.syntaxDiagnostics).toEqual([]);
      expect(result.semanticDiagnostics).toEqual([]);
      expect(result.request?.selection).toEqual(
        User.by({ company: 'ACME' })
          .and(User.by({ role: { role: 'admin' } }))
          .and(User.by({ identity: { id: 'u1' } }))
          .and(u => u.active.eq(true))
          .toAst(),
      );
      expect(result.syntax.expression?.factories.map(factory => factory.name?.value)).toEqual([
        'company',
        'role',
        'identity',
      ]);
      const target = dialect === 'ts' ? 'declarative' : 'ts';
      const converted = convertConsoleDocument(source, application, target, { dialect })!;
      expect(analyzeConsoleDocument(converted, application, { dialect: target }).request).toEqual(
        result.request,
      );
      expect(convertConsoleDocument(converted, application, dialect, { dialect: target })).toBe(
        source,
      );
      for (const changes of [
        editConsoleLimit(source, application, 10, { dialect }),
        editConsoleOrderBy(
          source,
          application,
          { fieldName: 'company', direction: 'desc' },
          { dialect },
        ),
      ]) {
        expect(changes).toBeDefined();
        const edited = [...changes!]
          .reverse()
          .reduce(
            (doc, change) => doc.slice(0, change.from) + change.insert + doc.slice(change.to),
            source,
          );
        const analyzed = analyzeConsoleDocument(edited, application, { dialect });
        expect(analyzed.request?.selection).toEqual(result.request?.selection);
        expect(
          analyzed.syntax.expression?.factories.map(factory => factory.argument?.text),
        ).toEqual(result.syntax.expression?.factories.map(factory => factory.argument?.text));
      }
    },
  );

  it.each(['many', 'one', 'first', 'count', 'exists'])(
    'allows repeated factory names with independent inputs for %s',
    terminal => {
      const ts = `User.by({ company: "ACME" }).by({ company: "OTHER" }).${terminal}()`;
      const declarative = `User by company "ACME" and by company "OTHER" ${terminal}`;
      const expected = User.by({ company: 'ACME' })
        .and(User.by({ company: 'OTHER' }))
        .toAst();
      const result = analyzeConsoleDocument(ts, application);
      expect(result.request?.selection).toEqual(expected);
      expect(
        analyzeConsoleDocument(declarative, application, { dialect: 'declarative' }).request,
      ).toEqual(result.request);
    },
  );

  it.each([
    ['ts', 'User.by({ company: "ACME" }).by({ unknown: true }).many()', 'unknown'],
    ['declarative', 'User by company "ACME" and by active "bad" many', 'active'],
  ] as const)(
    'locates an invalid later %s invocation without executing a valid prefix',
    (dialect, source, name) => {
      const result = analyzeConsoleDocument(source, application, { dialect });
      expect(result.request).toBeUndefined();
      expect(result.semanticDiagnostics[0]?.code).toBe('console.semantic.invalid-factory');
      const diagnostic = result.semanticDiagnostics[0]!;
      expect(source.slice(diagnostic.from, diagnostic.to)).toContain(name);
      expect(source.slice(diagnostic.from, diagnostic.to)).not.toContain('company');
      expect(
        convertConsoleDocument(source, application, dialect === 'ts' ? 'declarative' : 'ts', {
          dialect,
        }),
      ).toBeUndefined();
    },
  );

  it('handles composite inputs and completes the current property, not earlier string contents', () => {
    const Account = withSelectionFactories(
      entity('Account', { tenant: field.string(), number: field.number() })
        .locators({ key: ['tenant', 'number'] })
        .identity('key'),
      {
        identity: {
          version: 1,
          input: graphSchema.object({ space: field.string(), account: field.number() }),
          template: { kind: 'identity', bindings: { tenant: 'space', number: 'account' } },
        },
      },
    );
    const app = { entities: [reflectSelectionLanguageEntity(Account)] };
    const prefix = 'Account by identity { space: "comma, colon:", account: ';
    expect(
      completeConsoleDocument(prefix, prefix.length, app, { dialect: 'declarative' }).items.map(
        item => item.label,
      ),
    ).toEqual(['number']);
    const source = prefix + '12 } many';
    expect(
      analyzeConsoleDocument(source, app, { dialect: 'declarative' }).request?.selection,
    ).toEqual(Account.by({ identity: { space: 'comma, colon:', account: 12 } }).toAst());
    const incomplete = 'Account by identity { space: "x", ';
    expect(
      completeConsoleDocument(incomplete, incomplete.length, app, {
        dialect: 'declarative',
      }).items.map(item => item.label),
    ).toEqual(['account']);
  });

  it.each(['ts', 'declarative'] as const)(
    'inserts modifiers after by without a where in %s',
    dialect => {
      const source =
        dialect === 'ts'
          ? 'User.by({ company: "ACME" }).by({ active: true }).many()'
          : 'User by company "ACME" and by active true many';
      for (const changes of [
        editConsoleOrderBy(
          source,
          application,
          { fieldName: 'company', direction: 'asc' },
          { dialect },
        ),
        editConsoleLimit(source, application, 3, { dialect }),
      ]) {
        expect(changes).toBeDefined();
        const next = [...changes!]
          .reverse()
          .reduce(
            (doc, change) => doc.slice(0, change.from) + change.insert + doc.slice(change.to),
            source,
          );
        expect(analyzeConsoleDocument(next, application, { dialect }).request?.selection).toEqual(
          User.by({ company: 'ACME' })
            .and(User.by({ active: true }))
            .toAst(),
        );
      }
    },
  );
  it.each(['ts', 'declarative'] as const)(
    'expands %s factories and intersects where without losing source',
    dialect => {
      const source =
        dialect === 'ts'
          ? 'User.by({ company: "ACME" }).where(active = true).many()'
          : 'User by company "ACME" where active = true many';
      const analysis = analyzeConsoleDocument(source, application, { dialect });
      expect(analysis.syntaxDiagnostics).toEqual([]);
      expect(analysis.semanticDiagnostics).toEqual([]);
      expect(analysis.request?.selection).toEqual(
        User.by({ company: 'ACME' })
          .and(u => u.active.eq(true))
          .toAst(),
      );
      expect(analysis.syntax.expression?.factories[0]?.name?.value).toBe('company');
      const other = dialect === 'ts' ? 'declarative' : 'ts';
      const converted = convertConsoleDocument(source, application, other, { dialect })!;
      expect(converted).toContain('company');
      expect(converted).toContain('"ACME"');
      expect(analyzeConsoleDocument(converted, application, { dialect: other }).request).toEqual(
        analysis.request,
      );
      for (const changes of [
        editConsoleLimit(source, application, 5, { dialect }),
        editConsoleOrderBy(
          source,
          application,
          { fieldName: 'company', direction: 'desc' },
          { dialect },
        ),
      ]) {
        expect(changes).toBeDefined();
        const edited = [...changes!]
          .reverse()
          .reduce(
            (doc, change) => doc.slice(0, change.from) + change.insert + doc.slice(change.to),
            source,
          );
        expect(analyzeConsoleDocument(edited, application, { dialect }).request?.selection).toEqual(
          analysis.request?.selection,
        );
        expect(edited).toContain('"ACME"');
      }
    },
  );

  it.each(['many', 'one', 'first', 'count', 'exists'])(
    'supports %s with structured arguments',
    terminal => {
      const ts = `User.by({ identity: { id: "u1" } }).${terminal}()`;
      const decl = `User by identity { id: "u1" } ${terminal}`;
      const result = analyzeConsoleDocument(ts, application);
      expect(result.request?.selection).toEqual(User.by({ identity: { id: 'u1' } }).toAst());
      expect(analyzeConsoleDocument(decl, application, { dialect: 'declarative' }).request).toEqual(
        result.request,
      );
      expect(convertConsoleDocument(decl, application, 'ts', { dialect: 'declarative' })).toContain(
        '{ id: "u1" }',
      );
    },
  );

  it.each([
    'User.by({ company: "" }).many()',
    'User.by({ identity: "u1" }).many()',
    'User.by({ unknown: "x" }).many()',
    'User.by({ role: "bogus" }).many()',
    'User.by({ company: { name: "a", extra: true } }).many()',
    'User.by({ company: { name: "a", name: "b" } }).many()',
    'User.by({ company: "x", active: true }).many()',
    'User by company "ACME" or by active true many',
    'User by company "ACME" by active true many',
    'User by company "ACME" and',
    'User by company "ACME" and by',
    'User by company "ACME" and by active',
    'User.by({ company: "ACME" }).by',
    'User.by({ company: "ACME" }).by({ active: }).many()',
    'User by company "ACME" where active = true and by role "admin" many',
    'User.by({ company: "ACME" }).where(active = true).by({ role: "admin" }).many()',
  ])('rejects invalid input %s', source => {
    const result = analyzeConsoleDocument(source, application, {
      dialect: source.includes('.by') ? 'ts' : 'declarative',
    });
    expect(result.request).toBeUndefined();
    expect([...result.syntaxDiagnostics, ...result.semanticDiagnostics].length).toBeGreaterThan(0);
  });

  it.each([
    ['ts', 'User.', 'by'],
    ['ts', 'User.by({', 'company'],
    ['declarative', 'User by ', 'company'],
    ['declarative', 'User by active ', 'true'],
    ['ts', 'User.by({ role: ', '"admin"'],
    ['declarative', 'User by identity { ', 'id'],
    ['ts', 'User.by({ active: { enabled: ', 'false'],
    ['ts', 'User.by({ company: "ACME" }).', 'by'],
    ['ts', 'User.by({ company: "ACME" }).by({', 'active'],
    ['ts', 'User.by({ company: "ACME" }).by({ active: ', 'true'],
    ['declarative', 'User by company "ACME" ', 'and by'],
    ['declarative', 'User by company "ACME" an', 'and by'],
    ['declarative', 'User by company "ACME" and ', 'by'],
    ['declarative', 'User by company "ACME" and b', 'by'],
    ['declarative', 'User by company "ACME" and by ', 'active'],
    ['declarative', 'User by company "ACME" and by active ', 'false'],
    ['declarative', 'User by company "ACME" and by identity { ', 'id'],
  ] as const)('completes %s %s', (dialect, source, label) => {
    expect(
      completeConsoleDocument(source, source.length, application, { dialect }).items.map(
        item => item.label,
      ),
    ).toContain(label);
  });

  it('handles every incomplete prefix while deleting a factory expression', () => {
    for (const [dialect, source] of [
      ['ts', 'User.by({ company: { name: "ACME" } }).where(active = true).many()'],
      ['declarative', 'User by company { name: "ACME" } where active = true many'],
      [
        'ts',
        'User.by({ company: { name: "ACME" } }).by({ role: "admin" }).where(active = true).many()',
      ],
      [
        'declarative',
        'User by company { name: "ACME" } and by role "admin" where active = true many',
      ],
    ] as const)
      for (let end = source.length; end >= 0; end--) {
        const prefix = source.slice(0, end);
        expect(() => analyzeConsoleDocument(prefix, application, { dialect })).not.toThrow();
        expect(() => completeConsoleDocument(prefix, end, application, { dialect })).not.toThrow();
      }
  });

  it.each([
    ['User by company "ACME" and', 'by'],
    ['User by company "ACME" and ', 'by'],
    ['User by company "ACME" and b', 'by'],
    ['User by company "ACME" an', 'and by'],
  ])('replaces the conjunction prefix in %s without duplicating text', (source, label) => {
    const completion = completeConsoleDocument(source, source.length, application, {
      dialect: 'declarative',
    });
    const item = completion.items.find(item => item.label === label)!;
    const edited = source.slice(0, completion.from) + item.apply + source.slice(completion.to);
    expect(edited).toBe('User by company "ACME" and by ');
  });

  it('completes an earlier factory value without replacing later clauses', () => {
    const source = 'User by role "admin" and by active false many';
    const cursor = source.indexOf('"admin"') + 2;
    const completion = completeConsoleDocument(source, cursor, application, {
      dialect: 'declarative',
    });
    const item = completion.items.find(item => item.label === '"reader"')!;
    expect(source.slice(0, completion.from) + item.apply + source.slice(completion.to)).toBe(
      'User by role "reader" and by active false many',
    );
  });
});
