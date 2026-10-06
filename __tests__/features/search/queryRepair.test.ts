import {
  brandLookupTokens,
  editDistance,
  isTypoOf,
  pickBrandFallback,
  type BrandCandidate,
} from '@/src/features/search/queryRepair';

// Every case below is a query that really returned nothing in production
// between 2026-08-01 and 2026-10-05, or a guard against the repair overreaching.

describe('brandLookupTokens', () => {
  it('drops the function words that fanned out across the brand table', () => {
    // "and" alone matched 26 brands for "bath and body works".
    expect(brandLookupTokens(['bath', 'and', 'body', 'works'])).toEqual(['bath', 'body', 'works']);
    // "perfume para los hombres" matched 21 brands on words that name none.
    expect(brandLookupTokens(['perfume', 'para', 'los', 'hombres'])).toEqual([]);
  });

  it('keeps real brand words and still drops tokens under 3 chars', () => {
    expect(brandLookupTokens(['parfums', 'de', 'marly', 'layton'])).toEqual(['marly', 'layton']);
    expect(brandLookupTokens(['le', 'labo', 'santal', '33'])).toEqual(['labo', 'santal']);
  });
});

describe('editDistance', () => {
  it('charges an adjacent transposition as one edit', () => {
    expect(editDistance('pual', 'paul')).toBe(1);
  });
  it('handles substitutions and empties', () => {
    expect(editDistance('pusl', 'paul')).toBe(2);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });
});

describe('isTypoOf', () => {
  it('accepts real misspellings of a brand word', () => {
    expect(isTypoOf('pual', 'paul')).toBe(true);
    expect(isTypoOf('pusl', 'paul')).toBe(true);
  });
  it('rejects different words, short tokens, and a changed first letter', () => {
    expect(isTypoOf('pual', 'patou')).toBe(false);
    expect(isTypoOf('ga', 'gaultier')).toBe(false);
    expect(isTypoOf('vaul', 'paul')).toBe(false);
  });
});

describe('pickBrandFallback', () => {
  const jeanBrands: BrandCandidate[] = [
    { id: 'patou', name_normalized: 'jean patou', aliases: null },
    { id: 'jpg', name_normalized: 'jean paul gaultier', aliases: ['jpg'] },
    { id: 'couturier', name_normalized: 'jean couturier', aliases: null },
  ];

  it('"jean pual" -> Jean Paul Gaultier, not the trigram favourite Jean Patou', () => {
    expect(pickBrandFallback(jeanBrands, ['jean', 'pual'])).toBe('jpg');
    expect(pickBrandFallback(jeanBrands, ['jean', 'pusl'])).toBe('jpg');
    expect(pickBrandFallback(jeanBrands, ['jean', 'pual', 'ga'])).toBe('jpg');
  });

  it('a single recognised house plus one unknown word shows that house', () => {
    expect(pickBrandFallback([{ id: 'kayali', name_normalized: 'kayali', aliases: null }], ['kayali', 'wedd'])).toBe('kayali');
    expect(
      pickBrandFallback([{ id: 'ysl', name_normalized: 'yves saint laurent', aliases: ['ysl'] }], ['ysl', 'babycat']),
    ).toBe('ysl');
  });

  it('stays empty when several words are unexplained - the brand match is incidental', () => {
    expect(
      pickBrandFallback([{ id: 'tbs', name_normalized: 'the body shop', aliases: null }], ['bath', 'and', 'body', 'works']),
    ).toBeNull();
  });

  it('stays empty on a genuine tie rather than guessing', () => {
    const toms: BrandCandidate[] = [
      { id: 'tf', name_normalized: 'tom ford', aliases: null },
      { id: 'th', name_normalized: 'tommy hilfiger', aliases: null },
    ];
    expect(pickBrandFallback(toms, ['tom', 'xyzzy'])).toBeNull();
  });

  it('prefers the brand that explains more of the query', () => {
    const toms: BrandCandidate[] = [
      { id: 'tf', name_normalized: 'tom ford', aliases: null },
      { id: 'th', name_normalized: 'tommy hilfiger', aliases: null },
    ];
    expect(pickBrandFallback(toms, ['tom', 'ford', 'xyzzy'])).toBe('tf');
  });

  it('returns null with nothing to work from', () => {
    expect(pickBrandFallback([], ['anything'])).toBeNull();
  });
});
