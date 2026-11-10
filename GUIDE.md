# Campaign Companion — Owner's Guide

Plain-English instructions for running, using and maintaining your app.

---

## A. One-time setup (about 15 minutes, with Claude's help)

### 1. Create the database (Supabase)
1. Go to **supabase.com** → *Start your project* → sign up (free).
2. Click **New project**. Name it `shasn-companion`, pick a strong database password (save it somewhere), choose the region closest to you, click **Create**.
3. When it's ready, open **SQL Editor** (left sidebar) → **New query**.
4. Open the file `supabase/schema.sql` from this folder, copy everything, paste it in, click **Run**. You should see "Success".
5. New query again: paste everything from `supabase/seed.sql`, click **Run**. This adds the four ideologues and a sample deck.
6. Make yourself an admin. New query, paste this (with your email), and **Run**:
   ```sql
   insert into admins (email) values ('your-email@example.com');
   ```
7. Create your admin login: **Authentication → Users → Add user → Create new user**. Enter the same email and a password. Tick *Auto confirm user*.
8. Go to **Project Settings → API** (or *API Keys*). You'll need three values: the **Project URL**, the **anon / publishable** key, and the **service_role / secret** key. Give these to Claude (or put them in `.env.local` — see `.env.example`).

> The `service_role` key is like a master key. Never post it publicly. It only lives on the server.

### 2. Put the app online (Vercel)
1. Go to **vercel.com** → sign up (free; "Continue with Email" is fine).
2. Claude will run the deployment from your Mac and add the three keys to Vercel as "Environment Variables".
3. You'll get a public address like `https://shasn-companion.vercel.app`. That's the link you send your friends.

---

## B. Playing a game

**Host**
1. Open the app → **Create a Game**.
2. Type your name, pick the number of players and a campaign deck → **Create Game**.
3. A 5-letter code appears. Tap **Share invite** (or read the code out).
4. When everyone appears in the player list, tap **Start Game**.
5. After each answer, tap **Next Question** to move to the next player.
6. Need a redraw (the "pay 4 resources" rule, or skipping a sensitive card)? Tap **Redraw this card** *before* the player answers.

**Players**
1. Open the app → **Join a Game** → enter the code and your name.
2. When it's your turn, the screen glows gold — tap **Yes** or **No**.
3. The ideology card is revealed to everyone and added to your collection. Collect the matching resources on the physical board.

**Turn order** is fixed: host first, then everyone in the order they joined, looping around.

**Lost connection / refreshed the page?** Just open the app again — the "Return to game" button puts you back in your seat. On a different phone? Choose *Join a Game*, enter the code and **exactly the same name**, then tap **Rejoin**.

---

## C. Adding or editing campaign decks (no coding)

1. Go to `your-app-address/admin` and sign in with your admin email and password.
2. **+ New deck** → give it a name, description, theme colour, and optionally a cover image web address.
3. **+ Add question** for each card. For each question fill in:
   - Question text.
   - For **YES** and **NO**: the ideology it awards, optional card text, optional resources (e.g. "2 Funds"), and who receives it (normally *the player who answered*).
4. **Save draft** whenever you like — drafts are invisible to players.
5. **Save & publish** when ready. The deck immediately appears on the *Create a Game* screen.
6. Need a new ideology type (e.g. for a future-themed deck)? **Ideology types** → **+ Add ideology** → choose a name, colour and symbol → **Save changes**.

Questions outlined in red are incomplete (missing text or an ideology) and are skipped during games.

**Adding another admin:** add their email to the `admins` table (step A.6) and create their login (step A.7).

---

## D. Maintenance

- **Cost:** Supabase and Vercel free plans are plenty for friends' game nights.
- **Supabase pauses** free projects after about a week with no activity. If the app says "Something went wrong" after a long break, log into supabase.com and click **Restore project**; it takes a minute.
- **Changing the app's look or features:** open this folder with Claude Code and describe the change; Claude will redeploy.
- **Backups:** your decks live in Supabase. In Supabase → *Table Editor* you can export the `decks`, `questions` and `ideology_types` tables to CSV at any time.
- **Old games** stay in the database harmlessly. To clear them: SQL Editor → `delete from games where created_at < now() - interval '30 days';`

---

## E. What's where (for the curious)

| Folder / file | What it is |
|---|---|
| `app/` | The screens (home, create, join, game, admin) and the server "doors" (`app/api`) |
| `lib/` | Shared helpers (talking to the database, live updates) |
| `components/` | Reusable bits (admin login gate, deck cover) |
| `supabase/schema.sql` | Database tables **and all game rules** (whose turn, one answer only, host-only) |
| `supabase/seed.sql` | Starter ideologues and sample deck |
| `tests/` | Automated multiplayer test |

## New in this version
- **Resource coins** appear on every revealed ideology card (write resources like `2 Funds, 1 Media`; words: Funds, Clout, Media, Trust).
- **Tap a collection chip** (e.g. "Capitalist: 2") to see the cards behind it.
- **End this game** (host): at the bottom of the question screen -> pick who won -> confetti for everyone.
  This needs a one-time database update: run `supabase/migration-end-game.sql` in Supabase > SQL Editor.
- **India 2026 Campaign**: `test-decks/India 2026 Campaign.csv`, import it from Admin > Import from file.

## New: printed-card design and answer texts
- Questions now look like the real SHASN cards: black lattice top, cream body, and a coloured band with a plaque at the bottom.
- While answering, both the Yes and No texts are shown so you can read them aloud. The band stays grey with "?" until the answer is given; then it flips to show the ideology.
- Stored cards in the collections use the same design.
- A red "!!" badge marks sensitive questions. Tick "Sensitive topic" in the deck editor, or use the `sensitive` column (yes/no) in a CSV.
- Before using this, run `supabase/migration-card-design.sql` in the Supabase SQL Editor (and `migration-end-game.sql` if you haven't).

## New: Ideologue powers and the Jumla card
- **Resources box:** after each answer the app lists what to take from the reserve: the coins on the card plus passive bonuses (+1 resource of an Ideologue's type for every 2 of their cards, counting the new card).
- **Powers:** the Collections & Powers tab shows each player's passive bonus and any Level 3 or Level 5 power (tap one to read it). It also shows how many more cards you need. An "Ideologue powers guide" with the full table from the rulebook sits at the bottom.
- **Unlock alarm:** when anyone reaches 3 or 5 cards of one Ideologue, every phone shows a "Power unlocked" pop-up with a chime and vibration.
- **Jumla card:** tap "I got the Jumla card" and pick an Ideologue; it counts as one extra card there. The holder can move it on their own turn or discard it. Another player can ask to take it. The price is the level it sits on (how many cards of that Ideologue the holder has, Jumla included). The holder taps "Accept — I got paid" after receiving the resources.
- Before using the Jumla card, run `supabase/migration-powers-jumla.sql` in the Supabase SQL Editor.
