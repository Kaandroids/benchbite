import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { BiteButton } from './bite-button';
import { BITE_EXPRESSIONS, BITE_STATES } from './bite-expressions';
const SIZES = [32, 48, 72, 112];

/** Bite in the component gallery: every expression, every live state, its sizes and its button. */
export function BiteGallery() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="label">Expressions</Text>
      <View style={[styles.grid, { gap: spacing.lg }]}>
        {BITE_EXPRESSIONS.map((expression) => (
          <Sample key={expression} label={expression}>
            <BiteAvatar size={88} expression={expression} />
          </Sample>
        ))}
      </View>
      <Text variant="label">Live states</Text>
      <View style={[styles.grid, { gap: spacing.lg }]}>
        {BITE_STATES.map((state) => (
          <Sample key={state} label={state}>
            <BiteAvatar size={88} state={state} />
          </Sample>
        ))}
        <Sample label="looks about">
          <BiteAvatar size={88} looksAbout />
        </Sample>
      </View>
      <Text variant="label">Sizes</Text>
      <View style={[styles.grid, styles.bottom, { gap: spacing.lg }]}>
        {SIZES.map((size) => (
          <Sample key={size} label={`${size}`}>
            <BiteAvatar size={size} />
          </Sample>
        ))}
      </View>
      <Text variant="label">In the tab bar</Text>
      <View style={styles.button}>
        <BiteButton />
      </View>
    </View>
  );
}

function Sample({ label, children }: { label: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.sample, { gap: spacing.xs }]}>
      {children}
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bottom: {
    alignItems: 'flex-end',
  },
  sample: {
    alignItems: 'center',
    minWidth: 88,
  },
  button: {
    alignItems: 'flex-start',
    paddingTop: 8,
  },
});
