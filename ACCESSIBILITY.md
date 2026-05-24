# Accessibility — Heita CRM

This document captures the WCAG 2.1 AA evidence for the Heita CRM and the workflow we follow when changing UI.

## Standards we hold to

- **WCAG 2.1 AA** for text contrast, focus management, semantic structure, and keyboard reachability.
- **iOS and Android PWA install guidelines** for manifest accessibility metadata.
- **South Africa's PAIA + POPIA** expectations for plain-language UI where it touches consent and data subject rights.

## Built-in primitives

| Concern | Where it lives | Notes |
|---|---|---|
| Skip link | `src/app/layout.tsx` injects `<a href="#main-content" class="skip-link">`. CSS hides it offscreen until focused. | Anchors every screen so keyboard users skip the bottom-nav. |
| Focus ring | `src/app/globals.css` defines `:focus-visible` on `.btn`, `.input`, `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, and `[tabindex]`. | 3px solid `--color-primary` ring with 2px offset; uses `:focus-visible` so mouse users don't see it. |
| Reduced motion | The `@media (prefers-reduced-motion: reduce)` block at the end of `globals.css` zeroes animations and transitions for `*`, `*::before`, `*::after` and pins the skip link in place. | The Stitch token system has no decorative animation outside transitions, so this is sufficient. |
| Touch targets | All `.btn` sizes (sm/md/lg) clear 36–48 px. Bottom nav items use the full row width per item. | Validated against Apple HIG 44pt minimum on touch. |
| Language tag | `<html lang>` is filled from `resolveLocale()` so screen readers announce the correct language per locale. | `next-intl` provider injects messages and locale-aware date/number formatting. |
| Form field labels | The `Input`, `Textarea`, and `Select` components render `<label htmlFor>` paired to a stable `useId()` and propagate `aria-invalid` plus `aria-describedby` for hint/error. | All form usage in the codebase goes through these primitives — there are no hand-rolled inputs. |
| `aria-label` on icon-only buttons | `BottomNav`, language switcher, and back buttons set `aria-label` from `next-intl` translations. | Verified in the Stitch design audit. |
| Colour contrast | The Stitch palette is calibrated for WCAG AA: `--color-primary-action` `#0B63C5` on white passes 4.5:1 for body and 3:1 for large text. | `--color-tier-silver` over the muted background needs the 700-weight class (`font-display`) — enforced via the `tier-badge` style. |

## i18n coverage

Built-in locales: `en-ZA`, `zu`, `xh`, `af`. Catalogs live in `messages/<locale>.json`. The active locale comes from the `heita-locale` cookie first, then `Accept-Language`, falling back to `en-ZA`. A language switcher (`src/components/layout/language-switcher.tsx`) is mounted in the auth and customer shells and posts to `/api/locale` to persist the choice.

When adding strings:

1. Add the key to `messages/en-ZA.json` first.
2. Mirror the key in `messages/{zu,xh,af}.json` — leave a clearly-tagged English placeholder if a translator hasn't landed copy yet, but never delete the key.
3. Use the React `useTranslations(namespace)` hook in client components and `getTranslations(namespace)` in server components.

## How we test

- **Vitest + axe-core (where added)**: smoke tests assert that the Button, Input, and key page renderings produce no critical axe violations. Run with `npm test`.
- **Manual keyboard sweep**: TAB through every page after a UI change. The skip link must reach `#main-content`; bottom nav must be reachable via TAB.
- **Screen reader check**: VoiceOver on iOS Safari for any change that introduces icon-only controls.
- **Reduced motion**: toggle the OS setting before shipping any new transition. The global media query should already cover it.

## Outstanding items

- Add axe-core CI step (`vitest-axe` or `@axe-core/playwright`) once we add a smoke test against the production build.
- Audit dashboard pages for ARIA-live regions around long-running mutations (loyalty earn, refund, RAG document upload).
- Re-test colour contrast for the danger button on dark backgrounds — current `--color-danger` `#DC2626` on `--color-navy` `#0F1F3D` may sit at 4.0:1; investigate a 600-weight or a slightly lighter danger token for dark surfaces.
- Localise OAuth error copy (`OAuthEmailMissing`, `AccountDeactivated`, `OAuthAccountLinkRequired`) — currently English-only fallbacks render even on non-English locales.
