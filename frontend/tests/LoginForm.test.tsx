import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from '../src/components/auth/LoginForm';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    auth: {
      getConfig: vi.fn(),
      requestOtp: vi.fn(),
      loginWithGoogle: vi.fn(),
    },
  },
}));

describe('LoginForm with Google SSO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Google sign in button and divider when Google auth is enabled', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: 'mock-client-id.apps.googleusercontent.com',
      google_auth_enabled: true,
    });

    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('google-sso-button')).toBeInTheDocument();
      expect(screen.getByText(/or continue with email/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('hides Google button and divider when Google auth is disabled', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: null,
      google_auth_enabled: false,
    });

    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId('google-sso-button')).not.toBeInTheDocument();
      expect(screen.queryByText(/or continue with email/i)).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('submits email and triggers onOtpRequested', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: null,
      google_auth_enabled: false,
    });
    const onOtpRequested = vi.fn();
    vi.mocked(api.auth.requestOtp).mockResolvedValue({
      message: 'OTP sent',
      email: 'test@example.com',
    });

    render(<LoginForm onOtpRequested={onOtpRequested} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Your Name/i), {
      target: { value: 'Tester' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(api.auth.requestOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        display_name: 'Tester',
      });
      expect(onOtpRequested).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('displays error if requestOtp fails', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: null,
      google_auth_enabled: false,
    });
    vi.mocked(api.auth.requestOtp).mockRejectedValue(new Error('Rate limit exceeded'));

    render(<LoginForm onOtpRequested={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded');
    });
  });

  it('handles Google sign in success and calls onLoginSuccess', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: 'mock-client-id.apps.googleusercontent.com',
      google_auth_enabled: true,
    });

    const mockUser = {
      id: 'u-1',
      email: 'googleuser@example.com',
      display_name: 'Google User',
      is_superadmin: false,
    };

    vi.mocked(api.auth.loginWithGoogle).mockResolvedValueOnce({
      access_token: 'jwt-token',
      token: 'jwt-token',
      token_type: 'bearer',
      user: mockUser,
    });

    const onLoginSuccess = vi.fn();
    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={onLoginSuccess} />);

    await waitFor(() => {
      expect(screen.getByTestId('google-sso-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      expect(api.auth.loginWithGoogle).toHaveBeenCalled();
      expect(onLoginSuccess).toHaveBeenCalledWith(mockUser);
    });
  });

  it('displays error when Google sign in fails', async () => {
    vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
      google_client_id: 'mock-client-id.apps.googleusercontent.com',
      google_auth_enabled: true,
    });

    vi.mocked(api.auth.loginWithGoogle).mockRejectedValueOnce(new Error('Google token invalid or expired'));

    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('google-sso-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('google-sso-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Google token invalid or expired');
    });
  });

  it('displays user-friendly error when Google Sign-In fails to load outside test environment', async () => {
    const origMode = import.meta.env.MODE;
    try {
      (import.meta.env as Record<string, string>).MODE = 'production';

      vi.mocked(api.auth.getConfig).mockResolvedValueOnce({
        google_client_id: 'mock-client-id.apps.googleusercontent.com',
        google_auth_enabled: true,
      });

      render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('google-sso-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('google-sso-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Google Sign-In could not be loaded. Please disable content blockers or continue with email.'
        );
      });
    } finally {
      (import.meta.env as Record<string, string>).MODE = origMode;
    }
  });
});

