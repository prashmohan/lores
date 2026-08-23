import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LoginForm } from '../src/components/auth/LoginForm';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    auth: {
      requestOtp: vi.fn(),
    },
  },
}));

describe('LoginForm', () => {
  it('submits email and triggers onOtpRequested', async () => {
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
});
