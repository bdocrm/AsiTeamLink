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
  const [statusTimestamps, setStatusTimestamps] = useState<Record<string, { timestamp: number; is_online: boolean }>>({}); // Track when status changed
  const supabase = createClient();

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase.rpc('get_campaign_members', { campaign_uuid: channel.campaign_id });
      if (data) {
        setMembers(data);
        // Initialize status timestamps using last_online_at and last_offline_at from database
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

    // Campaign-wide presence (for online status everywhere)
    const campaignPresence = supabase.channel(`presence:${channel.campaign_id}`, {
      config: { presence: { key: currentUser?.id } },
    });

    campaignPresence
      .on('presence', { event: 'sync' }, () => {
        const state = campaignPresence.presenceState();
        const now = Date.now();
        const onlineIds = new Set(Object.keys(state));
        
        // Update members and track status changes
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
          
          // Update timestamps only when status CHANGES
          setStatusTimestamps(ts => {
            const newTs = { ...ts };
            updated.forEach(m => {
              const oldStatus = prev.find(p => p.id === m.id)?.is_online;
              const newStatus = m.is_online;
              const presenceData = state[m.id]?.[0] as any;
              
              // Initialize if not exists OR status changed
              if (!ts[m.id] || oldStatus !== newStatus) {
                // For online users: use online_at from presence
                // For offline users: use database last_offline_at or current time
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
        // User went offline - update database
        const offlineUser = members.find(m => m.id === key);
        if (offlineUser) {
          try {
            await supabase
              .from('users')
              .update({ is_online: false, last_offline_at: new Date().toISOString() })
              .eq('id', offlineUser.id);
            
            // Update offline timestamp in state
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
          // Track online status and update database
          await campaignPresence.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          });
          
          // Update database with online status (if columns exist)
          try {
            await supabase
              .from('users')
              .update({ is_online: true, last_online_at: new Date().toISOString() })
              .eq('id', currentUser.id);
          } catch (err) {
            // Columns may not exist yet - migration not run
            console.log('Could not update user status (run supabase-tracking.sql):', err);
          }
        }
      });

    // Channel-specific presence (for "currently viewing" indicator)
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
        console.log('Users viewing channel:', viewingIds);
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

  // Calculate duration since status change
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
    return isOnline ? `Online for ${duration}` : `Offline for ${duration}`;
  };

  // Update durations every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      // Trigger re-render by updating a dummy state
      setMembers(prev => [...prev]);
    }, 30000); // Update every 30 seconds for performance

    return () => clearInterval(timer);
  }, []);

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
            {onlineMembers.map(member => {
              const isViewingChannel = activeInChannel.has(member.id);
              const statusDuration = getStatusDuration(member.id, true);
              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors ${isViewingChannel ? 'bg-primary/5' : ''}`}
                  title={isViewingChannel ? 'Viewing this channel' : ''}
                >
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-surface" />
                    {isViewingChannel && (
                      <Eye className="absolute -top-1 -right-1 w-3 h-3 text-primary animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getRoleBadgeColor(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                      {statusDuration && (
                        <span className="flex items-center gap-0.5 text-[10px] text-success">
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
            <p className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-1">
              Offline — {offlineMembers.length}
            </p>
            {offlineMembers.map(member => {
              const statusDuration = getStatusDuration(member.id, false);
              return (
                <div key={member.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                  <div className="relative shrink-0 opacity-60">
                    <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-muted font-semibold text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-muted/40 rounded-full border-2 border-surface" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground/70 truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium opacity-70 ${getRoleBadgeColor(member.role)}`}>
                        {getRoleLabel(member.role)}
                      </span>
                      {statusDuration && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted/80 whitespace-nowrap">
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
