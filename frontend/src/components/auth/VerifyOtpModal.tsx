import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { KeyRound, ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { UserRead } from '../../types/api';

interface VerifyOtpModalProps {
  isOpen: boolean;
  email: string;
  onSuccess: (user?: UserRead | null) => void;
  onBack: () => void;
}

export const VerifyOtpModal: React.FC<VerifyOtpModalProps> = ({
  isOpen,
  email,
  onSuccess,
  onBack,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.auth.verifyOtp({
        email,
        code: code.trim(),
      });
      onSuccess(res.user);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid or expired code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setInfoMessage(null);
    try {
      await api.auth.requestOtp({ email });
      setInfoMessage('A new 6-digit code has been sent to your email.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to resend code. Please wait a moment.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onBack()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl z-50 border-2 border-slate-200"
          aria-describedby="otp-description"
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-300">
              <KeyRound className="w-7 h-7 text-amber-700" />
            </div>
            <Dialog.Title className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Enter Verification Code
            </Dialog.Title>
            <p id="otp-description" className="text-slate-600 text-sm mt-2 font-medium">
              We sent a 6-digit code to <strong className="text-slate-900">{email}</strong>
            </p>
          </div>

          {infoMessage && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm font-semibold text-center">
              {infoMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold text-center"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="otp-input" className="sr-only">
                6-digit verification code
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full px-4 py-4 text-center tracking-[0.5em] text-3xl font-mono font-bold rounded-2xl border-2 border-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-200 text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length === 0}
              className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-base transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={onBack}
              className="font-bold text-slate-600 hover:text-slate-950 flex items-center gap-1.5 cursor-pointer py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Change email</span>
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 py-1"
            >
              <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
              <span>{resending ? 'Sending...' : 'Resend code'}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
