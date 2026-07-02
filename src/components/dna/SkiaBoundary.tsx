import { Component, type ReactNode } from 'react';
import { captureException } from '@/src/lib/observability';

/**
 * SkiaBoundary — last line of defence for the first-ever Skia use in the app.
 *
 * The Decanting reveal mounts a Skia <Canvas> on the /dna route, which the
 * onboarding guard PINS new users to until onboarding completes. If Skia throws
 * on mount on some real-device GPU/driver cohort (a risk we can't fully rule out
 * from the simulator, and can't roll back without an App Store round-trip since
 * Skia is a brand-new native dep not in the shipped binary), an unguarded throw
 * would unwind the whole /dna tree → white screen → trapped user → uninstall.
 *
 * This boundary catches that, reports it to Sentry (so we LEARN it happened
 * instead of reading it in a one-star review), and renders a static fallback
 * (the plain emblem the app already shipped) so the reveal degrades to boring
 * instead of broken. The fallback carries the same testID, so reveal asserts
 * keep passing either way.
 */
interface SkiaBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

export class SkiaBoundary extends Component<SkiaBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    captureException(error, { surface: 'dna_decanting_reveal' });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
