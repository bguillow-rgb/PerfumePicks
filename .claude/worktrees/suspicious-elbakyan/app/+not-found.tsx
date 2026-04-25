import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { COLORS, SPACING } from '@/src/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.bg,
  },
  title: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  link: {
    marginTop: SPACING.md,
  },
  linkText: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '600',
  },
});
