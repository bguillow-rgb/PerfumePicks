// app/i.tsx — invite deep-link landing inside the app.
//
// A universal link (https://perfumepicks.app/i?r=…&a=…) or the perfumepicks://i
// scheme routes here when the app is installed. We stash the referrer for
// attribution (redundant with the Linking listener in referral.ts, but robust
// against races) and bounce to the root, which the route guard sends to
// login/onboarding/home as appropriate. This screen renders nothing.
import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { captureReferralParams } from '@/src/lib/referral';

export default function InviteDeepLink() {
  const { r, a } = useLocalSearchParams<{ r?: string; a?: string }>();
  useEffect(() => {
    void captureReferralParams(
      typeof r === 'string' ? r : null,
      typeof a === 'string' ? a : null,
    );
  }, [r, a]);
  return <Redirect href="/" />;
}
