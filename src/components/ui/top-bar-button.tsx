import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';

type TopBarButtonProps = {
  icon: IconName;
  /** Read by screen readers, as the button shows only its icon. */
  label: string;
  onPress: () => void;
};

/** An icon button at the end of a screen's top bar, as its back button is drawn. */
export function TopBarButton({ icon, label, onPress }: TopBarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.button}
    >
      <Icon name={icon} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
