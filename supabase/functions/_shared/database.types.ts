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
      custom_foods: {
        Row: {
          archived_at: string | null;
          carbs_g: number;
          created_at: string;
          fat_g: number;
          id: number;
          kcal: number;
          name: string;
          portion_grams: number | null;
          portion_unit: Database['public']['Enums']['portion_unit'] | null;
          protein_g: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          carbs_g: number;
          created_at?: string;
          fat_g: number;
          id?: never;
          kcal: number;
          name: string;
          portion_grams?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_g: number;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          id?: never;
          kcal?: number;
          name?: string;
          portion_grams?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
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
          archived_at: string | null;
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
          owner_id: string | null;
          primary_muscles: Database['public']['Enums']['muscle'][];
          secondary_muscles: Database['public']['Enums']['muscle'][];
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
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
          owner_id?: string | null;
          primary_muscles: Database['public']['Enums']['muscle'][];
          secondary_muscles: Database['public']['Enums']['muscle'][];
        };
        Update: {
          archived_at?: string | null;
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
          owner_id?: string | null;
          primary_muscles?: Database['public']['Enums']['muscle'][];
          secondary_muscles?: Database['public']['Enums']['muscle'][];
        };
        Relationships: [];
      };
      food_names: {
        Row: {
          food_id: string;
          language: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          food_id: string;
          language: string;
          name: string;
        };
        Update: {
          food_id?: string;
          language?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_names_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      food_portions: {
        Row: {
          food_id: string;
          grams: number;
          is_default: boolean;
          unit: Database['public']['Enums']['portion_unit'];
        };
        ComputedFields: never;
        Insert: {
          food_id: string;
          grams: number;
          is_default?: boolean;
          unit: Database['public']['Enums']['portion_unit'];
        };
        Update: {
          food_id?: string;
          grams?: number;
          is_default?: boolean;
          unit?: Database['public']['Enums']['portion_unit'];
        };
        Relationships: [
          {
            foreignKeyName: 'food_portions_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      foods: {
        Row: {
          archived_at: string | null;
          carbs_g: number;
          fat_g: number;
          fiber_g: number | null;
          food_group: Database['public']['Enums']['food_group'];
          id: string;
          kcal: number;
          protein_g: number;
          salt_g: number | null;
          saturated_fat_g: number | null;
          source: Database['public']['Enums']['food_source'];
          sugar_g: number | null;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          carbs_g: number;
          fat_g: number;
          fiber_g?: number | null;
          food_group: Database['public']['Enums']['food_group'];
          id: string;
          kcal: number;
          protein_g: number;
          salt_g?: number | null;
          saturated_fat_g?: number | null;
          source: Database['public']['Enums']['food_source'];
          sugar_g?: number | null;
        };
        Update: {
          archived_at?: string | null;
          carbs_g?: number;
          fat_g?: number;
          fiber_g?: number | null;
          food_group?: Database['public']['Enums']['food_group'];
          id?: string;
          kcal?: number;
          protein_g?: number;
          salt_g?: number | null;
          saturated_fat_g?: number | null;
          source?: Database['public']['Enums']['food_source'];
          sugar_g?: number | null;
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
      logged_sets: {
        Row: {
          exercise_id: string;
          exercise_position: number;
          id: number;
          log_id: number;
          meters: number | null;
          reps: number | null;
          seconds: number | null;
          set_position: number;
          user_id: string;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          exercise_position: number;
          id?: never;
          log_id: number;
          meters?: number | null;
          reps?: number | null;
          seconds?: number | null;
          set_position: number;
          user_id: string;
          weight_kg?: number | null;
        };
        Update: {
          exercise_id?: string;
          exercise_position?: number;
          id?: never;
          log_id?: number;
          meters?: number | null;
          reps?: number | null;
          seconds?: number | null;
          set_position?: number;
          user_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'logged_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logged_sets_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'workout_log_summaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logged_sets_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'workout_logs';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_entries: {
        Row: {
          carbs_g: number | null;
          carbs_per_100g: number;
          created_at: string;
          custom_food_id: number | null;
          day: string;
          fat_g: number | null;
          fat_per_100g: number;
          food_id: string | null;
          grams: number;
          id: number;
          kcal: number | null;
          kcal_per_100g: number;
          meal: Database['public']['Enums']['meal'];
          portion_count: number | null;
          portion_unit: Database['public']['Enums']['portion_unit'] | null;
          protein_g: number | null;
          protein_per_100g: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          carbs_g?: never;
          carbs_per_100g?: number;
          created_at?: string;
          custom_food_id?: number | null;
          day: string;
          fat_g?: never;
          fat_per_100g?: number;
          food_id?: string | null;
          grams: number;
          id?: never;
          kcal?: never;
          kcal_per_100g?: number;
          meal: Database['public']['Enums']['meal'];
          portion_count?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_g?: never;
          protein_per_100g?: number;
          user_id?: string;
        };
        Update: {
          carbs_g?: never;
          carbs_per_100g?: number;
          created_at?: string;
          custom_food_id?: number | null;
          day?: string;
          fat_g?: never;
          fat_per_100g?: number;
          food_id?: string | null;
          grams?: number;
          id?: never;
          kcal?: never;
          kcal_per_100g?: number;
          meal?: Database['public']['Enums']['meal'];
          portion_count?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_g?: never;
          protein_per_100g?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_entries_custom_food_id_fkey';
            columns: ['custom_food_id'];
            isOneToOne: false;
            referencedRelation: 'custom_foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_entries_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
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
          display_name: string | null;
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
          display_name?: string | null;
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
          display_name?: string | null;
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
      removed_meal_entries: {
        Row: {
          carbs_per_100g: number;
          created_at: string;
          custom_food_id: number | null;
          day: string;
          fat_per_100g: number;
          food_id: string | null;
          grams: number;
          id: number;
          kcal_per_100g: number;
          meal: Database['public']['Enums']['meal'];
          portion_count: number | null;
          portion_unit: Database['public']['Enums']['portion_unit'] | null;
          protein_per_100g: number;
          removed_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          carbs_per_100g: number;
          created_at: string;
          custom_food_id?: number | null;
          day: string;
          fat_per_100g: number;
          food_id?: string | null;
          grams: number;
          id: number;
          kcal_per_100g: number;
          meal: Database['public']['Enums']['meal'];
          portion_count?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_per_100g: number;
          removed_at?: string;
          user_id: string;
        };
        Update: {
          carbs_per_100g?: number;
          created_at?: string;
          custom_food_id?: number | null;
          day?: string;
          fat_per_100g?: number;
          food_id?: string | null;
          grams?: number;
          id?: number;
          kcal_per_100g?: number;
          meal?: Database['public']['Enums']['meal'];
          portion_count?: number | null;
          portion_unit?: Database['public']['Enums']['portion_unit'] | null;
          protein_per_100g?: number;
          removed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'removed_meal_entries_custom_food_id_fkey';
            columns: ['custom_food_id'];
            isOneToOne: false;
            referencedRelation: 'custom_foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'removed_meal_entries_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
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
      workout_logs: {
        Row: {
          client_id: string | null;
          estimated_kcal: number | null;
          finished_at: string;
          id: number;
          name: string | null;
          planned_exercise_ids: string[] | null;
          planned_exercises: number | null;
          planned_sets: number | null;
          started_at: string;
          type: Database['public']['Enums']['workout_type'] | null;
          user_id: string;
          workout_id: number | null;
        };
        ComputedFields: never;
        Insert: {
          client_id?: string | null;
          estimated_kcal?: number | null;
          finished_at: string;
          id?: never;
          name?: string | null;
          planned_exercise_ids?: string[] | null;
          planned_exercises?: number | null;
          planned_sets?: number | null;
          started_at: string;
          type?: Database['public']['Enums']['workout_type'] | null;
          user_id: string;
          workout_id?: number | null;
        };
        Update: {
          client_id?: string | null;
          estimated_kcal?: number | null;
          finished_at?: string;
          id?: never;
          name?: string | null;
          planned_exercise_ids?: string[] | null;
          planned_exercises?: number | null;
          planned_sets?: number | null;
          started_at?: string;
          type?: Database['public']['Enums']['workout_type'] | null;
          user_id?: string;
          workout_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_logs_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_moves: {
        Row: {
          created_at: string;
          from_on: string;
          id: number;
          to_on: string | null;
          user_id: string;
          workout_id: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          from_on: string;
          id?: never;
          to_on?: string | null;
          user_id: string;
          workout_id: number;
        };
        Update: {
          created_at?: string;
          from_on?: string;
          id?: never;
          to_on?: string | null;
          user_id?: string;
          workout_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_moves_workout_id_fkey';
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
      workout_log_summaries: {
        Row: {
          estimated_kcal: number | null;
          exercises: number | null;
          finished_at: string | null;
          id: number | null;
          kilograms: number | null;
          name: string | null;
          planned_exercise_ids: string[] | null;
          planned_exercises: number | null;
          planned_sets: number | null;
          sets: number | null;
          started_at: string | null;
          type: Database['public']['Enums']['workout_type'] | null;
          workout_id: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'workout_logs_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      age_in_years: { Args: { birth_year: number }; Returns: number };
      archive_exercise: { Args: { archived: boolean; exercise_id: string }; Returns: undefined };
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
      can_upload_exercise_photo: { Args: Record<PropertyKey, never>; Returns: boolean };
      check_sets: { Args: { log: Json }; Returns: undefined };
      complete_onboarding: { Args: { answers: Json; plan: Json }; Returns: undefined };
      create_exercise: { Args: { exercise: Json }; Returns: string };
      custom_exercise_fields: {
        Args: { exercise: Json };
        Returns: {
          equipment: Database['public']['Enums']['equipment'];
          image_paths: string[];
          instructions: string[];
          level: Database['public']['Enums']['exercise_level'];
          metrics: Database['public']['Enums']['exercise_metric'][];
          name: string;
          primary_muscles: Database['public']['Enums']['muscle'][];
          secondary_muscles: Database['public']['Enums']['muscle'][];
        }[];
      };
      custom_exercise_limit: { Args: Record<PropertyKey, never>; Returns: number };
      edit_exercise: { Args: { exercise: Json; exercise_id: string }; Returns: undefined };
      edit_workout_log: { Args: { log: Json; log_id: number }; Returns: undefined };
      exercise_bests: {
        Args: { exercise_ids: string[] };
        Returns: {
          exercise_id: string;
          kind: string;
          value: number;
        }[];
      };
      exercise_progress: {
        Args: { exercise_id: string };
        Returns: {
          best_pace: number;
          heaviest_kg: number;
          log_id: number;
          longest_meters: number;
          longest_seconds: number;
          most_reps: number;
          one_rep_max_kg: number;
          started_at: string;
          total_reps: number;
          total_seconds: number;
          volume_kg: number;
        }[];
      };
      exercise_records: {
        Args: { exercise_id: string };
        Returns: {
          achieved_at: string;
          exercise_position: number;
          kind: string;
          log_id: number;
          meters: number;
          reps: number;
          seconds: number;
          set_position: number;
          value: number;
          weight_kg: number;
        }[];
      };
      exercise_seconds: { Args: { exercise: Json }; Returns: number };
      food_name_key: { Args: { name: string }; Returns: string };
      has_no_duplicates: { Args: { items: number[] }; Returns: boolean };
      insert_workout_exercises: {
        Args: { items: Json; user_id: string; workout_id: number };
        Returns: undefined;
      };
      last_sets: {
        Args: { exercise_ids: string[] };
        Returns: {
          exercise_id: string;
          exercise_position: number;
          id: number;
          log_id: number;
          meters: number | null;
          reps: number | null;
          seconds: number | null;
          set_position: number;
          user_id: string;
          weight_kg: number | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'logged_sets';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      lock_user_limits: { Args: { user_id: string }; Returns: undefined };
      log_workout: { Args: { log: Json }; Returns: number };
      metrics_valid: {
        Args: { metrics: Database['public']['Enums']['exercise_metric'][] };
        Returns: boolean;
      };
      move_fits: {
        Args: {
          from_on: string;
          on_day: string;
          source: Omit<
            Database['public']['Tables']['workouts']['Row'],
            Database['public']['Tables']['workouts']['ComputedFields']
          >;
          to_on: string;
        };
        Returns: boolean;
      };
      move_workout: {
        Args: { from_on: string; to_on: string; workout_id: number };
        Returns: undefined;
      };
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
      my_strength_kcal_per_minute: { Args: Record<PropertyKey, never>; Returns: number };
      one_rep_max: { Args: { reps: number; weight_kg: number }; Returns: number };
      restore_meal_entry: { Args: { entry_id: number }; Returns: undefined };
      save_move: {
        Args: {
          from_on: string;
          on_day: string;
          source: Omit<
            Database['public']['Tables']['workouts']['Row'],
            Database['public']['Tables']['workouts']['ComputedFields']
          >;
          to_on: string;
        };
        Returns: boolean;
      };
      save_workout: { Args: { workout: Json }; Returns: number };
      search_foods: {
        Args: { language: string; query: string };
        Returns: {
          carbs_g: number;
          custom_food_id: number;
          fat_g: number;
          food_id: string;
          kcal: number;
          name: string;
          portion_grams: number;
          portion_unit: Database['public']['Enums']['portion_unit'];
          protein_g: number;
        }[];
      };
      set_suits: {
        Args: {
          meters: number;
          metrics: Database['public']['Enums']['exercise_metric'][];
          reps: number;
          seconds: number;
          weight_kg: number;
        };
        Returns: boolean;
      };
      sets_of: {
        Args: { log: Json };
        Returns: {
          exercise_id: string;
          exercise_position: number;
          meters: number;
          reps: number;
          seconds: number;
          set_position: number;
          weight_kg: number;
        }[];
      };
      strength_kcal_per_minute: { Args: { weight_kg: number }; Returns: number };
      target_suits: {
        Args: { metrics: Database['public']['Enums']['exercise_metric'][]; target: Json };
        Returns: boolean;
      };
      workout_limits: {
        Args: Record<PropertyKey, never>;
        Returns: {
          exercises: number;
          workouts: number;
        }[];
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
      food_group:
        | 'bread'
        | 'cereals'
        | 'pastries'
        | 'eggs_and_pasta'
        | 'fruit'
        | 'vegetables'
        | 'legumes_nuts_seeds'
        | 'potatoes_mushrooms'
        | 'dairy'
        | 'drinks'
        | 'alcoholic_drinks'
        | 'fats'
        | 'condiments'
        | 'sweets'
        | 'fish'
        | 'meat'
        | 'poultry_game_offal'
        | 'sausages'
        | 'dishes';
      food_source: 'bls';
      goal_kind: 'lose_fat' | 'build_muscle' | 'get_stronger' | 'stay_healthy';
      height_unit: 'cm' | 'ft';
      meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
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
      portion_unit:
        | 'piece'
        | 'slice'
        | 'cup'
        | 'glass'
        | 'bowl'
        | 'plate'
        | 'tablespoon'
        | 'teaspoon'
        | 'handful'
        | 'serving'
        | 'can'
        | 'bottle';
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
      food_group: [
        'bread',
        'cereals',
        'pastries',
        'eggs_and_pasta',
        'fruit',
        'vegetables',
        'legumes_nuts_seeds',
        'potatoes_mushrooms',
        'dairy',
        'drinks',
        'alcoholic_drinks',
        'fats',
        'condiments',
        'sweets',
        'fish',
        'meat',
        'poultry_game_offal',
        'sausages',
        'dishes',
      ],
      food_source: ['bls'],
      goal_kind: ['lose_fat', 'build_muscle', 'get_stronger', 'stay_healthy'],
      height_unit: ['cm', 'ft'],
      meal: ['breakfast', 'lunch', 'dinner', 'snack'],
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
      portion_unit: [
        'piece',
        'slice',
        'cup',
        'glass',
        'bowl',
        'plate',
        'tablespoon',
        'teaspoon',
        'handful',
        'serving',
        'can',
        'bottle',
      ],
      sex: ['female', 'male', 'unspecified'],
      training_setup: ['gym', 'dumbbells', 'bodyweight'],
      weight_unit: ['kg', 'lb'],
      workout_type: ['full_body', 'upper', 'lower', 'push', 'pull', 'legs'],
    },
  },
} as const;
