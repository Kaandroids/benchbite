// Fails while the pgTAP test of the shared rule cases is behind supabase/tests/rules/cases.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RULE_CASES_PATH, RULE_CASES_SQL_PATH, ruleCasesSql } from './lib/rule-cases.ts';

const ROOT = join(import.meta.dirname, '..');
if (readFileSync(join(ROOT, RULE_CASES_SQL_PATH), 'utf8') !== ruleCasesSql(ROOT)) {
  console.error(`${RULE_CASES_SQL_PATH} is behind ${RULE_CASES_PATH}: run \`pnpm rules:sql\`.`);
  process.exit(1);
}
console.log(`${RULE_CASES_SQL_PATH} matches ${RULE_CASES_PATH}`);
