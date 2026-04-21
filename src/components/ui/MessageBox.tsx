"use client";

import React from 'react';

type MessageBoxProps = {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  onClose: () => void;
};

export default function MessageBox({
  open,
  title,
  message,
  primaryLabel = 'OK',
  secondaryLabel,
  onPrimary,
  onSecondary,
  onClose,
}: MessageBoxProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop pointer-events-none" onClick={onClose} />

      <div className="modal-panel p-6 w-full max-w-md z-50 relative">
        {title && (
          <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
        )}
        {message && (
          <div className="text-sm text-muted mt-2 leading-relaxed">{message}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {secondaryLabel && (
            <button
              onClick={() => { if (onSecondary) onSecondary(); }}
              className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-xl text-sm font-medium transition-all duration-200"
            >
              {secondaryLabel}
            </button>
          )}

          {!secondaryLabel && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-xl text-sm font-medium transition-all duration-200"
            >
              Cancel
            </button>
          )}

          <button
            onClick={() => { if (onPrimary) onPrimary(); }}
            className="px-4 py-2 btn-primary text-sm"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
