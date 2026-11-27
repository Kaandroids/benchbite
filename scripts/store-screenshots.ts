// Draws the App Store screenshots from the app's own screens (#557): each language's shot of a
// screen, a caption above it with one word in the brand's colour, a part of the screen enlarged
// beside it and, on some, Bite. The design was approved as a mock-up on 2026-11-27. The screens
// are in docs/media/store/source/<language>/, taken as docs/media/README.md says; the
// screenshots go to docs/media/store/out/<language>/, which Git ignores, at the size App Store
// Connect asks for the 6.9" iPhone. Run with `pnpm store:screenshots`, which sets
// PANGOCAIRO_BACKEND=fc before sharp loads: on macOS, Pango otherwise finds fonts through CoreText,
// which ignores the Nunito files given here and draws the text in Helvetica.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp, { type OverlayOptions } from 'sharp';

import { BRAND_ORANGE } from '../src/brand/mark.ts';
import { darkColors, lightColors } from '../src/theme/colors.ts';

const ROOT = join(import.meta.dirname, '..');
const STORE_DIR = join(ROOT, 'docs', 'media', 'store');
const FONTS = join(ROOT, 'node_modules', '@expo-google-fonts', 'nunito');
const FONT_BLACK = join(FONTS, '900Black', 'Nunito_900Black.ttf');
const FONT_BOLD = join(FONTS, '700Bold', 'Nunito_700Bold.ttf');
const FONT_EXTRA_BOLD = join(FONTS, '800ExtraBold', 'Nunito_800ExtraBold.ttf');
/** The watch beside a finished workout, as the README shows it. */
const WATCH = join(ROOT, 'docs', 'media', 'watch-set.png');

/** The screenshot's size, App Store Connect's 6.9" iPhone portrait, and the screens'. */
const WIDTH = 1320;
const HEIGHT = 2868;

/** The phone: where it stands, its bezel, and the screen's width inside it. */
const PHONE = { left: 183, top: 660, bezel: 18, screen: 918, radius: 120 };
/** How much smaller the screen is drawn than it was taken. */
const SCREEN_SCALE = PHONE.screen / WIDTH;

const LANGUAGES = ['en', 'de', 'tr'] as const;
type Language = (typeof LANGUAGES)[number];

/** The app's colour tokens (src/theme/colors.ts) a screenshot is drawn in. */
const THEMES = {
  light: {
    background: lightColors.background,
    text: lightColors.text,
    accent: lightColors.primaryText,
    muted: lightColors.textMuted,
    bezel: lightColors.text,
    wash: lightColors.primaryWash,
  },
  dark: {
    background: darkColors.background,
    text: darkColors.text,
    accent: darkColors.primaryText,
    muted: darkColors.textMuted,
    bezel: darkColors.border,
    wash: darkColors.primaryWash,
  },
};

/** The caption's size, which keeps every caption to two lines. */
const CAPTION_SIZE = 88;

/** The frame of an enlarged part, the app's `primary`. */
const CALLOUT_FRAME = lightColors.primary;
/** The watch's case, as dark as the dark theme's borders. */
const WATCH_CASE = darkColors.border;

type Expression = 'happy' | 'thinking' | 'surprised';

/**
 * A caption: the words before the coloured one, the coloured one, and the words after it, with a
 * line break where it reads best, so that no word is left alone on a line.
 */
type Caption = [before: string, accent: string, after: string];

type Region = { x: number; y: number; width: number; height: number };

type Shot = {
  /** The screen's file in each language's folder. */
  file: string;
  theme: keyof typeof THEMES;
  caption: Record<Language, Caption>;
  line: Record<Language, string>;
  badge?: string;
  /**
   * The part of the screen enlarged: a fixed part, in the screen's pixels, one for all languages or
   * one each where the words move it, or the card around a point, in shares of the screen.
   */
  callout?: ({ region: Region | Record<Language, Region> } | { cardAround: [number, number] }) & {
    zoom: number;
    tilt: number;
    /** How far right of the middle it stands. */
    shift?: number;
  };
  bite?: { expression: Expression; left: number; top: number; size: number; tilt: number };
  watch?: boolean;
};

/** The shots, in the order the store shows them; the first three matter most. */
const SHOTS: Shot[] = [
  {
    file: '1-today.png',
    theme: 'light',
    caption: {
      en: ['Workouts and calories\nin ', 'one plan', ''],
      de: ['Training und Kalorien\nin ', 'einem Plan', ''],
      tr: ['Antrenman ve kalori\n', 'tek planda', ''],
    },
    line: {
      en: 'A plan from a few questions, no account needed',
      de: 'Ein Plan aus ein paar Fragen, ganz ohne Konto',
      tr: 'Birkaç soruyla planın hazır, hesap gerekmez',
    },
    callout: { cardAround: [0.5, 0.18], zoom: 1.18, tilt: -2 },
    bite: { expression: 'happy', left: 48, top: 1590, size: 264, tilt: -10 },
  },
  {
    file: '2-workout.png',
    theme: 'light',
    caption: {
      en: ['Beat ', 'last time', ',\nset by set'],
      de: ['Schlag dein ', 'letztes Mal', ',\nSatz für Satz'],
      tr: ['', 'Geçen seferi', ' geç,\nset set'],
    },
    line: {
      en: 'Last time beside every set, and new records as they fall',
      de: 'Das letzte Mal neben jedem Satz, und jeder neue Rekord',
      tr: 'Her setin yanında geçen sefer, kırılan her rekor',
    },
    // The second set's row, higher in German and Turkish, whose exercise name takes one line.
    callout: {
      region: {
        en: { x: 100, y: 956, width: 1124, height: 227 },
        de: { x: 100, y: 912, width: 1124, height: 227 },
        tr: { x: 100, y: 912, width: 1124, height: 227 },
      },
      zoom: 1.15,
      tilt: -2,
    },
  },
  {
    file: '3-nutrition.png',
    theme: 'light',
    caption: {
      en: ['Calories and macros\n', 'in seconds', ''],
      de: ['Kalorien und Makros\n', 'im Nu', ''],
      tr: ['Kalori ve makro,\n', 'saniyeler içinde', ''],
    },
    line: {
      en: 'Your own foods, favourites, water and a meal from a photo',
      de: 'Eigene Lebensmittel, Favoriten, Wasser und Mahlzeiten per Foto',
      tr: 'Kendi besinlerin, favorilerin, su ve fotoğraftan öğün',
    },
    callout: { cardAround: [0.5, 0.25], zoom: 1.15, tilt: 2 },
  },
  {
    file: '4-bite-meal.png',
    theme: 'light',
    badge: 'Premium',
    caption: {
      en: ['Tell ', 'Bite', ' what you ate'],
      de: ['Sag ', 'Bite', ', was du\ngegessen hast'],
      tr: ['Ne yediğini ', "Bite'a", ' söyle'],
    },
    line: {
      en: 'Send a photo, add a word, and Bite logs it for you',
      de: 'Schick ein Foto, sag kurz was dazu, und Bite trägt es ein',
      tr: 'Fotoğraf gönder, bir not ekle, Bite kaydetsin',
    },
    callout: { cardAround: [0.5, 0.66], zoom: 1.1, tilt: -2 },
    bite: { expression: 'happy', left: 42, top: 618, size: 300, tilt: -8 },
  },
  {
    file: '5-bite-remembers.png',
    theme: 'light',
    badge: 'Premium',
    caption: {
      en: ['A coach that\n', 'remembers', ''],
      de: ['Ein Coach, der sich\n', 'erinnert', ''],
      tr: ['Seni ', 'hatırlayan', '\nbir koç'],
    },
    line: {
      en: 'Bite notes an injury and suggests a swap you apply or undo',
      de: 'Bite merkt sich eine Verletzung und schlägt eine Änderung vor',
      tr: 'Bite sakatlığını not eder ve bir değişiklik önerir',
    },
    callout: { cardAround: [0.5, 0.68], zoom: 1.08, tilt: 2 },
    bite: { expression: 'thinking', left: 978, top: 618, size: 288, tilt: 8 },
  },
  {
    file: '6-workout-watch.png',
    theme: 'light',
    caption: {
      en: ['Log sets from\n', 'your wrist', ''],
      de: ['Sätze am ', 'Handgelenk', '\nabhaken'],
      tr: ['Setleri ', 'bileğinden', '\nişaretle'],
    },
    line: {
      en: 'Apple Watch, heart rate and Apple Health',
      de: 'Apple Watch, Puls und Apple Health',
      tr: 'Apple Watch, nabız ve Apple Sağlık',
    },
    callout: {
      region: { x: 88, y: 866, width: 1143, height: 406 },
      zoom: 1.1,
      tilt: -2,
      shift: -72,
    },
    watch: true,
  },
  {
    file: '7-progress.png',
    theme: 'light',
    caption: {
      en: ['See how far\n', "you've come", ''],
      de: ['Sieh, wie weit du\n', 'gekommen bist', ''],
      tr: ['Ne kadar\n', 'yol aldığını', ' gör'],
    },
    line: {
      en: 'Weight over time, monthly summaries and your streak',
      de: 'Gewicht im Verlauf, Monatsübersichten und deine Serie',
      tr: 'Kilonun seyri, aylık özetler ve serin',
    },
    callout: {
      region: { x: 93, y: 490, width: 717, height: 299 },
      zoom: 1.2,
      tilt: -3,
      shift: -150,
    },
    bite: { expression: 'surprised', left: 912, top: 900, size: 288, tilt: 10 },
  },
  {
    file: '8-today-dark.png',
    theme: 'dark',
    caption: {
      en: ['', 'Light or dark', ',\nevery day'],
      de: ['', 'Hell oder dunkel', ',\njeden Tag'],
      tr: ['', 'Açık ya da koyu', ',\nher gün'],
    },
    line: {
      en: 'In English, German and Turkish',
      de: 'Auf Deutsch, Englisch und Türkisch',
      tr: 'Türkçe, Almanca ve İngilizce',
    },
  },
];

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text drawn in a Nunito face, as one image `width` wide at most. */
async function text(markup: string, fontfile: string, face: string, size: number, width: number) {
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${face} ${size}`,
      fontfile,
      width,
      align: 'centre',
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** A rounded rectangle as an SVG image. */
function roundedRect(width: number, height: number, radius: number, fill: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" rx="${radius}" fill="${fill}"/></svg>`,
  );
}

/** A colour written as #RRGGBB, as its red, green and blue. */
function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** An image with its corners rounded off. */
async function rounded(image: Buffer, width: number, height: number, radius: number) {
  return sharp(image)
    .resize(width, height)
    .composite([{ input: roundedRect(width, height, radius, '#000'), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** A soft shadow under a rounded rectangle, `blur` wider on each side. */
async function shadow(
  width: number,
  height: number,
  radius: number,
  blur: number,
  opacity: number,
) {
  const pad = blur * 2;
  return sharp({
    create: { width: width + pad * 2, height: height + pad * 2, channels: 4, background: '#0000' },
  })
    .composite([
      {
        input: roundedRect(width, height, radius, `rgba(22, 23, 26, ${opacity})`),
        left: pad,
        top: pad,
      },
    ])
    .blur(blur)
    .png()
    .toBuffer();
}

/**
 * Bite, as src/coach/bite-face.tsx draws it on its orange circle, with one of its expressions from
 * src/coach/bite-expressions.tsx, on a 100 × 100 box.
 */
function biteSvg(expression: Expression, size: number): Buffer {
  const line = (d: string, width = 3) =>
    `<path d="${d}" fill="none" stroke="#16171A" stroke-width="${width}" stroke-linecap="round"/>`;
  const cheeks = (opacity: number, rx = 5, ry = 3, cy = 55) =>
    `<ellipse cx="29" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BRAND_ORANGE}" opacity="${opacity}"/>` +
    `<ellipse cx="71" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BRAND_ORANGE}" opacity="${opacity}"/>`;
  const eyes = (left: number, right: number, cy: number, r: number, glint: number, g: number) =>
    `<ellipse cx="${left}" cy="${cy}" rx="${r}" ry="${r}" fill="#16171A"/>` +
    `<ellipse cx="${right}" cy="${cy}" rx="${r}" ry="${r}" fill="#16171A"/>` +
    `<circle cx="${left + glint}" cy="${cy - glint}" r="${g}" fill="#FFFFFF"/>` +
    `<circle cx="${right + glint}" cy="${cy - glint}" r="${g}" fill="#FFFFFF"/>`;
  const faces: Record<Expression, string> = {
    happy:
      line('M33 46 Q38 39 43 46', 3.6) +
      line('M57 46 Q62 39 67 46', 3.6) +
      cheeks(0.6, 5.5, 3.2) +
      '<path d="M39 56 H61 Q61 72 50 72 Q39 72 39 56 Z" fill="#16171A"/>' +
      '<ellipse cx="50" cy="68.4" rx="5" ry="2.6" fill="#FF6A7A"/>',
    thinking:
      line('M56 33 Q62 29 68 32') +
      line('M32 36 L43 36') +
      cheeks(0.4) +
      eyes(40, 64, 43, 4.6, 1.8, 1.5) +
      line('M44 63 Q50 61 57 61.5', 3.4),
    surprised:
      line('M31 33 Q37 28 43 32') +
      line('M57 32 Q63 28 69 33') +
      cheeks(0.4, 5, 3, 56) +
      eyes(38, 62, 44, 6, 2, 2) +
      '<ellipse cx="50" cy="64" rx="5.5" ry="7" fill="#16171A"/>',
  };
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
      '<defs><mask id="bite" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">' +
      '<rect width="100" height="100" fill="#FFFFFF"/>' +
      '<circle cx="81.4" cy="25.6" r="10" fill="#000000"/>' +
      '<circle cx="67.3" cy="14.8" r="9" fill="#000000"/>' +
      '<circle cx="89.6" cy="41.4" r="9" fill="#000000"/></mask></defs>' +
      `<circle cx="50" cy="50" r="50" fill="${BRAND_ORANGE}"/>` +
      '<g transform="translate(9 7) scale(0.82)">' +
      '<g mask="url(#bite)"><circle cx="50" cy="52" r="38" fill="#FFFFFF"/>' +
      '<circle cx="50" cy="52" r="32" fill="none" stroke="#FFD9C2" stroke-width="3"/></g>' +
      '<circle cx="98" cy="31" r="1.6" fill="#FFFFFF"/>' +
      '<circle cx="95" cy="20" r="2.5" fill="#FFFFFF"/>' +
      '<circle cx="88" cy="9" r="2" fill="#FFFFFF"/>' +
      faces[expression] +
      '</g></svg>',
  );
}

/**
 * The card around a point of a screen, in its pixels: from the point out to where the screen's
 * background starts, along the point's row and a column just inside the card's left edge.
 */
function cardAround(
  pixels: Buffer,
  [shareX, shareY]: [number, number],
  background: [number, number, number],
): Region {
  const isBackground = (x: number, y: number) => {
    const i = (y * WIDTH + x) * 4;
    return background.every((value, channel) => Math.abs(pixels[i + channel]! - value) <= 2);
  };
  // The background, a few pixels of it in a row, ends the card; text and lines inside do not.
  const edge = (x: number, y: number, dx: number, dy: number): [number, number] => {
    let run = 0;
    for (;;) {
      if (x + dx < 0 || x + dx >= WIDTH || y + dy < 0 || y + dy >= HEIGHT) return [x, y];
      x += dx;
      y += dy;
      run = isBackground(x, y) ? run + 1 : 0;
      if (run === 6) return [x - dx * 6, y - dy * 6];
    }
  };
  const y = Math.round(shareY * HEIGHT);
  const [left] = edge(Math.round(shareX * WIDTH), y, -1, 0);
  const [right] = edge(Math.round(shareX * WIDTH), y, 1, 0);
  const column = left + 40;
  const [, top] = edge(column, y, 0, -1);
  const [, bottom] = edge(column, y, 0, 1);
  // Inside the card's border, which would show as a second frame.
  const inset = 6;
  return {
    x: left + inset,
    y: top + inset,
    width: right - left - inset * 2,
    height: bottom - top - inset * 2,
  };
}

async function draw(shot: Shot, language: Language): Promise<Buffer> {
  const theme = THEMES[shot.theme];
  const source = join(STORE_DIR, 'source', language, shot.file);
  const screen = sharp(source);
  const { width, height } = await screen.metadata();
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`${language}/${shot.file} is ${width} × ${height}, not ${WIDTH} × ${HEIGHT}`);
  }
  const layers: OverlayOptions[] = [];

  // A soft disc of the brand's colour behind the phone.
  layers.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="1140"><circle cx="570" cy="570" r="570" fill="${theme.wash}"/></svg>`,
    ),
    left: 90,
    top: 810,
  });

  // The words: the badge, the caption with its coloured word, and the line under it.
  let top = 138;
  if (shot.badge) {
    const label = await text(
      `<span foreground="#FFFFFF" letter_spacing="1200">${escape(shot.badge.toUpperCase())}</span>`,
      FONT_EXTRA_BOLD,
      'Nunito ExtraBold',
      39,
      600,
    );
    const pill = { width: label.width + 72, height: label.height + 24 };
    const left = Math.round((WIDTH - pill.width) / 2);
    layers.push(
      { input: roundedRect(pill.width, pill.height, pill.height / 2, theme.text), left, top },
      { input: label.data, left: left + 36, top: top + 12 },
    );
    top += pill.height + 30;
  }
  const [before, accent, after] = shot.caption[language];
  const caption = await text(
    `<span foreground="${theme.text}">${escape(before)}</span>` +
      `<span foreground="${theme.accent}">${escape(accent)}</span>` +
      `<span foreground="${theme.text}">${escape(after)}</span>`,
    FONT_BLACK,
    'Nunito Black',
    CAPTION_SIZE,
    1110,
  );
  layers.push({ input: caption.data, left: Math.round((WIDTH - caption.width) / 2), top });
  top += caption.height + 30;
  const line = await text(
    `<span foreground="${theme.muted}">${escape(shot.line[language])}</span>`,
    FONT_BOLD,
    'Nunito Bold',
    48,
    1020,
  );
  layers.push({ input: line.data, left: Math.round((WIDTH - line.width) / 2), top });
  if (top + line.height > PHONE.top - 30) {
    throw new Error(`${language}/${shot.file}: the words run into the phone`);
  }

  // The phone: its shadow, its bezel and the screen.
  const screenHeight = Math.round(HEIGHT * SCREEN_SCALE);
  const phone = {
    width: PHONE.screen + PHONE.bezel * 2,
    height: screenHeight + PHONE.bezel * 2,
  };
  layers.push(
    {
      input: await shadow(phone.width, phone.height, PHONE.radius, 70, 0.12),
      left: PHONE.left - 140,
      top: PHONE.top - 140 + 24,
    },
    {
      input: roundedRect(phone.width, phone.height, PHONE.radius, theme.bezel),
      left: PHONE.left,
      top: PHONE.top,
    },
    {
      input: await rounded(
        await screen.clone().png().toBuffer(),
        PHONE.screen,
        screenHeight,
        PHONE.radius - PHONE.bezel,
      ),
      left: PHONE.left + PHONE.bezel,
      top: PHONE.top + PHONE.bezel,
    },
  );

  // The part of the screen enlarged, framed and tilted, over where it stands on the phone.
  if (shot.callout) {
    const { zoom, tilt, shift = 0 } = shot.callout;
    const region =
      'region' in shot.callout
        ? 'x' in shot.callout.region
          ? shot.callout.region
          : shot.callout.region[language]
        : cardAround(
            await screen.clone().ensureAlpha().raw().toBuffer(),
            shot.callout.cardAround,
            rgb(theme.background),
          );
    const scale = SCREEN_SCALE * zoom;
    const inner = {
      width: Math.round(region.width * scale),
      height: Math.round(region.height * scale),
    };
    const frame = 9;
    const outer = { width: inner.width + frame * 2, height: inner.height + frame * 2 };
    const part = await screen
      .clone()
      .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
      .resize(inner.width, inner.height)
      .png()
      .toBuffer();
    const card = await sharp({
      create: { width: outer.width, height: outer.height, channels: 4, background: CALLOUT_FRAME },
    })
      .composite([
        { input: await rounded(part, inner.width, inner.height, 45), left: frame, top: frame },
      ])
      .png()
      .toBuffer();
    const framed = await rounded(card, outer.width, outer.height, 54);
    const turned = await sharp(framed).rotate(tilt, { background: '#0000' }).png().toBuffer({
      resolveWithObject: true,
    });
    const middle = {
      x: WIDTH / 2 + shift,
      y: PHONE.top + PHONE.bezel + (region.y + region.height / 2) * SCREEN_SCALE,
    };
    const turnedShadow = await sharp(await shadow(outer.width, outer.height, 54, 36, 0.18))
      .rotate(tilt, { background: '#0000' })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push(
      {
        input: turnedShadow.data,
        left: Math.round(middle.x - turnedShadow.info.width / 2),
        top: Math.round(middle.y - turnedShadow.info.height / 2 + 18),
      },
      {
        input: turned.data,
        left: Math.round(middle.x - turned.info.width / 2),
        top: Math.round(middle.y - turned.info.height / 2),
      },
    );
  }

  // The watch beside the phone, showing the set to do next.
  if (shot.watch) {
    const watch = { width: 468, height: 558, left: WIDTH - 48 - 468, top: HEIGHT - 288 - 558 };
    const face = await rounded(
      await sharp(WATCH).png().toBuffer(),
      watch.width - 72,
      watch.height - 72,
      84,
    );
    layers.push(
      {
        input: await shadow(watch.width, watch.height, 120, 50, 0.35),
        left: watch.left - 100,
        top: watch.top - 100 + 54,
      },
      {
        input: roundedRect(watch.width, watch.height, 120, WATCH_CASE),
        left: watch.left,
        top: watch.top,
      },
      {
        input: roundedRect(watch.width - 24, watch.height - 24, 108, '#000000'),
        left: watch.left + 12,
        top: watch.top + 12,
      },
      { input: face, left: watch.left + 36, top: watch.top + 36 },
    );
  }

  // Bite, peeking past the phone with the face the screen calls for.
  if (shot.bite) {
    const { expression, left, top: biteTop, size, tilt } = shot.bite;
    const face = await sharp(biteSvg(expression, size))
      .rotate(tilt, { background: '#0000' })
      .png()
      .toBuffer({ resolveWithObject: true });
    const offset = (face.info.width - size) / 2;
    const faceShadow = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 120}" height="${size + 120}"><circle cx="${size / 2 + 60}" cy="${size / 2 + 60}" r="${size / 2}" fill="rgba(22, 23, 26, 0.25)"/></svg>`,
      ),
    )
      .blur(24)
      .png()
      .toBuffer();
    layers.push(
      { input: faceShadow, left: left - 60, top: biteTop - 60 + 30 },
      { input: face.data, left: Math.round(left - offset), top: Math.round(biteTop - offset) },
    );
  }

  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: theme.background },
  })
    .composite(layers)
    .flatten({ background: theme.background })
    .removeAlpha()
    .png()
    .toBuffer();
}

for (const language of LANGUAGES) {
  const dir = join(STORE_DIR, 'out', language);
  await mkdir(dir, { recursive: true });
  for (const shot of SHOTS) {
    await writeFile(join(dir, shot.file), await draw(shot, language));
    console.log(`${language}/${shot.file}`);
  }
}
