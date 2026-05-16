/**
 * Legacy scan route — redirects to the new multi-screen identify flow.
 * Kept so any existing deep links or navigation to /scan still work.
 */

import { Redirect } from 'expo-router';

export default function ScanRedirect() {
  return <Redirect href="/identify/camera" />;
}
