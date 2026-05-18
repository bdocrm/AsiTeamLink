'use client';

import { useState } from 'react';
import { Shield, Trash2, FileUp, AlertTriangle } from 'lucide-react';
import LoginAuditViewer from '@/components/compliance/LoginAuditViewer';
import DeletionAuditViewer from '@/components/compliance/DeletionAuditViewer';
import FileAuditViewer from '@/components/compliance/FileAuditViewer';
import SuspiciousActivityViewer from '@/components/compliance/SuspiciousActivityViewer';
import ChannelRenameAuditViewer from '@/components/compliance/ChannelRenameAuditViewer';

type AuditView = 'login' | 'deletion' | 'files' | 'suspicious' | 'channel_renames';

export default function CompliancePage() {
  const [activeView, setActiveView] = useState<AuditView>('login');

  const tabs: Array<{ id: AuditView; label: string; icon: typeof Shield }> = [
    { id: 'login', label: 'Login Audits', icon: Shield },
    { id: 'deletion', label: 'Deletion Audits', icon: Trash2 },
    { id: 'files', label: 'File Audits', icon: FileUp },
    { id: 'suspicious', label: 'Suspicious Activity', icon: AlertTriangle },
    { id: 'channel_renames', label: 'Channel Renames', icon: Trash2 },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                activeView === tab.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-surface/30 rounded-lg border border-border p-6">
        {activeView === 'login' && <LoginAuditViewer />}
        {activeView === 'deletion' && <DeletionAuditViewer />}
        {activeView === 'files' && <FileAuditViewer />}
        {activeView === 'suspicious' && <SuspiciousActivityViewer />}
        {activeView === 'channel_renames' && <ChannelRenameAuditViewer />}
      </div>
    </div>
  );
}
