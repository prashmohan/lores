import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VerifyOtpModal } from '../src/components/auth/VerifyOtpModal';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    auth: {
      verifyOtp: vi.fn(),
      requestOtp: vi.fn(),
    },
  },
}));

describe('VerifyOtpModal', () => {
  it('submits code and triggers onSuccess', async () => {
    const onSuccess = vi.fn();
    const onBack = vi.fn();
    vi.mocked(api.auth.verifyOtp).mockResolvedValue({
      access_token: 'jwt.token.here',
      token: 'jwt.token.here',
      token_type: 'bearer',
      user: {
        id: 'u1',
        email: 'test@example.com',
        display_name: 'Tester',
        is_superadmin: false,
        created_at: new Date().toISOString(),
      },
    });

    render(
      <VerifyOtpModal
        isOpen={true}
        email="test@example.com"
        onSuccess={onSuccess}
        onBack={onBack}
      />
    );

    const input = screen.getByPlaceholderText('123456');
    fireEvent.change(input, { target: { value: '654321' } });

    fireEvent.click(screen.getByRole('button', { name: /Verify & Continue/i }));

    await waitFor(() => {
      expect(api.auth.verifyOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        code: '654321',
      });
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    });
  });

  it('handles back button click', () => {
    const onBack = vi.fn();
    render(
      <VerifyOtpModal
        isOpen={true}
        email="test@example.com"
        onSuccess={vi.fn()}
        onBack={onBack}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Change email/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
