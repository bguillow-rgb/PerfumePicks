// Smoke test for captureSilent — the helper that replaces the
// `.catch(() => {})` idiom with a reported-and-swallowed variant.

import { captureSilent } from '../captureSilent';

// Mock the errors module so captureSilent's captureException dependency
// doesn't try to initialize Sentry during tests.
jest.mock('../errors', () => ({
  captureException: jest.fn(),
}));

import { captureException } from '../errors';

describe('captureSilent', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
  });

  it('forwards the error to captureException with the context tag', () => {
    const handler = captureSilent('streak.hydrate');
    const err = new Error('boom');

    handler(err);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err, {
      context: 'streak.hydrate',
    });
  });

  it('includes the extra metadata when provided', () => {
    const handler = captureSilent('scanCount.refresh', { userId: 'u_1' });

    handler(new Error('rls'));

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'scanCount.refresh',
        userId: 'u_1',
      }),
    );
  });

  it('does not throw (never rethrows) so a .catch() chain keeps flowing', () => {
    const handler = captureSilent('x');
    expect(() => handler(new Error('boom'))).not.toThrow();
  });
});
