'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import type { Channel, User } from '@/lib/types';

interface MemberListProps {
  channel: Channel;
}

export function MemberList({ channel }: MemberListProps) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase.rpc('get_campaign_members', { campaign_uuid: channel.campaign_id });
      if (data) setMembers(data);
    };

    fetchMembers();

    // Set up presence channel
    const presenceChannel = supabase.channel(`presence:${channel.campaign_id}`, {
      config: { presence: { key: currentUser?.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setMembers(prev =>
          prev.map(m => ({ ...m, is_online: onlineIds.has(m.id) }))
        );
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && currentUser) {
          await presenceChannel.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [channel.campaign_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onlineMembers = members.filter(m => m.is_online);
  const offlineMembers = members.filter(m => !m.is_online);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-danger/10 text-danger';
      case 'manager': return 'bg-primary/10 text-primary';
      case 'tl': return 'bg-warning/10 text-warning';
      default: return 'bg-surface-hover text-muted';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      case 'tl': return 'TL';
      default: return 'Agent';
    }
  };

  return (
    <div className="w-60 bg-surface border-l border-border flex flex-col shrink-0">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Members — {members.length}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-1">
              Online — {onlineMembers.length}
            </p>
            {onlineMembers.map(member => (
              <div key={member.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-surface" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{member.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getRoleBadgeColor(member.role)}`}>
                    {getRoleLabel(member.role)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-1">
              Offline — {offlineMembers.length}
            </p>
            {offlineMembers.map(member => (
              <div key={member.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors opacity-60">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-muted font-semibold text-xs">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-muted/40 rounded-full border-2 border-surface" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{member.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getRoleBadgeColor(member.role)}`}>
                    {getRoleLabel(member.role)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
