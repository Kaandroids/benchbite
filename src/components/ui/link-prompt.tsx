import { StyleSheet, View } from 'react-native';

import { Text } from './text';
import { TextLink } from './text-link';

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
      <TextLink label={action} size="regular" onPress={onPress} />
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
