import { Linking } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/onboarding/consent';
import { createStep } from '@/test/step-mock';
import { fireEvent, render, screen } from '@/test/render';

import { ConsentStep } from './consent';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));

const AGREE = 'I agree that Benchbite processes my health data for these purposes.';

const TERMS = 'I accept the Terms of use.';

const continueButton = () => screen.getByRole('button', { name: 'Continue' });
const agreeBox = () => screen.getByRole('checkbox', { name: AGREE });
const termsBox = () => screen.getByRole('checkbox', { name: TERMS });
const BOTH = {
  consentedPolicyVersion: PRIVACY_POLICY_VERSION,
  acceptedTermsVersion: TERMS_VERSION,
};

describe('ConsentStep', () => {
  beforeEach(() => {
    mockStep = createStep();
  });

  it('starts unticked and cannot continue without agreeing', async () => {
    await render(<ConsentStep />);
    expect(agreeBox()).not.toBeChecked();
    expect(termsBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(continueButton());
    expect(mockStep.next).not.toHaveBeenCalled();
  });

  it('records both versions when continuing after ticking both boxes', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    await fireEvent.press(termsBox());
    expect(agreeBox()).toBeChecked();
    expect(termsBox()).toBeChecked();
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith(BOTH);
  });

  it('cannot continue with only one of the boxes ticked', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(agreeBox());
    await fireEvent.press(termsBox());
    expect(continueButton()).toBeDisabled();
  });

  it('can untick a box again', async () => {
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    await fireEvent.press(termsBox());
    await fireEvent.press(termsBox());
    expect(continueButton()).toBeDisabled();
  });

  it('keeps a consent to the current policy and the current terms', async () => {
    mockStep = createStep(BOTH);
    await render(<ConsentStep />);
    expect(agreeBox()).toBeChecked();
    expect(continueButton()).toBeEnabled();
  });

  it('asks again after the terms changed', async () => {
    mockStep = createStep({ ...BOTH, acceptedTermsVersion: '2000-01-01' });
    await render(<ConsentStep />);
    expect(agreeBox()).toBeChecked();
    expect(termsBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
    expect(mockStep.answer).toHaveBeenCalledWith({ acceptedTermsVersion: undefined });
  });

  it('withdraws an acceptance given earlier when unticking', async () => {
    mockStep = createStep(BOTH);
    await render(<ConsentStep />);
    await fireEvent.press(termsBox());
    expect(mockStep.answer).toHaveBeenCalledWith({ acceptedTermsVersion: undefined });
    expect(continueButton()).toBeDisabled();
  });

  it('asks again after the policy changed', async () => {
    mockStep = createStep({ consentedPolicyVersion: '2000-01-01' });
    await render(<ConsentStep />);
    expect(agreeBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
    expect(mockStep.answer).toHaveBeenCalledWith({ consentedPolicyVersion: undefined });
  });

  it('withdraws a consent given earlier when unticking', async () => {
    mockStep = createStep({ consentedPolicyVersion: PRIVACY_POLICY_VERSION });
    await render(<ConsentStep />);
    await fireEvent.press(agreeBox());
    expect(mockStep.answer).toHaveBeenCalledWith({ consentedPolicyVersion: undefined });
    expect(continueButton()).toBeDisabled();
  });

  it('says the plan cannot be built without the consent', async () => {
    await render(<ConsentStep />);
    expect(screen.getByText(/Without it, we can't build your plan/)).toBeTruthy();
  });

  it('opens the privacy policy', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<ConsentStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    expect(agreeBox()).not.toBeChecked();
    openURL.mockRestore();
  });

  it('opens the terms of use without ticking their box', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<ConsentStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Read the terms of use' }));
    expect(openURL).toHaveBeenCalledWith(TERMS_URL);
    expect(termsBox()).not.toBeChecked();
    openURL.mockRestore();
  });
});
