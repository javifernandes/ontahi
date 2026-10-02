import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  toGraphCommandRequest,
} from '../data-graph/index.js';

import {
  graphCommandApplicationHoles,
  lowerGraphCommandApplication,
  openGraphCommandApplication,
  substituteGraphCommandApplication,
} from './graph-command-application.js';

const Document = entity('SemanticGraphCommandDocument', {
  id: field.id(),
  title: field.nonEmptyString({ trim: true }),
  label: field.string(),
  published: field.boolean(),
});
const target = createEntityRef(Document, { id: 'document-1' });
const request = toGraphCommandRequest(
  mutateEntity(Document).update(target, { title: 'placeholder', published: false }),
);

describe('Graph Command application', () => {
  it('opens an Entity update value as a named Hole without changing its target', () => {
    const application = openGraphCommandApplication(request, [Document], { title: 'next-title' });

    expect(application).toEqual({
      kind: 'graph-command-application',
      request: {
        ...request,
        command: {
          ...request.command,
          values: {
            title: { kind: 'hole', id: 'next-title' },
            published: false,
          },
        },
      },
    });
    expect(graphCommandApplicationHoles(application)).toEqual(['next-title']);
  });

  it('cannot lower while open and lowers a closed value to the unchanged protocol', () => {
    const open = openGraphCommandApplication(request, [Document], { title: 'next-title' });
    expect(lowerGraphCommandApplication(open, [Document])).toEqual({
      success: false,
      reason: 'open-application',
      holes: ['next-title'],
    });

    const substitution = substituteGraphCommandApplication(
      open,
      [Document],
      'next-title',
      '  Revised  ',
    );
    expect(substitution.success).toBe(true);
    if (!substitution.success) return;
    expect(lowerGraphCommandApplication(substitution.application, [Document])).toEqual({
      success: true,
      request: {
        ...request,
        command: {
          ...request.command,
          values: { title: 'Revised', published: false },
        },
      },
    });
  });

  it('validates and normalizes every value field sharing a Hole independently', () => {
    const repeatedRequest = toGraphCommandRequest(
      mutateEntity(Document).update(target, { title: 'placeholder', label: 'placeholder' }),
    );
    const open = openGraphCommandApplication(repeatedRequest, [Document], {
      title: 'text',
      label: 'text',
    });

    expect(graphCommandApplicationHoles(open)).toEqual(['text']);
    expect(substituteGraphCommandApplication(open, [Document], 'text', '')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ path: ['title'] }],
    });
    expect(substituteGraphCommandApplication(open, [Document], 'text', '  Notes  ')).toMatchObject({
      success: true,
      application: {
        request: {
          command: {
            values: { title: 'Notes', label: '  Notes  ' },
          },
        },
      },
    });
    expect(substituteGraphCommandApplication(open, [Document], 'missing', 'Notes')).toEqual({
      success: false,
      reason: 'unknown-hole',
      holeId: 'missing',
    });
  });

  it('rejects unsupported commands, missing value fields, and unknown Entities when opening', () => {
    const deleteRequest = toGraphCommandRequest(mutateEntity(Document).delete(target));
    expect(() => openGraphCommandApplication(deleteRequest, [Document], {})).toThrow(
      'Graph Command application requires an Entity create or update payload.',
    );
    const unsupported = { kind: 'graph-command-application' as const, request: deleteRequest };
    expect(graphCommandApplicationHoles(unsupported)).toEqual([]);
    expect(substituteGraphCommandApplication(unsupported, [Document], 'target', target)).toEqual({
      success: false,
      reason: 'unknown-hole',
      holeId: 'target',
    });
    expect(() => openGraphCommandApplication(request, [Document], { label: 'label' })).toThrow(
      'Graph Command application has no value field for label.',
    );
    expect(() => openGraphCommandApplication(request, [], { title: 'title' })).toThrow(
      'Unknown data graph Entity',
    );
  });

  it('rejects unknown substitution fields and invalid closed requests', () => {
    const open = openGraphCommandApplication(request, [Document], { title: 'next-title' });
    expect(
      substituteGraphCommandApplication(
        {
          ...open,
          request: {
            ...open.request,
            command: { ...open.request.command, entityName: 'Missing' },
          } as typeof open.request,
        },
        [Document],
        'next-title',
        'Revised',
      ),
    ).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ path: ['title'] }],
    });

    const substitution = substituteGraphCommandApplication(
      open,
      [Document],
      'next-title',
      'Revised',
    );
    expect(substitution.success).toBe(true);
    if (!substitution.success) return;
    expect(
      lowerGraphCommandApplication(
        {
          ...substitution.application,
          request: { ...substitution.application.request, version: 99 } as never,
        },
        [Document],
      ),
    ).toMatchObject({
      success: false,
      reason: 'invalid-request',
      error: { error: { code: 'unsupported_version' } },
    });
  });
});
