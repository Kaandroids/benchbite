/** A time in seconds as minutes and seconds, such as 1:30. */
export function minutesAndSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
