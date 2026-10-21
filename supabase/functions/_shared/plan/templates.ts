import type { Role, SessionType, Slot } from './types.ts';

export type TemplateSlot = { slot: Slot; role: Role };

const main = (slot: Slot): TemplateSlot => ({ slot, role: 'main' });
const accessory = (slot: Slot): TemplateSlot => ({ slot, role: 'accessory' });

/**
 * The slots of each session type in order of importance. When time runs out, the slots at the
 * end are left out first.
 */
export const TEMPLATES: Record<SessionType, TemplateSlot[]> = {
  full_body: [
    main('squat'),
    main('horizontal_push'),
    main('horizontal_pull'),
    main('hinge'),
    accessory('vertical_pull'),
    accessory('vertical_push'),
    accessory('lunge'),
    accessory('core'),
  ],
  upper: [
    main('horizontal_push'),
    main('horizontal_pull'),
    main('vertical_push'),
    main('vertical_pull'),
    accessory('incline_push'),
    accessory('biceps'),
    accessory('triceps'),
    accessory('shoulders'),
  ],
  lower: [main('squat'), main('hinge'), accessory('lunge'), accessory('calves'), accessory('core')],
  push: [
    main('horizontal_push'),
    main('vertical_push'),
    accessory('incline_push'),
    accessory('shoulders'),
    accessory('triceps'),
    accessory('core'),
  ],
  // No hinge: deadlifts belong to leg days, which often follow pull days.
  pull: [
    main('vertical_pull'),
    main('horizontal_pull'),
    accessory('shoulders'),
    accessory('biceps'),
    accessory('core'),
  ],
  legs: [main('squat'), main('hinge'), accessory('lunge'), accessory('calves'), accessory('core')],
};
