/** The shortest password Auth accepts, as `minimum_password_length` in `supabase/config.toml`. */
export const MIN_PASSWORD_LENGTH = 6;
/** The longest password Auth accepts. */
export const MAX_PASSWORD_LENGTH = 72;

/** The limits, as the messages about passwords name them. */
export const PASSWORD_LIMITS = { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH };
