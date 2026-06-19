# Maestro E2E Tests

Smoke/regression suite for the Fragrance DNA milestone build (M0-M11). Runs
against the **native dev client** (`com.bobguillow.perfumepicks`), NOT Expo Go.

## Setup
1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Boot the iOS simulator and start the native dev client + metro:
   `npx expo run:ios --device <UDID>` (builds/installs the dev client and
   serves the JS bundle on :8081).
3. Run a single flow: `maestro test e2e/01_boot_today.yaml`
4. Run the whole suite: `maestro test e2e/`

## Runtime notes
- The native client carries a persisted **anonymous (guest) session**, so
  `launchApp` boots straight to the Today tab — no auth gate, no Expo Go dev
  menu. First launch downloads the JS bundle (slow); hence the 90s wait on
  `tab-today`.
- Do NOT use Expo Go (`host.exp.Exponent`): its dev-menu overlay is not
  readable by Maestro and the guest-auth cycle never settles.
- Stable tab selectors: `tab-today`, `tab-discover`, `tab-taste`,
  `tab-wardrobe`, `tab-profile` (the 6th slot is the floating Scan button).
- The XCUITest driver can drop the first action of a freshly-spawned Maestro
  process (transient reconnect). Re-run if a flow fails only on its first
  command; the harness is otherwise stable on sequential runs.

## Flow descriptions
- 01_boot_today    — cold boot lands on Today ("SCENT OF THE DAY")
- 02_tab_discover  — Discover tab renders the house browser ("BY HOUSE", Filter)
- 03_tab_taste     — Taste tab renders "Train My Nose" ("Begin a Session")
- 04_tab_wardrobe  — Wardrobe collection + Want/Have filter-chip taps
- 05_tab_you       — You/profile (ACCOUNT, Subscription, TASTE PROFILE)
- 06_taste_insights— "View taste insights" detail + back navigation (UX gate)
- 07_tab_sweep     — full tab-bar regression across all five tabs
