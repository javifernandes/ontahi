import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeSpecificDomainEntityExport, renderGeneratedClientEntityModule } from '../index.mjs';

import { importGeneratedModule } from './generated-module.test-support.js';

const factories = `{
  archivedSince: {
    version: 1,
    input: graphSchema.object({ date: field.datetime() }),
    scalarInput: 'date',
    template: { kind: 'predicate', fieldName: 'archivedAt', operator: 'gte', input: 'date' }
  }
}`;

describe('Selection factory browser projection', () => {
  it.each(['inline', 'named'])(
    'projects %s declarations into a typed, executable browser facade',
    async form => {
      const analysis = analyzeSpecificDomainEntityExport(
        `
      import { entity } from '@ontahi/core/runtime/server';
      import { field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';
      const factoryDeclarations = ${factories};
      const Base = entity({ name: 'Customer', fields: { id: field.id(), archivedAt: field.datetime() },
        locators: { refByDate: 'archivedAt' } });
      export const Customer = withSelectionFactories(Base, ${form === 'inline' ? factories : 'factoryDeclarations'});
    `,
        'Customer',
      );
      expect(analysis.diagnostics).toEqual([]);
      const source = renderGeneratedClientEntityModule({ entities: [analysis.definition] });
      expect(source).not.toContain('@ontahi/core/runtime/server');
      const directory = await mkdtemp(path.join(tmpdir(), 'ontahi-factories-codegen-'));
      try {
        const generated = await importGeneratedModule({
          directory,
          source: `${source}
        Customer.by({ archivedSince: '2026-06-01T00:00:00Z' });
        // @ts-expect-error factory arguments retain their input types
        if (false) Customer.by({ archivedSince: 42 });
      `,
        });
        const selected = generated.Customer.by({ archivedSince: { date: '2026-06-01T00:00:00Z' } });
        expect(selected.toAst().expression).toEqual({
          kind: 'predicate',
          fieldName: 'archivedAt',
          operator: 'gte',
          value: '2026-06-01T00:00:00Z',
        });
        expect(generated.Customer.definition.selectionFactories.archivedSince).toMatchObject({
          output: { kind: 'selection', entityName: 'Customer' },
          input: { kind: 'object', unknownKeys: 'strict' },
        });
        expect(generated.Customer.refById('c1').locator).toEqual({ id: 'c1' });
        expect(generated.Customer.refByDate('2026-06-01').locator).toEqual({
          archivedAt: '2026-06-01',
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it('diagnoses opaque factory declarations instead of importing server code', () => {
    const analysis = analyzeSpecificDomainEntityExport(
      `
      export const Customer = withSelectionFactories(entity({ name: 'Customer', fields: { id: field.id() } }), loadServerFactories());
    `,
      'Customer',
    );
    expect(analysis.diagnostics.join(' ')).toContain('portable object data');
  });
});
