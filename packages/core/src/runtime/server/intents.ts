import { isPlainObject } from '@ontahi/core/value/object';
import { Effect } from 'effect';

import { getArchitectureEffectors } from './architecture-registry.js';
import { getServerRuntimeConfig } from './config.js';
import { getOperationRuntimeContext } from './context.js';
import type {
  EffectIntent,
  EffectSuccessPayload,
  EventEffectIntent,
  RunEffectIntent,
  TryEffectIntent,
} from './effect-intents/types.js';
import { reportOperationWarning } from './failures.js';

export const event = <TEvent>(domainEvent: TEvent): EventEffectIntent<TEvent> => ({
  kind: 'emit-event',
  event: domainEvent,
});

export const run = (effect: RunEffectIntent['effect']): RunEffectIntent => ({
  kind: 'run-effect',
  effect,
});

export const tryEffect = <TEvent>(
  intent: TryEffectIntent<TEvent>['intent'],
): TryEffectIntent<TEvent> => ({
  kind: 'try',
  intent,
});

export const attempt = (effect: RunEffectIntent['effect']): TryEffectIntent =>
  tryEffect(run(effect));

export const attemptEvent = <TEvent>(domainEvent: TEvent): TryEffectIntent<TEvent> =>
  tryEffect(event(domainEvent));

export const withEffects = <TData, TEvent = unknown>(
  value: TData,
  effects: ReadonlyArray<EffectIntent<TEvent>>,
): EffectSuccessPayload<TData, TEvent> => ({
  value,
  effects,
});

export const isEffectSuccessPayload = <TData, TEvent = unknown>(
  value: unknown,
): value is EffectSuccessPayload<TData, TEvent> =>
  isPlainObject(value) &&
  'effects' in value &&
  Array.isArray((value as { effects?: unknown }).effects);

export const normalizeEffectSuccess = <TData, TEvent = unknown>(
  value: TData | EffectSuccessPayload<TData, TEvent>,
): { data: TData | void; effects: ReadonlyArray<EffectIntent<TEvent>> } => {
  if (isEffectSuccessPayload<TData, TEvent>(value)) {
    return {
      data: value.value,
      effects: value.effects,
    };
  }

  return {
    data: value,
    effects: [],
  };
};

const getEventType = (eventValue: unknown): string | undefined => {
  if (
    isPlainObject(eventValue) &&
    'type' in eventValue &&
    typeof (eventValue as { type?: unknown }).type === 'string'
  ) {
    return (eventValue as { type: string }).type;
  }

  return undefined;
};

const getIntentMetadata = <TEvent>(
  intent: EffectIntent<TEvent>,
): { intentKind: string; eventType?: string } => {
  switch (intent.kind) {
    case 'emit-event':
      return {
        intentKind: intent.kind,
        eventType: getEventType(intent.event),
      };
    case 'run-effect':
      return {
        intentKind: intent.kind,
      };
    case 'try': {
      const inner: { intentKind: string; eventType?: string } = getIntentMetadata(intent.intent);
      return {
        intentKind: `${intent.kind}:${inner.intentKind}`,
        ...(inner.eventType ? { eventType: inner.eventType } : {}),
      };
    }
  }
};

const resolveEffectIntent = async <TEvent>(intent: EventEffectIntent<TEvent> | RunEffectIntent) => {
  const effectors = await getArchitectureEffectors<TEvent>();

  if (intent.kind === 'run-effect') {
    return effectors['run-effect'] ? effectors['run-effect'](intent) : intent.effect;
  }

  const effector = effectors['emit-event'];
  if (!effector) {
    throw new Error('No effector registered for emit-event intents');
  }

  return effector(intent);
};

const executeRequiredEffectIntent = async <TEvent>(
  intent: EventEffectIntent<TEvent> | RunEffectIntent,
): Promise<void> => {
  const context = getOperationRuntimeContext();
  const { telemetry } = getServerRuntimeConfig<TEvent>();
  const metadata = getIntentMetadata(intent);

  await telemetry.withSpan(
    context?.telemetrySpanName
      ? `${context.telemetrySpanName}.${metadata.intentKind}`
      : `runtime.intent.${metadata.intentKind}`,
    {
      attributes: telemetry.getRuntimeAttributes({
        scope: context?.scope ?? 'runtime.intent',
        runtime: 'intent',
        attributes: metadata,
      }),
    },
    async span => {
      await Effect.runPromise(await resolveEffectIntent(intent));
      telemetry.markSuccess(span, metadata);
    },
  );
};

export const executeEffectIntents = async <TEvent>(
  intents: ReadonlyArray<EffectIntent<TEvent>> | undefined,
): Promise<void> => {
  if (!intents?.length) {
    return;
  }

  for (const intent of intents) {
    if (intent.kind === 'try') {
      try {
        await executeRequiredEffectIntent(intent.intent);
      } catch (cause) {
        reportOperationWarning('Failed to execute optional operation effect', cause, {
          ...getIntentMetadata(intent.intent),
        });
      }
      continue;
    }

    await executeRequiredEffectIntent(intent);
  }
};
