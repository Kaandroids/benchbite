import { assertEquals } from '@std/assert';

import { prescribe, prescribeFinisher, usesTimeTarget } from './prescription.ts';

Deno.test('strength means few heavy reps with long rests', () => {
  assertEquals(prescribe('get_stronger', 'intermediate', 'main', ['weight', 'reps']), {
    sets: 4,
    target: { reps: { min: 4, max: 6 } },
    restSeconds: 180,
  });
});

Deno.test('advanced lifters get an extra set on main strength exercises', () => {
  assertEquals(prescribe('get_stronger', 'advanced', 'main', ['weight', 'reps']).sets, 5);
  assertEquals(prescribe('build_muscle', 'advanced', 'main', ['weight', 'reps']).sets, 4);
});

Deno.test('accessories get fewer sets and more reps', () => {
  assertEquals(prescribe('build_muscle', 'beginner', 'accessory', ['reps']), {
    sets: 2,
    target: { reps: { min: 10, max: 15 } },
    restSeconds: 75,
  });
});

Deno.test('exercises that only record duration get a time', () => {
  assertEquals(prescribe('lose_fat', 'intermediate', 'accessory', ['duration']), {
    sets: 3,
    target: { seconds: 45 },
    restSeconds: 45,
  });
});

Deno.test('finishers are steady on machines and in rounds with bodyweight', () => {
  assertEquals(prescribeFinisher(['distance', 'duration'], 10), {
    sets: 1,
    target: { seconds: 540 },
    restSeconds: 0,
  });
  assertEquals(prescribeFinisher(['reps'], 5), {
    sets: 4,
    target: { reps: { min: 10, max: 15 } },
    restSeconds: 15,
  });
});

Deno.test('only exercises that record duration but not reps get a time', () => {
  assertEquals(usesTimeTarget(['duration']), true);
  assertEquals(usesTimeTarget(['distance', 'duration']), true);
  assertEquals(usesTimeTarget(['reps', 'duration']), false);
  assertEquals(usesTimeTarget(['weight', 'reps']), false);
  assertEquals(prescribeFinisher(['reps', 'duration'], 5).target, { reps: { min: 10, max: 15 } });
});
