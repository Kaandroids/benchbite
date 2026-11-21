import { LICENCES } from './libraries';

const libraries = LICENCES.flatMap((licence) => licence.libraries);

it('lists each library once, under a licence with its text', () => {
  const names = libraries.map((library) => library.name);
  expect(new Set(names).size).toBe(names.length);
  for (const licence of LICENCES) {
    expect(licence.id).not.toBe('');
    expect(licence.text.length).toBeGreaterThan(200);
    expect(licence.libraries.length).toBeGreaterThan(0);
  }
});

it('holds the libraries the app is made of, and none of the tools that only build it', () => {
  const names = new Set(libraries.map((library) => library.name));
  for (const name of ['react', 'react-native', 'expo', '@supabase/supabase-js']) {
    expect(names).toContain(name);
  }
  for (const name of ['typescript', 'eslint', 'jest', 'prettier', '@babel/core']) {
    expect(names).not.toContain(name);
  }
});

it('keeps the copyright lines out of a licence’s text, and with their libraries', () => {
  const mit = LICENCES.find((licence) => licence.id === 'MIT');
  expect(mit?.text).toMatch(/^Permission is hereby granted, free of charge/);
  expect(mit?.text).not.toMatch(/^\s*Copyright \(c\)/m);
  expect(mit?.libraries.find((library) => library.name === 'react')?.copyright[0]).toMatch(
    /^Copyright \(c\) /,
  );
});

it('names who holds the copyright of every library, also of one that ships no licence file', () => {
  for (const library of libraries) {
    expect(library.copyright.length).toBeGreaterThan(0);
  }
  const mit = LICENCES.find((licence) => licence.id === 'MIT');
  expect(mit?.libraries.find((library) => library.name === 'expo-router')?.copyright).toEqual([
    'Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)',
    'Copyright (c) 2017 React Navigation Contributors',
  ]);
});

it('holds the typeface’s own licence beside that of the package it comes in', () => {
  const nunito = LICENCES.find((licence) =>
    licence.libraries.some((library) => library.name === '@expo-google-fonts/nunito'),
  );
  expect(nunito?.id).toBe('MIT AND OFL-1.1');
  expect(nunito?.text).toContain('SIL OPEN FONT LICENSE');
});

it('shows a long licence whole, and says where each of a package’s two licences begins', () => {
  const symbols = LICENCES.find((licence) => licence.id === 'MIT AND Apache-2.0');
  expect(symbols?.text).toMatch(/^MIT License\s+Permission is hereby granted/);
  expect(symbols?.text).toMatch(/Apache License\s+Version 2\.0, January 2004/);
  expect(LICENCES.find((licence) => licence.id === 'MIT AND OFL-1.1')?.text).toMatch(
    /^MIT License\s+Permission is hereby granted/,
  );
});
