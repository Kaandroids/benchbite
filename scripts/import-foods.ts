// Imports the food library from the Bundeslebensmittelschlüssel (BLS) 4.0 of the Max
// Rubner-Institut, published under CC BY 4.0 (https://blsdb.de):
//
// - downloads the pinned release and checks its SHA-256,
// - reads the nutrients of the foods chosen in supabase/data/foods.json, and
// - writes a migration that inserts or updates them with their names and portions, and archives
//   the foods no longer listed.
//
// Run with `pnpm import:foods`. To add, change or remove a food, edit foods.json and run it
// again; to update the release, change BLS_URL and BLS_SHA256. `--file <zip>` reads a downloaded
// copy.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { Constants, type Database } from '../src/lib/database.types.ts';
import { MIGRATIONS_DIR, sqlString, timestamp } from './lib/migration.ts';

const BLS_URL = 'https://blsdb.de/assets/uploads/BLS_4_0_2025_DE.zip';
const BLS_SHA256 = '12b7a6ba62807ec9b301eb276f897dc85f99b2292311618dec3749a12d984c91';
const BLS_DATA_FILE = 'BLS_4_0_Daten_2025_DE.xlsx';

const ROOT = join(import.meta.dirname, '..');
const FOODS_FILE = join(ROOT, 'supabase', 'data', 'foods.json');

type FoodGroup = Database['public']['Enums']['food_group'];
type PortionUnit = Database['public']['Enums']['portion_unit'];

/** The languages every food is named in. A new one needs its names in foods.json. */
const LANGUAGES = ['en', 'de', 'tr'] as const;

type ChosenFood = Record<(typeof LANGUAGES)[number], string> & {
  portions: { unit: PortionUnit; grams: number; default?: boolean }[];
};

/** The BLS main groups by the first letter of a code. */
const GROUPS: Record<string, FoodGroup> = {
  B: 'bread',
  C: 'cereals',
  D: 'pastries',
  E: 'eggs_and_pasta',
  F: 'fruit',
  G: 'vegetables',
  H: 'legumes_nuts_seeds',
  K: 'potatoes_mushrooms',
  M: 'dairy',
  N: 'drinks',
  P: 'alcoholic_drinks',
  Q: 'fats',
  R: 'condiments',
  S: 'sweets',
  T: 'fish',
  U: 'meat',
  V: 'poultry_game_offal',
  W: 'sausages',
  X: 'dishes',
  Y: 'dishes',
};

const PORTION_UNITS = new Set<string>(Constants.public.Enums.portion_unit);

/**
 * BLS nutrient codes, the first word of each column header, with the column they fill and the
 * decimals that column keeps.
 */
const NUTRIENTS = {
  ENERCC: { column: 'kcal', decimals: 1, required: true },
  PROT625: { column: 'protein_g', decimals: 2, required: true },
  CHO: { column: 'carbs_g', decimals: 2, required: true },
  FAT: { column: 'fat_g', decimals: 2, required: true },
  FIBT: { column: 'fiber_g', decimals: 2, required: false },
  SUGAR: { column: 'sugar_g', decimals: 2, required: false },
  FASAT: { column: 'saturated_fat_g', decimals: 2, required: false },
  NACL: { column: 'salt_g', decimals: 2, required: false },
} as const;

type NutrientCode = keyof typeof NUTRIENTS;

async function readRelease(): Promise<Buffer> {
  const fileArgument = process.argv.indexOf('--file');
  let archive: Buffer;
  if (fileArgument !== -1) {
    const path = process.argv[fileArgument + 1];
    if (!path) {
      throw new Error('--file needs the path of the BLS zip');
    }
    archive = readFileSync(path);
  } else {
    const response = await fetch(BLS_URL);
    if (!response.ok) {
      throw new Error(`Could not download the BLS: ${response.status}`);
    }
    archive = Buffer.from(await response.arrayBuffer());
  }
  const hash = createHash('sha256').update(archive).digest('hex');
  if (hash !== BLS_SHA256) {
    throw new Error(`The BLS release changed: expected SHA-256 ${BLS_SHA256}, got ${hash}`);
  }
  return archive;
}

/**
 * The files of a zip archive by name. Enough for the BLS release and the xlsx inside it:
 * entries stored or deflated, found through the central directory.
 */
function unzip(archive: Buffer): Map<string, Buffer> {
  const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) {
    end--;
  }
  if (end < 0) {
    throw new Error('Not a zip archive');
  }
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < entries; index++) {
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeader = archive.readUInt32LE(offset + 42);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart =
      localHeader +
      30 +
      archive.readUInt16LE(localHeader + 26) +
      archive.readUInt16LE(localHeader + 28);
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) {
      files.set(name, data);
    } else if (method === 8) {
      files.set(name, inflateRawSync(data));
    } else {
      throw new Error(`${name} uses an unsupported compression method ${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function xmlText(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** The first sheet of an xlsx workbook as rows of cell texts, by column index. */
function readSheet(workbook: Buffer): string[][] {
  const files = unzip(workbook);
  const shared = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1]!)).join(''),
  );
  const sheet = files.get('xl/worksheets/sheet1.xml')?.toString('utf8');
  if (!sheet) {
    throw new Error('The workbook has no first sheet');
  }
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: string[] = [];
    for (const cell of row[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, letters, attributes, content = ''] = cell;
      const column = [...letters!].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
      const value = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1];
      cells[column - 1] =
        value === undefined ? '' : / t="s"/.test(attributes!) ? strings[Number(value)]! : value;
    }
    return cells;
  });
}

type BlsFood = Record<NutrientCode, number | null>;

/**
 * A nutrient value as a number. BLS marks amounts too small to measure as "<LOD or <LOQ" or
 * as traces ("Spuren", "TR"), which count as 0, and missing values as "-".
 */
function nutrientValue(code: string, nutrient: string, value: string | undefined): number | null {
  if (value === undefined || value === '' || value === '-') {
    return null;
  }
  if (value.startsWith('<') || value === 'Spuren' || value === 'TR') {
    return 0;
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    throw new Error(`${code} has an unknown ${nutrient} value "${value}"`);
  }
  return number;
}

/** The nutrients of every BLS food by code. */
function readBls(archive: Buffer): Map<string, BlsFood> {
  const files = unzip(archive);
  const workbook = files.get([...files.keys()].find((name) => name.endsWith(BLS_DATA_FILE)) ?? '');
  if (!workbook) {
    throw new Error(`The release has no ${BLS_DATA_FILE}`);
  }
  const [header, ...rows] = readSheet(workbook);
  const columnOf = (code: string) => {
    const index = header!.findIndex((title) => title?.split(' ')[0] === code);
    if (index === -1) {
      throw new Error(`The BLS has no column ${code}`);
    }
    return index;
  };
  const columns = Object.fromEntries(
    Object.keys(NUTRIENTS).map((code) => [code, columnOf(code)]),
  ) as Record<NutrientCode, number>;
  const foods = new Map<string, BlsFood>();
  for (const row of rows) {
    const code = row[0];
    if (!code) {
      continue;
    }
    foods.set(
      code,
      Object.fromEntries(
        Object.entries(columns).map(([nutrient, index]) => {
          return [nutrient, nutrientValue(code, nutrient, row[index])];
        }),
      ) as BlsFood,
    );
  }
  return foods;
}

function check(chosen: Record<string, ChosenFood>, bls: Map<string, BlsFood>): void {
  const problems: string[] = [];
  for (const [code, food] of Object.entries(chosen)) {
    const values = bls.get(code);
    if (!values) {
      problems.push(`${code} is not in the BLS`);
      continue;
    }
    if (!GROUPS[code[0]!]) {
      problems.push(`${code} has no known group`);
    }
    for (const [nutrient, { required }] of Object.entries(NUTRIENTS)) {
      if (required && values[nutrient as NutrientCode] === null) {
        problems.push(`${code} has no ${nutrient}`);
      }
    }
    for (const language of LANGUAGES) {
      const name = food[language]?.trim() ?? '';
      if (name.length < 1 || name.length > 120) {
        problems.push(`${code} needs a ${language} name of 1 to 120 characters`);
      }
    }
    if (
      food.portions.length === 0 ||
      food.portions.filter((p) => p.default === true).length !== 1
    ) {
      problems.push(`${code} needs portions with exactly one default`);
    }
    // The same limits as the food_portions table: grams up to 5000 with one decimal.
    for (const portion of food.portions) {
      const { unit, grams } = portion;
      if (
        !PORTION_UNITS.has(unit) ||
        !(grams > 0 && grams <= 5000) ||
        Number(grams.toFixed(1)) !== grams
      ) {
        problems.push(`${code} has an invalid portion ${JSON.stringify(portion)}`);
      }
    }
    if (new Set(food.portions.map((p) => p.unit)).size !== food.portions.length) {
      problems.push(`${code} has a unit more than once`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`foods.json has problems:\n${problems.join('\n')}`);
  }
}

function sqlNumber(value: number | null, decimals: number): string {
  return value === null ? 'null' : String(Number(value.toFixed(decimals)));
}

/**
 * Foods taken out of foods.json are archived, not deleted, so that the meals that refer to them
 * keep working. A food listed again is restored by the upsert.
 */
function archivedSql(chosen: [string, ChosenFood][]): string {
  return `
update public.foods set archived_at = now()
where source = 'bls' and archived_at is null
  and id not in (${chosen.map(([code]) => sqlString(code)).join(', ')});
`;
}

function foodsSql(chosen: [string, ChosenFood][], bls: Map<string, BlsFood>): string {
  const nutrients = Object.entries(NUTRIENTS) as [NutrientCode, (typeof NUTRIENTS)[NutrientCode]][];
  const columns = ['source', 'food_group', ...nutrients.map(([, { column }]) => column)];
  const rows = chosen.map(([code]) => {
    const values = bls.get(code)!;
    return `  (${[
      sqlString(code),
      "'bls'",
      sqlString(GROUPS[code[0]!]!),
      ...nutrients.map(([nutrient, { decimals }]) => sqlNumber(values[nutrient], decimals)),
    ].join(', ')})`;
  });
  return `
insert into public.foods (id, ${columns.join(', ')})
values
${rows.join(',\n')}
on conflict (id) do update set
${columns.map((column) => `  ${column} = excluded.${column}`).join(',\n')},
  archived_at = null;
`;
}

function namesSql(chosen: [string, ChosenFood][]): string {
  const rows = chosen.flatMap(([code, food]) =>
    LANGUAGES.map(
      (language) => `  (${[code, language, food[language].trim()].map(sqlString).join(', ')})`,
    ),
  );
  return `
insert into public.food_names (food_id, language, name)
values
${rows.join(',\n')}
on conflict (food_id, language) do update set name = excluded.name;
`;
}

/** Portions are replaced as a whole, so that one removed from foods.json goes too. */
function portionsSql(chosen: [string, ChosenFood][]): string {
  const rows = chosen.flatMap(([code, food]) =>
    food.portions.map(
      (portion) =>
        `  (${sqlString(code)}, ${sqlString(portion.unit)}, ${portion.grams}, ${portion.default === true})`,
    ),
  );
  return `
delete from public.food_portions
where food_id in (${chosen.map(([code]) => sqlString(code)).join(', ')});

insert into public.food_portions (food_id, unit, grams, is_default)
values
${rows.join(',\n')};
`;
}

const chosen = JSON.parse(readFileSync(FOODS_FILE, 'utf8')) as Record<string, ChosenFood>;
const bls = readBls(await readRelease());
check(chosen, bls);

const entries = Object.entries(chosen).sort(([a], [b]) => a.localeCompare(b));
const header = `-- Generated by scripts/import-foods.ts from the BLS 4.0 (Max Rubner-Institut, CC BY 4.0)
-- and supabase/data/foods.json. Do not edit by hand.
`;
const file = join(MIGRATIONS_DIR, `${timestamp()}_import_foods.sql`);
writeFileSync(
  file,
  header + archivedSql(entries) + foodsSql(entries, bls) + namesSql(entries) + portionsSql(entries),
);
console.log(`Wrote ${entries.length} foods to ${file}`);
