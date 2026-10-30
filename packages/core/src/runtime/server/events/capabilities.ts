import type {
  DurableEventDeliveryCapability,
  DurableEventDeliveryInspectionCapability,
  EventRuntime,
} from './types.js';

export const requireDurableEventDelivery = (
  runtime: EventRuntime,
): DurableEventDeliveryCapability => {
  const missing = [
    !runtime.capabilities.retention ? 'retention' : undefined,
    !runtime.capabilities.durableAcceptance ? 'durableAcceptance' : undefined,
    !runtime.capabilities.durableDelivery ? 'durableDelivery' : undefined,
    !runtime.capabilities.acknowledgement ? 'acknowledgement' : undefined,
    !runtime.durableDelivery ? 'durableDelivery API' : undefined,
  ].filter((capability): capability is string => capability !== undefined);
  if (missing.length > 0) {
    throw new TypeError(
      `Event Runtime cannot support a durable consumer; missing ${missing.join(', ')}.`,
    );
  }
  return runtime.durableDelivery!;
};

export const requireDurableEventDeliveryInspection = (
  runtime: EventRuntime,
): DurableEventDeliveryInspectionCapability => {
  if (!runtime.capabilities.deliveryInspection || !runtime.deliveryInspection) {
    throw new TypeError('Event Runtime does not provide durable Event delivery inspection.');
  }
  return runtime.deliveryInspection;
};
