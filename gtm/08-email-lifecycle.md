# Email Lifecycle

Three sequences: waitlist (pre-launch), launch announcement, and in-app onboarding/lifecycle. Voice = a note from Bob, not a newsletter. Plain text beats heavy templates for this audience. Keep one CTA per email.

> Note: in-app/transactional emails depend on what the app actually sends (Supabase auth, RevenueCat). Treat the onboarding sequence as a spec to wire up, not as already-existing flows.

---

## Sequence A — Waitlist (pre-launch)

**A1 — Confirmation (immediately on signup)**
- Subject: You're on the list 🕯️
- Body:
  > Thanks for signing up for Perfume Picks.
  >
  > Quick version of what you'll get: a wardrobe for the bottles you already own. Catalog your collection, log every wear, get a daily pick from your own shelf, and find your Fragrance DNA. No ads. Not a store.
  >
  > I'll email you the day it's live — and not much else.
  >
  > — Bob, founder

**A2 — Value tease (3–4 days later)**
- Subject: What's your fragrance archetype?
- Body:
  > One of the first things Perfume Picks does is read your taste into an archetype — The Connoisseur, The Seducer, The Purist, The Showstopper… 11 in all.
  >
  > It's built from the scents you actually love, and it keeps sharpening the more you use the app.
  >
  > Almost ready. Hang tight.
  >
  > — Bob

**A3 — Launch (day of)**
- Subject: It's live — Perfume Picks is on the App Store
- Body:
  > It's here. [Download Perfume Picks] →
  >
  > Find your Fragrance DNA, build your wardrobe, log your wears, and get your first daily pick — all free.
  >
  > If you collect, I think you'll feel at home. Reply and tell me your archetype.
  >
  > — Bob

---

## Sequence B — Onboarding (first 7 days after install/signup)

**B1 — Welcome (after DNA reveal)**
- Subject: You're [Archetype]. Here's what to do next.
- Body:
  > Nice — your Fragrance DNA is in. Three things worth doing this week:
  > 1. Add a few bottles to your wardrobe (or scan one — point your camera at it).
  > 2. Log a wear. It'll grab the weather automatically.
  > 3. Check your Scent of the Day tomorrow morning.
  >
  > The more you use it, the sharper your DNA gets.

**B2 — Activation nudge (day 2–3, if wardrobe is thin)**
- Subject: Your wardrobe's looking a little empty
- Body:
  > Perfume Picks gets good once it knows what's on your shelf. Add five bottles and the daily picks start making sense.
  >
  > Quickest way: tap Scan and photograph a bottle.

**B3 — Dupe reveal (day 4–5)**
- Subject: That expensive bottle? There's probably a dupe.
- Body:
  > Open any fragrance in your wardrobe and check the dupes — cheaper bottles that smell nearly identical, ranked by match. Some are 30–70% less than the original.
  >
  > It's one of the most useful things in the app. (And the main reason people go Pro.)

**B4 — Pro trial (day 6–7, free users)**
- Subject: Unlock your Living DNA
- Body:
  > You've got the free version — the DNA, the wardrobe, the wear log, the daily pick. Pro adds the parts that compound:
  > – A Living Fragrance DNA that re-ranks as you wear
  > – Every dupe (one good find pays for the year)
  > – Unlimited wardrobe, layering suggestions, Perfume Wrapped, cost-per-wear
  >
  > $24.99/year, 7-day free trial. [Start your trial] →

---

## Sequence C — Lifecycle / retention

**C1 — Re-engagement (14 days inactive)**
- Subject: The back of your shelf misses you
- Body:
  > You haven't logged a wear in a couple weeks. Perfume Picks just queued up a pick from a bottle you haven't touched in a while — open the app to see it.

**C2 — Perfume Wrapped (seasonal / year-end)**
- Subject: Your year in scent is ready
- Body:
  > Your Perfume Wrapped is in — top houses, top families, your most-worn bottles. One card, made to share.
  > [See your Wrapped] →

**C3 — Win-back (lapsed Pro)**
- Subject: Your Living DNA is on pause
- Body:
  > Your Pro trial ended, so your DNA stopped re-ranking and the dupes are locked again. If you want them back, you know where to find us — same price, no hard feelings.

---

## Rules

- One CTA per email. Plain, signed by Bob.
- Never fabricate urgency or fake scarcity.
- Honor the privacy promise: these are product emails, not data resale.
- Always include an unsubscribe; transactional/onboarding separate from marketing per CAN-SPAM.
