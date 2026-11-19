import { DeleteAccountScreen } from '@/account/delete-account-screen';
import { SectionErrorBoundary } from '@/components/error-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

export default DeleteAccountScreen;
