import { AppErrorBoundary } from '@/components/error-screen';
import { TermsUpdateScreen } from '@/requirements/terms-update-screen';

// In place of the screen when it fails as it draws; the app is out of reach behind it (ADR 0150).
export const ErrorBoundary = AppErrorBoundary;

export default TermsUpdateScreen;
