# scratch-tycoon

Idle game cào vé số: cào vé kiếm tiền, nâng cấp dụng cụ, mở khoá vé mới. Toàn bộ tiền trong game là tiền ảo.

## Playing

The game is first person: you sit behind the desk of a lottery kiosk. Look up at the rack and click a ticket to buy
it, look down at the mat and drag the coin over the foil to scratch, then click the ticket to cash it in. The board
next to the rack shows what the next ticket type needs before its licence can be bought.

Keys: `Space` does what the prompt says, `W`/`S` or the arrow keys (or the mouse wheel, or a vertical drag) look up
and down, `D`/`A` look at the licence board and back, `Esc` opens the pause menu (save export/import, reset).

## Development

Requires Node 22 (`.nvmrc`).

```sh
npm ci
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run lint
npm run typecheck
npm run build      # production build in dist/
npm start          # serve the production build
```

`npm install` with npm 10 can fail on this dependency tree with `Cannot read properties of null (reading 'edgesOut')`. When changing dependencies, regenerate the lockfile with `npx npm@11 install`; `npm ci` works with either version.

## Layout

```
src/
  game/   Pure game logic, no UI dependencies
  data/   Balance numbers (tickets, prizes, unlocks)
  ui/     React shell and the small HUD (purse, prompt, pause menu)
  render/ Three.js first-person kiosk: stage, ticket rack, licence board, toon shader
  audio/  Sound effects
  gallery/ Asset board (dev only, open /gallery.html)
  i18n/   UI strings (Vietnamese)
```

## Assets

All art and sound lives in `public/assets`; sources and licences are listed in [ASSETS.md](ASSETS.md), and the games
looked at for reference are in [docs/references.md](docs/references.md). Run `npm run dev` and open `/gallery.html`
to see every asset in the game's toon style.

## Deploy

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages once Pages is turned on in the repository settings (Settings > Pages > Source: GitHub Actions).
