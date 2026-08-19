import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { BuildWardrobeCard } from '@/src/components/home/BuildWardrobeCard';
import { track, EVENTS } from '@/src/lib/observability';

jest.mock('@/src/lib/observability', () => ({
  track: jest.fn(),
  EVENTS: {
    WARDROBE_NUDGE_SHOWN: 'wardrobe_nudge_shown',
    WARDROBE_NUDGE_TAPPED: 'wardrobe_nudge_tapped',
  },
}));

const trackMock = track as jest.Mock;

function renderCard() {
  const onBrowse = jest.fn();
  const onScan = jest.fn();
  render(<BuildWardrobeCard onBrowse={onBrowse} onScan={onScan} />);
  return { onBrowse, onScan };
}

beforeEach(() => trackMock.mockClear());

describe('BuildWardrobeCard', () => {
  it('asks for the shelf and says what it buys the user', () => {
    renderCard();
    expect(screen.getByTestId('build-wardrobe-title')).toHaveTextContent(
      'Add all the bottles you own',
    );
    expect(screen.getByTestId('build-wardrobe-body')).toHaveTextContent(
      /So we can recommend your scent of the day/,
    );
  });

  it('stays slim: no progress meter, no section eyebrow', () => {
    renderCard();
    // The card is a prompt above the DNA card, not a content section. If a
    // meter or eyebrow creeps back in it stops being narrow.
    expect(screen.queryByTestId('shelf-dot-filled')).toBeNull();
    expect(screen.queryByTestId('shelf-dot-empty')).toBeNull();
    expect(screen.queryByText('YOUR SHELF')).toBeNull();
  });

  it('offers both doors and routes them to different places', () => {
    const { onBrowse, onScan } = renderCard();

    fireEvent.press(screen.getByTestId('build-wardrobe-browse'));
    expect(onBrowse).toHaveBeenCalledTimes(1);
    expect(onScan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('build-wardrobe-scan'));
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('logs an impression so the tap-through denominator is real', () => {
    renderCard();
    expect(trackMock).toHaveBeenCalledWith(EVENTS.WARDROBE_NUDGE_SHOWN, {});
  });

  it('attributes each tap to the door that was used', () => {
    renderCard();
    fireEvent.press(screen.getByTestId('build-wardrobe-scan'));
    expect(trackMock).toHaveBeenCalledWith(EVENTS.WARDROBE_NUDGE_TAPPED, {
      action: 'scan',
    });
  });

  it('keeps both CTAs at the 44pt minimum tap target', () => {
    renderCard();
    for (const id of ['build-wardrobe-browse', 'build-wardrobe-scan']) {
      const flat = Object.assign(
        {},
        ...[screen.getByTestId(id).props.style].flat(Infinity).filter(Boolean),
      );
      expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
