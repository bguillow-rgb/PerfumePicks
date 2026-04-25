import { View, StyleSheet, ScrollView, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '@/src/constants/theme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  padded?: boolean;
}

export function ScreenWrapper({ children, scroll = false, style, padded = true }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();

  const containerStyle = [
    styles.container,
    {
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    padded && styles.padded,
    style,
  ];

  if (scroll) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          { paddingTop: insets.top, paddingBottom: insets.bottom + SPACING.xl },
          padded && styles.padded,
          style,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  padded: {
    paddingHorizontal: SPACING.md,
  },
});
