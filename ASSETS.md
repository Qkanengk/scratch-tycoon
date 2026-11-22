# Assets

Everything under `public/assets` is either CC0 (public domain) or original work made for this game. No asset
needs attribution; the credits below are given anyway. Preview the whole set with `npm run dev` and open
`/gallery.html` (the asset board: models on a turntable, stickers, ticket mock-ups, patterns, effects, icons, sounds).

## Style rules

### Đổi đời / Thần Tài

The lacquer wall altar, seated Thần Tài figure, incense pot and sticks, oranges, lamp and gold ingots
are original hand-built geometry in `src/render/altar.ts`, using the existing toon ramp and ink outlines.
Its painted wooden tablet is original canvas lettering. Vũ Trụ's navy/violet stars and ringed planet
are original SVG/canvas artwork (`public/assets/patterns/paper-vutru.svg`, `src/render/ticketFace.ts`).
The ritual reuses the original `smoke-puff` and `coin` particles and existing `unlock` sound below.
No downloaded assets or additional licences.

### Drains and hazards scene additions

Rent notices, payout receipt paper, return tags, hologram seals, serial checks and tool wear scuffs are original procedural geometry/canvas artwork in `src/render` (no external assets). The repair tags reuse `public/assets/icons/wrench.png` (Kenney Game Icons, CC0 1.0, see Icons below); bombs reuse the CC0 Kenney-derived `stickers/bomb.png`; blast feedback reuses the original `particles/smoke-puff.svg` and existing game audio documented below. No new downloaded assets.

- Models are drawn with the game's toon shader (`src/render/toon.ts`): three flat light bands and an ink outline.
- Ink is `#2b1b17`; the rest of the palette is in `src/render/palette.ts`. 2D art uses flat fills and thick ink lines.
- No emoji and no gradients-with-glow. Symbols on tickets are stickers baked from the 3D models, so 2D and 3D match.

## 3D models (`public/assets/models`)

All CC0 1.0. `manifest.json` in that folder is the machine-readable version of this table.

| Id | File | Author | Source | Used for |
| --- | --- | --- | --- | --- |
| `platformer-kit/coin-gold` | `public/assets/models/kenney-platformer-kit/coin-gold.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | tool: đồng xu cào |
| `food-kit/cherries` | `public/assets/models/kenney-food-kit/cherries.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/food-kit) | symbol: Vé Đồng |
| `food-kit/lemon` | `public/assets/models/kenney-food-kit/lemon.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/food-kit) | symbol: Vé Đồng |
| `quaternius/bell` | `public/assets/models/quaternius/bell.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/cILuaO115Y) | symbol: Vé Đồng |
| `platformer-kit/jewel` | `public/assets/models/kenney-platformer-kit/jewel.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | symbol: Vé Đồng, Vé Ngọc |
| `quaternius/crown` | `public/assets/models/quaternius/crown.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/i0PZVuVlYv) | symbol: Vé Đồng (jackpot) |
| `original/gourd` | `public/assets/models/original/gourd.glb` | Scratch Tycoon | [scripts/assets/make-gourd.py](scripts/assets/make-gourd.py) | symbol: Vé Bạc (bầu) |
| `quaternius/crab` | `public/assets/models/quaternius/crab.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/Gs3yfsV5lB) | symbol: Vé Bạc (cua) |
| `quaternius/fish-a` | `public/assets/models/quaternius/fish-a.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/BEcU9rjiAq) | symbol: Vé Bạc (cá) |
| `quaternius/chicken-a` | `public/assets/models/quaternius/chicken-a.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/ineV9pU5VL) | symbol: Vé Bạc (gà) |
| `quaternius/stag` | `public/assets/models/quaternius/stag.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/tQdzbZ1Cmw) | symbol: Vé Bạc (nai, jackpot) |
| `platformer-kit/star` | `public/assets/models/kenney-platformer-kit/star.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | symbol: số may mắn, hiệu ứng thắng |
| `quaternius/dragon-evolved` | `public/assets/models/quaternius/dragon-evolved.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/LlwD0QNUPj) | symbol: Vé Rồng (rồng) |
| `platformer-kit/bomb` | `public/assets/models/kenney-platformer-kit/bomb.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | symbol: Vé Rồng (bom) |
| `quaternius/coins` | `public/assets/models/quaternius/coins.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/VaGFKE0n0F) | reward: thắng nhỏ |
| `quaternius/star-coin` | `public/assets/models/quaternius/star-coin.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/n5nJIQAozN) | reward: xu thưởng |
| `quaternius/gold-bag` | `public/assets/models/quaternius/gold-bag.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/vFFblhnHtb) | reward: thắng vừa |
| `quaternius/gold-ingots` | `public/assets/models/quaternius/gold-ingots.glb` | Quaternius | [poly.pizza](https://poly.pizza/m/3jRhAgbc6t) | reward: thắng lớn |
| `platformer-kit/chest` | `public/assets/models/kenney-platformer-kit/chest.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | reward: jackpot |
| `platformer-kit/lock` | `public/assets/models/kenney-platformer-kit/lock.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/platformer-kit) | shop: vé chưa mở khóa |
| `mini-arcade/ticket-machine` | `public/assets/models/kenney-mini-arcade/ticket-machine.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/mini-arcade) | prop: máy bán vé |
| `mini-arcade/cash-register` | `public/assets/models/kenney-mini-arcade/cash-register.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/mini-arcade) | prop: quầy thu ngân |
| `mini-arcade/prize-wheel` | `public/assets/models/kenney-mini-arcade/prize-wheel.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/mini-arcade) | prop: vé khuyến mãi |
| `mini-arcade/gambling-machine` | `public/assets/models/kenney-mini-arcade/gambling-machine.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/mini-arcade) | prop: trang trí bàn |
| `mini-shop/gacha-machine` | `public/assets/models/kenney-mini-shop/gacha-machine.glb` | Kenney | [kenney.nl](https://kenney.nl/assets/mini-shop) | prop: trang trí bàn |

Kenney packs: [Platformer Kit](https://kenney.nl/assets/platformer-kit), [Food Kit](https://kenney.nl/assets/food-kit),
[Mini Arcade](https://kenney.nl/assets/mini-arcade), [Mini Shop](https://kenney.nl/assets/mini-shop). Each kit's
`Textures/colormap.png` is the shared colour atlas its models reference. Quaternius models were downloaded from
[Poly Pizza](https://poly.pizza/u/Quaternius), where each model page states CC0 1.0.

## Stickers (`public/assets/stickers`)

One 256 px transparent PNG per model, baked from the asset board with `scripts/assets/bake-stickers.mjs`.
Derived from the CC0 models above, so CC0 as well. Re-bake after changing a model, the shader or a `yaw` in the manifest.

## Patterns, particles, brand (`public/assets/patterns`, `particles`, `brand`)

Original SVGs for this game, generated by `scripts/assets/make-patterns.py` and `scripts/assets/make-particles.py`.

| Files | Used for |
| --- | --- |
| `patterns/paper-dong.svg`, `paper-bac.svg`, `paper-vang.svg`, `paper-ngoc.svg`, `paper-rong.svg` | Ticket paper of the five tiers (cash coins, waves, star lattice, cut gems, dragon scales) |
| `patterns/foil.svg` | Scratch-off layer |
| `patterns/table-wood.svg`, `patterns/mat-felt.svg` | Table top and the mat under the ticket |
| `particles/foil-flake-a.svg`, `foil-flake-b.svg`, `foil-curl.svg`, `smoke-puff.svg` | Scratching debris |
| `particles/star.svg`, `sparkle.svg`, `coin.svg`, `ring.svg`, `confetti-*.svg` | Win effects |
| `brand/logo-mark.svg`, `brand/favicon.svg` | Logo mark and browser icon |

## Interface icons (`public/assets/icons`)

White 100 px PNGs from Kenney's [Game Icons](https://kenney.nl/assets/game-icons) (CC0 1.0), renamed to kebab-case.
They are tinted in CSS where used.

## Sounds (`public/assets/audio`)

Kenney (CC0 1.0), converted from OGG to mono MP3 so they also play in Safari.

| Files | Source pack | Used for |
| --- | --- | --- |
| `scratch-1.mp3` to `scratch-5.mp3` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Scratching, picked at random |
| `ticket-buy.mp3`, `ticket-deal.mp3`, `ticket-collect.mp3` | [Casino Audio](https://kenney.nl/assets/casino-audio) | Buying a ticket, ticket landing on the table, collecting it |
| `coin-1.mp3` to `coin-3.mp3`, `coins-many.mp3` | Casino Audio | Money counting up |
| `reveal.mp3`, `win-small.mp3`, `win-big.mp3`, `win-jackpot.mp3`, `lose.mp3` | Interface Sounds | Ticket result |
| `unlock.mp3`, `promo.mp3` | Interface Sounds | New ticket type unlocked, free ticket ready |
| `ui-click.mp3`, `ui-select.mp3`, `ui-error.mp3` | Interface Sounds | Buttons |

## Font

[Baloo 2](https://fonts.google.com/specimen/Baloo+2) by Ek Type, SIL Open Font License 1.1, installed from
`@fontsource/baloo-2` (Vietnamese and Latin subsets). The OFL asks that the licence ships with the font; the package includes it.

## Regenerating

```sh
python3 scripts/assets/make-gourd.py       # models/original/gourd.glb
python3 scripts/assets/make-patterns.py    # patterns/*.svg
python3 scripts/assets/make-particles.py   # particles/*.svg, brand/*.svg
npm run dev -- --port 5199 &               # then:
node scripts/assets/bake-stickers.mjs      # stickers/*.png (needs google-chrome and Pillow)
```
