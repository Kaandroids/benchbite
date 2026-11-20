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

it('holds the typeface’s own licence beside that of the package it comes in', () => {
  const nunito = LICENCES.find((licence) =>
    licence.libraries.some((library) => library.name === '@expo-google-fonts/nunito'),
  );
  expect(nunito?.id).toBe('MIT AND OFL-1.1');
  expect(nunito?.text).toContain('SIL OPEN FONT LICENSE');
});
