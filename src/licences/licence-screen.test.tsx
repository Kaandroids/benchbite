import { render, screen } from '@/test/render';

import { LICENCES } from './libraries';
import { LicenceScreen } from './licence-screen';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

const MIT = LICENCES.findIndex(({ id }) => id === 'MIT');

it('shows the licence’s text and how many libraries come under it', async () => {
  await render(<LicenceScreen index={MIT} />);
  expect(screen.getByRole('header', { name: 'MIT' })).toBeOnTheScreen();
  expect(screen.getByText(/^Permission is hereby granted, free of charge/)).toBeOnTheScreen();
  const count = LICENCES[MIT]?.libraries.length;
  expect(screen.getByRole('header', { name: `${count} LIBRARIES UNDER IT` })).toBeOnTheScreen();
});

it('lists each library with the copyright lines of its own licence file', async () => {
  await render(<LicenceScreen index={MIT} />);
  const react = LICENCES[MIT]?.libraries.find(({ name }) => name === 'react');
  expect(screen.getByText('react')).toBeOnTheScreen();
  expect(screen.getAllByText(react?.copyright[0] ?? '').length).toBeGreaterThan(0);
});

it('shows nothing for an address that names no licence', async () => {
  await render(<LicenceScreen index={999} />);
  expect(screen.queryByText(/^Permission is hereby granted/)).not.toBeOnTheScreen();
  await render(<LicenceScreen index={Number('x')} />);
  expect(screen.queryByText(/^Permission is hereby granted/)).not.toBeOnTheScreen();
});
