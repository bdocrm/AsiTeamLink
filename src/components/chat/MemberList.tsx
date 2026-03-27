'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Eye, Clock } from 'lucide-react';
import type { Channel, User } from '@/lib/types';

interface MemberListProps {
  channel: Channel;
}

interface MemberWithStatus extends User {
  last_seen?: string;
  status_changed_at?: string;
}

export function MemberList({ channel }: MemberListProps) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<MemberWithStatus[]>([]);
  const [activeInChannel, setActiveInChannel] = useState<Set<string>>(new Set());
  const [statusTimestamps, setStatusTimestamps] = useState<Record<string, { timestamp: number; is_online: boolean }>>({});
  const supabase = createClient();

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase.rpc('get_campaign_members', { campaign_uuid: channel.campaign_id });
      if (data) {
        setMembers(data);
        const initialTimestamps: Record<string, { timestamp: number; is_online: boolean }> = {};
        data.forEach((member: any) => {
          const statusTime = member.is_online 
            ? (member.last_online_at ? new Date(member.last_online_at).getTime() : Date.now())
            : (member.last_offline_at ? new Date(member.last_offline_at).getTime() : Date.now());
          
          initialTimestamps[member.id] = {
            timestamp: statusTime,
            is_online: member.is_online || false,
          };
        });
        setStatusTimestamps(initialTimestamps);
      }
    };

    fetchMembers();

    const campaignPresence = supabase.channel(`presence:${channel.campaign_id}`, {
      config: { presence: { key: currentUser?.id } },
    });

    campaignPresence
      .on('presence', { event: 'sync' }, () => {
        const state = campaignPresence.presenceState();
        const now = Date.now();
        const onlineIds = new Set(Object.keys(state));
        
        setMembers(prev => {
          const updated = prev.map(m => {
            const isOnline = onlineIds.has(m.id);
            const presenceData = state[m.id]?.[0] as any;
            return {
              ...m,
              is_online: isOnline,
              last_seen: presenceData?.last_seen || m.last_seen,
              status_changed_at: presenceData?.status_changed_at,
            };
          });
          
          setStatusTimestamps(ts => {
            const newTs = { ...ts };
            updated.forEach(m => {
              const oldStatus = prev.find(p => p.id === m.id)?.is_online;
              const newStatus = m.is_online;
              const presenceData = state[m.id]?.[0] as any;
              
              if (!ts[m.id] || oldStatus !== newStatus) {
                const statusTime = newStatus
                  ? (presenceData?.online_at ? new Date(presenceData.online_at).getTime() : now)
                  : (m.last_offline_at ? new Date(m.last_offline_at).getTime() : now);
                newTs[m.id] = { timestamp: statusTime, is_online: newStatus };
              }
            });
            return newTs;
          });
          
          return updated;
        });
      })
      .on('presence', { event: 'leave' }, async ({ key }: any) => {
        const offlineUser = members.find(m => m.id === key);
        if (offlineUser) {
          try {
            await supabase
              .from('users')
              .update({ is_online: false, last_offline_at: new Date().toISOString() })
              .eq('id', offlineUser.id);
            
            setStatusTimestamps(ts => ({
              ...ts,
              [offlineUser.id]: { timestamp: Date.now(), is_online: false },
            }));
          } catch (err) {
            console.log('Could not mark user offline:', err);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && currentUser) {
          await campaignPresence.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          });
          
          try {
            await supabase
              .from('users')
              .update({ is_online: true, last_online_at: new Date().toISOString() })
              .eq('id', currentUser.id);
          } catch (err) {
            console.log('Could not update user status:', err);
          }
        }
      });

    const channelPresence = supabase.channel(`presence:${channel.id}`, {
      config: { presence: { key: currentUser?.id } },
    });

    channelPresence
      .on('presence', { event: 'sync' }, () => {
        const state = channelPresence.presenceState();
        const viewingIds = new Set(
          Object.values(state).flat().map((p: any) => p.user_id || currentUser?.id)
        );
        setActiveInChannel(viewingIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && currentUser) {
          await channelPresence.track({
            user_id: currentUser.id,
            user_name: currentUser.name,
            timestamp: new Date().toISOString(),
          });
        }
      });

    return () => {
      campaignPresence.untrack();
      supabase.removeChannel(campaignPresence);
      channelPresence.untrack();
      supabase.removeChannel(channelPresence);
    };
  }, [channel.campaign_id, channel.id, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onlineMembers = members.filter(m => m.is_online);
  const offlineMembers = members.filter(m => !m.is_online);

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-danger/10 text-danger border-danger/20';
      case 'manager': return 'bg-secondary-light text-secondary border-secondary/20';
      case 'tl': return 'bg-accent-light text-accent border-accent/20';
      default: return 'bg-surface-hover text-muted border-border';
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

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return 'now';
  };

  const getStatusDuration = (userId: string, isOnline: boolean): string => {
    const record = statusTimestamps[userId];
    if (!record) return '';
    
    const durationMs = Date.now() - record.timestamp;
    const duration = formatDuration(durationMs);
    return isOnline ? `Online ${duration}` : `Offline ${duration}`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setMembers(prev => [...prev]);
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-60 bg-surface border-l border-border flex flex-col shrink-0">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          Members
          <span className="text-xs font-normal text-muted bg-surface-hover px-1.5 py-0.5 rounded-md">{members.length}</span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-soft" />
              Online — {onlineMembers.length}
            </p>
            {onlineMembers.map(member => {
              const isViewingChannel = activeInChannel.has(member.id);
              const statusDuration = getStatusDuration(member.id, true);
              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 ${isViewingChannel ? 'bg-primary-light' : 'hover:bg-surface-hover'}`}
                  title={isViewingChannel ? 'Viewing this channel' : ''}
                >
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full avatar-gradient flex items-center justify-center text-xs font-bold">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="online-dot absolute -bottom-0.5 -right-0.5" />
                    {isViewingChannel && (
                      <Eye className="absolute -top-1 -right-1 w-3 h-3 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate font-medium">{member.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border ${getRoleBadgeStyle(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                      {statusDuration && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary/80">
                          <Clock className="w-2.5 h-2.5" />
                          {statusDuration}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2 mb-2">
              Offline — {offlineMembers.length}
            </p>
            {offlineMembers.map(member => {
              const statusDuration = getStatusDuration(member.id, false);
              return (
                <div key={member.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-surface-hover transition-all duration-200">
                  <div className="relative shrink-0 opacity-50">
                    <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-muted font-bold text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-muted/30 rounded-full border-2 border-surface" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground/60 truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium opacity-60 border ${getRoleBadgeStyle(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                      {statusDuration && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted/60 whitespace-nowrap">
                          <Clock className="w-2.5 h-2.5" />
                          {statusDuration}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
