// Stores the project URL and the secret API key of the local Supabase stack in its Vault, where
// the scheduled jobs read them to call Edge Functions (ADR 0063). Run with `pnpm vault:local`
// while the stack is running, and again after `pnpm supabase db reset`. The key is read from
// `supabase status`, so that it is never written into the repository; it works only locally.
import { execFileSync } from 'node:child_process';

// The jobs run in the database container, which reaches the API gateway by its name.
const PROJECT_URL = 'http://kong:8000';

const status = JSON.parse(
  execFileSync('pnpm', ['-s', 'supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
) as { SECRET_KEY?: string };
const secretKey = status.SECRET_KEY;
// Checked, as it is written into the SQL below.
if (!secretKey || !/^sb_secret_[\w-]+$/.test(secretKey)) {
  throw new Error('No secret key in `supabase status`; is the local stack running?');
}

// One statement, as `db query` runs no more.
const sql = `do $$ begin
  delete from vault.secrets where name in ('project_url', 'secret_key');
  perform vault.create_secret('${PROJECT_URL}', 'project_url');
  perform vault.create_secret('${secretKey}', 'secret_key');
end $$`;
try {
  execFileSync('pnpm', ['-s', 'supabase', 'db', 'query', '--local', sql], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch {
  // The command's error would repeat the SQL, with the key.
  console.error('Storing the secrets in the local Vault failed.');
  process.exit(1);
}
console.log('Stored project_url and secret_key in the local Vault.');
