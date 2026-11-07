/** The shortest password Auth accepts, as `minimum_password_length` in `supabase/config.toml`. */
export const MIN_PASSWORD_LENGTH = 8;
/** The longest password Auth accepts, in bytes. */
export const MAX_PASSWORD_LENGTH = 72;

/** The limits, as the messages about passwords name them. */
export const PASSWORD_LIMITS = { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH };

/** Whether Auth would refuse a password for its length, as letters such as ü take two bytes. */
export function isPasswordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH;
}

/** Whether a new password fits the limits. */
export function isPasswordValid(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && !isPasswordTooLong(password);
}
