# scratch-tycoon

Idle game cào vé số: cào vé kiếm tiền, nâng cấp dụng cụ, mở khoá vé mới. Toàn bộ tiền trong game là tiền ảo.

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
  ui/     React components
  render/ Three.js toon shader and palette
  gallery/ Asset board (dev only, open /gallery.html)
  i18n/   UI strings (Vietnamese)
```

## Assets

All art and sound lives in `public/assets`; sources and licences are listed in [ASSETS.md](ASSETS.md), and the games
looked at for reference are in [docs/references.md](docs/references.md). Run `npm run dev` and open `/gallery.html`
to see every asset in the game's toon style.

## Deploy

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages once Pages is turned on in the repository settings (Settings > Pages > Source: GitHub Actions).
