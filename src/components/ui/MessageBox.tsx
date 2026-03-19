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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="bg-surface border border-border rounded-lg shadow-lg p-5 w-full max-w-lg z-10">
        {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
        {message && <div className="text-sm text-muted mt-2">{message}</div>}

        <div className="mt-4 flex justify-end gap-2">
          {secondaryLabel && (
            <button
              onClick={() => { if (onSecondary) onSecondary(); }}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded text-sm"
            >
              {secondaryLabel}
            </button>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded text-sm"
          >
            Cancel
          </button>

          <button
            onClick={() => { if (onPrimary) onPrimary(); }}
            className="px-3 py-1.5 bg-primary text-white rounded text-sm"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
