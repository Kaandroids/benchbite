// Every model call is limited and counted (ADR 0051) only if functions reach a model through
// aiModel(): this keeps them from calling one past it.
import { assertEquals } from '@std/assert';

const FUNCTIONS = new URL('../../', import.meta.url);

/** The TypeScript files of a function, its tests left out. */
async function* sources(dir: URL): AsyncIterable<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) yield* sources(url);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('_test.ts')) yield url;
  }
}

Deno.test('functions reach a model only through aiModel()', async () => {
  const offending: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS)) {
    if (!entry.isDirectory || entry.name.startsWith('_')) continue;
    for await (const file of sources(new URL(`${entry.name}/`, FUNCTIONS))) {
      const text = await Deno.readTextFile(file);
      if (/\blanguageModel\b|llm\/gemini\.ts|\bGeminiModel\b/.test(text)) {
        offending.push(file.pathname.slice(FUNCTIONS.pathname.length));
      }
    }
  }

  assertEquals(offending, []);
});
