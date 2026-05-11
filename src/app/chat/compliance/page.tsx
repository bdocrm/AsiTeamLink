'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Eye, Download, LogIn, FileText } from 'lucide-react';
import LoginAuditViewer from '@/components/compliance/LoginAuditViewer';
import type { Channel } from '@/lib/types';

interface AuditLog {
  id: string;
  action_type: string;
  deleted_by_name: string;
  affected_user_name: string;
  channel_name: string;
  old_content: string;
  reason: string;
  created_at: string;
}

interface AttachmentLog {
  id: string;
  message_id: string;
  channel_name: string;
  attachment_name: string;
  attachment_size: number;
  action_type: string; // 'uploaded' or 'downloaded'
  uploaded_by: string;
  uploaded_by_email: string;
  download_by: string | null;
  download_by_email: string | null;
  created_at: string;
}

export default function ComplianceAuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [attachmentLogs, setAttachmentLogs] = useState<AttachmentLog[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'messages' | 'attachments' | 'logins'>('messages');
  const supabase = createClient();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'compliance')) {
      router.push('/chat');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchAuditData = async () => {
      if (!user) return;
      
      try {
        // Get channels user is member of
        const { data: memberChannels } = await supabase
          .from('channel_members')
          .select('channel_id')
          .eq('user_id', user.id);

        if (memberChannels && memberChannels.length > 0) {
          const channelIds = memberChannels.map(m => m.channel_id);
          
          // Fetch channel details
          const { data: chans } = await supabase
            .from('channels')
            .select('*')
            .in('id', channelIds);
          
          if (chans) setChannels(chans);
        }

        // Fetch deleted message audit logs
        const { data: logs } = await supabase
          .from('audit_logs')
          .select(`
            id,
            action_type,
            old_content,
            reason,
            created_at,
            users!audit_logs_user_id(name),
            users!audit_logs_target_user_id(name),
            channels(name)
          `)
          .eq('action_type', 'message_deleted')
          .order('created_at', { ascending: false });

        if (logs) {
          const formattedLogs = logs.map((log: any) => ({
            id: log.id,
            action_type: log.action_type,
            deleted_by_name: log.users?.name || 'Unknown',
            affected_user_name: log.users_target?.name || 'Unknown',
            channel_name: log.channels?.name || 'Unknown',
            old_content: log.old_content || '',
            reason: log.reason || '',
            created_at: log.created_at,
          }));
          setAuditLogs(formattedLogs);
        }

        // Fetch attachment audit logs
        const { data: attachments } = await supabase
          .from('attachment_logs')
          .select(`
            id,
            message_id,
            channel_id,
            attachment_name,
            attachment_size,
            action_type,
            created_at,
            users!attachment_logs_user_id(name, email),
            users!attachment_logs_download_by_user_id(name, email),
            channels(name)
          `)
          .order('created_at', { ascending: false });

        if (attachments) {
          const formattedAttachments = attachments.map((att: any) => ({
            id: att.id,
            message_id: att.message_id,
            channel_name: att.channels?.name || 'Unknown',
            attachment_name: att.attachment_name || 'Unknown',
            attachment_size: att.attachment_size || 0,
            action_type: att.action_type,
            uploaded_by: att.users?.name || 'Unknown',
            uploaded_by_email: att.users?.email || 'Unknown',
            download_by: att.download_by_user?.name || null,
            download_by_email: att.download_by_user?.email || null,
            created_at: att.created_at,
          }));
          setAttachmentLogs(formattedAttachments);
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuditData();
  }, [user]);

  const filteredLogs = selectedChannel === 'all' 
    ? auditLogs 
    : auditLogs.filter(log => log.channel_name === channels.find(c => c.id === selectedChannel)?.name);

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      alert('No logs to export');
      return;
    }

    // Prepare CSV headers
    const headers = ['ID', 'Deleted By', 'Affected User', 'Channel', 'Reason', 'Content', 'Timestamp'];
    
    // Prepare CSV rows
    const rows = filteredLogs.map(log => [
      log.id,
      log.deleted_by_name,
      log.affected_user_name,
      log.channel_name,
      `"${log.reason.replace(/"/g, '""')}"`, // Escape quotes in reason
      `"${log.old_content.replace(/"/g, '""')}"`, // Escape quotes in content
      new Date(log.created_at).toLocaleString(),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !user || user.role !== 'compliance') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface sticky top-0 z-40">
        <div className="flex items-center gap-4 px-6 py-4">
          <button
            onClick={() => router.push('/chat')}
            className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Compliance & Audit</h1>
            <p className="text-sm text-muted">View security events and message audit trail</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-border px-6 flex gap-1">
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'messages'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Deleted Messages
            </span>
          </button>
          <button
            onClick={() => setActiveTab('attachments')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'attachments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              File Attachments
            </span>
          </button>
          <button
            onClick={() => setActiveTab('logins')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'logins'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              Login Activity
            </span>
          </button>
        </div>
      </div>

      {/* Messages Tab Content */}
      {activeTab === 'messages' && (
        <>
          {/* Filters */}
          <div className="px-6 py-4 border-b border-border bg-surface/50">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">Filter by Channel:</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Channels</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-muted">
                  {filteredLogs.length} deleted message{filteredLogs.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleExport}
                  disabled={filteredLogs.length === 0}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export audit logs to CSV"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs List */}
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted">Loading audit logs...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted">
                <Eye className="w-12 h-12 mx-auto opacity-20 mb-2" />
                <p>No deleted messages in this channel</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-4 bg-surface border border-border rounded-lg hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="p-2 bg-danger/10 rounded-lg text-danger shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">Message deleted</span>
                          <span className="text-xs text-muted bg-background px-2 py-1 rounded">
                            #{log.channel_name}
                          </span>
                        </div>
                        <div className="text-sm text-muted mt-1">
                          <span>From: <span className="text-foreground font-medium">{log.affected_user_name}</span></span>
                          <span className="mx-2">•</span>
                          <span>Deleted by: <span className="text-foreground font-medium">{log.deleted_by_name}</span></span>
                        </div>
                      </div>
                      <div className="text-xs text-muted shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>

                    {log.old_content && (
                      <div className="mt-3 p-3 bg-background rounded-lg border border-border">
                        <p className="text-xs font-medium text-muted mb-1">Deleted Message:</p>
                        <p className="text-sm text-foreground break-words max-h-20 overflow-y-auto">
                          {log.old_content}
                        </p>
                      </div>
                    )}

                    {log.reason && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted mb-1">Reason:</p>
                        <p className="text-sm text-foreground">{log.reason}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Attachments Tab Content */}
      {activeTab === 'attachments' && (
        <>
          {/* Filters */}
          <div className="px-6 py-4 border-b border-border bg-surface/50">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">Filter by Channel:</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Channels</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Attachments List */}
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted">Loading attachment logs...</div>
            ) : attachmentLogs.filter(att => selectedChannel === 'all' || att.channel_name === channels.find(c => c.id === selectedChannel)?.name).length === 0 ? (
              <div className="text-center py-12 text-muted">
                <FileText className="w-12 h-12 mx-auto opacity-20 mb-2" />
                <p>No file attachments in this channel</p>
              </div>
            ) : (
              <div className="space-y-3">
                {attachmentLogs
                  .filter(att => selectedChannel === 'all' || att.channel_name === channels.find(c => c.id === selectedChannel)?.name)
                  .map(log => (
                    <div
                      key={log.id}
                      className="p-4 bg-surface border border-border rounded-lg hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          log.action_type === 'uploaded' 
                            ? 'bg-success/10 text-success' 
                            : 'bg-info/10 text-info'
                        }`}>
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">
                              {log.action_type === 'uploaded' ? 'File uploaded' : 'File downloaded'}
                            </span>
                            <span className="text-xs text-muted bg-background px-2 py-1 rounded">
                              #{log.channel_name}
                            </span>
                          </div>
                          <div className="text-sm text-muted mt-1">
                            <span>File: <span className="text-foreground font-medium break-all">{log.attachment_name}</span></span>
                            <span className="mx-2">•</span>
                            <span className="text-foreground">{(log.attachment_size / 1024).toFixed(2)} KB</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted shrink-0">
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="mt-3 p-3 bg-background rounded-lg border border-border space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted mb-1">
                            {log.action_type === 'uploaded' ? 'Uploaded by' : 'Downloaded by'}:
                          </p>
                          <p className="text-sm text-foreground">
                            {log.action_type === 'uploaded' 
                              ? `${log.uploaded_by} (${log.uploaded_by_email})`
                              : log.download_by ? `${log.download_by} (${log.download_by_email})` : 'Unknown'
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Login Activity Tab Content */}
      {activeTab === 'logins' && (
        <div className="px-6 py-4">
          <LoginAuditViewer />
        </div>
      )}
    </div>
  );
}
