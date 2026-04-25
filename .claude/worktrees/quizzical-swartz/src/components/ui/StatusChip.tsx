import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, RADIUS } from '@/src/constants/theme';

type HumidorStatus = 'wishlist' | 'owned' | 'smoked';

const STATUS_CONFIG: Record<HumidorStatus, { label: string; icon: string; bg: string; fg: string }> = {
  owned: { label: 'Owned', icon: 'checkmark-circle', bg: 'rgba(76,175,80,0.15)', fg: '#4CAF50' },
  smoked: { label: 'Smoked', icon: 'flame', bg: 'rgba(199,162,75,0.15)', fg: '#C7A24B' },
  wishlist: { label: 'Wishlist', icon: 'heart', bg: 'rgba(100,181,246,0.15)', fg: '#64B5F6' },
};

export function StatusChip({ status }: { status: HumidorStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <View style={[styles.chip, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon as any} size={10} color={config.fg} />
      <Text style={[styles.label, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
}

export function StatusChips({ statuses }: { statuses: HumidorStatus[] }) {
  if (!statuses || statuses.length === 0) return null;

  return (
    <View style={styles.row}>
      {statuses.map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
  },
  label: {
    fontFamily: FONTS.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
