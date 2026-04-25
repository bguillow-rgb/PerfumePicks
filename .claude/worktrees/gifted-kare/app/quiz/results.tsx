import { View, Text, StyleSheet, ScrollView, Pressable, Image, Switch, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Meter } from '@/src/components/ui/Meter';
import { Button } from '@/src/components/ui/Button';
import { COLORS, SPACING, FONTS } from '@/src/constants/theme';
import { scoreQuiz } from '@/src/features/quiz/scoring';
import { getDrinkPairings, type DrinkPairing } from '@/src/features/quiz/pairings';
import { CommunityRating } from '@/src/components/cigar/CommunityRating';
import { useCommunityRatings } from '@/src/hooks/useCommunityRating';
import { useHumidorStatuses } from '@/src/hooks/useHumidorStatuses';
import { StatusChips } from '@/src/components/ui/StatusChip';
import type { Cigar, QuizAnswers } from '@/src/types/cigar';

interface ScoredCigar {
  cigar: Cigar;
  score: number;
  reasons: string[];
}

export default function QuizResultsScreen() {
  const params = useLocalSearchParams<{ answers: string; mode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<ScoredCigar[]>([]);
  const [includeCubans, setIncludeCubans] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdvanced = params.mode === 'advanced';
  const ratingsMap = useCommunityRatings(results.map((r) => r.cigar.id));
  const humidorMap = useHumidorStatuses(results.map((r) => r.cigar.id));
  let answers: QuizAnswers;
  try {
    answers = params.answers
      ? JSON.parse(params.answers)
      : { strength: null, smoothness: null, body: null, time: null, price: null, flavors: [], adventure: null, wrapper: null, origin: null };
  } catch {
    answers = { strength: null, smoothness: null, body: null, time: null, price: null, flavors: [], adventure: null, wrapper: null, origin: null };
  }

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('cigars').select('*');
        const cigars = (data as Cigar[]) ?? [];
        const scored = scoreQuiz(answers, cigars);
        setResults(scored);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = includeCubans
    ? results
    : results.filter((r) => !r.cigar.origin?.toLowerCase().includes('cuba'));

  const top = filtered[0];
  const maxAlts = isAdvanced ? 9 : 2; // basic: top 3 total, advanced: top 10
  const alts = filtered.slice(1, maxAlts + 1);

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={true}
      indicatorStyle="white"
      bounces={true}
      alwaysBounceVertical={true}
    >
      {/* Navigation header */}
      <View style={styles.navRow}>
        <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12}>
          <Text style={styles.navLink}>Home</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/(tabs)/browse')} hitSlop={12}>
          <Text style={styles.navLink}>Browse</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/(tabs)/humidor')} hitSlop={12}>
          <Text style={styles.navLink}>Humidor</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>Your Match</Text>
      {loading ? (
        <View style={{ alignItems: 'center', paddingTop: SPACING.xxl }}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={[styles.subheader, { marginTop: SPACING.md }]}>Finding your perfect cigar...</Text>
        </View>
      ) : (
      <Text style={styles.subheader}>
        {top ? 'A confident pick based on your preferences.' : 'No matches found. Try different preferences.'}
      </Text>
      )}

      <View style={styles.cubanToggle}>
        <Text style={styles.cubanLabel}>Include Cuban Cigars</Text>
        <Switch
          value={includeCubans}
          onValueChange={setIncludeCubans}
          trackColor={{ false: COLORS.border, true: COLORS.accent }}
          thumbColor={COLORS.text}
        />
      </View>

      {top && (
        <Card style={styles.heroCard} onPress={() => router.push(`/(tabs)/cigar/${top.cigar.id}`)}>
          {top.cigar.image_url && (
            <Image source={{ uri: top.cigar.image_url }} style={styles.heroImg} resizeMode="cover" />
          )}
          <Text style={styles.kicker}>BEST MATCH</Text>
          <Text style={styles.heroName}>{top.cigar.line ?? top.cigar.name}</Text>
          <Text style={styles.heroBrand}>{top.cigar.brand}</Text>
          <View style={{ marginTop: SPACING.sm }}>
            <Meter label="Strength" value={top.cigar.strength} />
            <Meter label="Body" value={top.cigar.body} />
            <Meter label="Price" value={top.cigar.price_tier} />
          </View>
          <View style={styles.flavors}>
            {top.cigar.flavors.slice(0, 4).map((f) => (
              <Badge key={f} label={f} />
            ))}
          </View>
          <StatusChips statuses={humidorMap.get(top.cigar.id) ?? []} />
          {(() => {
            const r = ratingsMap.get(top.cigar.id);
            return r && r.count > 0 ? (
              <CommunityRating average={r.average} count={r.count} variant="compact" />
            ) : null;
          })()}
          {top.reasons.length > 0 && (
            <View style={styles.reasons}>
              <Text style={styles.reasonsTitle}>Why this match</Text>
              {top.reasons.map((r, i) => (
                <Text key={i} style={styles.reason}>{r}</Text>
              ))}
            </View>
          )}
          {isAdvanced && (
            <View style={styles.pairings}>
              <Text style={styles.pairingsTitle}>Pair it with</Text>
              {getDrinkPairings(top.cigar).map((p, i) => (
                <View key={i} style={styles.pairingRow}>
                  <Text style={styles.pairingDrink}>{p.drink}</Text>
                  <Text style={styles.pairingReason}>{p.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {alts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>More Picks</Text>
          {alts.map((item, i) => (
            <Card
              key={item.cigar.id}
              style={styles.altCard}
              onPress={() => router.push(`/(tabs)/cigar/${item.cigar.id}`)}
            >
              <View style={styles.altHeader}>
                {item.cigar.image_url && (
                  <Image source={{ uri: item.cigar.image_url }} style={styles.altThumb} resizeMode="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName}>{item.cigar.line ?? item.cigar.name}</Text>
                  <Text style={styles.altBrand}>{item.cigar.brand}</Text>
                </View>
                <Text style={styles.altRank}>#{i + 2}</Text>
              </View>
              <View style={styles.flavors}>
                {item.cigar.flavors.slice(0, 3).map((f) => (
                  <Badge key={f} label={f} />
                ))}
              </View>
              <StatusChips statuses={humidorMap.get(item.cigar.id) ?? []} />
              {(() => {
                const r = ratingsMap.get(item.cigar.id);
                return r && r.count > 0 ? (
                  <CommunityRating average={r.average} count={r.count} variant="compact" />
                ) : null;
              })()}
            </Card>
          ))}
        </>
      )}

      {/* Pro upsell for basic quiz users */}
      {!isAdvanced && (
        <Card style={styles.proCard}>
          <Text style={styles.proTitle}>Want better matches?</Text>
          <Text style={styles.proSub}>
            Unlock the Advanced Quiz with 9 questions, wrapper and origin preferences, top 10 results, and your personal humidor.
          </Text>
          <Button
            title="Upgrade to Pro"
            onPress={() => router.push('/paywall')}
            style={{ marginTop: SPACING.sm }}
          />
        </Card>
      )}

      <Button
        title="Retake Quiz"
        variant="secondary"
        onPress={() => router.replace(isAdvanced ? '/quiz?mode=advanced' : '/quiz')}
        style={{ marginTop: SPACING.md }}
      />
      <Button
        title="Back to Home"
        variant="ghost"
        onPress={() => router.replace('/(tabs)')}
        style={{ marginTop: SPACING.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  navLink: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  header: {
    fontFamily: FONTS.display,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  subheader: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  cubanToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  cubanLabel: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  heroCard: {
    paddingVertical: SPACING.lg,
  },
  heroImg: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  kicker: {
    fontFamily: 'Cormorant',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  heroName: {
    fontFamily: 'Cormorant',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  heroBrand: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  flavors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SPACING.sm,
  },
  reasons: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reasonsTitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  reason: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 20,
  },
  pairings: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pairingsTitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: SPACING.sm,
  },
  pairingRow: {
    marginBottom: SPACING.sm,
  },
  pairingDrink: {
    fontFamily: 'Cormorant',
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  pairingReason: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  altCard: {
    marginBottom: SPACING.sm,
  },
  altThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  altHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  altName: {
    fontFamily: 'Cormorant',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  altBrand: {
    fontFamily: 'Cormorant',
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  altRank: {
    fontFamily: 'Cormorant',
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.subtle,
  },
  proCard: {
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: SPACING.lg,
  },
  proTitle: {
    fontFamily: 'Cormorant',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.accent,
    textAlign: 'center',
  },
  proSub: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
});
