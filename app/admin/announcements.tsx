/**
 * Founder-only in-app message composer.
 *
 * Author a "what's new" announcement, pick the audience, and publish it straight
 * to the announcements table. It shows up as a modal on users' next app open
 * (once each), gated to the audience chosen here. Delivery lives in
 * useAnnouncement / AnnouncementModal; this is the authoring side.
 *
 * Access is gated two ways: this screen renders a locked state for non-founders,
 * and the announcements RLS write policy (202607172000) rejects non-founder
 * writes regardless. Reached from Profile → "Send a message" (founder only).
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnnouncementSheet } from '@/src/components/announcements/AnnouncementSheet';
import { Button } from '@/src/components/ui/Button';
import { Alert } from '@/src/components/ui/StyledAlert';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '@/src/constants/theme';
import type { Audience } from '@/src/features/announcements/useAnnouncement';
import { isFounder } from '@/src/lib/admin';
import { track, EVENTS } from '@/src/lib/observability';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getCurrentUser } from '@/src/stores/useAuthStore';

interface AnnouncementRow {
  id: string;
  active: boolean;
  audience: Audience;
  emoji: string | null;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
  created_at: string;
}

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: 'all', label: 'Everyone', hint: 'All users' },
  { key: 'pro', label: 'Pro only', hint: 'Paid subscribers' },
  { key: 'free', label: 'Free only', hint: 'Not-yet-Pro users' },
];

// The message's button. Acknowledge options (route null) just dismiss with that
// label. Destination options (route set) navigate there, and the modal also shows
// a secondary dismiss link. `cta` is the default button text.
const CTA_OPTIONS: { key: string; label: string; route: string | null; cta: string }[] = [
  { key: 'gotit', label: 'Got it', route: null, cta: 'Got it' },
  { key: 'sounds', label: 'Sounds Good!', route: null, cta: 'Sounds Good!' },
  { key: 'discover', label: 'Discover', route: '/(tabs)/discover', cta: 'Explore scents' },
  { key: 'wardrobe', label: 'Wardrobe', route: '/(tabs)/wardrobe', cta: 'Open your wardrobe' },
  { key: 'dna', label: 'Your DNA', route: '/taste-profile', cta: 'See your DNA' },
  { key: 'pro', label: 'Go Pro', route: '/paywall', cta: 'See Pro' },
];

export default function AnnouncementsComposer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [emoji, setEmoji] = useState('🌸');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [ctaKey, setCtaKey] = useState('gotit');
  const [ctaLabel, setCtaLabel] = useState('Got it');
  const [publishing, setPublishing] = useState(false);
  const [recent, setRecent] = useState<AnnouncementRow[]>([]);
  const [previewRow, setPreviewRow] = useState<AnnouncementRow | null>(null);

  const loadRecent = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data } = await supabase
      .from('announcements')
      .select('id,active,audience,emoji,title,body,cta_label,cta_route,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecent((data ?? []) as unknown as AnnouncementRow[]);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = getCurrentUser();
        if (!mounted) return;
        const ok = isFounder(user?.id);
        setAllowed(ok);
        if (ok) await loadRecent();
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadRecent]);

  const selectCta = (key: string) => {
    setCtaKey(key);
    const opt = CTA_OPTIONS.find((o) => o.key === key);
    // Reset the button text to the option's default. For destination options the
    // editable field below lets the founder tweak it; acknowledge options hide the
    // field and keep their fixed label.
    setCtaLabel(opt?.cta ?? '');
  };

  const canPublish = title.trim().length > 0 && body.trim().length > 0 && !publishing;

  const publish = async () => {
    if (!canPublish || !isSupabaseConfigured) return;
    const aud = AUDIENCES.find((a) => a.key === audience);
    Alert.alert(
      'Publish this message?',
      `It shows once to ${aud?.hint ?? audience} on their next app open.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true);
            try {
              const ctaOpt = CTA_OPTIONS.find((o) => o.key === ctaKey);
              const cta_route = ctaOpt?.route ?? null;
              // Store the button text for every option, including acknowledge
              // buttons (route null) so "Sounds Good!" / "Got it" render as the
              // primary button. Falls back to the option default, then "Got it".
              const cta_label = ctaLabel.trim() || ctaOpt?.cta || 'Got it';
              const { data, error } = await supabase
                .from('announcements')
                .insert({
                  active: true,
                  audience,
                  emoji: emoji.trim() || null,
                  title: title.trim(),
                  body: body.trim(),
                  cta_label,
                  cta_route,
                })
                .select('id')
                .single();
              if (error) throw error;
              track(EVENTS.ANNOUNCEMENT_PUBLISHED, {
                id: (data as { id?: string })?.id ?? null,
                audience,
                has_cta: !!cta_route,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Reset the composable fields, keep audience selection.
              setTitle('');
              setBody('');
              setCtaKey('gotit');
              setCtaLabel('Got it');
              await loadRecent();
              Alert.alert('Published', `Sent to ${aud?.label ?? audience}.`);
            } catch (e: unknown) {
              const err = e as { message?: string };
              Alert.alert('Could not publish', err?.message ?? 'Please try again.');
            } finally {
              setPublishing(false);
            }
          },
        },
      ],
    );
  };

  const toggleActive = async (row: AnnouncementRow) => {
    if (!isSupabaseConfigured) return;
    const next = !row.active;
    setRecent((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: next } : r)));
    Haptics.selectionAsync();
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ active: next })
        .eq('id', row.id);
      if (error) throw error;
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert('Update failed', err?.message ?? 'Please try again.');
      setRecent((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: row.active } : r)));
    }
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Send a message</Text>
      <View style={{ width: 22 }} />
    </View>
  );

  if (checkingAccess) {
    return <View style={styles.screen}>{Header}</View>;
  }

  if (!allowed) {
    return (
      <View style={styles.screen}>
        {Header}
        <View style={styles.lockedWrap}>
          <Ionicons name="lock-closed-outline" size={40} color={COLORS.subtle} />
          <Text style={styles.lockedText}>This area is for the Perfume Picks team.</Text>
        </View>
      </View>
    );
  }

  const ctaHasRoute = !!CTA_OPTIONS.find((o) => o.key === ctaKey)?.route;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {Header}
      <ScrollView
        contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Audience */}
        <Text style={styles.fieldLabel}>Who sees it</Text>
        <View style={styles.segment}>
          {AUDIENCES.map((a) => {
            const on = audience === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => setAudience(a.key)}
                style={[styles.segmentBtn, on && styles.segmentBtnOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{a.label}</Text>
                <Text style={[styles.segmentHint, on && styles.segmentHintOn]}>{a.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Emoji + Title */}
        <Text style={styles.fieldLabel}>Header</Text>
        <View style={styles.headerRow}>
          <TextInput
            style={[styles.input, styles.emojiInput]}
            value={emoji}
            onChangeText={setEmoji}
            placeholder="🌸"
            placeholderTextColor={COLORS.subtle}
            maxLength={2}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={COLORS.subtle}
            maxLength={80}
          />
        </View>

        {/* Body */}
        <Text style={styles.fieldLabel}>Message</Text>
        <TextInput
          style={[styles.input, styles.bodyInput]}
          value={body}
          onChangeText={setBody}
          placeholder="What do you want to tell them?"
          placeholderTextColor={COLORS.subtle}
          multiline
          maxLength={400}
        />

        {/* CTA */}
        <Text style={styles.fieldLabel}>Button</Text>
        <View style={styles.chipRow}>
          {CTA_OPTIONS.map((o) => {
            const on = ctaKey === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => selectCta(o.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {ctaHasRoute ? (
          <TextInput
            style={[styles.input, { marginTop: SPACING.sm }]}
            value={ctaLabel}
            onChangeText={setCtaLabel}
            placeholder="Button text"
            placeholderTextColor={COLORS.subtle}
            maxLength={30}
          />
        ) : null}

        <Button
          title="Publish now"
          variant="primary"
          disabled={!canPublish}
          loading={publishing}
          onPress={publish}
          style={{ marginTop: SPACING.lg, alignSelf: 'stretch' }}
        />

        {/* Recent */}
        {recent.length > 0 ? (
          <>
            <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Live &amp; recent</Text>
            <Text style={styles.recentHint}>
              Tap a message to preview it. Tap Live/Off to publish or pull it.
            </Text>
            {recent.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setPreviewRow(r)}
                style={styles.recentRow}
                accessibilityRole="button"
                accessibilityLabel={`Preview "${r.title}"`}
              >
                <Text style={styles.recentEmoji}>{r.emoji || '•'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {r.audience === 'all' ? 'Everyone' : r.audience === 'pro' ? 'Pro' : 'Free'}
                    {'  ·  '}
                    {new Date(r.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Ionicons name="eye-outline" size={16} color={COLORS.subtle} />
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    toggleActive(r);
                  }}
                  style={styles.statusToggle}
                  hitSlop={8}
                >
                  <View style={[styles.statusDot, r.active ? styles.statusOn : styles.statusOff]} />
                  <Text style={[styles.statusText, r.active && { color: COLORS.accent }]}>
                    {r.active ? 'Live' : 'Off'}
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Tap-to-preview: the exact modal a user would see, before publishing.
          Buttons here just close the preview (no navigation, nothing sent). */}
      {previewRow ? (
        <AnnouncementSheet
          emoji={previewRow.emoji}
          title={previewRow.title}
          body={previewRow.body}
          primaryLabel={previewRow.cta_label || 'Got it'}
          onPrimary={() => setPreviewRow(null)}
          showDismiss={!!previewRow.cta_route}
          onDismiss={() => setPreviewRow(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...TYPE.heading },
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  lockedText: { ...TYPE.body, color: COLORS.subtle },
  fieldLabel: {
    ...TYPE.label,
    color: COLORS.muted,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  segmentBtnOn: { borderColor: COLORS.accent, backgroundColor: COLORS.card2 },
  segmentText: { fontFamily: FONTS.body, fontWeight: '600', fontSize: 14, color: COLORS.muted },
  segmentTextOn: { color: COLORS.accent },
  segmentHint: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.subtle, marginTop: 2 },
  segmentHintOn: { color: COLORS.muted },
  headerRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  emojiInput: { width: 56, textAlign: 'center' },
  bodyInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  chipText: { fontFamily: FONTS.body, fontWeight: '600', fontSize: 13, color: COLORS.muted },
  chipTextOn: { color: COLORS.white },
  recentHint: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.subtle, marginBottom: SPACING.xs },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  recentEmoji: { fontSize: 20, width: 24, textAlign: 'center' },
  recentTitle: { fontFamily: FONTS.body, fontWeight: '600', fontSize: 15, color: COLORS.text },
  recentMeta: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.subtle, marginTop: 2 },
  statusToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusOn: { backgroundColor: COLORS.accent },
  statusOff: { backgroundColor: COLORS.subtle },
  statusText: { fontFamily: FONTS.body, fontWeight: '600', fontSize: 12, color: COLORS.subtle },
});
