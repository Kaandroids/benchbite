import { router } from 'expo-router';
import { Linking } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { LICENCES } from './libraries';
import { LicencesScreen } from './licences-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined);
});

it('names the source of the food values, its licence and what was changed', async () => {
  await render(<LicencesScreen />);
  expect(
    screen.getByText(
      'Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, Karlsruhe. CC BY 4.0. The Turkish names, some shortened names and the portion sizes are our own.',
    ),
  ).toBeOnTheScreen();
});

it('credits the exercises and the typeface, and opens where each comes from', async () => {
  await render(<LicencesScreen />);
  await fireEvent.press(screen.getByRole('link', { name: /^Food values/ }));
  await fireEvent.press(screen.getByRole('link', { name: /^Exercises and their pictures/ }));
  await fireEvent.press(screen.getByRole('link', { name: /^Typeface/ }));
  expect(jest.mocked(Linking.openURL).mock.calls.map(([url]) => url)).toEqual([
    'https://blsdb.de',
    'https://github.com/yuhonas/free-exercise-db',
    'https://fonts.google.com/specimen/Nunito',
  ]);
});

it('lists every licence with the number of its libraries, and opens it', async () => {
  await render(<LicencesScreen />);
  for (const { id, libraries } of LICENCES) {
    const count = libraries.length === 1 ? '1 library' : `${libraries.length} libraries`;
    expect(screen.getByRole('button', { name: `${id} ${count}` })).toBeOnTheScreen();
  }
  const mit = LICENCES.findIndex(({ id }) => id === 'MIT');
  const count = LICENCES[mit]?.libraries.length;
  await fireEvent.press(screen.getByRole('button', { name: `MIT ${count} libraries` }));
  expect(router.push).toHaveBeenCalledWith(`/licences/${mit}`);
});
