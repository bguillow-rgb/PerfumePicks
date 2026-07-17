/**
 * In-app announcement modal — a dismissible "what's new" card shown once on app
 * load. Content and targeting come from the `announcements` table via
 * useAnnouncement. The visual card lives in AnnouncementSheet (shared with the
 * composer's preview); this wires the live behavior (seen-tracking, CTA nav,
 * analytics).
 *
 * Mounted self-contained on Home: renders nothing until the hook resolves an
 * eligible, unseen announcement for this user.
 */

import { useRouter } from 'expo-router';
import React from 'react';

import { AnnouncementSheet } from '@/src/components/announcements/AnnouncementSheet';
import { useAnnouncement } from '@/src/features/announcements/useAnnouncement';
import { track, EVENTS } from '@/src/lib/observability';

export function AnnouncementModal() {
  const router = useRouter();
  const { announcement, dismiss } = useAnnouncement();

  if (!announcement) return null;

  const handleDismiss = () => {
    track(EVENTS.ANNOUNCEMENT_DISMISSED, { id: announcement.id });
    dismiss();
  };

  const route = announcement.cta_route;
  const hasRoute = !!route;

  const handleCta = () => {
    track(EVENTS.ANNOUNCEMENT_CTA_TAPPED, { id: announcement.id, route: route ?? null });
    dismiss();
    // Defer navigation until after the modal unmounts so the transition doesn't
    // fight the dismiss animation.
    if (route) setTimeout(() => router.push(route as never), 0);
  };

  // With a destination, the primary button navigates and a secondary link handles
  // plain dismiss. Without one, the primary button IS the dismiss (label comes
  // from the message, e.g. "Sounds Good!"), with no secondary link.
  return (
    <AnnouncementSheet
      emoji={announcement.emoji}
      title={announcement.title}
      body={announcement.body}
      primaryLabel={announcement.cta_label || 'Got it'}
      onPrimary={hasRoute ? handleCta : handleDismiss}
      showDismiss={hasRoute}
      onDismiss={handleDismiss}
    />
  );
}
