import { BiteScreen } from '@/coach/bite-screen';

import { render, screen, waitFor } from './render';

/** Renders Bite once ai_access() has answered, as a new chat waits for it. */
export async function renderBite(options?: Parameters<typeof render>[1]) {
  const rendered = await render(<BiteScreen />, options);
  await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
  return rendered;
}
