// Starts reporting as this module loads (ADR 0149). The root layout imports it before anything
// else, so that a module failing as it loads, such as the Supabase client without its settings,
// is reported too: imports run before the code of the module that imports them.
import { startReporting } from './reporting';

startReporting();
