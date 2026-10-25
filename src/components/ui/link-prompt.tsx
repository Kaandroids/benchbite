import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';

/** A question and a link that answers it, such as "Already have an account? Log in". */
export function LinkPrompt({
  question,
  action,
  onPress,
}: {
  question: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text color="textMuted">{question} </Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
        <Text variant="label" color="primaryText">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
