import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { PhotoCropModal } from '../src/components/tree/PhotoCropModal';

describe('PhotoCropModal', () => {
  const sampleAvatar =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('renders modal when open with title and description', () => {
    render(
      <PhotoCropModal
        isOpen={true}
        onClose={vi.fn()}
        personName="Eleanor Vance"
        onSavePhoto={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Photo for Eleanor Vance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload a photo/i)).toBeInTheDocument();
  });

  it('renders crop controls when an initial avatar is provided', () => {
    render(
      <PhotoCropModal
        isOpen={true}
        onClose={vi.fn()}
        personName="Eleanor Vance"
        currentAvatarUrl={sampleAvatar}
        onSavePhoto={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Photo zoom level/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zoom In/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zoom Out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Center and Reset/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Photo/i })).toBeInTheDocument();
  });

  it('calls onSavePhoto(null) when Remove Photo is clicked and confirmed', async () => {
    const onSavePhoto = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <PhotoCropModal
        isOpen={true}
        onClose={onClose}
        personName="Eleanor Vance"
        currentAvatarUrl={sampleAvatar}
        onSavePhoto={onSavePhoto}
      />
    );

    const removeBtn = screen.getByRole('button', { name: /Remove Photo/i });
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    await vi.waitFor(() => {
      expect(onSavePhoto).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('adjusts zoom level when slider is moved', () => {
    render(
      <PhotoCropModal
        isOpen={true}
        onClose={vi.fn()}
        personName="Eleanor Vance"
        currentAvatarUrl={sampleAvatar}
        onSavePhoto={vi.fn()}
      />
    );

    const slider = screen.getByLabelText(/Photo zoom level/i) as HTMLInputElement;
    expect(slider.value).toBe('1');

    fireEvent.change(slider, { target: { value: '2' } });
    expect(slider.value).toBe('2');
  });

  it('adjusts zoom when zoom in and zoom out buttons are clicked', () => {
    render(
      <PhotoCropModal
        isOpen={true}
        onClose={vi.fn()}
        personName="Eleanor Vance"
        currentAvatarUrl={sampleAvatar}
        onSavePhoto={vi.fn()}
      />
    );

    const slider = screen.getByLabelText(/Photo zoom level/i) as HTMLInputElement;
    const zoomInBtn = screen.getByRole('button', { name: /Zoom In/i });
    const zoomOutBtn = screen.getByRole('button', { name: /Zoom Out/i });

    fireEvent.click(zoomInBtn);
    expect(parseFloat(slider.value)).toBeGreaterThan(1);

    fireEvent.click(zoomOutBtn);
    expect(parseFloat(slider.value)).toBeCloseTo(1, 1);
  });

  it('passes accessibility audit with 0 violations', async () => {
    const { container } = render(
      <PhotoCropModal
        isOpen={true}
        onClose={vi.fn()}
        personName="Eleanor Vance"
        currentAvatarUrl={sampleAvatar}
        onSavePhoto={vi.fn()}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
