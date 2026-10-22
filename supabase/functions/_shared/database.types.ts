export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      exercise_translations: {
        Row: {
          exercise_id: string;
          language: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          language: string;
          name: string;
        };
        Update: {
          exercise_id?: string;
          language?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_translations_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercises: {
        Row: {
          category: Database['public']['Enums']['exercise_category'];
          equipment: Database['public']['Enums']['equipment'] | null;
          force: Database['public']['Enums']['exercise_force'] | null;
          id: string;
          image_paths: string[];
          instructions: string[];
          level: Database['public']['Enums']['exercise_level'];
          mechanic: Database['public']['Enums']['exercise_mechanic'] | null;
          metrics: Database['public']['Enums']['exercise_metric'][];
          name: string;
          primary_muscles: Database['public']['Enums']['muscle'][];
          secondary_muscles: Database['public']['Enums']['muscle'][];
        };
        ComputedFields: never;
        Insert: {
          category: Database['public']['Enums']['exercise_category'];
          equipment?: Database['public']['Enums']['equipment'] | null;
          force?: Database['public']['Enums']['exercise_force'] | null;
          id: string;
          image_paths: string[];
          instructions: string[];
          level: Database['public']['Enums']['exercise_level'];
          mechanic?: Database['public']['Enums']['exercise_mechanic'] | null;
          metrics: Database['public']['Enums']['exercise_metric'][];
          name: string;
          primary_muscles: Database['public']['Enums']['muscle'][];
          secondary_muscles: Database['public']['Enums']['muscle'][];
        };
        Update: {
          category?: Database['public']['Enums']['exercise_category'];
          equipment?: Database['public']['Enums']['equipment'] | null;
          force?: Database['public']['Enums']['exercise_force'] | null;
          id?: string;
          image_paths?: string[];
          instructions?: string[];
          level?: Database['public']['Enums']['exercise_level'];
          mechanic?: Database['public']['Enums']['exercise_mechanic'] | null;
          metrics?: Database['public']['Enums']['exercise_metric'][];
          name?: string;
          primary_muscles?: Database['public']['Enums']['muscle'][];
          secondary_muscles?: Database['public']['Enums']['muscle'][];
        };
        Relationships: [];
      };
      goals: {
        Row: {
          created_at: string;
          kind: Database['public']['Enums']['goal_kind'];
          target_weight_kg: number | null;
          updated_at: string;
          user_id: string;
          weekly_pace_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          kind: Database['public']['Enums']['goal_kind'];
          target_weight_kg?: number | null;
          updated_at?: string;
          user_id: string;
          weekly_pace_kg?: number | null;
        };
        Update: {
          created_at?: string;
          kind?: Database['public']['Enums']['goal_kind'];
          target_weight_kg?: number | null;
          updated_at?: string;
          user_id?: string;
          weekly_pace_kg?: number | null;
        };
        Relationships: [];
      };
      health_data_consents: {
        Row: {
          granted_at: string;
          id: number;
          policy_version: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          id?: never;
          policy_version: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          id?: never;
          policy_version?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      plan_slot_exercises: {
        Row: {
          exercise_id: string;
          min_experience: Database['public']['Enums']['experience'];
          priority: number;
          requires: Database['public']['Enums']['training_setup'];
          slot: Database['public']['Enums']['plan_slot'];
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          min_experience: Database['public']['Enums']['experience'];
          priority: number;
          requires: Database['public']['Enums']['training_setup'];
          slot: Database['public']['Enums']['plan_slot'];
        };
        Update: {
          exercise_id?: string;
          min_experience?: Database['public']['Enums']['experience'];
          priority?: number;
          requires?: Database['public']['Enums']['training_setup'];
          slot?: Database['public']['Enums']['plan_slot'];
        };
        Relationships: [
          {
            foreignKeyName: 'plan_slot_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          activity_level: Database['public']['Enums']['activity_level'];
          birth_year: number;
          created_at: string;
          experience: Database['public']['Enums']['experience'];
          height_cm: number;
          height_unit: Database['public']['Enums']['height_unit'];
          onboarding_completed_at: string | null;
          pregnant_or_breastfeeding: boolean;
          session_minutes: number;
          sex: Database['public']['Enums']['sex'];
          training_days: number[];
          training_setup: Database['public']['Enums']['training_setup'];
          updated_at: string;
          user_id: string;
          weight_unit: Database['public']['Enums']['weight_unit'];
        };
        ComputedFields: never;
        Insert: {
          activity_level: Database['public']['Enums']['activity_level'];
          birth_year: number;
          created_at?: string;
          experience: Database['public']['Enums']['experience'];
          height_cm: number;
          height_unit: Database['public']['Enums']['height_unit'];
          onboarding_completed_at?: string | null;
          pregnant_or_breastfeeding?: boolean;
          session_minutes: number;
          sex: Database['public']['Enums']['sex'];
          training_days: number[];
          training_setup: Database['public']['Enums']['training_setup'];
          updated_at?: string;
          user_id: string;
          weight_unit: Database['public']['Enums']['weight_unit'];
        };
        Update: {
          activity_level?: Database['public']['Enums']['activity_level'];
          birth_year?: number;
          created_at?: string;
          experience?: Database['public']['Enums']['experience'];
          height_cm?: number;
          height_unit?: Database['public']['Enums']['height_unit'];
          onboarding_completed_at?: string | null;
          pregnant_or_breastfeeding?: boolean;
          session_minutes?: number;
          sex?: Database['public']['Enums']['sex'];
          training_days?: number[];
          training_setup?: Database['public']['Enums']['training_setup'];
          updated_at?: string;
          user_id?: string;
          weight_unit?: Database['public']['Enums']['weight_unit'];
        };
        Relationships: [];
      };
      weight_entries: {
        Row: {
          created_at: string;
          id: number;
          measured_on: string;
          user_id: string;
          weight_kg: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          measured_on?: string;
          user_id: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          measured_on?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      workout_exercises: {
        Row: {
          exercise_id: string;
          id: number;
          is_finisher: boolean;
          position: number;
          rest_seconds: number;
          sets: number;
          slot: Database['public']['Enums']['plan_slot'] | null;
          target_meters: number | null;
          target_reps_max: number | null;
          target_reps_min: number | null;
          target_seconds: number | null;
          user_id: string;
          workout_id: number;
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          id?: never;
          is_finisher?: boolean;
          position: number;
          rest_seconds: number;
          sets: number;
          slot?: Database['public']['Enums']['plan_slot'] | null;
          target_meters?: number | null;
          target_reps_max?: number | null;
          target_reps_min?: number | null;
          target_seconds?: number | null;
          user_id: string;
          workout_id: number;
        };
        Update: {
          exercise_id?: string;
          id?: never;
          is_finisher?: boolean;
          position?: number;
          rest_seconds?: number;
          sets?: number;
          slot?: Database['public']['Enums']['plan_slot'] | null;
          target_meters?: number | null;
          target_reps_max?: number | null;
          target_reps_min?: number | null;
          target_seconds?: number | null;
          user_id?: string;
          workout_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workouts: {
        Row: {
          active: boolean;
          created_at: string;
          estimated_minutes: number;
          id: number;
          name: string | null;
          type: Database['public']['Enums']['workout_type'] | null;
          user_id: string;
          weekdays: number[];
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          estimated_minutes: number;
          id?: never;
          name?: string | null;
          type?: Database['public']['Enums']['workout_type'] | null;
          user_id: string;
          weekdays?: number[];
        };
        Update: {
          active?: boolean;
          created_at?: string;
          estimated_minutes?: number;
          id?: never;
          name?: string | null;
          type?: Database['public']['Enums']['workout_type'] | null;
          user_id?: string;
          weekdays?: number[];
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      age_in_years: { Args: { birth_year: number }; Returns: number };
      calculate_nutrition_targets: {
        Args: {
          activity_level: Database['public']['Enums']['activity_level'];
          age: number;
          goal: Database['public']['Enums']['goal_kind'];
          height_cm: number;
          pregnant_or_breastfeeding?: boolean;
          sex: Database['public']['Enums']['sex'];
          target_weight_kg?: number;
          training_days_per_week: number;
          weekly_pace_kg?: number;
          weight_kg: number;
        };
        Returns: Database['public']['CompositeTypes']['nutrition_targets'];
        SetofOptions: {
          from: '*';
          to: 'nutrition_targets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_onboarding: { Args: { answers: Json; plan: Json }; Returns: undefined };
      has_no_duplicates: { Args: { items: number[] }; Returns: boolean };
      my_nutrition_targets: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['CompositeTypes']['nutrition_targets'];
        SetofOptions: {
          from: '*';
          to: 'nutrition_targets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
      equipment:
        | 'barbell'
        | 'dumbbell'
        | 'body only'
        | 'cable'
        | 'machine'
        | 'kettlebells'
        | 'bands'
        | 'medicine ball'
        | 'exercise ball'
        | 'foam roll'
        | 'e-z curl bar'
        | 'other';
      exercise_category:
        | 'strength'
        | 'stretching'
        | 'plyometrics'
        | 'powerlifting'
        | 'olympic weightlifting'
        | 'strongman'
        | 'cardio';
      exercise_force: 'push' | 'pull' | 'static';
      exercise_level: 'beginner' | 'intermediate' | 'expert';
      exercise_mechanic: 'compound' | 'isolation';
      exercise_metric: 'weight' | 'reps' | 'duration' | 'distance';
      experience: 'beginner' | 'intermediate' | 'advanced';
      goal_kind: 'lose_fat' | 'build_muscle' | 'get_stronger' | 'stay_healthy';
      height_unit: 'cm' | 'ft';
      muscle:
        | 'abdominals'
        | 'abductors'
        | 'adductors'
        | 'biceps'
        | 'calves'
        | 'chest'
        | 'forearms'
        | 'glutes'
        | 'hamstrings'
        | 'lats'
        | 'lower back'
        | 'middle back'
        | 'neck'
        | 'quadriceps'
        | 'shoulders'
        | 'traps'
        | 'triceps';
      plan_slot:
        | 'squat'
        | 'hinge'
        | 'lunge'
        | 'horizontal_push'
        | 'incline_push'
        | 'vertical_push'
        | 'horizontal_pull'
        | 'vertical_pull'
        | 'biceps'
        | 'triceps'
        | 'shoulders'
        | 'calves'
        | 'core'
        | 'conditioning';
      sex: 'female' | 'male' | 'unspecified';
      training_setup: 'gym' | 'dumbbells' | 'bodyweight';
      weight_unit: 'kg' | 'lb';
      workout_type: 'full_body' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';
    };
    CompositeTypes: {
      nutrition_targets: {
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_level: ['sedentary', 'light', 'moderate', 'active'],
      equipment: [
        'barbell',
        'dumbbell',
        'body only',
        'cable',
        'machine',
        'kettlebells',
        'bands',
        'medicine ball',
        'exercise ball',
        'foam roll',
        'e-z curl bar',
        'other',
      ],
      exercise_category: [
        'strength',
        'stretching',
        'plyometrics',
        'powerlifting',
        'olympic weightlifting',
        'strongman',
        'cardio',
      ],
      exercise_force: ['push', 'pull', 'static'],
      exercise_level: ['beginner', 'intermediate', 'expert'],
      exercise_mechanic: ['compound', 'isolation'],
      exercise_metric: ['weight', 'reps', 'duration', 'distance'],
      experience: ['beginner', 'intermediate', 'advanced'],
      goal_kind: ['lose_fat', 'build_muscle', 'get_stronger', 'stay_healthy'],
      height_unit: ['cm', 'ft'],
      muscle: [
        'abdominals',
        'abductors',
        'adductors',
        'biceps',
        'calves',
        'chest',
        'forearms',
        'glutes',
        'hamstrings',
        'lats',
        'lower back',
        'middle back',
        'neck',
        'quadriceps',
        'shoulders',
        'traps',
        'triceps',
      ],
      plan_slot: [
        'squat',
        'hinge',
        'lunge',
        'horizontal_push',
        'incline_push',
        'vertical_push',
        'horizontal_pull',
        'vertical_pull',
        'biceps',
        'triceps',
        'shoulders',
        'calves',
        'core',
        'conditioning',
      ],
      sex: ['female', 'male', 'unspecified'],
      training_setup: ['gym', 'dumbbells', 'bodyweight'],
      weight_unit: ['kg', 'lb'],
      workout_type: ['full_body', 'upper', 'lower', 'push', 'pull', 'legs'],
    },
  },
} as const;
