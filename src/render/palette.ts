/** The game's flat toon palette. Assets under public/assets use the same values. */
export const palette = {
  ink: '#2b1b17',
  paper: '#fff3d6',
  card: '#ffe7a8',
  cream: '#fff6d6',
  red: '#ef4b3f',
  blue: '#3d8bfd',
  green: '#3bb273',
  gold: '#ffd23f',
  goldDeep: '#f7b500',
  foil: '#c4c9d6',
  foilShade: '#aeb4c2',
  wood: '#c98a4b',
  /** Paper colour of each ticket tier, matching public/assets/patterns/paper-<id>.svg. */
  ticket: {
    dong: '#e58a45',
    bac: '#cfdcec',
    vang: '#f7c948',
    ngoc: '#46ad86',
    rong: '#d83a2e',
  },
} as const;
