import { Effect } from 'effect';
import type { IValidation } from 'typia';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  contract,
  contractFromValidation,
  contractFromZod,
  createOperationFailure,
  createTypiaValidationMessageFormatter,
  typiaFieldMessage,
  withEffects,
  type LayerConcernRuntime,
} from '../../../src/runtime/server/index.js';

type TestInput = {
  bookSlug: string;
};

const createRuntime = (input: TestInput): LayerConcernRuntime<TestInput> => ({
  scope: 'tests.runtime.contract',
  telemetrySpanName: 'tests.runtime.contract',
  input,
  resources: new Map(),
});

describe('contract concern', () => {
  it('runs pre checks before the wrapped effect', async () => {
    const calls: string[] = [];
    const runtime = createRuntime({ bookSlug: 'progbook' });
    const concern = contract<TestInput, { ok: true }>({
      pre: input => {
        calls.push(`pre:${input.bookSlug}`);
      },
      post: (_input, result) => {
        calls.push(`post:${result.ok}`);
      },
    });

    const result = await Effect.runPromise(
      concern.run(
        runtime,
        Effect.sync(() => {
          calls.push('next');
          return { ok: true as const };
        }),
      ),
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['pre:progbook', 'next', 'post:true']);
  });

  it('fails on the first pre-check failure without running the wrapped effect', async () => {
    const next = vi.fn(() => ({ ok: true }));
    const runtime = createRuntime({ bookSlug: '' });
    const failure = createOperationFailure('missing_book_slug', 'Book slug is required.');
    const concern = contract<TestInput, { ok: true }>({
      pre: [
        () => failure,
        () => createOperationFailure('other_failure', 'Should not be observed.'),
      ],
    });

    await expect(
      Effect.runPromise(Effect.flip(concern.run(runtime, Effect.sync(next)))),
    ).resolves.toEqual(failure);
    expect(next).not.toHaveBeenCalled();
  });

  it('runs post checks against the unwrapped success payload value', async () => {
    const post = vi.fn();
    const runtime = createRuntime({ bookSlug: 'progbook' });
    const concern = contract<TestInput, { documentCount: number }>({
      post,
    });
    const payload = withEffects({ documentCount: 3 }, []);

    const result = await Effect.runPromise(concern.run(runtime, Effect.succeed(payload)));

    expect(result).toBe(payload);
    expect(post).toHaveBeenCalledWith({ bookSlug: 'progbook' }, { documentCount: 3 }, runtime);
  });

  it('creates pre-check failures from generic validation results', () => {
    const preCheck = contractFromValidation<TestInput, { code: string }, 'invalid_book'>(
      () => ({
        success: false,
        errors: [{ code: 'too_small' }],
      }),
      {
        reason: 'invalid_book',
        formatMessage: errors => `First error: ${errors[0]?.code}`,
      },
    );

    expect(preCheck({ bookSlug: '' }, createRuntime({ bookSlug: '' }))).toEqual({
      reason: 'invalid_book',
      message: 'First error: too_small',
    });
  });

  it('creates pre-check failures from zod schemas', () => {
    const schema = z.object({
      bookSlug: z.string().min(1, 'Book slug is required.'),
    });
    const preCheck = contractFromZod(schema);

    expect(preCheck({ bookSlug: '' }, createRuntime({ bookSlug: '' }))).toEqual({
      reason: 'invalid_input',
      message: 'Book slug is required.',
    });
  });

  it('formats typia validation field messages by path and expected constraint', () => {
    const formatter = createTypiaValidationMessageFormatter<TestInput>(
      {
        bookSlug: typiaFieldMessage.requiredString('Book slug', {
          maxLength: 12,
          maxLengthMessage: 'Book slug is too long.',
        }),
      },
      { defaultMessage: 'Invalid input.' },
    );

    expect(
      formatter([
        {
          path: '$input.bookSlug',
          expected: 'string & MaxLength<12>',
          value: 'a-very-long-book-slug',
        } satisfies IValidation.IError,
      ]),
    ).toBe('Book slug is too long.');
    expect(
      formatter([
        {
          path: '$input.unknown',
          expected: 'string',
          value: null,
        } satisfies IValidation.IError,
      ]),
    ).toBe('Invalid input.');
  });
});
