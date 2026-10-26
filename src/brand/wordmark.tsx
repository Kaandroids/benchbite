import { StyleSheet, Text, type TextStyle } from 'react-native';

import { fonts } from '@/theme';

type WordmarkProps = {
  /** The font size; the letter spacing tightens with it. */
  size: number;
  color: string;
};

/** "benchbite" as the brand writes it: lower case, in the heaviest Nunito. */
export function Wordmark({ size, color }: WordmarkProps) {
  const style: TextStyle = { fontSize: size, letterSpacing: -size / 80, color };
  return (
    // A name, so it keeps its size whatever the system font size.
    <Text allowFontScaling={false} style={[styles.wordmark, style]}>
      benchbite
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: fonts.black,
  },
});
