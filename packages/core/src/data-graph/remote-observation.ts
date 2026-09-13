/** Abort a pending transport pull before waiting for its iterator to close. */
export const withObservationLifetime = (
  open: (signal: AbortSignal) => AsyncIterable<unknown>,
): AsyncIterable<unknown> => ({
  [Symbol.asyncIterator]() {
    const controller = new AbortController();
    let iterator: AsyncIterator<unknown>;
    try {
      iterator = open(controller.signal)[Symbol.asyncIterator]();
    } catch (error) {
      controller.abort();
      throw error;
    }
    return {
      next: () => iterator.next(),
      return: async () => {
        // An async generator queues return() behind next(). Without abort, an idle live
        // transport can wait forever and keep both the subscription and finalizer alive.
        controller.abort();
        return iterator.return ? iterator.return() : { done: true, value: undefined };
      },
    };
  },
});
