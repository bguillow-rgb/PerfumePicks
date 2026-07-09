/**
 * DNA V3 archetype flag — the SYNC side of the `dna_v3_archetypes` switch.
 *
 * The engine (deriveDna.ts) is pure and synchronous, so it reads this
 * module-level cache; the ASYNC remote resolution (app_settings row) lives in
 * killSwitch.ts (`useDnaV3ArchetypesEnabled`), which writes the cache. Kept in
 * a separate dependency-free module so the pure engine never imports
 * react-native/supabase.
 *
 * Unlike the kill-switches (fail OPEN), this is a NEW-FEATURE flag and fails
 * CLOSED: default false, enabled only by an explicit truthy
 * `app_settings.dna_v3_archetypes` row. Flag off → the legacy SCORERS election
 * runs byte-identical (the no-regression contract).
 */

let enabled = false;

/** Synchronous read the engine uses at derivation time. */
export function isDnaV3ArchetypesEnabled(): boolean {
  return enabled;
}

/** Written by the remote resolver (killSwitch.ts) and by tests. */
export function setDnaV3ArchetypesEnabled(v: boolean): void {
  enabled = v;
}
