/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS config read by Tailwind */
/**
 * Nestovin Tailwind preset for NativeWind (Resident and Worker apps).
 * DESIGN.md values come from @nestovin/design-tokens/tokens.json (single source). Mobile-only additions
 * (mint tints, per-weight font families, the 28 px radius, the 20 px gutter) come from src/extensions.json.
 * Only the type scale is defined here, because it is Tailwind-specific.
 */
const t = require('@nestovin/design-tokens/tokens.json');
const x = require('./src/extensions.json');

const c = t.colors;
const px = (n) => `${n}px`;
const f = x.fontFamilies;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: c.primary, green: c.secondary },
        teal: {
          DEFAULT: c.tealAction,
          deep: c.tealDeep,
          50: x.tints.teal50,
          100: x.tints.teal100,
          200: x.tints.teal200,
          300: x.tints.teal300,
        },
        green: { action: c.greenAction },
        charcoal: c.charcoal,
        mint: c.background,
        surface: { DEFAULT: c.surface, subtle: c.surfaceSubtle },
        ink: { DEFAULT: c.textPrimary, 2: c.textSecondary, 3: c.textMuted },
        line: c.border,
        success: { DEFAULT: c.success, text: c.successText, surface: c.successSurface },
        warning: { DEFAULT: c.warning, text: c.warningText, surface: c.warningSurface },
        error: { DEFAULT: c.error, text: c.errorText, surface: c.errorSurface },
        info: { DEFAULT: c.info, text: c.infoText, surface: c.infoSurface },
        highlight: x.highlight,
      },
      fontFamily: {
        display: [f.display],
        'display-semi': [f.displaySemi],
        'display-x': [f.displayX],
        body: [f.body],
        medium: [f.medium],
        semibold: [f.semibold],
        bold: [f.bold],
      },
      fontSize: {
        title: ['30px', { lineHeight: '38px' }],
        h2: ['24px', { lineHeight: '32px' }],
        h3: ['20px', { lineHeight: '28px' }],
        lead: ['18px', { lineHeight: '26px' }],
        body: ['16px', { lineHeight: '24px' }],
        sm: ['14px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
        metric: ['28px', { lineHeight: '36px' }],
      },
      borderRadius: {
        sm: px(t.radius.sm),
        md: px(t.radius.md),
        lg: px(t.radius.lg),
        xl: px(t.radius.xl),
        '2xl': px(x.radius2xl),
      },
      spacing: { gutter: px(x.gutter) },
    },
  },
};
