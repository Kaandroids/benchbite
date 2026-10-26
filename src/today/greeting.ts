import { useTranslation } from 'react-i18next';

/** The part of the day a greeting is for. */
export function greetingOf(date: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  return hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
}

/** Greets by the time of day, with the user's name when there is one: "Good evening, Kaan". */
export function useGreeting() {
  const { t } = useTranslation();
  return (date: Date, name: string | null | undefined) =>
    name
      ? t(`today.greetingWithName.${greetingOf(date)}`, { name })
      : t(`today.greeting.${greetingOf(date)}`);
}
