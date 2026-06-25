# Meridian brand assets (simulated bank)

> **Meridian is a fictional bank used for a local software simulation.** These
> assets are original, do not depict any real institution, and must never be
> presented as a real financial brand.

## Logo variants

| File | Use |
| --- | --- |
| `logo-horizontal.svg` | Full horizontal logo (compass mark + wordmark) on light backgrounds. |
| `logo-mark.svg` | Compact icon mark only (favicons, app icons, tight spaces). |
| `logo-mono-light.svg` | Monochrome light-on-dark version for navy/dark surfaces. |

The apps render these shapes inline via a `<Logo />` React component
(`apps/*/src/components/Logo.tsx`) so they theme cleanly and need no build
step. The favicon is shipped as `apps/*/public/brand/favicon.svg`.

## Color tokens

Defined once in `packages/shared/src/brand.ts` and mirrored in each app's
`tailwind.config.js`:

- Navy `#0A2540` / Navy deep `#071B30`
- Teal `#0EA5A4` / Teal dark `#0B7E7D`
- Gold `#E0A82E` / Gold soft `#F2C14E`
- Ink `#0F172A`, Mist `#F1F5F9`, White `#FFFFFF`

## Photography / marketing imagery

Marketing images are not committed. See
`assets/prompts/IMAGE_GENERATION_PROMPTS.md` for generation prompts and
`apps/customer/public/images/README.md` for the drop-in file names the app
expects.
