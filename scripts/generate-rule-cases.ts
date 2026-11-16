// Writes the pgTAP test of supabase/tests/rules/cases.json. Run with `pnpm rules:sql` after
// changing the cases; `pnpm check:rules` fails while the test is behind.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RULE_CASES_SQL_PATH, ruleCasesSql } from './lib/rule-cases.ts';

const ROOT = join(import.meta.dirname, '..');
writeFileSync(join(ROOT, RULE_CASES_SQL_PATH), ruleCasesSql(ROOT));
console.log(`Wrote ${RULE_CASES_SQL_PATH}`);
