# Pulse Studio — class & membership booking

Member-facing booking app for a gym, yoga or dance studio. A weekly grid timetable, booking with
class credits, waitlists with a real queue, rescheduling, recurring bookings, and a membership
view that counts what you have actually attended.

**Live:** [pulse-studio-v9rm.vercel.app](https://pulse-studio-v9rm.vercel.app) ·
[jcpoli.github.io/pulse-studio](https://jcpoli.github.io/pulse-studio/)

**Stack:** React 19 · TypeScript · Vite 6 · plain CSS · Vitest. No backend: the schedule is
generated deterministically from today, and bookings persist in `localStorage`. Installable as a
PWA and works offline.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # 114 tests
npm run typecheck  # tsc --noEmit
npm run build      # tsc -b && vite build → dist/
```

Node 18.17+ works, but Node 18 has been end of life since April 2025 and CI runs 22. On 22 you
can also move `vitest` to 5, which clears the two remaining dev-only advisories in `npm audit`.

## What the app does

| | |
|---|---|
| **Board** | Seven day columns on an hour rail, four weeks deep. Runs of two or more empty hours collapse into a hatched band, which took the grid from 1020px to 842px — this studio has no classes at all between 14:00 and 17:00. |
| **Filters** | Several class types at once, time of day (morning / lunch / evening), and one coach. Fields are AND-ed, values within a field OR-ed: *morning or lunch Yoga with Maya*. |
| **Booking** | One credit per seat. Cancel free up to two hours before; after that you may still cancel, but the credit is spent. Clashing bookings are refused. |
| **Waitlist** | A full class has a queue, and the panel says where in line you land. A seat you give up goes to the next person rather than back to the pool, so the class stays full. |
| **Reschedule** | Move a booking to another sitting of the same class in one step, with no credit round-trip. |
| **Recurring** | Book the same class, same hour, same weekday for the next four weeks in one action. |
| **Guest** | One guest per booking: a second credit and a second seat. |
| **History** | Past bookings become attendance records. The membership tab shows an eight-week strip, a rolling weekly streak, and your most-attended type. |
| **Calendar** | A `.ics` download and a Google Calendar link, because an in-app browser will silently swallow a blob download. |
| **Links** | The tab, the week and the selected class live in the URL, so a class can be shared or bookmarked. |
| **Keyboard** | The board is one tab stop. Arrow keys move between days and classes, Home and End to the ends of a day. |

## Decisions worth explaining

**The board is one tab stop, not thirty-one.** The columns are day-major in the DOM, so Tab used
to walk all of Monday before reaching Tuesday — Saturday's noon class was twenty-nine presses
away. Arrow keys move within the grid instead. Sideways aims at the *nearest class in time*
rather than the same row index, because the days hold different numbers of classes at different
hours and an index would drift down the board as you crossed the week.

**Deliberately not `role="grid"`.** The DOM is column-major with absolutely positioned blocks on
a piecewise scale, so row and gridcell semantics would describe a table that does not exist. The
blocks are buttons that already name their own day, time, coach and status.

**Full classes are not dimmed.** At `opacity: .55` all six type colours failed WCAG AA
(3.35–3.72:1); at full opacity they are 6.20–7.62:1. A faded block also reads as disabled, which
a past class genuinely is, while a full class is still actionable — tapping it joins the waitlist.
A dashed edge marks it instead.

**A late cancellation goes through.** Refusing it kept the credit but also kept the seat: a member
who cannot come and cannot cancel simply does not turn up, and the class runs a body short with a
waitlist behind it. The deadline closes the refund, not the cancellation.

**Credits move once per action.** Rescheduling is a single reducer action rather than a cancel
followed by a book, because that round-trip refunds a credit and spends it again — the wallet
flashes, and a member on their last credit is one failed step from having given up their spot for
nothing.

**The queue handover counts seats.** Releasing a booking frees one seat, or two with a guest. Two
seats with one person waiting means handing one over and returning the other, so the rule counts
rather than answering yes or no.

**Attendance records carry their own facts.** A record stores the type and name, not a reference
to the class. Past classes fall out of the generated horizon within a day, and deriving the type
from today's template would rewrite last month's history the moment a class is renamed.

**Streaks use rolling seven-day windows.** Someone who trains Saturdays and Mondays should not
have their streak cut in half at midnight on Sunday. The current week being empty does not end a
streak either — it is Tuesday.

## Structure

```
src/
  data/catalog.ts        types, coaches, weekly template, tunable constants
  lib/
    schedule.ts          build days/classes, hash seeding, past / cancellable / full / overlap
    boardScale.ts        piecewise minute → pixel mapping with collapsed empty hours
    boardNav.ts          arrow-key movement across the grid
    booking.ts           clash, alternatives, series, queue and seat rules
    filter.ts            the filter model and its predicate
    history.ts           attendance records, stats, streak
    calendar.ts          .ics export and Google Calendar URL
    deeplink.ts          URL schema, parsed defensively
  hooks/
    useBooking.ts        reducer, persistence, and everything that needs React
    useIsMobile.ts       the 980px breakpoint as a hook
  components/            TopBar · Filters · DaySwitch · Board · ClassBlock
                         DetailPanel · MyClasses · Membership · Toast
  App.tsx                tabs, selection, panel, URL sync, mobile scroll
  index.css              reset, design tokens, component styles
public/                  manifest, icon, service worker
```

Anything that is a pure function of the schedule lives in `lib/` and is tested directly. What
stays in `useBooking` is what genuinely needs React: dispatch, the toast, and reading the clock at
the moment of the tap.

## Tests

```bash
npm test
```

114 tests, run in CI before the build so a red suite stops a deploy rather than following one.
They are not smoke tests — the ones worth reading are the invariants:

- a breadth-first walk that reaches all 31 blocks of the week using only arrow keys, which is
  what catches a day left unreachable;
- morning, lunch and evening partitioning the week exactly, so no class falls through all three
  chips;
- a reschedule and its inverse restoring byte-for-byte the prior state;
- cancel-late-then-rebook-free not minting a credit;
- every generated class id needing no escaping in a URL.

There is no browser automation, so focus order, the service worker and the sheet's scroll are
reviewed rather than exercised.

## Deploy

**GitHub Pages:** push to `main`; `.github/workflows/deploy.yml` typechecks, tests, builds and
publishes. One-time setup: **Settings → Pages → Source → GitHub Actions**. If the repo is renamed,
change `--base=/pulse-studio/` in that workflow.

**Vercel:** import the repo, framework preset Vite, nothing else to configure.

`vite.config.ts` sets no `base`, so the default `/` is what Vercel, `npm run dev` and
`npm run preview` get; the Pages sub-path is passed at build time instead. Every PWA path is
relative for the same reason.

## What a backend would change

The demo's limit is that one browser can only move its own capacity. Nothing here can free a seat
in a class you are waiting on, so the promotion rule exists and is tested but never fires for the
member; capacity is not shared between devices; and credits are enforced on the client.

Sketch: `members`, `classes` (recurring template → instances), `bookings` (member_id, class_id,
status, guest_count), `credit_ledger`. Replace the reducer with queries plus a realtime
subscription on `bookings` so capacity is shared, and enforce the credit balance and the cancel
window in a Postgres function behind RLS so the client cannot bypass either.
