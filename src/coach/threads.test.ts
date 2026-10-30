import { messageText } from './threads';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('messageText', () => {
  it('reads the text parts of a message, in order', () => {
    expect(
      messageText([
        { type: 'text', text: 'One' },
        { type: 'toolCall', name: 'get_records', args: {} },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('One\ntwo');
  });

  it('reads nothing of content that is not a list of parts', () => {
    expect(messageText(null)).toBe('');
    expect(messageText({ type: 'text', text: 'x' })).toBe('');
  });
});
