import { Linking } from 'react-native';

import { PRIVACY_POLICY_URL, PRIVACY_POLICY_VERSION } from '@/onboarding/consent';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ConsentStep } from './consent';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const AGREE = 'I agree that Benchbite processes my health data for these purposes.';

const continueButton = () => screen.getByRole('button', { name: 'Continue' });
const agreeBox = () => screen.getByRole('checkbox', { name: AGREE });

describe('ConsentStep', () => {
  beforeEach(() => {
    mockStep = createStep();
  });

  it('starts unticked and cannot continue without agreeing', async () => {
    await render(<ConsentStep />);
    expect(agreeBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(continueButton());
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('records the policy version when continuing after agreeing', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    expect(agreeBox()).toBeChecked();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({ consentedPolicyVersion: PRIVACY_POLICY_VERSION });
  });

  it('can untick the box again', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    await fireEvent.press(agreeBox());
    expect(continueButton()).toBeDisabled();
  });

  it('keeps a consent to the current policy', async () => {
    mockStep = createStep({ consentedPolicyVersion: PRIVACY_POLICY_VERSION });
    await render(<ConsentStep />);
    expect(agreeBox()).toBeChecked();
    expect(continueButton()).toBeEnabled();
  });

  it('asks again after the policy changed', async () => {
    mockStep = createStep({ consentedPolicyVersion: '2000-01-01' });
    await render(<ConsentStep />);
    expect(agreeBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
  });

  it('withdraws a consent given earlier when unticking', async () => {
    mockStep = createStep({ consentedPolicyVersion: PRIVACY_POLICY_VERSION });
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    expect(mockStep.answer).toHaveBeenCalledWith({ consentedPolicyVersion: undefined });
    expect(continueButton()).toBeDisabled();
  });

  it('explains why the consent is needed and goes back to it', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    await fireEvent.press(screen.getByRole('button', { name: 'Why is this needed?' }));
    expect(screen.getByText('A personal plan needs your consent')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Back to the consent' }));
    expect(agreeBox()).toBeChecked();
    expect(mockStep.answer).not.toHaveBeenCalled();
  });

  it('opens the privacy policy', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<ConsentStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    openURL.mockRestore();
  });
});
