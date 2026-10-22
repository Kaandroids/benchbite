import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

import { WorkoutListItem } from './workout-list-item';
import { useWorkouts } from './workouts';

/**
 * The Workout tab: the active workouts, with today's highlighted, and the finished workouts below.
 * Inactive workouts are kept in the archive.
 */
export function WorkoutsScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const active = workouts.data?.filter((workout) => workout.active) ?? [];
  const today = isoWeekday(new Date());

  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.xl, gap: spacing.md }]}
      >
        <View style={styles.header}>
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            {t('workout.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.archive.title')}
            onPress={() => router.push('/workout/archive')}
            style={({ pressed }) => [
              styles.headerButton,
              {
                borderRadius: radii.full,
                backgroundColor: pressed ? colors.track : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon name="archive" color="textMuted" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('editor.newTitle')}
            onPress={() => router.push('/workout/edit')}
            style={({ pressed }) => [
              styles.headerButton,
              {
                borderRadius: radii.full,
                backgroundColor: colors.primaryButton,
                borderColor: colors.primaryButton,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Icon name="plus" color="onPrimary" />
          </Pressable>
        </View>

        <LoadState queries={[workouts]} />
        {allLoaded([workouts]) ? (
          <>
            <Text variant="caption" color="textMuted" style={styles.section}>
              {t('workout.activeCount', { count: active.length })}
            </Text>
            {active.length > 0 ? (
              active.map((workout) => (
                <WorkoutListItem
                  key={workout.id}
                  workout={workout}
                  today={workout.weekdays.includes(today)}
                />
              ))
            ) : (
              <Text color="textMuted">{t('workout.noActive')}</Text>
            )}

            <Text
              variant="caption"
              color="textMuted"
              style={[styles.section, { marginTop: spacing.md }]}
            >
              {t('workout.history.title')}
            </Text>
            {/* Workouts are logged in #34; until then there is no history. */}
            <Card>
              <Text color="textMuted">{t('workout.history.empty')}</Text>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    fontFamily: fonts.extraBold,
  },
});
