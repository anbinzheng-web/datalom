'use client';
import { useState } from 'react';
import { Button, Input } from './ui';

export function PasswordAuth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: Record<string, string> = {};
    const email = event.currentTarget.elements.namedItem('email') as HTMLInputElement;
    const password = String(form.get('password') ?? '');
    if (!email.value.trim()) next.email = 'Enter your email address.';
    else if (email.validity.typeMismatch) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    else if (mode === 'signup' && password.length < 8) next.password = 'Use at least 8 characters.';
    if (mode === 'signup' && !form.get('confirmPassword'))
      next.confirmPassword = 'Confirm your password.';
    else if (mode === 'signup' && password !== form.get('confirmPassword'))
      next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    setMessage('');
    const first = Object.keys(next)[0];
    if (first) {
      (event.currentTarget.elements.namedItem(first) as HTMLInputElement).focus();
      return;
    }
    setMessage(
      mode === 'signin'
        ? 'Email sign-in is not available yet.'
        : 'Email registration is not available yet.',
    );
  }
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 rounded-sm bg-soft p-1" aria-label="Account access">
        <button
          type="button"
          aria-pressed={mode === 'signin'}
          onClick={() => {
            setMode('signin');
            setMessage('');
            setErrors({});
          }}
          className="rounded-sm px-3 py-2 text-xs font-medium aria-pressed:bg-surface aria-pressed:text-ink"
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === 'signup'}
          onClick={() => {
            setMode('signup');
            setMessage('');
            setErrors({});
          }}
          className="rounded-sm px-3 py-2 text-xs font-medium aria-pressed:bg-surface aria-pressed:text-ink"
        >
          Create account
        </button>
      </div>
      <form
        noValidate
        onSubmit={submit}
        onChange={(event) => {
          const input = event.target;
          if (!(input instanceof HTMLInputElement)) return;
          setErrors((current) => {
            const next = { ...current };
            delete next[input.name];
            if (input.name === 'password') delete next.confirmPassword;
            return next;
          });
          setMessage('');
        }}
        className="space-y-2"
      >
        <label className="block text-xs font-medium">
          Email
          <Input
            size="xl"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1"
          />
          {errors.email && (
            <span
              id="email-error"
              role="alert"
              className="mt-1 block text-xs font-normal leading-4 text-danger"
            >
              {errors.email}
            </span>
          )}
        </label>
        <label className="block text-xs font-medium">
          Password
          <Input
            size="xl"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            name="password"
            type="password"
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            className="mt-1"
          />
          {errors.password && (
            <span
              id="password-error"
              role="alert"
              className="mt-1 block text-xs font-normal leading-4 text-danger"
            >
              {errors.password}
            </span>
          )}
        </label>
        {mode === 'signup' && (
          <label className="block text-xs font-medium">
            Confirm password
            <Input
              size="xl"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              name="confirmPassword"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete="new-password"
              placeholder="Repeat your password"
              className="mt-1"
            />
            {errors.confirmPassword && (
              <span
                id="confirmPassword-error"
                role="alert"
                className="mt-1 block text-xs font-normal leading-4 text-danger"
              >
                {errors.confirmPassword}
              </span>
            )}
          </label>
        )}
        <Button size="xl" type="submit" className="w-full">
          {mode === 'signin' ? 'Sign in with email' : 'Create account'}
        </Button>
      </form>
      {message && (
        <p role="alert" className="mt-2 text-xs leading-4 text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
