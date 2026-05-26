'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Shield, CheckCircle, AlertTriangle, FileText, Monitor, Lock, Users, Camera } from 'lucide-react';

interface AUPModalProps {
  userName: string;
  onAccept?: () => Promise<void>;
  readOnly?: boolean;
  onClose?: () => void;
}

const POLICY_ITEMS = [
  {
    icon: Monitor,
    title: 'Authorized Use Only',
    body: 'This system is strictly for AsiTeamLink employees. Access by unauthorized individuals is prohibited and may be prosecuted.',
  },
  {
    icon: Shield,
    title: 'All Activities Are Monitored',
    body: 'Your login sessions, file operations, and messages are logged and reviewed by our Compliance team at any time.',
  },
  {
    icon: Camera,
    title: 'No Unauthorized Screenshots',
    body: 'Do not capture, share, or distribute screenshots of this system or any information displayed within it.',
  },
  {
    icon: Lock,
    title: 'Protect Confidential Information',
    body: 'Client data, internal communications, and files accessed through this platform are confidential. Do not share them outside the organization.',
  },
  {
    icon: Users,
    title: 'Personal Devices',
    body: 'Use of personal devices to access this system is permitted only in accordance with company policy. You remain accountable for all activity on your account.',
  },
  {
    icon: AlertTriangle,
    title: 'Violations',
    body: 'Violations of this policy may result in immediate account suspension and disciplinary action, up to and including termination.',
  },
];

export default function AUPModal({ userName, onAccept, readOnly = false, onClose }: AUPModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (readOnly || !onAccept) return;
    if (!agreed || loading) return;
    setLoading(true);
    try {
      await onAccept();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="modal-panel relative z-20 w-full max-w-lg mx-2 sm:mx-0 flex flex-col bg-surface shadow-xl overflow-hidden rounded-t-xl sm:rounded-xl"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-brand shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground leading-tight">
              Acceptable Use Policy
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {readOnly ? 'Policy reference' : 'Please read and accept before continuing'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Image
              src="/asiteamlinklogo.png"
              alt="AsiTeamLink"
              width={28}
              height={28}
              className="rounded-lg"
            />
          </div>
        </div>

        <div className="px-4 sm:px-6 pt-4 shrink-0">
          <p className="text-sm text-muted">
            Welcome back, <span className="font-semibold text-foreground">{userName}</span>. Before accessing the system, you must acknowledge the following policy.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 min-h-0">
          {POLICY_ITEMS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-3 p-3 rounded-xl bg-surface border border-border"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-light shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 sm:px-6 pb-6 pt-4 border-t border-border shrink-0 space-y-4 bg-surface sticky bottom-0">
          {readOnly ? (
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-semibold rounded-lg border border-border text-foreground hover:bg-surface-hover transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                      agreed
                        ? 'bg-primary border-primary'
                        : 'border-border group-hover:border-primary/60 bg-surface'
                    }`}
                  >
                    {agreed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
                <span className="text-xs text-foreground leading-relaxed">
                  I have read and understood the Acceptable Use Policy and agree to comply with its terms. I acknowledge that my activities on this platform are monitored and logged.
                </span>
              </label>

              <button
                onClick={handleAccept}
                disabled={!agreed || loading}
                className={`btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                  !agreed || loading ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    I Agree - Continue to AsiTeamLink
                  </>
                )}
              </button>
            </>
          )}

          <p className="text-[10px] text-muted text-center">
            Last updated: May 13, 2026 - AsiTeamLink Compliance Team
          </p>
        </div>
      </div>
    </div>
  );
}
