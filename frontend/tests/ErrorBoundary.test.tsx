import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

const ThrowErrorComponent: React.FC<{ shouldThrow: boolean; message?: string }> = ({
  shouldThrow,
  message = 'Test simulated error',
}) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Normal Content Loaded Successfully</div>;
};

describe('ErrorBoundary', () => {
  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('catches render errors and displays accessible recovery fallback UI with alert role', () => {
    // Suppress console.error during expected throw test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowErrorComponent shouldThrow={true} message="Simulated crash during node render" />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something unexpected went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulated crash during node render/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Try Again$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reload Page$/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('allows user to click Try Again to reset error state', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowErrorComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Rerender with working child and click Try Again
    rerender(
      <ErrorBoundary>
        <ThrowErrorComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    const tryAgainBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(tryAgainBtn);

    expect(screen.getByText('Normal Content Loaded Successfully')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
