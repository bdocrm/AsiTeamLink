'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { X, Plus, Trash2, Shield, User } from 'lucide-react';
import type { Channel, User as UserType } from '@/lib/types';

interface ChannelMembersManagerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

interface ChannelMember {
  user_id: string;
  user_name: string;
  user_role: string;
  member_role: string;
  joined_at: string;
}

export function ChannelMembersManager({ channel, isOpen, onClose }: ChannelMembersManagerProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [availableToAdd, setAvailableToAdd] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [addingMembers, setAddingMembers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const supabase = createClient();

  // Check if current user is owner or admin
  const isOwnerOrAdmin = user?.role === 'admin' || members.some(m => m.user_id === user?.id && m.member_role === 'owner');

  // Fetch members
  useEffect(() => {
    if (!isOpen) return;
    fetchMembers();
    fetchAvailableMembers();
  }, [isOpen, channel.id]);

  // Presence subscription to enrich members with device/ip info
  useEffect(() => {
    if (!isOpen || !user) return;

    const presenceChannel = supabase.channel(`presence:${channel.id}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = presenceChannel.presenceState();
          setMembers(prev => prev.map(m => {
            const pres = state[m.user_id]?.[0] as any;
            if (!pres) return m;
            return {
              ...m,
              // merge presence fields when available
              devicePlatform: pres.devicePlatform || (m as any).devicePlatform,
              ip: pres.ip || (m as any).ip,
              // mark member as online if present
              is_online: true,
            } as ChannelMember & any;
          }));
        } catch (e) {
          // ignore
        }
      })
      .subscribe();

    return () => {
      try { presenceChannel.untrack(); } catch (e) {}
      supabase.removeChannel(presenceChannel);
    };
  }, [isOpen, channel.id, user]);

  // Realtime subscription: refresh members when channel_members changes
  useEffect(() => {
    if (!isOpen) return;

    const membersChannel = supabase.channel(`realtime:channel_members:${channel.id}`);

    membersChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members', filter: `channel_id=eq.${channel.id}` }, (payload: any) => {
      try {
        // refresh members and available list on any change
        fetchMembers();
        fetchAvailableMembers();
      } catch (e) {
        // ignore
      }
    }).subscribe();

    return () => {
      try { supabase.removeChannel(membersChannel); } catch (e) {}
    };
  }, [isOpen, channel.id]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase.rpc('get_channel_members', {
        p_channel_id: channel.id,
      });

      if (err) {
        setError(err.message);
        return;
      }

      const membersRes = (data as ChannelMember[]) || [];

      if (membersRes.length === 0) {
        // If no channel members, show all users in the system as a fallback
        try {
          const { data: usersData, error: usersErr } = await supabase
            .from('users')
            .select('id, name, email, role, is_online, last_online_at, last_offline_at, created_at')
            .order('name', { ascending: true });

          if (!usersErr && usersData) {
            const fallback: ChannelMember[] = (usersData as any[]).map(u => ({
              user_id: u.id,
              user_name: u.name || u.email || 'Unknown',
              user_role: u.role || 'agent',
              member_role: 'member',
              joined_at: u.created_at || new Date().toISOString(),
            }));
            setMembers(fallback);
          } else {
            setMembers(membersRes);
          }
        } catch (e: any) {
          setMembers(membersRes);
        }
      } else {
        setMembers(membersRes);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableMembers = async () => {
    try {
      // Get all users, not just campaign members - removed campaign restriction
      const { data, error: err } = await supabase
        .from('users')
        .select('id, name, email, role, campaign_id')
        .order('name', { ascending: true });

      if (err) return;

      const alreadyMembers = new Set(members.map(m => m.user_id));
      const available = (data as UserType[]).filter(m => !alreadyMembers.has(m.id) && m.id !== user?.id);
      setAvailableToAdd(available);
    } catch (err) {
      console.error('Failed to fetch available members:', err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      setRemoving(memberId);
      const { data, error: err } = await supabase.rpc('remove_channel_member', {
        p_channel_id: channel.id,
        p_user_id: memberId,
      });

      if (err) {
        setError(err.message);
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      // Remove from local state
      setMembers(members.filter(m => m.user_id !== memberId));
      setAvailableToAdd([...availableToAdd, members.find(m => m.user_id === memberId)!] as any);
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    } finally {
      setRemoving(null);
    }
  };

  const handleAddMembers = async () => {
    if (selectedToAdd.size === 0) return;

    try {
      setAddingMembers(true);
      setError('');

      // Call the SECURITY DEFINER helper to add all members at once
      const memberIds = Array.from(selectedToAdd);
      const { error: err } = await supabase.rpc('add_members_to_channel', {
        p_channel_id: channel.id,
        p_member_ids: memberIds,
      });

      if (err) {
        setError(err.message);
        return;
      }

      // Refresh members
      setSelectedToAdd(new Set());
      setShowAddMembers(false);
      fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      owner: 'bg-danger/10 text-danger',
      moderator: 'bg-warning/10 text-warning',
      member: 'bg-primary/10 text-primary',
    };
    const labels: Record<string, string> = {
      owner: 'Owner',
      moderator: 'Moderator',
      member: 'Member',
    };
    return { style: styles[role] || styles.member, label: labels[role] || 'Member' };
  };

  const getUserRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      admin: 'bg-danger/10 text-danger',
      manager: 'bg-primary/10 text-primary',
      tl: 'bg-warning/10 text-warning',
      agent: 'bg-surface-hover text-muted',
    };
    return styles[role] || styles.agent;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-lg shadow-lg w-full max-w-md max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-lg font-semibold text-foreground">Channel Members</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          {/* Add Members Section */}
          {isOwnerOrAdmin && (
            <div>
              {!showAddMembers ? (
                <button
                  onClick={() => {
                    setShowAddMembers(true);
                    setSearchTerm('');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary-hover text-white text-sm rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Members
                </button>
              ) : (
                <div className="space-y-2">
                  {availableToAdd.length === 0 ? (
                    <div className="p-3 text-center text-muted text-sm bg-surface-hover rounded-lg">
                      All campaign members are already in this channel
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search members..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        {availableToAdd
                          .filter(member => {
                            const term = (searchTerm || '').toLowerCase();
                            const name = (member.name || '').toLowerCase();
                            const email = (member.email || '').toLowerCase();
                            return name.includes(term) || email.includes(term);
                          })
                          .map(member => (
                          <button
                            key={member.id}
                            onClick={() => {
                              const newSet = new Set(selectedToAdd);
                              if (newSet.has(member.id)) {
                                newSet.delete(member.id);
                              } else {
                                newSet.add(member.id);
                              }
                              setSelectedToAdd(newSet);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 border-b border-border/30 hover:bg-surface-hover transition-colors text-left last:border-b-0 ${
                              selectedToAdd.has(member.id) ? 'bg-primary/10' : ''
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                              selectedToAdd.has(member.id)
                                ? 'bg-primary border-primary'
                                : 'border-border'
                            }`}>
                              {selectedToAdd.has(member.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{member.name}</p>
                              <p className={`text-xs ${getUserRoleBadge(member.role)}`}>
                                {member.role.toUpperCase()}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddMembers}
                          disabled={selectedToAdd.size === 0 || addingMembers}
                          className="flex-1 py-1.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
                        >
                          {addingMembers ? 'Adding...' : `Add (${selectedToAdd.size})`}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddMembers(false);
                            setSelectedToAdd(new Set());
                            setSearchTerm('');
                          }}
                          className="flex-1 py-1.5 bg-surface-hover text-foreground text-xs rounded font-medium transition-colors hover:bg-border"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Members ({members.length})
            </h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted text-center py-4">Loading members...</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No members yet</p>
              ) : (
                members.map(member => {
                  const badge = getRoleBadge(member.member_role);
                  const joinedDate = new Date(member.joined_at).toLocaleDateString();
                  const canRemove = isOwnerOrAdmin && member.user_id !== user?.id && member.member_role !== 'owner';

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                        {((member.user_name || 'U') + '').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{member.user_name || 'Unknown'}</p>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium w-fit ${badge.style}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-muted">{joinedDate}</span>
                        </div>
                        {/* Device / IP info (from presence state) */}
                        {(member as any).devicePlatform && (
                          <div className="text-[11px] text-muted mt-1 truncate">
                            <span className="mr-2">{(member as any).devicePlatform}</span>
                            {((member as any).ip) && <span className="ml-1">· {(member as any).ip}</span>}
                          </div>
                        )}
                      </div>
                      {canRemove && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          disabled={removing === member.user_id}
                          className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
