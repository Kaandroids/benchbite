import { TextInput } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { CodeField } from './code-field';

async function renderField(value = '') {
  const onChange = jest.fn();
  await render(<CodeField value={value} onChange={onChange} length={6} label="6-digit code" />);
  return onChange;
}

describe('CodeField', () => {
  it('keeps only the digits, up to its length', async () => {
    const onChange = await renderField();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '12 34-5678');
    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('shows each digit in its box', async () => {
    await renderField('123');
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('focuses the input again when the boxes are pressed, as after the keyboard was closed', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderField('12');
    await fireEvent.press(screen.getByText('1'));
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });
});
