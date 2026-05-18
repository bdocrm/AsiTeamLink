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
  Eye,
} from 'lucide-react';
import type { Channel, Campaign } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { CreateChannelModal } from './CreateChannelModal';

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
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [selectedCampaignForCreate, setSelectedCampaignForCreate] = useState<string>('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchChannels();
    fetchCampaigns();
    if (user) fetchUnreadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const handler = () => fetchChannels();
    window.addEventListener('channelsUpdated', handler as EventListener);
    return () => window.removeEventListener('channelsUpdated', handler as EventListener);
  }, []);

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
          if (msg.sender_id === user.id) return;

          if (msg.channel_id !== selectedChannel?.id) {
            setUnreadCounts(prev => ({
              ...prev,
              [msg.channel_id]: (prev[msg.channel_id] || 0) + 1,
            }));
          }

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
    let result = await supabase.rpc('get_all_campaigns');
    if (result.error) {
      console.warn('RPC get_all_campaigns failed, trying direct query:', result.error.message);
      result = await supabase.from('campaigns').select('*').order('name');
    }
    if (result.data) setCampaigns(result.data);
  };

  const fetchChannels = async () => {
    let result = await supabase.rpc('get_my_channels');
    if (result.error) {
      console.warn('RPC get_my_channels failed:', result.error.message);
      result = await supabase.from('channels').select('*').order('name');
    }
    const data = result.data;
    if (data) {
      setChannels(data);
      if (user?.campaign_id) {
        setExpandedCampaigns(prev => new Set(prev).add(user.campaign_id!));
      }
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

  const handleChannelCreated = () => {
    setShowCreateChannelModal(false);
    setSelectedCampaignForCreate('');
    fetchChannels();
  };

  const handleSelectChannel = async (channel: Channel) => {
    onSelectChannel(channel);
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[channel.id];
      return next;
    });
    if (user) {
      await supabase.rpc('mark_channel_read', { p_user_id: user.id, p_channel_id: channel.id });
    }
  };

  const handleLogout = async () => {
    try {
      const result = await supabase.from('users').update({ is_online: false }).eq('id', user?.id);
      if (result.error) {
        console.error('Supabase update error (users.is_online):', result.error);
      }
    } catch (err) {
      console.error('Unhandled error updating users.is_online:', err);
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    }
    router.push('/login');
  };

  const canCreateChannel = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'tl';

  const groupedChannels = campaigns.reduce((acc, campaign) => {
    acc[campaign.id] = channels.filter(c => c.campaign_id === campaign.id);
    return acc;
  }, {} as Record<string, Channel[]>);

  // Collapsed sidebar
  if (collapsed) {
    return (
      <div className="w-[68px] bg-surface border-r border-border flex flex-col items-center py-4 shrink-0 relative">
        {/* Top gradient stripe */}
        <div className="sidebar-gradient-stripe absolute top-0 left-0 right-0" />

        <div className="mb-5 mt-1">
          <Image
            src="/asiteamlinklogo.png"
            alt="Logo"
            width={36}
            height={36}
            className="rounded-xl"
          />
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-2.5 text-muted hover:text-primary hover:bg-primary-light rounded-xl transition-all duration-200 mb-4"
          title="Expand sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        <div className="flex-1" />

        {/* Bottom user avatar */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-9 h-9 rounded-full avatar-gradient flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-muted hover:text-danger rounded-xl transition-all duration-200"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[272px] bg-surface border-r border-border flex flex-col shrink-0 relative h-full">
      {/* Top gradient stripe */}
      <div className="sidebar-gradient-stripe absolute top-0 left-0 right-0 z-10" />

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image
            src="/asiteamlinklogo.png"
            alt="Logo"
            width={34}
            height={34}
            className="rounded-xl"
          />
          <span className="font-bold text-foreground text-[15px] gradient-brand-text">AsiTeamLink</span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-all duration-200"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {canCreateChannel && (
          <button
            onClick={() => {
              const campaignId = user?.role === 'admin' ? '' : user?.campaign_id;
              setSelectedCampaignForCreate(campaignId || '');
              setShowCreateChannelModal(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-primary hover:bg-primary-light rounded-xl transition-all duration-200 mb-2 group"
          >
            <div className="w-6 h-6 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Plus className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-medium">Create Channel</span>
          </button>
        )}

        {campaigns.map(campaign => {
          const campaignChannels = groupedChannels[campaign.id] || [];
          if (user?.role !== 'admin' && user?.campaign_id !== campaign.id) return null;
          if (campaignChannels.length === 0 && user?.role !== 'admin') return null;

          const campaignUnread = campaignChannels.reduce((sum, ch) => sum + (unreadCounts[ch.id] || 0), 0);

          return (
            <div key={campaign.id} className="mb-1">
              <button
                onClick={() => toggleCampaign(campaign.id)}
                className="w-full flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-muted uppercase tracking-wider hover:text-foreground rounded-lg transition-all duration-200 group"
              >
                <div className="transition-transform duration-200">
                  {expandedCampaigns.has(campaign.id) ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </div>
                <span className="flex-1 text-left">{campaign.name}</span>
                {campaignUnread > 0 ? (
                  <span className="unread-badge">
                    {campaignUnread > 99 ? '99+' : campaignUnread}
                  </span>
                ) : (
                  <span className="text-[10px] font-normal bg-surface-hover px-1.5 py-0.5 rounded-md opacity-60 group-hover:opacity-100 transition-opacity">
                    {campaignChannels.length}
                  </span>
                )}
              </button>

              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                  maxHeight: expandedCampaigns.has(campaign.id) ? `${(campaignChannels.length + 1) * 40 + 20}px` : '0',
                  opacity: expandedCampaigns.has(campaign.id) ? 1 : 0,
                }}
              >
                <div className="ml-1 py-0.5">
                  {campaignChannels.map(channel => {
                    const isActive = selectedChannel?.id === channel.id;
                    const hasUnread = unreadCounts[channel.id] > 0 && !isActive;

                    return (
                      <button
                        key={channel.id}
                        onClick={() => handleSelectChannel(channel)}
                        className={`channel-item w-full flex items-center gap-2.5 px-3 py-[7px] text-sm transition-all duration-200 ${
                          isActive
                            ? 'active text-primary font-semibold'
                            : hasUnread
                            ? 'text-foreground font-medium hover:bg-surface-hover'
                            : 'text-muted hover:text-foreground hover:bg-surface-hover'
                        }`}
                      >
                        <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                        <span className="truncate flex-1 text-left">{channel.name}</span>
                        {hasUnread && (
                          <span className="unread-badge">
                            {unreadCounts[channel.id] > 99 ? '99+' : unreadCounts[channel.id]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {campaignChannels.length === 0 && (
                    <p className="text-xs text-muted px-3 py-2 italic opacity-60">No channels yet</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom section - User info */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <div className="w-9 h-9 rounded-full avatar-gradient flex items-center justify-center text-sm font-bold shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted capitalize">{user?.role === 'tl' ? 'Team Leader' : user?.role}</p>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-success shrink-0 animate-glow-pulse" />
        </div>
        <div className="flex gap-1">
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/chat/admin')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-secondary hover:bg-secondary-light rounded-xl transition-all duration-200 font-medium"
              title="Admin Panel"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </button>
          )}
          {(user?.role === 'compliance' || user?.role === 'admin') && (
            <button
              onClick={() => router.push('/compliance')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-secondary hover:bg-secondary-light rounded-xl transition-all duration-200 font-medium"
              title="Compliance Audit"
            >
              <Eye className="w-3.5 h-3.5" />
              Audit
            </button>
          )}
          <button
            onClick={() => router.push('/chat/settings')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-foreground hover:bg-surface-hover rounded-xl transition-all duration-200 font-medium"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-danger hover:bg-danger/5 rounded-xl transition-all duration-200 font-medium"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      {/* Create Channel Modal */}
      <CreateChannelModal
        isOpen={showCreateChannelModal}
        campaignId={selectedCampaignForCreate}
        onClose={() => setShowCreateChannelModal(false)}
        onChannelCreated={handleChannelCreated}
      />
    </div>
  );
}
