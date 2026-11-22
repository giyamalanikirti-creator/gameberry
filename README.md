# Badla: turn a capture into a rivalry

A clickable concept demo of a new Ludo feature. **Concept prototype, not affiliated with Gameberry.**

## How to use it

```bash
npm install
npm run dev        # open http://localhost:5173
```

The page shows **one phone** and a short explanation beside it. Every phone screen has **one yellow button**: tap it to move the story forward. The button beside the phone does the same thing. **Back** and **Restart** are under the explanation. When the story moves to another player, the phone shows "Now on Gunjan's phone" and switches by itself.

## The story (19 steps, about 3 minutes)

The demo opens on an original loading screen (stage curtain, lights, a bouncing die). The look borrows the game's general palette: purple patterned backdrop, magenta panels with gold borders, gold buttons and a bright four-colour board on a wooden frame. All artwork is original: no Ludo STAR logo, mascots or crown art.

| # | Phone | What happens |
|---|---|---|
| 1 | Riya | The app loads. |
| 2–5 | Riya | Riya plays a Quick match. Gunjan sends her last token home one square from the finish ("😂 so close"). |
| 5 | Riya | Gunjan wins; Riya loses 100 gold. The **Badla card** offers revenge: first to two wins. |
| 6 | Riya | **Smart Fixture** suggests tomorrow 20:15, when they both usually play. Riya sends the challenge. |
| 7–8 | Gunjan | Gunjan's locked phone gets a notification. She opens it and accepts. |
| 9 | Gunjan | A fixture ticket for tomorrow, with a button to skip ahead to it. |
| 10–12 | Riya | Next evening: check in, play, Riya wins. The series is **1-1**. |
| 13–14 | Riya, Ananya | Riya makes the decider a **Grudge Night** (2v2) and invites Ananya; Gunjan brings Shruti. |
| 15 | Dev | The match appears in the club. Dev, who is not playing, picks a side for free. |
| 16–18 | Riya, Dev | Grudge Night is played. **Riya wins the series 2-1**, and Dev's pick was right. |

Each step's explanation includes a **Why it matters** line that ties it to the daily-active-user model (1.22, 0.50, 0.30 and 0.23 extra active days; about +10% DAU in the base case).

## Under the hood

The demo screens are drawn from a tested game engine, so the board, gold and scores are real computed values, not pictures.

- `src/linear/steps.ts`: the 18 steps (whose phone, screen, button, explanation).
- `src/linear/LinearApp.tsx`: the phone screens and the explanation panel.
- `src/state`, `src/engine`, `src/smart`: the rules engine, Ludo board and dice, gold ledger, and the deterministic Smart Fixture suggestions.
- `src/demo/guided.ts`: the scripted story the engine plays.

Gold is conserved: the five players always hold 5,000 in total. Final balances: Riya 1,200, Gunjan 800, Ananya 1,100, Shruti 900, Dev 1,000.

```bash
npm test           # 76 engine tests
npm run build      # production build in dist/
npm run e2e        # clicks through all 18 steps in a browser (needs `npm run dev` running and playwright)
```

**Known difference from the spec:** the spec says 21:15, but its seeded play-hour data peaks at 20:00, so Smart Fixture suggests 20:15.
