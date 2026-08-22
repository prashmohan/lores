import React, { useState } from 'react';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';

interface LoginFormProps {
  onOtpRequested: (email: string, devOtp?: string | null) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onOtpRequested }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.auth.requestOtp({
        email: email.trim().toLowerCase(),
        display_name: displayName.trim() || undefined,
      });
      onOtpRequested(res.email, res.dev_otp);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send verification code. Please check your email and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 border-2 border-slate-200 shadow-xl">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-300">
          <Mail className="w-7 h-7 text-amber-700" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Welcome to Lores
        </h2>
        <p className="text-slate-600 text-sm mt-2 font-medium">
          Sign in without a password. We will send a secure 6-digit code to your email.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-bold text-slate-900 mb-1.5">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. grandpa.miller@example.com"
            className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
          />
        </div>

        <div>
          <label htmlFor="login-name" className="block text-sm font-bold text-slate-900 mb-1.5">
            Your Name <span className="text-xs font-normal text-slate-500">(Optional)</span>
          </label>
          <input
            id="login-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Arthur Miller"
            className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 text-base text-slate-900 placeholder:text-slate-400 font-medium"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-base transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            'Sending code...'
          ) : (
            <>
              <span>Send Verification Code</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span>Safe, secure, and password-free</span>
      </div>
    </div>
  );
};
