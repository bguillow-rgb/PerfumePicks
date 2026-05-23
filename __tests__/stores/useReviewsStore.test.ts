import { useReviewsStore } from '@/src/stores/useReviewsStore';

const expoCrypto = require('expo-crypto');

beforeEach(() => {
  expoCrypto.__resetCounter();
  useReviewsStore.setState({ mine: [], community: {}, helpfulVotes: [] });
});

describe('useReviewsStore', () => {
  describe('upsert()', () => {
    it('creates a new review for a fragrance', () => {
      const id = useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 4, title: 'Lovely', body: 'Great scent' });
      expect(typeof id).toBe('string');
      expect(id).toBeTruthy();
      const mine = useReviewsStore.getState().mine;
      expect(mine).toHaveLength(1);
      expect(mine[0].fragrance_id).toBe('frag-1');
      expect(mine[0].rating).toBe(4);
      expect(mine[0].title).toBe('Lovely');
    });

    it('updates the existing review (same fragrance_id) rather than creating a duplicate', () => {
      const id1 = useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 3 });
      const id2 = useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 5, body: 'Updated thoughts' });
      // Same review ID returned
      expect(id1).toBe(id2);
      // Only one review in store
      expect(useReviewsStore.getState().mine).toHaveLength(1);
      // Updated values
      const review = useReviewsStore.getState().mine[0];
      expect(review.rating).toBe(5);
      expect(review.body).toBe('Updated thoughts');
    });

    it('creates separate reviews for different fragrances', () => {
      useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 4 });
      useReviewsStore.getState().upsert({ fragrance_id: 'frag-2', rating: 3 });
      expect(useReviewsStore.getState().mine).toHaveLength(2);
    });
  });

  describe('remove()', () => {
    it('deletes by ID', () => {
      const id = useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 4 });
      useReviewsStore.getState().remove(id);
      expect(useReviewsStore.getState().mine).toHaveLength(0);
    });

    it('does not delete other reviews', () => {
      const id1 = useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 4 });
      const id2 = useReviewsStore.getState().upsert({ fragrance_id: 'frag-2', rating: 3 });
      useReviewsStore.getState().remove(id1);
      expect(useReviewsStore.getState().mine).toHaveLength(1);
      expect(useReviewsStore.getState().mine[0].id).toBe(id2);
    });
  });

  describe('myReviewFor()', () => {
    it('returns the review for a given fragrance', () => {
      useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 5 });
      const review = useReviewsStore.getState().myReviewFor('frag-1');
      expect(review).not.toBeNull();
      expect(review?.fragrance_id).toBe('frag-1');
      expect(review?.rating).toBe(5);
    });

    it('returns null when no review for fragrance', () => {
      expect(useReviewsStore.getState().myReviewFor('not-reviewed')).toBeNull();
    });
  });

  describe('forFragrance()', () => {
    it('places myReview first in the list', () => {
      useReviewsStore.getState().upsert({ fragrance_id: 'frag-1', rating: 4 });
      const myReview = useReviewsStore.getState().mine[0];

      const communityRows = [
        { id: 'c1', fragrance_id: 'frag-1', user_id: 'user-2', rating: 3, helpful_count: 2, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
        { id: 'c2', fragrance_id: 'frag-1', user_id: 'user-3', rating: 5, helpful_count: 0, created_at: '2026-05-02T00:00:00Z', updated_at: '2026-05-02T00:00:00Z' },
      ];
      useReviewsStore.getState().setCommunity('frag-1', communityRows);

      const result = useReviewsStore.getState().forFragrance('frag-1');
      expect(result[0].id).toBe(myReview.id);
      expect(result).toHaveLength(3);
    });

    it('returns community reviews when user has no review', () => {
      const communityRows = [
        { id: 'c1', fragrance_id: 'frag-1', user_id: 'user-2', rating: 3, helpful_count: 1, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
      ];
      useReviewsStore.getState().setCommunity('frag-1', communityRows);
      const result = useReviewsStore.getState().forFragrance('frag-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('returns empty array when no reviews at all', () => {
      expect(useReviewsStore.getState().forFragrance('no-reviews')).toEqual([]);
    });
  });

  describe('toggleHelpful()', () => {
    it('adds vote to helpfulVotes', () => {
      useReviewsStore.getState().toggleHelpful('review-123');
      expect(useReviewsStore.getState().helpfulVotes).toContain('review-123');
    });

    it('removes vote if already voted (toggle off)', () => {
      useReviewsStore.getState().toggleHelpful('review-123');
      useReviewsStore.getState().toggleHelpful('review-123');
      expect(useReviewsStore.getState().helpfulVotes).not.toContain('review-123');
    });

    it('optimistically increments helpful_count in community cache', () => {
      useReviewsStore.getState().setCommunity('frag-1', [
        { id: 'r1', fragrance_id: 'frag-1', user_id: 'u1', rating: 4, helpful_count: 5, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
      ]);
      useReviewsStore.getState().toggleHelpful('r1');
      const updated = useReviewsStore.getState().community['frag-1'][0];
      expect(updated.helpful_count).toBe(6);
    });

    it('optimistically decrements helpful_count on untoggle', () => {
      useReviewsStore.getState().setCommunity('frag-1', [
        { id: 'r1', fragrance_id: 'frag-1', user_id: 'u1', rating: 4, helpful_count: 5, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
      ]);
      useReviewsStore.getState().toggleHelpful('r1');
      useReviewsStore.getState().toggleHelpful('r1');
      const updated = useReviewsStore.getState().community['frag-1'][0];
      expect(updated.helpful_count).toBe(5);
    });
  });
});
