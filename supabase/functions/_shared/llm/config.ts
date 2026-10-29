// Which model each task uses, and how (ADR 0049). Kept apart from the code that calls them, so
// that moving a task to another model is a change here, or in the environment, alone.
import type { Task } from './types.ts';

export type Thinking = 'minimal' | 'low' | 'medium' | 'high';

export type ModelConfig = {
  model: string;
  /** How much the model reasons before it answers. */
  thinking: Thinking;
};

/**
 * Chat runs on Flash-Lite, which also takes voice; a meal photo and the reviews on Flash, which
 * reads photos and writes longer texts better (#289). `LLM_MODEL_<TASK>` overrides a model, such
 * as `LLM_MODEL_CHAT=gemini-3.8-flash`.
 */
export const MODELS: Record<Task, ModelConfig> = {
  chat: { model: 'gemini-3.5-flash-lite', thinking: 'low' },
  mealPhoto: { model: 'gemini-3.8-flash', thinking: 'low' },
  review: { model: 'gemini-3.8-flash', thinking: 'medium' },
};

const ENV_NAMES: Record<Task, string> = {
  chat: 'LLM_MODEL_CHAT',
  mealPhoto: 'LLM_MODEL_MEAL_PHOTO',
  review: 'LLM_MODEL_REVIEW',
};

/** A task's model and settings, with the environment's model where it names one. */
export function modelFor(task: Task, env: { get(name: string): string | undefined }): ModelConfig {
  const model = env.get(ENV_NAMES[task])?.trim();
  return model ? { ...MODELS[task], model } : MODELS[task];
}
