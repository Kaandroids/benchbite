import { useTranslation } from 'react-i18next';

import { SettingRow } from '@/components/ui/setting-row';
import { Text } from '@/components/ui/text';

import { healthStore, installHealthStore } from './health';
import { ConsentSheet, DisconnectSheet, InstallSheet } from './health-sheets';
import { useHealthConnection } from './use-health-connection';

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
