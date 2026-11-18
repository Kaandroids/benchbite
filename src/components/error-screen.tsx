import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { isReporting, reportingErrorBoundary } from '@/lib/reporting';
import { useTheme } from '@/theme';

/** What failed: the whole app, or one part of it, with the tabs still there. */
export type ErrorScope = 'app' | 'section';

/** How long after Try again a new failure counts as the same one failing again. */
const AGAIN_MS = 30_000;

/** When Try again was last pressed, for each scope, kept as the screen goes and comes back. */
const retriedAt: Partial<Record<ErrorScope, number>> = {};

type ErrorScreenProps = ErrorBoundaryProps & {
  scope: ErrorScope;
  /** Whether the screen can offer Today, which it cannot from Today itself. */
  offersToday?: boolean;
};

/**
 * Shown in place of a part of the app that failed while it rendered (#550): Bite looks sorry, the
 * text says what happened, and Try again draws that part anew. Failing again soon after says so,
 * rather than the same words.
 */
export function ErrorScreen({ scope, retry, offersToday = scope === 'section' }: ErrorScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [again] = useState(() => Date.now() - (retriedAt[scope] ?? -Infinity) < AGAIN_MS);
  const [retrying, setRetrying] = useState(false);

  const tryAgain = () => {
    retriedAt[scope] = Date.now();
    setRetrying(true);
    void retry().finally(() => setRetrying(false));
  };

  const text = again ? 'still' : scope;
  return (
    <Screen
      footer={
        <View style={{ gap: spacing.md }}>
          <Button label={t('common.tryAgain')} loading={retrying} onPress={tryAgain} />
          {offersToday ? (
            <TextLink
              label={t('errorScreen.goToday')}
              tone="muted"
              size="regular"
              onPress={() => router.navigate('/')}
            />
          ) : null}
        </View>
      }
      scrolls={false}
    >
      <View style={[styles.content, { gap: spacing.lg, padding: spacing.xl }]}>
        <BiteAvatar size={scope === 'app' ? 112 : 96} expression="sad" />
        <View style={{ gap: spacing.md }}>
          <Text variant="title" align="center" accessibilityRole="header">
            {t(`errorScreen.${text}.title`)}
          </Text>
          <Text color="textMuted" align="center">
            {again && isReporting()
              ? `${t('errorScreen.still.body')} ${t('errorScreen.reported')}`
              : t(`errorScreen.${text}.body`)}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

/** The error screen of the whole app, for the root layout to export as its ErrorBoundary. */
export const AppErrorBoundary = reportingErrorBoundary((props) => (
  <ErrorScreen {...props} scope="app" />
));

/** The error screen of a tab or another part of the app, with the way to Today. */
export const SectionErrorBoundary = reportingErrorBoundary((props) => (
  <ErrorScreen {...props} scope="section" />
));

/** The error screen of Today itself, which has nowhere better to send to. */
export const TodayErrorBoundary = reportingErrorBoundary((props) => (
  <ErrorScreen {...props} scope="section" offersToday={false} />
));

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
