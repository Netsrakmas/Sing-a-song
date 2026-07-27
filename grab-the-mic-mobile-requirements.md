# Grab the Mic — Mobile Game Requirements

## 1. Concept

A party karaoke game for one shared phone. A word appears on screen; the first player to grab the mic must sing a real song lyric containing that word. The group votes on whether it counts. The phone replaces the card deck, the board, and the tokens.

**Design principle:** the phone is a referee and scorekeeper, not the entertainment. All judging is human. No lyric database — the group vote *is* the game.

**Grab modes:** the grab itself is physical by default — an object on the table (spoon, coaster, keys) stands in for the foam mic, and the phone only registers who got it. A screen-tap mode (radial zones) remains available as a fallback when there is no object or no table.

## 2. Core game loop

1. **Reveal** — A word card animates onto the screen (large type, readable from 2 m). Optional 3‑2‑1 countdown before reveal so nobody has a head start.
2. **Grab** — Two modes, chosen at setup:
   - **Object (default).** A prop lies in the middle; the phone stands where everyone can read it. Physical possession decides the grabber — no latency, no mis-registration, and the phone stays out of the scrum. Anyone then taps the grabber's name on screen; this is registration, not a race, so it is correctable (see Performance) and there is no auto-discard timer — a group still laughing five seconds later must not lose a valid grab. An explicit "nobody" button ends the card instead. Anti-camping is a house rule shown on the setup screen: hands flat on the table until the word appears. Scales to 10 players.
   - **Screen tap (fallback).** Phone lies flat in the middle; the screen is divided into radial colored wedges, one per player, name rotated toward them. First `touchstart` inside a zone wins. Near-simultaneous taps are resolved by event timestamp; if the margin is < 250 ms, show it ("beat Joer by 0.04s"). Touches during the reveal countdown lock that player out for the current card. Capped at 8 players; the mode is disabled in setup above that. Muted players' wedges are grey and dead.
3. **Sing** — On grab: sing-cue sound plays and a countdown starts (default 10 s to start singing). Any *other* player taps "they're singing" to stop the clock (judges control it, not the grabber). Timeout → buzzer → automatic fail (Mute Token, no vote). The lyric must be from a real song and contain the word (variations allowed: WIN → WINNER).
4. **Vote** — Two big buttons: ✅ counts / ❌ doesn't count. Majority of the group decides (host taps the result, or pass-the-phone voting in strict mode).
5. **Score** — Approved: grabber earns a Mic Token. Rejected: grabber gets a Mute Token → locked out of the next round (their name greyed out on the grab screen).
6. **Next card** — If nobody grabs within N seconds (default 15), the card is discarded and a new one is drawn.

**Rules enforced by the app:** no repeated lyrics within a session (honor system, but the app shows a "recently sung" list for disputes); muted players cannot grab; same word never appears twice in a session.

## 3. Game modes

| Mode | Win condition | Notes |
|---|---|---|
| Classic | First to 5 Mic Tokens | Default; token count configurable 3–10 |
| Race | First to finish a virtual board (e.g. 10 spaces) | Mic Token = +1 space, Mute = −1 space; replicates the physical board |
| Battle Royale | Last player standing | 2 Mute Tokens = eliminated |
| Quick Play | Fixed number of rounds (e.g. 15 cards) | Highest token count wins |

**Modifier toggles** (per session): Solo Artists Only (no group help), Full Volume (whisper = rejected), Steal (if the grabber fails, one other player may attempt the same word for the token).

## 4. Players & session setup

- 2–10 players, names entered at session start (color auto-assigned; 10 distinct colors). Tap mode caps at 8 and is disabled above that.
- Session settings: grab mode, game mode, deck(s), grab timeout (tap mode only), sing timer on/off, mic listening, modifiers.
- Pause / resume mid-game; add or remove a player mid-session (late arrivals are common at parties).
- No accounts, no login. Local-only state. A session survives app backgrounding.

## 5. Content: word decks

- **Base deck:** 150–250 single words, curated for singability (high frequency in pop lyrics: love, night, dance, fire, baby, home, rain...). This curation is the real content work — random dictionary words kill the game.
- **Deck structure:** JSON per deck `{ id, name, language, words[] }` so decks are trivially addable.
- **Localization:** Dutch deck (words common in NL pop/levenslied/kinderliedjes) and English deck as separate purchasable/selectable decks. Mixed-language sessions allowed — the word is the constraint, the song can be any language.
- **Themed decks (post-MVP):** Kids, 90s, Christmas, Musicals — mirrors the physical expansions and is the obvious monetization surface.
- **Family filter:** decks tagged kid-safe; a "family mode" toggle hides adult decks.

## 6. Screens

1. **Home** — New game, resume, deck store, settings, how-to-play.
2. **Setup** — Player names, mode, deck selection, modifiers.
3. **Countdown/Reveal** — Full-screen word card.
4. **Grab** — Object mode: the word plus a grid of player-name buttons, armed only after the reveal, and a "nobody" button. Tap mode: radial wedges; muted players shown locked.
5. **Performance** — Grabber's name, the word, optional timer, "I sang it" → vote. In object mode the name is correctable here and on the vote screen, since a mis-tap would otherwise award the token to the wrong player. Hidden in tap mode, where the tap *is* the result and rewriting it would be griefable.
6. **Vote** — ✅/❌; on rejection, optional Steal prompt.
7. **Scoreboard** — Token counts / board positions; shown briefly between rounds, always accessible.
8. **Winner** — Confetti, final standings, rematch button (same players, one tap).

## 7. UX / feel requirements

- Landscape not required; portrait, one-hand pass-around.
- Huge tap targets (the grab race gets physical — expect the phone to be smacked).
- Haptics on grab, distinct sounds for grab / approve / reject / mute.
- Screen keep-awake during a session.
- Round transitions < 1 s; total dead time between sing and next reveal < 5 s. Pace is everything in this game.
- Optional crowd SFX (air horn on approve, sad trombone on reject) — toggleable, default on.

### Audio spec

- **Sounds:** countdown tick, card-reveal sting, sing cue (airhorn/jingle on grab), clock tick in the final 3 s, timeout buzzer, approve chime, reject trombone, early-tap buzz, winner fanfare.
- All sounds synthesized via Web Audio (no assets, offline-safe) or preloaded short files; total < 200 KB if files.
- iOS unlock: audio context must be created/resumed inside a user gesture — the grab tap (or the "start game" tap) satisfies this.
- Master mute toggle persisted per device.

### Sing-timer modes

- **Manual (MVP):** judge-stop button as described in the core loop. Zero permissions.
- **Mic detection (v1.1):** optional microphone permission, live volume-threshold monitoring only (no recording). Calibrate ambient level at session start; sustained sound above baseline stops the clock automatically. Side benefit: a live volume meter enables the "Full Volume" modifier for real. Toggle in settings, off by default.

## 8. Technical requirements

- **MVP as a single self-contained web app (PWA)**: HTML/JS/canvas or plain DOM, offline-capable, installable. Zero backend — all state in memory + localStorage for resume. Same deployment model as Tijdlijn (GitHub Pages).
- No network calls during gameplay. No audio recording, no microphone permission — avoids the entire privacy/permission surface and app-store review friction.
- Native wrapper (Capacitor) only if store distribution is later wanted.
- State machine: `setup → countdown → reveal → grabbed → voting → scored → (next|end)`. Every screen is a state; back-button maps to pause.
- Deterministic shuffle with no-repeat guarantee per session; decks lazy-loaded JSON.

## 9. Out of scope (MVP)

- Multi-device play / networking
- Lyric verification via API (Genius/Musixmatch) — group vote replaces it
- Audio recording or playback of performances
- Accounts, cloud sync, leaderboards
- Spotify integration

## 10. Risks & open issues

- **IP:** "Grab the Mic" is a Lucky Egg product (with trademark and TikTok fame). Game *mechanics* aren't protectable, but the name, branding, and their specific word lists are. Ship under a different name with an independently curated deck — same situation as Tijdlijn vs. Hitster.
- **Grab fairness:** in object mode, possession is unambiguous and the app never claims a winner it cannot see — the failure mode of tap mode (the app confidently crediting the wrong player after a drunk mis-tap or a dropped touch event) disappears. Reach differences around the table remain; the hands-flat-on-the-table start equalizes them better than wedge geometry did. Cost: the millisecond tiebreak is gone, and camping is unenforceable — both are now social, which matches the design principle.
- **Phone safety:** the original flat-in-the-middle layout invited six people to slap a phone surrounded by drinks. Object mode removes the phone from the impact zone entirely; tap mode still carries this risk and should be framed as the fallback it is.
- **Vote griefing:** in competitive groups, players vote ❌ tactically. Option: the grabber's own vote doesn't count, or host-decides mode.
- **Word deck quality** is the make-or-break asset; budget real time for curating and playtesting the Dutch deck especially.

## 11. MVP definition

Classic mode, one English + one Dutch base deck (≥100 words each), 2–10 players, grab/vote/score loop, mute tokens, scoreboard, winner screen, rematch. Single HTML file, playable offline. Everything else is v1.1+.
