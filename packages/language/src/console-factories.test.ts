import { entity, field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import {
  analyzeConsoleDocument,
  completeConsoleDocument,
  convertConsoleDocument,
  editConsoleLimit,
  editConsoleOrderBy,
  reflectSelectionLanguageEntity,
} from './index.js';

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
        dialect === 'ts' ? 'User.by({ company: "ACME" }).many()' : 'User by company "ACME" many';
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
          User.by({ company: 'ACME' }).toAst(),
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
      expect(analysis.syntax.expression?.factory?.name?.value).toBe('company');
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
    'User by company "ACME" and by active true many',
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
    ] as const)
      for (let end = source.length; end >= 0; end--) {
        const prefix = source.slice(0, end);
        expect(() => analyzeConsoleDocument(prefix, application, { dialect })).not.toThrow();
        expect(() => completeConsoleDocument(prefix, end, application, { dialect })).not.toThrow();
      }
  });
});
