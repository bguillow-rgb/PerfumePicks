import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, TYPE, RADIUS, FONTS } from '@/src/constants/theme';
import type { FragranceDNA } from '@/src/features/dna/types';
import { getLadderById } from '@/src/features/dna';

/**
 * Fragrance Journey — the full predictive ladder, rendered in the You DNA home.
 *
 * Reads the matched journey (ladderId + 1-based stage) off the DNA, looks up the
 * authored ladder, and lays it out as a vertical progression:
 *   ● Started        (rung 1, passed)
 *   ● You are here   (current rung, highlighted)
 *   ○ Next           (current + 1, with the "what you'll discover next" bottles)
 *   ○ …              (aspirational rungs)
 *
 * At launch the ladders are EXPERT-AUTHORED (source: "editorial"), so the copy is
 * softened — "people at your stage tend to explore…", never a promise. One
 * surface only: this is the single place the full ladder lives (the Today chip
 * just points here).
 */
export function JourneyLadder({ dna }: { dna: FragranceDNA }) {
  const journey = dna.journey;
  const ladder = getLadderById(journey?.ladderId);
  if (!journey || !ladder) return null;

  const current = journey.stage; // 1-based

  return (
    <View style={styles.wrap} testID="journey-ladder">
      <Text style={styles.eyebrow}>YOUR FRAGRANCE JOURNEY</Text>
      <Text style={styles.title}>{ladder.title}</Text>
      {journey.source === 'editorial' && (
        <Text style={styles.note}>
          A typical path for your taste — not a prediction, a place to explore from.
        </Text>
      )}

      <View style={styles.ladder}>
        {ladder.stages.map((stage, i) => {
          const rung = i + 1; // 1-based
          const isPast = rung < current;
          const isCurrent = rung === current;
          const isNext = rung === current + 1;
          const status = isCurrent
            ? 'You are here'
            : rung === 1 && isPast
              ? 'Started'
              : isNext
                ? 'Next'
                : null;

          return (
            <View key={stage.label} style={styles.rungRow}>
              {/* Rail: node + connector */}
              <View style={styles.rail}>
                <View
                  style={[
                    styles.node,
                    (isPast || isCurrent) && styles.nodeFilled,
                    isCurrent && styles.nodeCurrent,
                  ]}
                />
                {i < ladder.stages.length - 1 && (
                  <View style={[styles.connector, isPast && styles.connectorFilled]} />
                )}
              </View>

              {/* Content */}
              <View style={styles.rungContent}>
                {status && (
                  <Text
                    style={[styles.status, isCurrent && styles.statusCurrent]}
                    testID={isCurrent ? 'journey-you-are-here' : undefined}
                  >
                    {status}
                  </Text>
                )}
                <Text style={[styles.stageLabel, isCurrent && styles.stageLabelCurrent]}>
                  {stage.label}
                </Text>
                {isNext && stage.exemplars.length > 0 && (
                  <View style={styles.exemplarRow}>
                    {stage.exemplars.map((ex) => (
                      <View key={ex} style={styles.exemplarChip}>
                        <Text style={styles.exemplarText}>{ex}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const NODE = 14;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  eyebrow: { ...TYPE.eyebrow, marginBottom: SPACING.xs },
  title: { fontFamily: FONTS.serif, fontSize: 22, fontWeight: '700', color: COLORS.text },
  note: { ...TYPE.caption, color: COLORS.muted, marginTop: SPACING.xs, marginBottom: SPACING.md },

  ladder: { marginTop: SPACING.sm },
  rungRow: { flexDirection: 'row' },
  rail: { width: NODE, alignItems: 'center' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  nodeFilled: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  nodeCurrent: {
    width: NODE + 4,
    height: NODE + 4,
    borderRadius: (NODE + 4) / 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  connector: { width: 2, flex: 1, minHeight: SPACING.lg, backgroundColor: COLORS.border, marginTop: 2 },
  connectorFilled: { backgroundColor: COLORS.accent },

  rungContent: { flex: 1, paddingLeft: SPACING.md, paddingBottom: SPACING.lg },
  status: { ...TYPE.eyebrow, color: COLORS.muted, marginBottom: 2 },
  statusCurrent: { color: COLORS.accent },
  stageLabel: { ...TYPE.body, color: COLORS.text },
  stageLabelCurrent: { fontWeight: '700' },
  exemplarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.sm },
  exemplarChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.card2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exemplarText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
});
