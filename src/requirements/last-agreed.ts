// The version of a text the user agreed to last (ADR 0158, ADR 0159): the terms they accepted, or
// the health data consent they gave. It decides whether they are asked again, so it is known in
// the first render from what the device kept, and the server's answer then counts.
import { type QueryClient, useQuery } from '@tanstack/react-query';

import { useUserId } from '@/providers/session-provider';

import { keepAgreed, type KeptAgreement, readAgreed } from './kept-agreements';
import type { AgreementVersion } from './requirements';

const agreedKey = (agreement: KeptAgreement) => ['agreed', agreement];

/**
 * When data that came from the device counts as loaded: old enough for the server to be asked at
 * once, and the mark by which it is told from the server's answer.
 */
const KEPT_AT = 0;

/**
 * The version the user agreed to last, or null for none; nothing while it is not known. It starts
 * from what the device kept for this user, so that a new text shows before the app does and not a
 * moment after it. The server is asked all the same, with `read`, and its answer counts; when it
 * cannot be asked, nothing is known, and the app opens as without the kept version.
 */
export function useLastAgreed(
  agreement: KeptAgreement,
  enabled: boolean,
  read: () => Promise<string | null>,
): string | null | undefined {
  const userId = useUserId();
  const { data, isError, failureCount, dataUpdatedAt } = useQuery({
    queryKey: agreedKey(agreement),
    queryFn: async ({ signal }) => {
      const version = await read();
      // An answer from before the user agreed meanwhile is dropped, and not kept either.
      if (userId !== undefined && !signal.aborted) keepAgreed(agreement, { userId, version });
      return version;
    },
    enabled,
    initialData: () => readAgreed(agreement, userId)?.version,
    initialDataUpdatedAt: KEPT_AT,
  });
  // Only the kept version, and the server could not be asked, be it at the first try: not enough
  // to hold the user on. The question returns if a later try gets an answer.
  const onlyKept = dataUpdatedAt === KEPT_AT;
  return onlyKept && (isError || failureCount > 0) ? undefined : data;
}

/** Takes the version the user just agreed to as their last, here and on the device. */
export async function setLastAgreed(
  queryClient: QueryClient,
  agreement: KeptAgreement,
  userId: string | undefined,
  version: string,
) {
  // A read under way was answered before the user agreed, and would undo it.
  await queryClient.cancelQueries({ queryKey: agreedKey(agreement) });
  if (userId !== undefined) keepAgreed(agreement, { userId, version });
  queryClient.setQueryData(agreedKey(agreement), version);
}

/** What changed in a version, in the given language or else in English, when it says. */
export function summaryOf(current: AgreementVersion, language: string): string | undefined {
  // An empty text in the user's language is none.
  return current.summary[language]?.trim() || current.summary.en?.trim() || undefined;
}
