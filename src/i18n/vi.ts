export const vi = {
  'app.title': 'Scratch Tycoon',
  'app.tagline': 'Cào vé số, kiếm tiền, mở khoá vé mới',
  'app.comingSoon': 'Quầy vé đang dọn hàng. Vé đầu tiên sắp mở bán.',
  'app.playMoney': 'Toàn bộ tiền trong game là tiền ảo.',
} as const;

export type MessageKey = keyof typeof vi;
