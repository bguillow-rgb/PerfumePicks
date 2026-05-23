# Maestro E2E Tests

## Setup
1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Start Expo Go on a connected device/simulator: `npx expo start`
3. Run a single flow: `maestro test e2e/01_onboarding.yaml`
4. Run all flows: `maestro test e2e/`

## Requirements
- iOS Simulator or Android Emulator with Expo Go installed
- App running via `npx expo start` (Expo Go, not a dev build)

## Flow descriptions
- 01_onboarding — Verifies app boots, wordmark visible, onboarding card works
- 02_wardrobe_add — Add a fragrance to wardrobe via Discover → detail → sheet
- 03_log_wear — Log a wear entry from fragrance detail
- 04_quiz_flow — Complete the taste quiz
- 05_discover_filter — Open and apply discover filters
- 06_profile_navigation — Navigate profile sections
- 07_fragrance_review — Write a community review
