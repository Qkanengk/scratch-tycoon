# Asset sources

Scratch Tycoon uses free third-party art and audio, except for the five original ticket paper patterns. Three.js applies the game's toon shading, outlines and placement at runtime. Canvases lay out the localized game text, ticket rules, prices, and scratch masks; these layouts do not ship as separate illustrations.

The [in-game credits](public/assets/credits/credits.html) and [model inventory](public/assets/models/manifest.json) retain author and source links. License copies live in [the credits directory](public/assets/credits).

## Models

The inventory includes each GLB's original page, author, and license. Models from Kenney, Quaternius, Pichuliru, and Kay Lousberg are CC0 1.0. The Paint roller by Poly by Google is CC BY 3.0, used as the motorized scratch tool. The game applies toon materials, tints and a rotation to that model; its downloaded GLB is unchanged.

The razor scraper is the CC0 utility knife from LonesomeDucky's [Tool Pack 2](https://opengameart.org/content/tool-pack-2). It uses the source's extended blade pose and original mesh, with a 256 px base-color texture and unused PBR maps removed.

## Images and textures

| Game files | Original source | License |
| --- | --- | --- |
| `patterns/paper-{dong,bac,vang,ngoc,rong}.svg` | Original Scratch Tycoon ticket paper patterns, restored from the first release | In-repository originals |
| `patterns/paper-vutru.png`, `stickers/spaceship.png` | Kenney [Space Shooter Redux](https://opengameart.org/content/space-shooter-redux), darkPurple and playerShip2_blue | CC0 1.0 |
| `patterns/{foil,mat-felt,wall,paper}.png` | Kenney [Prototype Textures](https://opengameart.org/content/prototype-textures), tinted in game | CC0 1.0 |
| `patterns/table-wood.png` | OzMaister, [Seamless Cartoon Textures — wood_floor.jpg](https://opengameart.org/content/seamless-cartoon-textures-woodfloorjpg), converted to greyscale and tinted in game | CC0 1.0 |
| `stickers/gourd.png` | [Calabash bottle gourd](https://creazilla.com/media/clipart/7801006/calabash-bottle-gourd), Creazilla's public-domain collection, resized and tinted green at runtime | CC0 1.0 |
| `src/render/than-tai.svg` | lkamming, [chinese new year](https://openclipart.org/detail/213211/chinese-new-year), displayed in the shrine with a runtime palette swap | [CC0 1.0](https://openclipart.org/share) |
| Other `stickers/*.png` | Existing transparent renders of the sourced CC0 models in the model inventory | CC0 1.0 |
| `particles/*.png` | Kenney [Particle Pack](https://opengameart.org/content/particle-pack-80-sprites), dirt_01–03, spark_04, smoke_01, star_05, circle_02 and star_06. The original monochrome masks were resized and converted to alpha for standard sprite blending. | CC0 1.0 |
| `brand/coin.png` | Kenney [Platformer Pack Remastered](https://kenney.nl/assets/platformer-pack-remastered), coinGold | CC0 1.0 |
| `icons/*.png` | Kenney [Game Icons](https://kenney.nl/assets/game-icons), white 100 px PNGs | CC0 1.0 |

## Audio and fonts

Kenney's [Interface Sounds](https://kenney.nl/assets/interface-sounds) and [Casino Audio](https://kenney.nl/assets/casino-audio) (CC0 1.0) are stored under `public/assets/audio` as mono MP3 for browser compatibility. The complete [Baloo 2 variable font](https://github.com/google/fonts/tree/main/ofl/baloo2) by Ek Type is stored as WOFF2 under the SIL Open Font License 1.1.

The development [asset gallery](gallery.html) previews the downloaded models through the game shader, shows ticket samples from the same renderer as the game, and links to the credits.
