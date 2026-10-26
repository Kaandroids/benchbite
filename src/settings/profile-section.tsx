import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { displayNameOf, useDisplayName, useSetDisplayName } from '@/profile/display-name';
import { NameField } from '@/profile/name-field';

import { SettingRow } from './setting-row';

/** The user's name in a row, changed in a sheet. */
export function ProfileSection() {
  const { t } = useTranslation();
  const name = useDisplayName().data ?? null;
  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingRow
        label={t('profile.name')}
        value={name ?? undefined}
        hint={t('profile.nameHint')}
        onPress={() => setOpen(true)}
      />
      {open ? <NameSheet name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NameSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const setDisplayName = useSetDisplayName();
  // Compared with the name the field started from, not one that loaded while the sheet was open:
  // saving an untouched empty field must not remove it.
  const [openedWith] = useState(name);
  const [text, setText] = useState(name ?? '');

  const save = () => {
    if (setDisplayName.isPending) {
      return;
    }
    const changed = displayNameOf(text);
    if (changed === openedWith) {
      onClose();
      return;
    }
    setDisplayName.mutate(changed, { onSuccess: onClose });
  };

  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {t('profile.name')}
      </Text>
      <Text color="textMuted">{t('profile.nameMessage')}</Text>
      <NameField
        value={text}
        onChange={setText}
        onSubmit={save}
        editable={!setDisplayName.isPending}
        showLabel={false}
      />
      {setDisplayName.isError ? <Text color="danger">{t('profile.notSaved')}</Text> : null}
      <Button label={t('profile.save')} loading={setDisplayName.isPending} onPress={save} />
    </Sheet>
  );
}
