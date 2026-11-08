// The code sent to an account's address that confirms deleting it from the app (#438, ADR 0095).
import { sha256Hex } from './hash.ts';

/** How many digits a code has, as the app's code fields. */
export const CODE_LENGTH = 6;

/** A code of random digits, each as likely as the others. */
export function newCode(): string {
  const digits: number[] = [];
  while (digits.length < CODE_LENGTH) {
    // 250 is the largest multiple of 10 a byte holds, so higher bytes are drawn again.
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (byte < 250 && digits.length < CODE_LENGTH) digits.push(byte % 10);
    }
  }
  return digits.join('');
}

/** The hash kept for a user's code, with the user in it, so it says nothing about other codes. */
export function codeHash(userId: string, code: string): Promise<string> {
  return sha256Hex(`${userId}:${code}`);
}
