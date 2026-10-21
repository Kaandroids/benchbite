import type { Database } from '@/lib/database.types';

type Enums = Database['public']['Enums'];

/**
 * The answers collected during the onboarding. Every field is optional until its step is
 * answered. Measurements are metric, whatever unit the user picked.
 */
export type OnboardingAnswers = {
  goal?: Enums['goal_kind'];
  /** The privacy policy version the user consented to for health data. */
  consentedPolicyVersion?: string;
  sex?: Enums['sex'];
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  weeklyPaceKg?: number;
  activityLevel?: Enums['activity_level'];
  experience?: Enums['experience'];
  /** ISO weekdays, 1 for Monday to 7 for Sunday. */
  trainingDays?: number[];
  /** Whether the user picked the days; until then they follow the recommendation. */
  trainingDaysChosen?: boolean;
  setup?: Enums['training_setup'];
  sessionMinutes?: 30 | 45 | 60 | 75;
  weightUnit?: Enums['weight_unit'];
  heightUnit?: Enums['height_unit'];
};
