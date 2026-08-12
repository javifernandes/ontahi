import { Chunk, Effect, Stream } from 'effect';

export { Stream };

export const fromEffect = Stream.fromEffect;
export const fromIterable = Stream.fromIterable;
export const fromIterableEffect = Stream.fromIterableEffect;
export const flatMap = Stream.flatMap;
export const grouped = Stream.grouped;
export const mapEffect = Stream.mapEffect;
export const runCollect = Stream.runCollect;
export const runDrain = Stream.runDrain;

export const runCollectArray = <A, E, R>(self: Stream.Stream<A, E, R>) =>
  Stream.runCollect(self).pipe(Effect.map(Chunk.toReadonlyArray));
