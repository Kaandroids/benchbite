import { fireEvent, render, screen } from '@/test/render';

import { EmailField, PasswordField } from './account-fields';

describe('EmailField', () => {
  it('reports what is typed and shows an error with its action', async () => {
    const onChange = jest.fn();
    await render(
      <EmailField value="" onChange={onChange} error="Already taken." errorAction={<></>} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Email'), 'kaan@example.com');
    expect(onChange).toHaveBeenCalledWith('kaan@example.com');
    expect(screen.getByText('Already taken.')).toBeOnTheScreen();
  });
});

describe('PasswordField', () => {
  it('hides the password until it is shown', async () => {
    await render(<PasswordField value="secret12" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('shows the rules of a new password, and an error instead of them', async () => {
    const { rerender } = await render(<PasswordField value="" onChange={jest.fn()} isNew />);
    expect(screen.getByText('At least 8 characters.')).toBeOnTheScreen();
    await rerender(<PasswordField value="" onChange={jest.fn()} isNew error="Too short." />);
    expect(screen.getByText('Too short.')).toBeOnTheScreen();
    expect(screen.queryByText('At least 8 characters.')).not.toBeOnTheScreen();
  });

  it('says a new password is too long as soon as it is, counted in bytes', async () => {
    await render(<PasswordField value={'ü'.repeat(37)} onChange={jest.fn()} isNew />);
    expect(screen.getByText('Use a password with at most 72 characters.')).toBeOnTheScreen();
  });

  it('shows no rules for a password being typed to log in', async () => {
    await render(<PasswordField value={'ü'.repeat(37)} onChange={jest.fn()} />);
    expect(screen.queryByText('At least 8 characters.')).not.toBeOnTheScreen();
    expect(screen.queryByText(/at most 72/)).not.toBeOnTheScreen();
  });

  it('offers a new password to the password manager as one', async () => {
    await render(<PasswordField value="" onChange={jest.fn()} isNew />);
    expect(screen.getByLabelText('Password')).toHaveProp('autoComplete', 'new-password');
  });
});
