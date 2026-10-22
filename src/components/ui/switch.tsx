import { Switch as NativeSwitch, type SwitchProps as NativeSwitchProps } from 'react-native';

import { useTheme } from '@/theme';

type SwitchProps = Pick<NativeSwitchProps, 'value' | 'onValueChange' | 'accessibilityLabel'>;

/** The system's on/off switch in the app's colours, with a white thumb in both themes. */
export function Switch(props: SwitchProps) {
  const { colors } = useTheme();
  return (
    <NativeSwitch
      {...props}
      trackColor={{ true: colors.primaryButton, false: colors.track }}
      thumbColor={colors.switchThumb}
      ios_backgroundColor={colors.track}
    />
  );
}
