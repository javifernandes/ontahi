export type EventEffectIntent<TEvent = unknown> = {
  kind: 'emit-event';
  event: TEvent;
};

export type RunEffectIntent = {
  kind: 'run-effect';
  effect: import('effect').Effect.Effect<void, unknown>;
};

export type TryEffectIntent<TEvent = unknown> = {
  kind: 'try';
  intent: EventEffectIntent<TEvent> | RunEffectIntent;
};

export type EffectIntent<TEvent = unknown> =
  | EventEffectIntent<TEvent>
  | RunEffectIntent
  | TryEffectIntent<TEvent>;

export type EffectSuccessPayload<TData, TEvent = unknown> = {
  value: TData;
  effects: ReadonlyArray<EffectIntent<TEvent>>;
};

export type UnwrapEffectSuccess<TData> =
  TData extends EffectSuccessPayload<infer TValue, unknown> ? TValue : TData;

export type Effectors<TEvent = unknown> = {
  'emit-event'?: (
    intent: EventEffectIntent<TEvent>,
  ) => import('effect').Effect.Effect<void, unknown>;
  'run-effect'?: (intent: RunEffectIntent) => import('effect').Effect.Effect<void, unknown>;
};
