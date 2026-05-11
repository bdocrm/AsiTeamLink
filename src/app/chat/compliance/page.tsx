'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Eye } from 'lucide-react';
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

export default function ComplianceAuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
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

        // Fetch audit logs
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
            <h1 className="text-xl font-bold text-foreground">Compliance Audit Log</h1>
            <p className="text-sm text-muted">View deleted messages and audit trail</p>
          </div>
        </div>
      </div>

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
          <div className="ml-auto text-sm text-muted">
            {filteredLogs.length} deleted message{filteredLogs.length !== 1 ? 's' : ''}
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
    </div>
  );
}
