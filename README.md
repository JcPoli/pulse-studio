# Pulse Studio — class & membership booking

Member-facing booking app for a gym, yoga or dance studio. Weekly grid timetable (days × hours),
book / cancel / waitlist with class credits, and a membership view.

**Stack:** React 19 · TypeScript · Vite 7 · Tailwind CSS v4 (Vite plugin). No backend yet —
in-memory sample data, deterministic week generated from today. Supabase comes next.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/pulse-studio/
npm run typecheck  # tsc --noEmit
npm run build      # outputs dist/
```

The dev URL includes `/pulse-studio/` because `vite.config.ts` sets `base` for GitHub Pages.

## Deploy

**GitHub Pages (automatic):** push to `main`. The workflow in `.github/workflows/deploy.yml`
builds and publishes `dist/`. One-time setup: repo **Settings → Pages → Source → GitHub Actions**.
If the repo is not named `pulse-studio`, change `base` in `vite.config.ts` to `'/<repo-name>/'`.

**Vercel:** import the repo, framework preset Vite, and set `base: '/'` in `vite.config.ts`.

## Project structure

```
src/
  data/catalog.ts        class types, coaches, descriptions, weekly template, constants
  lib/schedule.ts        pure logic: build week/classes, hash seeding, past/cancellable/full rules
  hooks/useBooking.ts    reducer + hook: book, cancel, waitlist, top-up, derived lists, toast
  components/
    TopBar.tsx           brand, three tabs, credit cells
    Legend.tsx           class-type filter
    DaySwitch.tsx        mobile prev/next day control
    Board.tsx            weekly grid: hour rail + 7 day columns + now-line
    ClassBlock.tsx       one class positioned by start time and duration
    DetailPanel.tsx      sticky aside (desktop) / bottom sheet (mobile) with the booking CTA
    MyClasses.tsx        upcoming + waitlist rows
    Membership.tsx       credits card, activity stats, packs
    Toast.tsx
  App.tsx                tab state, selection, panel, mobile scroll sync
  index.css              Tailwind import, @theme tokens, component styles
```

## Booking rules (all in `useBooking.ts` / `schedule.ts`)

- Booking costs 1 credit; cancelling refunds it.
- Cancelling is allowed until 2 hours before the class (`CANCEL_WINDOW_MS`).
- A full class offers a waitlist instead of booking.
- Past classes are disabled on the board.
- Demo seeds 6 credits, two bookings and one waitlist entry so every state is visible.

## Next step: Supabase

Tables: `members`, `classes` (recurring template → instances), `bookings` (member_id, class_id,
status: booked | waitlisted | cancelled), `credit_ledger`. Replace `useBooking`'s reducer with
queries + a realtime subscription on `bookings` so capacity is shared across devices; enforce
credits and the cancel window in a Postgres function so the client can't bypass them.
