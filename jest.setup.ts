// Runs before every test file.

// The Supabase client refuses to start without these. Tests never reach the server: modules that
// call it are mocked.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
