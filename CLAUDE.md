# Perfume Picks (fragrance app — LIVE)

Live App Store app (id6774184221). KPI truth: `scripts/kpi-dashboard.js`. Launch date 2026-06-25; tester exclusion is mandatory in all user counts.

## DATA INTEGRITY RULES (non-negotiable — added 2026-08-07)

These exist because on 2026-08-07 five separate errors reached Bob in one day —
including a fabricated "32% search decline" published to a buyer-facing
dashboard — and every one had the same root cause: **a derived or carried number
was trusted instead of checked.** The real figure was +49%; the error came from
summing GSC query-dimension rows (which Google anonymizes and undercounts)
instead of reading the property-level total.

**1. Numbers come from the system that owns them, in the form that system
reports them.** Supabase counts come from SQL against production. Git counts
come from `git log`, run now. Store data comes from the ASC/iTunes APIs. Search
data comes from GSC property-level totals — NEVER from summing query rows.
Revenue comes from the payment ledger, not an analytics mirror. A number from a
prior report, brief, memory file, scoreboard, or summary is a CLAIM, not a
fact — re-pull it before repeating it.

**2. Derived numbers say so.** Anything summed, averaged, extrapolated, or
computed from other numbers is labeled as derived, with the method stated. If
the method has a known distortion (GSC query anonymization, GA4 sampling,
RevenueCat sandbox blending, ASC's 2–3 day lag), name it next to the number.

**3. A surprising number is a bug until proven otherwise.** Before writing any
narrative on top of a big swing (>±20%, a zero where there was activity, a
uniform change across unrelated things), check the window, the method, and the
source first. Uniform movement across independent properties is a measurement
artifact until shown otherwise — it is the tell, not the corroboration.

**4. Windows end where data is complete.** GSC lags 2–3 days; ASC daily reports
lag a day. A window ending "today" silently understates the tail. State the
window's end date next to the number.

**5. Unverifiable claims ship as `[unverified]` or not at all.** If the owning
system can't be queried right now, either mark the figure `[unverified]` inline
or leave it out. Never let an unmarked carried claim sit next to verified ones.

**6. Corrections are stated, not smoothed.** If a published number turns out
wrong, the correction names the old number, the new number, and the mechanism
of the error — in the same place the wrong number appeared.
