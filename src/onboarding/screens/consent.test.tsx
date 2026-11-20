import { Linking } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/links';
import { createStep } from '@/test/step-mock';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/requirements/built-with';
import { REQUIREMENTS_KEY } from '@/requirements/requirements';
import { act, createTestQueryClient, fireEvent, render, screen, waitFor } from '@/test/render';

import { ConsentStep } from './consent';

let mockStep = createStep();
jest.mock('@/onboarding/use-step', () => ({ useStep: () => mockStep }));
// The step reads the texts' current versions, which the app asked the server for at its start.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/device-storage', () => ({ readItem: () => null, writeItem: jest.fn() }));

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

  it('records the versions the server says are current, not those the build was made with', async () => {
    const queryClient = createTestQueryClient();
    const text = (version: string) => ({ version, appliesAt: '2027-03-03T00:00:00Z', summary: {} });
    queryClient.setQueryData(REQUIREMENTS_KEY, {
      supported: true,
      lowestVersion: '0.0.0',
      agreements: {
        terms: text('2027-02-01'),
        health_consent: text('2027-01-15'),
        ai_consent: text('2026-11-18'),
      },
    });
    await render(<ConsentStep />, { queryClient });
    await fireEvent.press(agreeBox());
    await fireEvent.press(termsBox());
    await fireEvent.press(continueButton());
    expect(mockStep.next).toHaveBeenCalledWith({
      consentedPolicyVersion: '2027-01-15',
      acceptedTermsVersion: '2027-02-01',
    });
  });

  it('unticks the boxes when the server says newer versions while the step shows', async () => {
    const queryClient = createTestQueryClient();
    await render(<ConsentStep />, { queryClient });
    await fireEvent.press(agreeBox());
    await fireEvent.press(termsBox());
    expect(continueButton()).toBeEnabled();

    // As when the app comes back from reading a text and asks the server again.
    const text = (version: string) => ({ version, appliesAt: '2027-03-03T00:00:00Z', summary: {} });
    await act(() =>
      queryClient.setQueryData(REQUIREMENTS_KEY, {
        supported: true,
        lowestVersion: '0.0.0',
        agreements: {
          terms: text('2027-02-01'),
          health_consent: text('2027-01-15'),
          ai_consent: text('2026-11-18'),
        },
      }),
    );
    await waitFor(() => expect(agreeBox()).not.toBeChecked());
    expect(termsBox()).not.toBeChecked();
    expect(continueButton()).toBeDisabled();
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
