import { describe, expect, it } from 'vitest';

import { createEntityRef, entity, field, graphSchema } from '../data-graph/index.js';

import {
  prepareOperationApplicationChoice,
  projectOperationApplicationChoiceToForm,
  projectOperationApplicationChoiceToTaskInteraction,
  selectOperationApplicationChoice,
  type OperationApplicationChoicePresentation,
} from './operation-application-projection.js';
import type { OperationApplicationHoleResolution } from './operation-application-resolution.js';
import {
  lowerOperationApplication,
  normalizeOperationApplication,
} from './operation-application.js';

const TodoList = entity('SemanticProjectionTodoList', {
  id: field.id(),
  name: field.string(),
});
const completeAll = {
  id: 'SemanticProjectionTodoList.completeAll',
  input: graphSchema.object({ list: graphSchema.ref(TodoList) }),
};
const open = normalizeOperationApplication(completeAll);
const candidates = [
  {
    value: createEntityRef(TodoList, { id: 'list-inbox' }),
    provenance: { kind: 'authorized-graph-read' as const, entityName: TodoList.name },
  },
  {
    value: createEntityRef(TodoList, { id: 'list-later' }),
    provenance: { kind: 'authorized-graph-read' as const, entityName: TodoList.name },
  },
];
const resolution = {
  status: 'choice',
  holeId: 'list',
  candidates,
} satisfies OperationApplicationHoleResolution;

const compact: OperationApplicationChoicePresentation = {
  prompt: 'Choose a list',
  presentCandidate: candidate => {
    const ref = candidate.value as (typeof candidates)[number]['value'];
    return { id: ref.locator.id, label: ref.locator.id };
  },
};

describe('Operation application choice projection', () => {
  it('projects one semantic choice to form and Task interaction surfaces', () => {
    const choice = prepareOperationApplicationChoice(open, resolution, compact);

    expect(projectOperationApplicationChoiceToForm(choice)).toEqual({
      kind: 'form',
      fields: [
        {
          kind: 'choice',
          name: 'list',
          label: 'Choose a list',
          required: true,
          options: [
            { id: 'list-inbox', label: 'list-inbox' },
            { id: 'list-later', label: 'list-later' },
          ],
        },
      ],
    });
    expect(projectOperationApplicationChoiceToTaskInteraction(choice)).toEqual({
      id: `${completeAll.id}:list`,
      prompt: 'Choose a list',
      options: [
        { id: 'list-inbox', label: 'list-inbox', value: candidates[0] },
        { id: 'list-later', label: 'list-later', value: candidates[1] },
      ],
    });
  });

  it('accepts the same option identity from either surface and preserves provenance', () => {
    const choice = prepareOperationApplicationChoice(open, resolution, compact);
    const selected = selectOperationApplicationChoice(completeAll, choice, 'list-later');

    expect(selected).toEqual({
      success: true,
      application: {
        ...open,
        arguments: { list: { kind: 'value', value: candidates[1]!.value } },
      },
      candidate: candidates[1],
    });
    if (!selected.success) return;
    expect(lowerOperationApplication(completeAll, selected.application)).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: completeAll.id,
        input: { list: candidates[1]!.value },
      },
    });
  });

  it('allows presentation policies to vary without changing the application or candidates', () => {
    const conversational = prepareOperationApplicationChoice(open, resolution, {
      prompt: 'Where should I complete the todos?',
      presentCandidate: (candidate, index) => ({
        id: compact.presentCandidate(candidate, index).id,
        label: index === 0 ? 'Inbox' : 'Later',
      }),
    });

    expect(conversational.application).toBe(open);
    expect(conversational.options.map(option => option.candidate)).toEqual(candidates);
    expect(projectOperationApplicationChoiceToTaskInteraction(conversational)).toMatchObject({
      prompt: 'Where should I complete the todos?',
      options: [{ label: 'Inbox' }, { label: 'Later' }],
    });
  });

  it('rejects ambiguous presentations and unknown responses without mutating the program', () => {
    expect(() =>
      prepareOperationApplicationChoice(open, resolution, {
        prompt: '',
        presentCandidate: compact.presentCandidate,
      }),
    ).toThrow('choice prompt must not be empty');
    expect(() =>
      prepareOperationApplicationChoice(open, resolution, {
        prompt: 'Choose',
        presentCandidate: () => ({ id: 'same', label: 'List' }),
      }),
    ).toThrow('Duplicate Operation application choice option id "same".');
    expect(() =>
      prepareOperationApplicationChoice(open, resolution, {
        prompt: 'Choose',
        presentCandidate: () => ({ id: '', label: 'List' }),
      }),
    ).toThrow('choice option id must not be empty');
    expect(() =>
      prepareOperationApplicationChoice(open, resolution, {
        prompt: 'Choose',
        presentCandidate: () => ({ id: 'list', label: '' }),
      }),
    ).toThrow('choice option label must not be empty');

    const choice = prepareOperationApplicationChoice(open, resolution, compact);
    expect(selectOperationApplicationChoice(completeAll, choice, 'missing')).toEqual({
      success: false,
      reason: 'unknown-option',
      optionId: 'missing',
    });
    expect(choice.application).toBe(open);
  });

  it('requires a real multi-candidate choice and delegates schema validation', () => {
    expect(() =>
      prepareOperationApplicationChoice(
        open,
        { ...resolution, candidates: candidates.slice(0, 1) },
        compact,
      ),
    ).toThrow('choice requires at least two candidates');
    expect(() =>
      prepareOperationApplicationChoice(open, { ...resolution, holeId: 'missing' }, compact),
    ).toThrow(`Operation application choice Hole "missing" is not open in ${completeAll.id}.`);

    const choice = prepareOperationApplicationChoice(open, resolution, compact);
    const other = { ...completeAll, id: 'SemanticProjectionTodoList.archive' };
    expect(selectOperationApplicationChoice(other, choice, 'list-inbox')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ code: 'operation_mismatch' }],
    });
  });
});
