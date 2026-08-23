import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Upload, ZoomIn, ZoomOut, RotateCcw, Trash2, Check, Image as ImageIcon } from 'lucide-react';

interface PhotoCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  personName: string;
  currentAvatarUrl?: string | null;
  onSavePhoto: (avatarDataUrl: string | null) => Promise<void>;
}

export const PhotoCropModal: React.FC<PhotoCropModalProps> = ({
  isOpen,
  onClose,
  personName,
  currentAvatarUrl = null,
  onSavePhoto,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const VIEWPORT_SIZE = 260; // Size of circular crop area in px
  const OUTPUT_SIZE = 400; // Final square output image size in px

  // Reset state when dialog opens or avatar changes
  useEffect(() => {
    if (isOpen) {
      if (currentAvatarUrl) {
        setImageSrc(currentAvatarUrl);
      } else {
        setImageSrc(null);
      }
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setError(null);
      setIsSaving(false);
      setImageDimensions(null);
    }
  }, [isOpen, currentAvatarUrl]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please select a photo under 10 MB.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imageElementRef.current = img;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // Pointer drag handling for 2D panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!imageSrc) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(3, Math.max(1, parseFloat((prev + delta).toFixed(2)))));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, parseFloat((prev + 0.2).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(1, parseFloat((prev - 0.2).toFixed(2))));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCropAndSave = useCallback(async () => {
    if (!imageElementRef.current || !imageSrc) return;

    setIsSaving(true);
    setError(null);

    try {
      const img = imageElementRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to create canvas rendering context');
      }

      // Compute aspect ratio scaling
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const naturalAspect = naturalWidth / naturalHeight;

      // Base displayed dimensions inside VIEWPORT_SIZE before zoom
      let baseWidth = VIEWPORT_SIZE;
      let baseHeight = VIEWPORT_SIZE;

      if (naturalAspect >= 1) {
        // Landscape or square
        baseHeight = VIEWPORT_SIZE;
        baseWidth = VIEWPORT_SIZE * naturalAspect;
      } else {
        // Portrait
        baseWidth = VIEWPORT_SIZE;
        baseHeight = VIEWPORT_SIZE / naturalAspect;
      }

      // Scale factor to map VIEWPORT_SIZE to OUTPUT_SIZE
      const scaleFactor = OUTPUT_SIZE / VIEWPORT_SIZE;

      // Center offset + pan + zoom
      const renderedWidth = baseWidth * zoom * scaleFactor;
      const renderedHeight = baseHeight * zoom * scaleFactor;

      const drawX = (OUTPUT_SIZE - renderedWidth) / 2 + pan.x * scaleFactor;
      const drawY = (OUTPUT_SIZE - renderedHeight) / 2 + pan.y * scaleFactor;

      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Draw image
      ctx.drawImage(img, drawX, drawY, renderedWidth, renderedHeight);

      // Export compressed high-resolution JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      await onSavePhoto(dataUrl);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to process and save avatar photo.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [imageSrc, zoom, pan, onSavePhoto, onClose]);

  const handleRemovePhoto = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSavePhoto(null);
      setImageSrc(null);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to remove photo.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl z-50 max-h-[95vh] overflow-y-auto border-2 border-slate-200"
          aria-describedby="photo-crop-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <Dialog.Title className="text-xl font-extrabold text-slate-900 leading-snug flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-600" />
              <span>Photo for {personName}</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <p id="photo-crop-description" className="text-sm text-slate-600 mt-2">
            Upload a portrait, zoom in, and drag to center their face in the circular frame.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium"
            >
              {error}
            </div>
          )}

          {/* File Input */}
          <input
            ref={fileInputRef}
            id="photo-upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Upload a photo"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {!imageSrc ? (
            /* Upload Dropzone View */
            <button
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 w-full border-2 border-dashed border-slate-300 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 group-hover:text-amber-700 group-hover:border-amber-300 group-hover:scale-105 transition-all mb-3">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-base font-extrabold text-slate-900 mb-1">
                Upload a photo
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                Drag and drop a photo here, or click to browse files (JPEG, PNG, WebP up to 10 MB)
              </p>
            </button>
          ) : (
            /* Image Cropper Viewport & Controls */
            <div className="mt-4 flex flex-col items-center space-y-4">
              {/* Interactive Cropper Stage */}
              <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onWheel={handleWheel}
                className="relative w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center select-none cursor-grab active:cursor-grabbing border-2 border-slate-300 shadow-inner touch-none"
              >
                {/* Image under test */}
                <img
                  ref={imageElementRef}
                  src={imageSrc}
                  alt={personName}
                  onLoad={handleImageLoad}
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    maxWidth: imageDimensions && imageDimensions.width < imageDimensions.height ? 'none' : '100%',
                    maxHeight: imageDimensions && imageDimensions.height < imageDimensions.width ? 'none' : '100%',
                    width: imageDimensions && imageDimensions.width < imageDimensions.height ? `${VIEWPORT_SIZE}px` : 'auto',
                    height: imageDimensions && imageDimensions.height < imageDimensions.width ? `${VIEWPORT_SIZE}px` : 'auto',
                    transition: isDragging ? 'none' : 'transform 0.05s ease-out',
                  }}
                  className="pointer-events-none select-none object-cover"
                />

                {/* Circular Viewport Cutout Mask */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)',
                    borderRadius: '50%',
                    width: `${VIEWPORT_SIZE}px`,
                    height: `${VIEWPORT_SIZE}px`,
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '2px solid rgba(251, 191, 36, 0.9)',
                  }}
                />

                {/* Subtle Centering Crosshair Guides */}
                <div
                  className="absolute pointer-events-none w-4 h-4 border-t border-b border-amber-300/40"
                  style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                />
                <div
                  className="absolute pointer-events-none w-4 h-4 border-l border-r border-amber-300/40"
                  style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                />
              </div>

              <p className="text-xs text-slate-500 font-medium">
                Tip: Drag to position face • Scroll or use slider to zoom
              </p>

              {/* Zoom & Adjustment Controls */}
              <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoom <= 1}
                    aria-label="Zoom Out"
                    className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>

                  <div className="flex-1 flex items-center gap-2">
                    <input
                      id="photo-zoom-slider"
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      aria-label="Photo zoom level"
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-600 min-w-[36px] text-right">
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                    aria-label="Zoom In"
                    className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Center and Reset</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-700" />
                    <span>Choose Different Photo</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons Footer */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200">
            {imageSrc || currentAvatarUrl ? (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={isSaving}
                className="px-3 py-2 rounded-xl text-rose-700 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove Photo</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              {imageSrc && (
                <button
                  type="button"
                  onClick={handleCropAndSave}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSaving ? 'Saving...' : 'Save Photo'}</span>
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
