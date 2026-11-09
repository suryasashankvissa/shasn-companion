# Shasn Campaign Companion — Phase 1: Architecture

Written for a non-programmer. Each section says **what** we'll use and **why**, in plain English.

---

## 1. The big picture

```
 Phones / laptops (any browser)
          │
          ▼
 ┌──────────────────────┐      ┌──────────────────────────────┐
 │  The website          │◄────►│  Supabase (the "back office") │
 │  Next.js on Vercel    │      │  • Database (decks, games)    │
 │  (screens, buttons)   │      │  • Real-time broadcasting     │
 └──────────────────────┘      │  • Admin login                │
                               │  • Rule-checking functions    │
                               └──────────────────────────────┘
```

- **Next.js (the website)** — builds the four screens plus the admin area. One codebase works on desktop, Android and iPhone browsers. Nothing to install.
- **Vercel (hosting)** — puts the website on a public URL (e.g. `shasn-companion.vercel.app`). Free tier is plenty for a friend group. Updates go live automatically.
- **Supabase (database + real-time + login)** — stores decks and live games, and instantly pushes changes to every connected phone. Free tier is plenty.

I'm sticking with your preferred stack: it's the simplest reliable option, and both services have free plans with no servers for you to maintain.

---

## 2. Database structure (the "spreadsheets" behind the app)

Think of each table as a spreadsheet tab.

**Campaign content (managed in the admin area)**

| Table | What one row is | Key columns |
|---|---|---|
| `ideology_types` | One ideologue/ideology, e.g. "The Capitalist" | name, colour, icon/emoji, short description |
| `decks` | One campaign, e.g. "India" | name, description, cover image/colour theme, status (draft / published) |
| `questions` | One campaign card | deck, card number, question text, **Yes outcome**, **No outcome** |

Each **outcome** (Yes or No) stores: answer label, ideology type, card text / flavour, resources shown on the card, and the **recipient rule** (who gets the card — see open questions below).

Ideology types are their own list, so a new deck can introduce new ideologies without touching code.

**Live games (created automatically while playing)**

| Table | What one row is |
|---|---|
| `games` | One session: game code (e.g. `KX7P2`), deck, max players, status (lobby / playing / finished), current question, whose turn it is |
| `players` | One person in a game: name, seat order (host = seat 1, then joining order), is-host, a secret "player key" stored on their device |
| `turns` | One answered question: which question, who answered, Yes/No, which ideology, who received it |

Collections are **calculated** from `turns` (count cards per player per ideology), so they can never drift out of sync.

---

## 3. Real-time synchronisation

- Every phone in a game "subscribes" to that game. When anything changes (someone joins, an answer is picked, the host taps Next Question), Supabase pushes the change to every phone within a fraction of a second. No refreshing.
- **The ideology outcome is never sent to phones before it's revealed.** Hidden answers stay on the server; phones only see the question and the two answer texts. This stops anyone peeking via browser tools.

---

## 4. Security and permissions

All important actions go through **server-side functions** that check the rules before changing anything. Phones cannot write to the database directly.

| Action | Server checks |
|---|---|
| Join game | Code exists, game not started, not full, name not already taken |
| Start game | Caller is the host |
| Answer | Caller is the active player, and this question hasn't been answered yet (database lock prevents double answers even if two taps arrive at once) |
| Next Question | Caller is the host, and the current question has been answered |
| Edit decks | Caller is logged in as an approved admin |

**Player identity without accounts:** when you join, your device quietly stores a secret player key. If you refresh or close the browser, re-opening the app (or re-entering the game code) recognises the key and drops you back into your seat — no duplicate players.

**Admin login:** a proper email + password login (Supabase Auth). Only email addresses on an "approved admins" list can edit decks. Players and hosts never see or touch this.

---

## 5. Cloud hosting & what you'll need to do

I can write, test and run everything on your Mac. To put it online, **you'll need to create two free accounts** (I can't sign up on your behalf), and I'll walk you through each click:

1. **Supabase** (supabase.com) — sign up, create a project, paste me two keys.
2. **Vercel** (vercel.com) — sign up, then I'll deploy from your Mac.

(A free GitHub account is optional but makes future updates easier.)

Note: your Mac doesn't have Node.js (the toolkit Next.js needs) installed yet. I'll install it inside your user folder — no admin password needed.

---

## 6. What I learned from the rulebook

- Each campaign deck = **Ideology Cards** (a policy question with two answers).
- Base game has **4 ideologues: The Capitalist, The Supremo, The Showstopper, The Idealist.** Each answer belongs to a different ideologue and shows some resources.
- In the physical rules, **the player who answers keeps the card.** The card is read by the player to their right and kept hidden until the answer is confirmed.
- You can pay 4 resources to **redraw** (discard the card and draw another).
- Cards are numbered; some sensitive cards may be removed before play (Content Advisory).

I'll keep the app's ideology list data-driven and pre-load these four as starter types — you can rename or add more (your brief mentions "Supremacist" and "Socialist" as examples).

---

## 7. Unresolved game mechanics (need your decision)

1. **Who receives the ideology card?** Your brief says both "award the ideology to the person answering" (section 7) **and** "never the player answering — the other player specified by the outcome" (section 9). The rulebook says the answerer keeps it. Which is right? And if it's another player, how is that player identified?
2. **Question order** — shuffled fresh each game, or in card-number order?
3. **Redraw / skip** — should the host have a "Skip this card" button (for the pay-4-resources redraw, or a sensitive card)?
4. **End of deck** — what happens when every question has been used?

---

### Your decisions (9 Nov 2026)

1. **The answerer keeps the card** (matches the rulebook). Admins can optionally set a card's outcome to go to the next or previous player instead.
2. **Questions are shuffled** each game; no repeats.
3. **Host can redraw** the current card before it's answered (same player gets a new card).
4. **When the deck runs out**, it reshuffles and continues.

## 8. Build plan after your answers

- **Phase 2** — Home, Create, Join, Lobby, rotation, question card, reveal animation, collections, host Next Question.
- **Phase 3** — Admin login + deck editor (draft / publish), seeded with one sample deck so you can test immediately.
- **Phase 4** — Automated multi-player tests (several simulated players at once) covering every item in your checklist, plus a manual phone test checklist.
- **Phase 5** — Deploy, then a plain-English `GUIDE.md`: public URL, admin access, creating a game, adding decks, maintenance.
