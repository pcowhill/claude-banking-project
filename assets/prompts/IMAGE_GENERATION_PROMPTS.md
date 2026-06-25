# Image generation prompts — Meridian (simulated bank)

> These prompts are for generating **original, royalty-free marketing imagery**
> for the fictional Meridian brand. Do **not** depict real people, real brands,
> real logos, or any identifiable real bank. Everything here supports a clearly
> labeled local **simulation**.

## How images are wired into the app

The customer app references images by fixed file names under
`apps/customer/public/images/`. Until a real file exists, the UI shows a
graceful branded gradient placeholder (no code change needed). To use a
generated image, export it to the matching path and it appears automatically.

| Slot | Drop-in path | Recommended size |
| --- | --- | --- |
| Hero — happy family banking | `public/images/hero-family.jpg` | 1600×900 |
| Professional, laptop/mobile banking | `public/images/feature-professional.jpg` | 1200×800 |
| Small business owner | `public/images/feature-small-business.jpg` | 1200×800 |
| Credit card / product marketing | `public/images/product-card.jpg` | 1200×800 |
| Security / fraud protection | `public/images/security-protection.jpg` | 1200×800 |

Shared style direction for all images: clean, modern, trustworthy national-bank
aesthetic; natural light; navy/teal/white palette with subtle warm gold accents;
authentic candid moments (not stiff stock poses); plenty of negative space for
text overlays; no visible real brand names, logos, card numbers, or text.

---

## 1. Happy family banking hero (`hero-family.jpg`)

```
A warm, candid lifestyle photograph of a diverse multi-generational family
relaxing together in a bright modern living room, softly out-of-focus, natural
window light, calm and reassuring mood. Cool navy-and-teal color grade with
subtle warm highlights. Shallow depth of field, generous negative space on the
left for headline text. Photorealistic, editorial banking-brand quality. No
text, no logos, no visible screens with brand names.
```

## 2. Professional using laptop/mobile banking (`feature-professional.jpg`)

```
A focused young professional sitting at a clean minimalist desk using a laptop
and holding a smartphone, soft daylight from a side window, modern office or
home-office setting, confident and at-ease expression. Navy/teal palette, crisp
and bright. Composition leaves room on the right for UI mockups. Photorealistic,
no readable screen content, no brand logos.
```

## 3. Small business owner banking (`feature-small-business.jpg`)

```
A small-business owner in an artisan storefront (e.g. a bakery or boutique)
checking finances on a tablet behind the counter, warm and welcoming
atmosphere, genuine smile, authentic workspace details. Balanced navy/teal with
warm gold accent lighting. Photorealistic lifestyle photography, no real brand
names or logos visible.
```

## 4. Credit card / product marketing (`product-card.jpg`)

```
A premium studio product render of a sleek unbranded matte navy payment card
with a subtle teal-to-gold gradient edge and an embossed abstract compass motif,
floating at a three-quarter angle on a soft gradient background with gentle
reflections and shadow. No real card network logos, no numbers, no names.
Clean, modern fintech marketing aesthetic.
```

## 5. Security / fraud protection (`security-protection.jpg`)

```
A clean conceptual image representing financial security and fraud protection: a
softly glowing abstract shield or padlock motif integrated with a subtle compass
/ meridian-line pattern, navy-and-teal palette with a single warm gold accent,
minimalist, lots of negative space, premium and reassuring. Abstract and
modern, not literal; no text, no logos.
```

---

### Negative prompt guidance (for tools that support it)

```
real bank logos, brand names, trademarks, readable text, watermark, identifiable
celebrities, real credit card numbers, distorted hands, low quality, oversaturated
```
