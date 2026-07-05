# Feature B — Friends & Social (Requirements)

**Status:** Draft for review · **Owner:** Bob · **Depends on:** Feature A (DNA invite loop) shipped first
**Posture (decided):** Private by default. Username-based identity (no real names / phone / email exposed). Mutual-consent friendships only. No public/global feed.

---

## 1. Why

A real user asked to **add friends and see their Fragrance DNA and what they wear.** This is a retention/engagement feature (vs. Feature A, which is acquisition). It turns the app from a solo tool into a small private circle where friends compare scent identities.

**This feature re-opens Apple Guideline 1.2 (UGC), which v1.0 deliberately avoided** by stripping UGC down to an anonymized SOTD feed. Shipping B means implementing the full social-safety stack below — non-negotiable for App Review. The private-by-default posture *reduces* the harassment/discovery surface but does **not** exempt us from 1.2: usernames, display names, bios, and any shared wear notes are all user-generated content, and friend-to-friend is still user-to-user interaction.

---

## 2. User stories

- As a user, I can **claim a unique username** so friends can find me without exposing my real name/email/phone.
- As a user, I can **send a friend request** to someone (by username, or via a Feature-A invite link) and they must **accept** before either of us sees the other's private data.
- As a user, once we're friends, I can **see their Fragrance DNA** (archetype + traits) and **what they're wearing** (SOTD / recent wears), subject to their visibility settings.
- As a user, I control **what friends can see** (DNA always; wardrobe/wear-log opt-in).
- As a user, I can **remove a friend**, **block** someone, and **report** objectionable content or behavior.
- As a user, I can **delete my account** and have all my social data (username, friendships, requests) removed.

---

## 3. Identity model — usernames

- **Unique, user-chosen handle** (e.g. `@bergamot_bob`). This is the ONLY public-ish identifier. Real name/email/phone are never exposed to other users.
- **Constraints:** 3–20 chars, `[a-z0-9_]`, case-insensitive-unique, immutable-ish (allow change at most every 30 days to prevent impersonation churn).
- **Username IS user-generated content** → must be **profanity/hate filtered** on creation and on change (denylist + normalized leetspeak check), and screened for **impersonation/reserved terms** (`admin`, `perfumepicks`, `support`, brand names, etc.).
- **Display name + bio** (optional) are also UGC → same filter + reportable.
- No username enumeration API that returns lists; lookup is exact-match only (anti-scraping / anti-harassment).

---

## 4. Privacy & visibility model (private by default)

| Data | Default visibility | User control |
|---|---|---|
| Username / display name / avatar | Visible to anyone you've friended or sent/received a request | — |
| Fragrance DNA (archetype + traits) | Friends only | Always on for friends (it's the point) |
| Wardrobe (bottles owned) | **Off** by default | Opt-in: "Let friends see my collection" |
| Wear log / SOTD | **Off** by default | Opt-in: "Let friends see what I wear" |
| Wear notes / journal text | **Never** shared (stays private) | Not shareable in v1 of B |
| Real name / email / phone | **Never** exposed | — |

- **No global discovery.** You cannot browse strangers. You reach people only via (a) exact username, or (b) a Feature-A invite link that pre-seeds the friend edge.
- **Requests are consent gates:** no private data is visible until a request is **accepted**. A pending request exposes only username/display name/avatar.
- All row-level access enforced by **Supabase RLS** — a user can only read another user's DNA/wardrobe/wears if an accepted friendship row exists AND that data's visibility flag is on. Client checks are not trusted.

---

## 5. Friendship model (mutual consent)

- Move from the existing asymmetric `follows` table to a **mutual friendship** model (or layer friendship on top of reciprocal follows). A friendship is a single logical edge with a status:
  - `pending` (requester → recipient), `accepted`, `declined`, `blocked`.
- **Block** is absolute: a blocked user cannot see your profile, send requests, or appear in your surfaces; you disappear from theirs. Blocking auto-removes any friendship.
- Rate-limit outbound requests (anti-spam): e.g. max N pending requests / day.

---

## 6. Apple App Store rules for social/UGC — the full checklist

Feature B cannot ship without **all** of these. Guideline **1.2 (Safety → User-Generated Content)** requires apps with UGC to implement *all four*:

- [ ] **Content filtering** — a method to filter objectionable material before it appears (username/display-name/bio profanity + hate filter at minimum).
- [ ] **Reporting** — a mechanism for users to **flag objectionable content/users**, with a commitment to act (remove content + eject the user) within **24 hours**.
- [ ] **Blocking** — a mechanism for users to **block abusive users**.
- [ ] **Published contact info** — a way for users to reach us (support email/URL) — already have via feedback + marketing site; confirm it's linked in-app.
- [ ] **EULA with zero-tolerance clause** — Terms must state there is **no tolerance for objectionable content or abusive behavior**. Apple frequently checks for this exact language. Add to Terms + require acceptance before first social action.

Related guidelines that also apply:

- [ ] **5.1.1 (Data Collection & Storage)** — privacy policy must disclose the social data collected; collect the **minimum**; get consent. **5.1.1(v):** apps that support account creation **must** support in-app **account deletion** — we already have `delete-account`; extend it to purge social data.
- [ ] **5.1.2 (Data Use & Sharing)** — don't use friend/social data for anything the user didn't consent to; no selling; no undisclosed sharing.
- [ ] **5.1.1 (Permission strings)** — if we ever add **Contacts** discovery, the `NSContactsUsageDescription` must be specific, access must be **optional**, and we must not upload the whole address book. **v1 of B avoids contacts entirely** (username + invite-link only) to sidestep this.
- [ ] **1.1.6 / 1.2** — safety: no mechanism that enables harassment; block/report must be reachable from the content itself (e.g. long-press a friend → Report/Block).
- [ ] **Age rating** — user-to-user social typically raises the questionnaire answers; confirm the rating still fits. Private, friends-only, moderated content keeps this manageable, but re-answer the App Privacy + age-rating questionnaire honestly.
- [ ] **2.1 (App Completeness)** — moderation tooling must actually work at submission (reviewers test report/block).
- [ ] **Privacy Nutrition Label** — update App Privacy to declare the new data types linked to the user (username, friends, usage).
- [ ] **Notifications** — if we push "X sent you a friend request," follow 4.5.4 (push not required to use app; no marketing push without consent).

**Reviewer-tested paths:** App Review *will* create two accounts, send a request, report, and block. All three must visibly work, and reported content must be removable. Budget for this.

---

## 7. Moderation & safety implementation

- **Report flow:** on any user/profile → "Report" with reasons (impersonation, harassment, inappropriate username/bio, other). Writes to a `content_reports` queue (we already have a moderation-queue concept in Supabase). SLA: triage < 24h.
- **Block flow:** on any user → "Block." Immediate bidirectional invisibility + friendship removal.
- **Automated username/bio filter** at write time (Edge Function): denylist + normalization; reject or shadow-hold for review.
- **Admin action:** ability to disable a username / eject a user (service-role tool or simple admin view).
- **Auditability:** keep report + moderation-action history.

---

## 8. Data model (delta)

> The map of the existing `follows` table (migrations `003_sotd_social.sql`, `004_sotd_rls.sql`) and current profile columns is being confirmed; this section is the intended target and will be reconciled to what exists.

- `profiles`: add `username` (citext unique), `username_changed_at`, `show_wardrobe_to_friends` (bool, default false), `show_wears_to_friends` (bool, default false).
- `friendships`: `id`, `requester_id`, `recipient_id`, `status` (`pending|accepted|declined|blocked`), `created_at`, `responded_at`. Unique on the unordered pair. (Can be built over/replacing `follows`.)
- `blocks`: `blocker_id`, `blocked_id` (or fold into `friendships.status='blocked'`).
- `content_reports`: `id`, `reporter_id`, `target_user_id`, `reason`, `context`, `status`, `created_at`.
- `usernames_reserved`: denylist/reserved handles.
- **RLS:** DNA/wardrobe/wear reads gated on `accepted` friendship + the relevant visibility flag. Reuse the taste-profile / wardrobe tables; add friend-scoped read policies.
- **`delete-account`:** extend to remove `friendships`, `blocks`, `content_reports` (as reporter), and release the username.

---

## 9. Screens / flows

1. **Claim username** (first time entering the social area) — with live availability + filter feedback + a one-time **Terms acceptance (zero-tolerance)** gate.
2. **Add friend** — search by exact username → send request. (Also the entry point Feature A's invite link resolves into.)
3. **Requests** — incoming/outgoing, accept/decline.
4. **Friends list** — each row → their DNA card + (if permitted) SOTD/wardrobe.
5. **Friend profile** — DNA archetype + traits; wardrobe/wears if opted-in; **Report / Block** reachable here.
6. **Privacy settings** — the two visibility toggles + block list management.

---

## 10. Interaction with Feature A

Feature A's invite link carries the inviter's user id / invite code. When an invitee finishes onboarding, convert that into a **pending friend request from the inviter** (or auto-accepted friendship if we decide invited = trusted — *decision needed*, default to pending for safety). This is why A ships first and its attribution must be a durable edge, not just an analytics event.

---

## 11. Analytics

`friend_request_sent`, `friend_request_accepted`, `friend_removed`, `user_blocked`, `user_reported`, `friend_dna_viewed`, `username_claimed`, `social_visibility_changed`. (Add via the existing `EVENTS` pattern.)

---

## 12. Non-goals (v1 of B)

- No public/global feed, no strangers, no discovery browsing.
- No contacts import (avoids `NSContactsUsageDescription` review + privacy cost).
- No DMs/chat (huge added moderation surface — separate future decision).
- No sharing of private wear-note text.
- No group/leaderboard features.

---

## 13. Open decisions

1. **Invited friend = auto-accepted or pending?** (default: pending, safer).
2. **Replace `follows` or layer friendship on top?** (lean: introduce `friendships`, migrate/retire `follows`.)
3. **Username change cadence** (default: once / 30 days).
4. **Moderation staffing** — who clears the report queue within 24h, and is a lightweight admin view needed before launch? (Apple requires the *mechanism*; we need the *operational* answer.)
5. **Age rating impact** — re-run questionnaire; confirm no bump that hurts ASO.

---

## 14. Definition of done (for App Review)

- Two test accounts can: claim usernames, request/accept, view DNA, toggle wardrobe/wear visibility, **block**, and **report** — all working live.
- Terms include the zero-tolerance clause; acceptance gated before first social action.
- Username/bio filter live; reported users can be ejected within 24h.
- Account deletion purges all social data.
- App Privacy label + age rating updated. Support contact reachable in-app.
