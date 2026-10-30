/** The value if it is one of `options`, typed as that option; undefined otherwise. */
export function oneOf<T extends string>(options: readonly T[], value: string | undefined) {
  return options.find((option) => option === value);
}
