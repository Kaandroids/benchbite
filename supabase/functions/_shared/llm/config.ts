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
 * Chat and voice notes run on Flash-Lite, which takes audio; a meal photo and the reviews on Flash,
 * which reads photos and writes longer texts better (#289). `LLM_MODEL_<TASK>` overrides a model,
 * such as `LLM_MODEL_COACH_CHAT=gemini-3.8-flash`; the model needs a price (ADR 0051).
 */
export const MODELS: Record<Task, ModelConfig> = {
  coach_chat: { model: 'gemini-3.5-flash-lite', thinking: 'low' },
  coach_voice: { model: 'gemini-3.5-flash-lite', thinking: 'low' },
  meal_photo: { model: 'gemini-3.8-flash', thinking: 'low' },
  review: { model: 'gemini-3.8-flash', thinking: 'medium' },
};

/** Where the settings are read from: `Deno.env`, or a stand-in in tests. */
export type Env = { get(name: string): string | undefined };

/** A task's model and settings, with the environment's model where it names one. */
export function modelFor(task: Task, env: Env): ModelConfig {
  const model = env.get(`LLM_MODEL_${task.toUpperCase()}`)?.trim();
  return model ? { ...MODELS[task], model } : MODELS[task];
}
