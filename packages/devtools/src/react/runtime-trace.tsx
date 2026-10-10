import { useContext } from 'react';

import { ActivityMessage } from './activity-message.js';
import { formatClock, semanticSummary, type ExchangeActivity } from './activity-model.js';
import { AuthoringDialectContext } from './authoring-dialect.js';
import { styles } from './devtools-styles.js';
import type { GraphObservationActivity } from './graph-observation-model.js';

export const RuntimeTrace = ({
  exchanges = [],
  graphObservations = [],
  collapsible = true,
}: {
  readonly exchanges?: readonly ExchangeActivity[];
  readonly graphObservations?: readonly GraphObservationActivity[];
  readonly collapsible?: boolean;
}) => {
  const dialect = useContext(AuthoringDialectContext);
  const stepCount = exchanges.length + graphObservations.length;
  if (stepCount === 0) return null;
  const messages = (
    <ol style={styles.messageList} aria-label='Internal runtime trace'>
      {exchanges.map(exchange => {
        const event = exchange.started ?? exchange.settled;
        if (!event) return null;
        return (
          <ActivityMessage
            key={`exchange:${exchange.id}`}
            direction='↳'
            outcome={exchange.settled?.outcome ?? 'pending'}
            title={semanticSummary(exchange, dialect)}
            time={formatClock(exchange.at)}
            transport={event.transportId}
            detail={exchange.settled ? `${exchange.settled.durationMs} ms` : undefined}
            value={exchange.started?.request}
            label='Internal request JSON'
            response={
              exchange.settled?.response
                ? { value: exchange.settled.response, label: 'Internal response JSON' }
                : undefined
            }
          />
        );
      })}
      {graphObservations.flatMap(observation =>
        observation.snapshots.map(snapshot => (
          <ActivityMessage
            key={`graph-observation:${observation.id}:${snapshot.sequence}`}
            direction='↳'
            outcome='success'
            title={`Graph Read refresh #${snapshot.sequence}`}
            time={formatClock(snapshot.at)}
            transport={snapshot.transportId}
            detail={`${snapshot.rowCount ?? 'unknown'} rows`}
            value={snapshot}
            label={`Graph Read refresh ${snapshot.sequence} JSON`}
          />
        )),
      )}
    </ol>
  );
  if (!collapsible) return messages;
  return (
    <details style={styles.runtimeTrace}>
      <summary style={styles.runtimeTraceSummary}>
        Runtime trace · {stepCount} internal {stepCount === 1 ? 'step' : 'steps'}
      </summary>
      {messages}
    </details>
  );
};
