// デザイントークンの単一ソース。
// CSS 生成（renderCss）・OG 画像生成・styleguide ページがこの値を参照する。
// 副作用なし・依存ゼロの純粋なデータモジュール。

// カラー: light / dark の 2 セット（両者は同じキー集合を持つ）
export const colors = {
  light: {
    bg: "#ffffff",
    surface: "#f8f6f1",
    border: "#e8e4dc",
    text: "#1a1a1a",
    textMuted: "#6b6456",
    accent: "#e07b39",
    accentHover: "#c96a28",
    accentText: "#ffffff",
    shadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
    danger: "#e53935",
    dangerText: "#ffffff",
    successBg: "#e8f5e9",
    successFg: "#2e7d32",
    errorBg: "#fce4ec",
    errorFg: "#c62828",
  },
  dark: {
    bg: "#1a1814",
    surface: "#242220",
    border: "#3a3630",
    text: "#f0ede8",
    textMuted: "#9a9080",
    accent: "#e07b39",
    accentHover: "#f08949",
    accentText: "#ffffff",
    shadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
    danger: "#e53935",
    dangerText: "#ffffff",
    successBg: "#1b3a1c",
    successFg: "#81c784",
    errorBg: "#3e1c1c",
    errorFg: "#ef9a9a",
  },
} as const;

// スペーシングスケール（余白・gap 用）
export const space = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  "2xl": "32px",
  "3xl": "48px",
  "4xl": "64px",
} as const;

// タイポグラフィ: フォントサイズスケール
export const fontSize = {
  xs: "0.6875rem",
  sm: "0.75rem",
  md: "0.8125rem",
  base: "0.875rem",
  lg: "0.9375rem",
  xl: "1.0625rem",
  "2xl": "1.25rem",
  "3xl": "1.5rem",
  "4xl": "1.75rem",
} as const;

// タイポグラフィ: フォントウェイトスケール
export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
} as const;

// 角丸スケール
export const radius = {
  sm: "6px",
  md: "12px",
  pill: "99px",
} as const;
