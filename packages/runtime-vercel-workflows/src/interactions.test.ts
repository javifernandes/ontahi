import { describe, expect, it } from 'vitest';

import { vercelInteractionHookToken, vercelInteractionId } from './interactions.js';

describe('Vercel Workflow interaction identities', () => {
  const ref = { taskId: 'TodoItem.deleteFromNamedList', runId: 'run:one' };

  it('derives stable ids for unnamed interactions and preserves explicit ids', () => {
    const request = {
      prompt: 'Which list?',
      options: [{ id: 'one', label: 'One', value: 'one' }],
    };

    expect(vercelInteractionId(ref, { step: 'choose' }, request)).toBe(
      vercelInteractionId(ref, { step: 'choose' }, request),
    );
    expect(vercelInteractionId(ref, { step: 'choose' }, { ...request, id: 'choose-list' })).toBe(
      'choose-list',
    );
  });

  it('keeps the native hook token deterministic and unambiguous', () => {
    const token = vercelInteractionHookToken(ref, 'approval/one');

    expect(token).toBe(vercelInteractionHookToken(ref, 'approval/one'));
    expect(token).toContain(encodeURIComponent(ref.taskId));
    expect(token).toContain(encodeURIComponent(ref.runId));
    expect(token).toContain(encodeURIComponent('approval/one'));
    expect(token).not.toBe(vercelInteractionHookToken(ref, 'approval/two'));
  });
});
