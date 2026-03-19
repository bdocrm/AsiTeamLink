'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Image from 'next/image';
import {
  Hash,
  Plus,
  Settings,
  Shield,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Bell,
} from 'lucide-react';
import type { Channel, Campaign } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ selectedChannel, onSelectChannel, collapsed, onToggleCollapse }: SidebarProps) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [createForCampaign, setCreateForCampaign] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchChannels();
    fetchCampaigns();
    if (user) fetchUnreadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Listen for new messages globally to update unread counts + send browser notifications
  useEffect(() => {
    if (!user) return;

    const sub = supabase
      .channel('global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { channel_id: string; sender_id: string; text: string | null };
          if (msg.sender_id === user.id) return; // ignore own messages

          // Update unread count
          if (msg.channel_id !== selectedChannel?.id) {
            setUnreadCounts(prev => ({
              ...prev,
              [msg.channel_id]: (prev[msg.channel_id] || 0) + 1,
            }));
          }

          // Browser notification
          if (Notification.permission === 'granted' && document.hidden) {
            const notification = new Notification('AsiTeamLink', {
              body: msg.text || 'Sent an attachment',
              icon: '/asiteamlinklogo.png',
            });
            notification.onclick = () => window.focus();
          }
        }
      )
      .subscribe();

    // Request notification permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => { supabase.removeChannel(sub); };
  }, [user, selectedChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUnreadCounts = async () => {
    if (!user) return;
    const { data } = await supabase.rpc('get_unread_counts', { p_user_id: user.id });
    if (data) {
      const counts: Record<string, number> = {};
      (data as { channel_id: string; unread_count: number }[]).forEach(r => {
        counts[r.channel_id] = r.unread_count;
      });
      setUnreadCounts(counts);
    }
  };

  const fetchCampaigns = async () => {
    // Try RPC first, fall back to direct query
    let result = await supabase.rpc('get_all_campaigns');
    if (result.error) {
      console.warn('RPC get_all_campaigns failed, trying direct query:', result.error.message);
      result = await supabase.from('campaigns').select('*').order('name');
    }
    console.log('Campaigns result:', result.data, result.error);
    if (result.data) setCampaigns(result.data);
  };

  const fetchChannels = async () => {
    // Try RPC first, fall back to direct query
    let result = await supabase.rpc('get_all_channels');
    if (result.error) {
      console.warn('RPC get_all_channels failed, trying direct query:', result.error.message);
      result = await supabase.from('channels').select('*').order('name');
    }
    const data = result.data;
    if (data) {
      setChannels(data);
      // Auto-expand user's campaign
      if (user?.campaign_id) {
        setExpandedCampaigns(prev => new Set(prev).add(user.campaign_id!));
      }
      // If admin, expand all
      if (user?.role === 'admin') {
        const ids = new Set((data as Channel[]).map(c => c.campaign_id));
        setExpandedCampaigns(ids);
      }
    }
  };

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !createForCampaign) return;
    const campaignId = user?.role === 'admin' ? createForCampaign : user?.campaign_id;
    if (!campaignId) return;

    await supabase.from('channels').insert({
      name: newChannelName.trim(),
      campaign_id: campaignId,
      created_by: user?.id,
    });

    setNewChannelName('');
    setShowCreateChannel(false);
    fetchChannels();
  };

  const handleSelectChannel = async (channel: Channel) => {
    onSelectChannel(channel);
    // Clear unread count locally
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[channel.id];
      return next;
    });
    // Mark as read in DB
    if (user) {
      await supabase.rpc('mark_channel_read', { p_user_id: user.id, p_channel_id: channel.id });
    }
  };

  const handleLogout = async () => {
    await supabase.from('users').update({ is_online: false }).eq('id', user?.id);
    await supabase.auth.signOut();
    router.push('/login');
  };

  const canCreateChannel = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'tl';

  const groupedChannels = campaigns.reduce((acc, campaign) => {
    acc[campaign.id] = channels.filter(c => c.campaign_id === campaign.id);
    return acc;
  }, {} as Record<string, Channel[]>);

  if (collapsed) {
    return (
      <div className="w-16 bg-surface border-r border-border flex flex-col items-center py-4 shrink-0">
        <Image
          src="/asiteamlinklogo.png"
          alt="Logo"
          width={36}
          height={36}
          className="rounded-lg mb-4"
        />
        <button
          onClick={onToggleCollapse}
          className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors mb-4"
          title="Expand sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          className="p-2 text-muted hover:text-danger rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/asiteamlinklogo.png"
            alt="Logo"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-bold text-foreground text-sm">AsiTeamLink</span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto p-2">
        {canCreateChannel && (
          <button
            onClick={() => setShowCreateChannel(!showCreateChannel)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors mb-1"
          >
            <Plus className="w-4 h-4" />
            Create Channel
          </button>
        )}

        {showCreateChannel && (
          <div className="mx-2 mb-3 p-3 bg-background border border-border rounded-lg">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Channel name"
              maxLength={100}
              className="w-full px-2 py-1.5 bg-surface border border-border rounded text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary mb-2"
            />
            {user?.role === 'admin' && (
              <select
                value={createForCampaign}
                onChange={(e) => setCreateForCampaign(e.target.value)}
                className="w-full px-2 py-1.5 bg-surface border border-border rounded text-sm text-foreground mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select campaign</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateChannel}
                className="flex-1 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs rounded font-medium transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateChannel(false)}
                className="flex-1 py-1.5 bg-surface-hover text-foreground text-xs rounded font-medium transition-colors hover:bg-border"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {campaigns.map(campaign => {
          const campaignChannels = groupedChannels[campaign.id] || [];
          // Non-admin users only see their own campaign
          if (user?.role !== 'admin' && user?.campaign_id !== campaign.id) return null;
          if (campaignChannels.length === 0 && user?.role !== 'admin') return null;

          return (
            <div key={campaign.id} className="mb-1">
              <button
                onClick={() => toggleCampaign(campaign.id)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted uppercase tracking-wider hover:text-foreground transition-colors"
              >
                {expandedCampaigns.has(campaign.id) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {campaign.name}
                {(() => {
                  const campaignUnread = campaignChannels.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);
                  return campaignUnread > 0 ? (
                    <span className="ml-auto bg-danger text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0">
                      {campaignUnread > 99 ? '99+' : campaignUnread}
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] font-normal bg-surface-hover px-1.5 py-0.5 rounded">
                      {campaignChannels.length}
                    </span>
                  );
                })()}
              </button>

              {expandedCampaigns.has(campaign.id) && (
                <div className="ml-2">
                  {campaignChannels.map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => handleSelectChannel(channel)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        selectedChannel?.id === channel.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{channel.name}</span>
                      {unreadCounts[channel.id] > 0 && selectedChannel?.id !== channel.id && (
                        <span className="ml-auto bg-primary text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0">
                          {unreadCounts[channel.id] > 99 ? '99+' : unreadCounts[channel.id]}
                        </span>
                      )}
                    </button>
                  ))}
                  {campaignChannels.length === 0 && (
                    <p className="text-xs text-muted px-3 py-1.5 italic">No channels yet</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom section - User info */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted capitalize">{user?.role === 'tl' ? 'Team Leader' : user?.role}</p>
          </div>
        </div>
        <div className="flex gap-1">
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/chat/admin')}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
              title="Admin Panel"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </button>
          )}
          <button
            onClick={() => router.push('/chat/settings')}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted hover:text-danger hover:bg-surface-hover rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
