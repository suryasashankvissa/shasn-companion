# SHASN Campaign Companion: How to Use

A phone-friendly companion for the physical board game **SHASN**. It draws the Ideology Cards, keeps each player's collections, works out resources and powers, and tracks the Jumla card. The board, voters and resources stay on the table.

For setup and deployment, see `GUIDE.md`.

---

## 1. Before you play

- Everyone needs a phone (or any browser) and the app's web address.
- Keep the physical board and resource coins on the table. The app tells you what to take, but it does not track what you hold.
- One person is the **host**. Only the host moves the game forward.

---

## 2. Starting a game

**Host**
1. Open the app and tap **Create a Game**.
2. Enter your name, choose the number of players (2 to 8) and pick a **campaign deck**.
3. A 5-letter code appears. Tap **Share invite**, or read the code aloud.
4. Wait until everyone shows in the player list, then tap **Start Game**.

**Everyone else**
1. Open the app and tap **Join a Game**.
2. Enter the code and your name.
3. If your phone closes or reloads, tap **Resume** on the home page, or rejoin with the same name. You keep your seat.

Turn order is the host first, then everyone in the order they joined.

---

## 3. Playing a turn

1. The **Campaign Question** tab shows a card styled like the printed ones: black lattice top, cream body, and a grey band with a "?".
2. A red **!!** badge in the corner means a sensitive topic. The host can skip it with **Redraw this card**.
3. The active player sees two buttons, **YES** and **NO**, each with its explanation text. Read these aloud as the rulebook asks.
4. The ideology colour and name stay hidden until the answer is given.
5. The active player taps an answer. The card flips to show the ideology, the coins earned and the card text.
6. A **Resources to take from the reserve** box lists the coins on the card plus passive bonuses, with a total.
7. The host taps **Next Question** to pass to the next player.

Questions are shuffled for every game. When the deck runs out it reshuffles.

**Host extras**
- **Redraw this card** works only before the player answers. Use it for the "pay 4 resources" redraw or to skip a sensitive card.
- **End this game** asks **Who won?** Pick the winner and confirm. Everyone sees a confetti celebration and can open the final collections.

---

## 4. Collections & Powers tab

- Each player has chips such as **Showstopper: 3**. Tap a chip to see the cards behind it.
- Under each player you see their **passive bonuses** and any **Level 3 / Level 5 powers** they have unlocked. Tap a power to read it.
- For your own row it also says how many more cards you need for the next level.
- **Recent answers** lists what happened in the last turns.
- **Ideologue powers guide** at the bottom has the rulebook table for all four Ideologues.

### How powers work (from the rulebook)

| | Passive | Level 3 (3 cards) | Level 5 (5 cards) |
|---|---|---|---|
| **Capitalist** | +1 Funds per 2 cards | Prospecting: trade 1 resource for 2 | Land Grab: evict 3 voters |
| **Supremo** | +1 Clout per 2 cards | Donations: snatch 2 resources | Payback: pay 1 to discard a voter, up to 2 times |
| **Showstopper** | +1 Media per 2 cards | Going Viral: +1 voter per Voter Card | Election Fever: +1 Gerrymander per zone |
| **Idealist** | +1 Trust per 2 cards | Helping Hands: 2 discounts | Tough Love: pay 2 Trust + 2 any to convert 2 voters |

- A power is active while you hold enough cards. Drop below the number and you lose it.
- You can use a power in the same turn you unlock it, and several can be active at once.

### Unlock alarm

When anyone reaches 3 or 5 cards of one Ideologue, a **Power unlocked** pop-up appears on every phone, with a chime and a vibration. Tap **Got it** to close it. From then on, that player's bonuses are included in the resources box.

---

## 5. The Jumla card

If a player gets the Jumla card from the Conspiracy deck:

1. Open **Collections & Powers** and tap **I got the Jumla card**.
2. Choose the Ideologue to place it under. It counts as one extra card there, for bonuses and levels.
3. The holder can **Move** it to another Ideologue on their own turn, or **Discard** it.

**Taking it from another player (both must agree)**
1. The other player taps **Ask to take it** and picks where they will place it. The app shows the price: the level the card sits on (the holder's card count for that Ideologue, Jumla included).
2. They hand over those resources at the table.
3. The holder sees a banner and taps **Accept, I got paid**, or **Decline**. The asker can **Withdraw** the request.

---

## 6. Admin area: managing decks

Open `/admin` on the site and sign in with the admin email and password.

- **Decks:** create, edit, publish or unpublish decks. Only published decks can be chosen in a new game.
- **Question editor:** set the question text and, for Yes and No, the ideology, the text read aloud, the resources (for example `2 Funds, 1 Media`) and who receives the card. Tick **Sensitive topic** for the red !! badge.
- **Ideology types:** edit names, colours and symbols.
- **Import from file:** upload a CSV to create a draft deck.

### CSV format

Download the template on the import page. Columns, in this order:

`number, question, sensitive, yes_ideology, yes_card_text, yes_resources, yes_recipient, no_ideology, no_card_text, no_resources, no_recipient`

- `sensitive`: `yes` or `no`.
- Ideology names must match an existing ideology exactly, such as `The Capitalist`.
- Recipient is `answerer` (default), `next` or `previous`.
- Resource names: Funds, Clout, Media, Trust.
- Review the imported draft, then **Save & publish**.

Ready-made decks are in `test-decks/`, including **India 2026 Campaign** (108 questions).

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| Phone shows "Reconnecting…" | Wait a few seconds. The app refreshes itself every 4 seconds. |
| "Can't open this game" | Tap **Join or rejoin**, and use the same name you joined with. |
| Not your turn | Only the active player can answer. The turn strip at the top shows whose turn it is. |
| Jumla panel says it needs a database update | Run `supabase/migration-powers-jumla.sql` in the Supabase SQL Editor. |
| Red !! badge or End game missing | Run `supabase/migration-card-design.sql` and `supabase/migration-end-game.sql`. |
| Import button missing on the live site | Upload the latest `github-upload` folder to GitHub and wait for Vercel to redeploy. |

---

## 8. Updating the live app

1. If the update comes with a `migration-*.sql` file, run it once in **Supabase → SQL Editor**.
2. Upload the contents of the `github-upload` folder to your GitHub repository.
3. Vercel redeploys on its own in about a minute.

Keep your secret key private. It belongs only in `.env.local` and the Vercel environment variables.
