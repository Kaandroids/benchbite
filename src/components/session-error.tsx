import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

type SessionErrorProps = {
  onRetry: () => Promise<void>;
};

/** Shown when the first anonymous sign-in fails, usually because the device is offline. */
export function SessionError({ onRetry }: SessionErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const isDark = useColorScheme() === 'dark';

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Couldn’t connect</Text>
      <Text style={[styles.message, { color: isDark ? '#aaa' : '#555' }]}>
        Benchbite needs an internet connection the first time it starts. Check your connection and
        try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={isRetrying}
        onPress={handleRetry}
        style={({ pressed }) => [styles.button, (pressed || isRetrying) && styles.buttonPressed]}
      >
        {isRetrying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Try again</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    marginTop: 12,
    minWidth: 160,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#208AEF',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
