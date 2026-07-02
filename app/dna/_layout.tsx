import { Stack } from 'expo-router';

/**
 * Pre-tab onboarding stack for the Fragrance DNA flow (M2+). Sibling of `(tabs)`
 * in the root Stack, so `(tabs)` — and Today's data hooks, ScanFAB/CompareFAB —
 * mount only AFTER the user finishes here. `index` is the picker grid; later
 * milestones add the reading/reveal/first-rec screens to this same stack.
 *
 * Gesture-back is disabled at the stack root: the picker is the front door of a
 * fresh install, there is nowhere behind it to swipe to.
 */
export default function DnaLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: '#FAF6F0' },
      }}
    >
      <Stack.Screen name="index" />
      {/* "More matches" — reachable from the reveal; swipe-back is fine here
          (it sits ON TOP of the picker/reveal, not as the front door). */}
      <Stack.Screen name="matches" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
