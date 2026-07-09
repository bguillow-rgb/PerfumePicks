import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { PickerSearch } from '@/src/components/dna/PickerSearch';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '@/src/features/dna/pickerSearch';

/**
 * PickerSearch component (V3 M4 — FEATURE_PICKER_SEARCH.md). Runs in demo mode
 * (mocked lib/supabase → useCatalogStore.search filters MOCK_CATALOG), so the
 * shelf, the completeness gate, and the edge-state copy are exercised against
 * real catalog rows: "neroli sauvage" → a complete Creed bottle; "heretic" →
 * Heretic Parfum rows with empty top_accords (gated).
 */

const mockTrack = jest.fn();
jest.mock('@/src/lib/observability', () => ({
  track: (...a: unknown[]) => mockTrack(...a),
  EVENTS: { SEARCH_NO_RESULTS: 'search_no_results' },
}));

const onOpen = jest.fn();
const onClose = jest.fn();
const onPick = jest.fn();
const onEnrichRequest = jest.fn();

function renderSearch(open: boolean) {
  return render(
    <PickerSearch
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onPick={onPick}
      onEnrichRequest={onEnrichRequest}
    />,
  );
}

/** Type into the field and let the debounce + demo search settle. */
async function typeAndSettle(text: string) {
  fireEvent.changeText(screen.getByTestId('dna-search-input'), text);
  await act(async () => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('entry affordance (closed)', () => {
  it('renders the exact ownership-framed line and opens on tap', () => {
    renderSearch(false);
    expect(screen.getByText(/Own a bottle you don’t see\?/)).toBeTruthy();
    expect(screen.getByText('Search for it.')).toBeTruthy();
    // Closed state renders NO input, no shelf — grid untouched.
    expect(screen.queryByTestId('dna-search-input')).toBeNull();
    fireEvent.press(screen.getByTestId('dna-search-affordance'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('expanded field — edge states', () => {
  it('empty search (pre-typing): placeholder + the muted hint', () => {
    renderSearch(true);
    expect(screen.getByPlaceholderText('Search by brand or bottle')).toBeTruthy();
    expect(
      screen.getByText('Type a brand or bottle — like Baccarat Rouge 540'),
    ).toBeTruthy();
  });

  it('no results: one quiet line, query stays editable, search_no_results fires', async () => {
    renderSearch(true);
    await typeAndSettle('zzxqvblorp');
    expect(screen.getByTestId('dna-search-no-results').props.children.join('')).toContain(
      'No match for “zzxqvblorp”. Check the spelling — or it may not be in our catalog yet.',
    );
    // The field is still there and editable — no dead-end state.
    expect(screen.getByTestId('dna-search-input')).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith('search_no_results', { query_length: 10 });
  });

  it('complete result: renders on the shelf and taps through to onPick', async () => {
    renderSearch(true);
    await typeAndSettle('neroli sauvage');
    const results = screen.getAllByTestId('dna-search-result');
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(SEARCH_RESULT_LIMIT);
    expect(screen.getByText('Neroli Sauvage')).toBeTruthy();
    fireEvent.press(results[0]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].name).toBeTruthy();
    expect(onEnrichRequest).not.toHaveBeenCalled();
  });

  it('gated result (fails completeness): dimmed, "Details coming soon", tap enqueues enrich', async () => {
    renderSearch(true);
    await typeAndSettle('heretic');
    const gated = screen.getAllByTestId('dna-search-result-gated');
    expect(gated.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Details coming soon').length).toBe(gated.length);
    fireEvent.press(gated[0]);
    expect(onEnrichRequest).toHaveBeenCalledTimes(1);
    expect(onEnrichRequest.mock.calls[0][0].top_accords).toEqual([]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a new query replaces the shelf wholesale (abandoned results are ephemeral)', async () => {
    renderSearch(true);
    await typeAndSettle('neroli sauvage');
    expect(screen.getByText('Neroli Sauvage')).toBeTruthy();
    await typeAndSettle('heretic');
    expect(screen.queryByText('Neroli Sauvage')).toBeNull();
  });

  it('submit (keyboard Done) collapses the field', () => {
    renderSearch(true);
    fireEvent(screen.getByTestId('dna-search-input'), 'submitEditing');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the inline ✕ collapses the field', () => {
    renderSearch(true);
    fireEvent.press(screen.getByTestId('dna-search-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('collapsing clears the query — reopening starts fresh', async () => {
    const view = renderSearch(true);
    await typeAndSettle('neroli sauvage');
    view.rerender(
      <PickerSearch
        open={false}
        onOpen={onOpen}
        onClose={onClose}
        onPick={onPick}
        onEnrichRequest={onEnrichRequest}
      />,
    );
    view.rerender(
      <PickerSearch
        open
        onOpen={onOpen}
        onClose={onClose}
        onPick={onPick}
        onEnrichRequest={onEnrichRequest}
      />,
    );
    expect(screen.getByTestId('dna-search-input').props.value).toBe('');
    expect(screen.queryByTestId('dna-search-shelf')).toBeNull();
  });
});
