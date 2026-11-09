import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** A measured figure, already rounded and formatted, under its value. */
export type Figure = { value: string; label: string };

/** Figures side by side, set apart by lines, as a watch's or another app's workout shows them. */
export function FigureRow({ figures }: { figures: Figure[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {figures.map((figure, index) => (
        <View
          key={figure.label}
          style={[
            styles.figure,
            { borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: colors.border },
          ]}
        >
          <Text variant="headline">{figure.value}</Text>
          <Text variant="caption" color="textMuted">
            {figure.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  figure: {
    flex: 1,
    alignItems: 'center',
  },
});
