import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text variant="headline">Benchbite</Text>
      {__DEV__ ? (
        <Link href="/dev/components">
          <Text variant="bodyStrong" color="primaryText">
            Open the component gallery
          </Text>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
