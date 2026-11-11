# Community Top of the Prompts

A prompt leaderboard for the "AI in the Workplace" workshops. Staff vote on short
prompts for Microsoft Copilot, add their own, and a chart shows what the room thinks.

Three pages share one vote server:

- **Try-it page** (`/`): copy a prompt, try it, pick a face. Also where staff add their own.
- **Swipe sprint** (`/sprint/`): go through the prompts as cards and vote on each.
- **Chart** (`/projector.html`): the leaderboard, with views for loved, Marmite and so on.

Pages: GitHub Pages, https://wmgmm.github.io/leaderboard/ (not published yet).
Vote server: Node on Railway with Postgres (not deployed yet).

## Run it on your machine

Needs Node 22.

```
npm ci
npm ci --prefix sprint
cp .env.example .env      # then set FACILITATOR_KEY to a passphrase of your own
npm run dev
```

Open http://localhost:8787. With no `DATABASE_URL` it keeps its data in `.data/`.

## Tests

```
npm test
npm run check
```

## Going live

`railway.json` holds the Railway build and start settings; `.github/workflows/pages.yml`
publishes the pages.
