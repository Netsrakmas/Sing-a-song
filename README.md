# 🎤 Sing-a-Song

**Eén woord op het scherm. Wie zingt er als eerste een échte songtekst mee?**

Sing-a-Song is a party karaoke game for one shared phone. The phone lies flat in the
middle of the table, every player gets a colored zone, a word appears — and the first
player to tap their zone grabs the mic and must sing a real song lyric containing that
word. The group votes on whether it counts. The phone is the referee and the prop;
the group is the game.

▶ **Play:** open `index.html` — or serve the repo and install it as an app (PWA, works fully offline).

## How to play

1. **Lay the phone flat** in the middle. Each player gets their own colored wedge.
2. **A word appears** after a 3-2-1 countdown. Tap your own zone to grab the mic.
   Tap too soon and you sit this card out.
3. **Sing** a real, existing song containing the word (variations allowed: WIN → WINNER)
   before the timer runs out. Only *another* player may press "singing!" to stop the clock.
4. **Vote** — the group decides by majority (the singer doesn't vote).
   Approved = 🎤 token. Rejected or too late = 🔇 and you miss the next card.
5. **Win** — depends on the mode.

## Game modes

| Mode | Win condition |
|---|---|
| **Classic** | First to 3/5/7/10 🎤 tokens |
| **Race** | 🎤 = +1 space, 🔇 = −1. First to 10 wins |
| **Knockout** | 2× 🔇 = eliminated. Last one standing wins |
| **Quick play** | Fixed number of rounds, most 🎤 wins (ties → sudden death) |

**House rules (toggles):** 😈 Steal (on a rejection another player may attempt the word),
🎤 Solo artists (no group help), 📢 Full volume (whispering doesn't count).

## Features

- 2–10 players, radial grab zones with anti-camping lockout and "beat you by 0.04s" margin display
- Dutch (126 words) and English (146 words) decks, curated for singability — plus mixed play
- Bilingual UI (Nederlands / English)
- No repeated words per session; "sung words" list for settling disputes
- Pause menu: add or remove players mid-game (late arrivals welcome)
- Session persists in `localStorage` — survives backgrounding and reloads, resume from the home screen
- All sound effects synthesized with Web Audio (zero assets), haptics, screen wake-lock
- Installable PWA, 100% offline, zero backend, no accounts, no permissions

## Tech

A single self-contained `index.html` (display font inlined as base64 woff2) plus a
service worker (`sw.js`), manifest and icons for PWA install. Plain DOM + SVG, no
frameworks, no build step, no network calls during gameplay.

State machine: `home → setup → countdown → grab → sing → vote (→ steal) → score → win`.

### Deploy

Any static host works. For GitHub Pages: Settings → Pages → deploy from branch, done.

### Development

```bash
python3 -m http.server 8099   # serve locally (needed for the service worker)
```

End-to-end smoke tests (Playwright) drive the full loop: grab, early-tap lockout,
mute rounds, all four win conditions, steal, resume-after-reload and the pause menu.

## Name & content

The game mechanics are inspired by classic sing-along party games, but Sing-a-Song
ships under its own name with an independently curated word list. See
`grab-the-mic-mobile-requirements.md` for the original design document.
