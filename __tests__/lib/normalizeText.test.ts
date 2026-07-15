import { normalizeSearchText } from '@/src/lib/normalizeText';
import { normalizeStr } from '@/scripts/lib/affiliate-etl-base';

describe('normalizeSearchText', () => {
  it('strips the accents that made the catalog unsearchable', () => {
    // Every one of these is a real brand or fragrance in the catalog that
    // returned zero rows when the user typed the natural spelling.
    expect(normalizeSearchText('Hermès')).toBe('hermes');
    expect(normalizeSearchText('Lancôme')).toBe('lancome');
    expect(normalizeSearchText('Météore')).toBe('meteore');
    expect(normalizeSearchText('Stéphane Humbert Lucas 777')).toBe('stephane humbert lucas 777');
    expect(normalizeSearchText('Acqua di Giò Profondo')).toBe('acqua di gio profondo');
    expect(normalizeSearchText('INITIO Parfums Privés')).toBe('initio parfums prives');
    expect(normalizeSearchText('Neela Vermeire Créations')).toBe('neela vermeire creations');
    expect(normalizeSearchText('Bibliothèque')).toBe('bibliotheque');
  });

  it('is idempotent, so an already-accentless query is untouched', () => {
    expect(normalizeSearchText('hermes')).toBe('hermes');
    expect(normalizeSearchText(normalizeSearchText('Hermès'))).toBe('hermes');
  });

  it('collapses punctuation and whitespace to single spaces', () => {
    expect(normalizeSearchText("L'Eau d'Issey")).toBe('l eau d issey');
    expect(normalizeSearchText('  Sauvage   Elixir  ')).toBe('sauvage elixir');
  });

  it('matches the ETL normalizer that already built every slug in the catalog', () => {
    // The client and the ETL must agree or the DB mirror column (built with the
    // SQL twin of this function) would not match what the client searches for.
    for (const s of [
      'Hermès', 'Lancôme', 'Météore', 'Café Rose', 'Cinéma', 'Ethéré Parfum',
      'Régime des Fleurs', "L'Eau d'Issey", 'Sauvage', 'Acqua di Giò Profondo',
    ]) {
      expect(normalizeSearchText(s)).toBe(normalizeStr(s));
    }
  });
});
