import { useTranslation } from 'react-i18next';

import { SettingRow } from '@/components/ui/setting-row';
import { SwitchCard } from '@/components/ui/switch-card';
import { Text } from '@/components/ui/text';

import { healthStore, installHealthStore } from './health';
import { ConsentSheet, DisconnectSheet, InstallSheet, WriteSheet } from './health-sheets';
import type { HealthStore } from './types';
import { useHealthConnection } from './use-health-connection';
import { useWorkoutWriting } from './use-workout-writing';

/**
 * The phone's health store in the settings, Apple Health or Health Connect (#467, ADR 0097):
 * whether it is connected, and the sheets that connect and disconnect it. Shown only where the
 * phone has a store to read.
 */
export function HealthSection() {
  const { t } = useTranslation();
  const { connected, sheet, problem, busy, open, connect, disconnect, close } =
    useHealthConnection();
  const store = healthStore!;

  return (
    <>
      <SettingRow
        icon={{ name: 'heart', color: 'snack', background: 'snackBackground' }}
        label={t(`health.${store}`)}
        value={t(connected ? 'health.connected' : 'health.notConnected')}
        valueIsGood={connected}
        hint={t('health.rowHint')}
        onPress={() => void open()}
      />
      {connected ? <WritingSwitch store={store} /> : null}
      <Text variant="caption" color={problem ? 'danger' : 'textMuted'}>
        {problem
          ? t(
              problem === 'denied'
                ? `health.problems.denied.${store}`
                : `health.problems.${problem}`,
            )
          : t(connected ? `health.noteConnected.${store}` : 'health.note')}
      </Text>

      {sheet === 'consent' ? (
        <ConsentSheet store={store} busy={busy} onConnect={() => void connect()} onClose={close} />
      ) : null}
      {sheet === 'disconnect' ? (
        <DisconnectSheet
          store={store}
          busy={busy}
          onDisconnect={() => void disconnect()}
          onClose={close}
        />
      ) : null}
      {sheet === 'install' ? (
        <InstallSheet
          onInstall={() => {
            installHealthStore();
            close();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** Saving finished workouts to the store, once it is connected (#479, ADR 0105). */
function WritingSwitch({ store }: { store: NonNullable<HealthStore> }) {
  const { t } = useTranslation();
  const { writing, asking, problem, busy, toggle, allow, close } = useWorkoutWriting();
  const name = t(`health.${store}`);
  return (
    <>
      <SwitchCard
        label={t('health.write.label', { store: name })}
        note={
          problem === 'denied'
            ? t(`health.write.denied.${store}`)
            : problem === 'failed'
              ? t('health.problems.failed')
              : t(`health.write.note.${store}`)
        }
        noteColor={problem ? 'danger' : 'textMuted'}
        value={writing}
        onValueChange={toggle}
      />
      {asking ? (
        <WriteSheet store={store} busy={busy} onAllow={() => void allow()} onClose={close} />
      ) : null}
    </>
  );
}
