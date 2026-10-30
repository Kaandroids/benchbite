// Every model call is limited and counted (ADR 0051) only if functions reach a model through
// aiModel(): this keeps any other code from calling one past it.
import { assertEquals } from '@std/assert';

const FUNCTIONS = new URL('../../', import.meta.url);

/** Where a model may be reached: the model interface itself, and aiModel(). */
const ALLOWED = ['_shared/llm/', '_shared/ai_usage.ts'];

/** What reaching a model looks like: our model, Gemini's own client or API, or its key. */
const MODEL =
  /\blanguageModel\b|\bGeminiModel\b|llm\/gemini|@google\/genai|googleapis\.com|GEMINI_API_KEY/;

/** Every source file under `dir`, its tests left out. */
async function* sources(dir: URL): AsyncIterable<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) yield* sources(url);
    else if (/\.(m|c)?[jt]sx?$/.test(entry.name) && !/_test\.\w+$/.test(entry.name)) yield url;
  }
}

Deno.test('code reaches a model only through aiModel()', async () => {
  const offending: string[] = [];
  for await (const file of sources(FUNCTIONS)) {
    const path = file.pathname.slice(FUNCTIONS.pathname.length);
    if (ALLOWED.some((allowed) => path.startsWith(allowed))) continue;
    if (MODEL.test(await Deno.readTextFile(file))) offending.push(path);
  }

  assertEquals(offending, []);
});
