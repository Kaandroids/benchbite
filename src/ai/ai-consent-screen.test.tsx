import { supabase } from '@/lib/supabase';
import { fireEvent, render, screen } from '@/test/render';

import { AiConsentScreen } from './ai-consent-screen';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const AGREE = 'I agree that Benchbite sends this health data to Google for these features.';

function inserts(error: unknown = null) {
  const insert = jest.fn().mockResolvedValue({ error });
  jest.mocked(supabase.from).mockReturnValue({ insert } as never);
  return insert;
}

it('saves the consent only once its box is ticked', async () => {
  const insert = inserts();
  const onGiven = jest.fn();
  await render(<AiConsentScreen onGiven={onGiven} onClose={jest.fn()} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(insert).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('checkbox', { name: AGREE }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

  expect(supabase.from).toHaveBeenCalledWith('ai_consents');
  expect(insert).toHaveBeenCalledWith({ consent_version: '2026-11-18' });
  expect(onGiven).toHaveBeenCalled();
});

it('says so when the consent was not saved', async () => {
  inserts({ message: 'offline' });
  const onGiven = jest.fn();
  await render(<AiConsentScreen onGiven={onGiven} onClose={jest.fn()} />);

  await fireEvent.press(screen.getByRole('checkbox', { name: AGREE }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

  expect(await screen.findByText('Couldn’t save your OK. Try again.')).toBeOnTheScreen();
  expect(onGiven).not.toHaveBeenCalled();
});

it('leaves without consenting on Not now', async () => {
  const onClose = jest.fn();
  await render(<AiConsentScreen onClose={onClose} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

  expect(onClose).toHaveBeenCalled();
});
