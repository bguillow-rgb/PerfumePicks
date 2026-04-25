// Drop-in replacement for the `.catch(() => {})` idiom. Behaviour for the
// caller is identical (non-throwing, non-blocking) but ops now sees the
// error in Sentry / dev console instead of being silently blind.
//
// Usage:
//   await somePromise.catch(captureSilent('context-tag'));
//   await somePromise.catch(captureSilent('context-tag', { extra: 'meta' }));
//
// Picking a context tag:
//   Something a human scanning Sentry can recognise, e.g. 'streak.hydrate',
//   'humidor.fetchStatuses'. Kebab or dotted style — consistency is more
//   important than a specific format.

import { captureException } from './errors';

export function captureSilent(
  context: string,
  extra?: Record<string, unknown>,
): (err: unknown) => void {
  return (err: unknown) => {
    captureException(err, { context, ...(extra ?? {}) });
  };
}
