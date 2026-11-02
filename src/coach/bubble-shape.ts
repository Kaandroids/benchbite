import { StyleSheet } from 'react-native';

import { radii } from '@/theme';

/** The sharper corner of a message, toward who said it. */
export const TAIL = 6;

/** The shape of the user's messages, text or voice, their corner by the edge sharper. */
export const userBubble = StyleSheet.create({
  shape: {
    maxWidth: '80%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: TAIL,
  },
}).shape;
