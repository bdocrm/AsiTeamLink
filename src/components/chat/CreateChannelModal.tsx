'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { X, Plus, Check } from 'lucide-react';
import type { User, Campaign } from '@/lib/types';

interface CreateChannelModalProps {
  isOpen: boolean;
  campaignId: string;
  onClose: () => void;
  onChannelCreated: (channelName: string) => void;
}

export function CreateChannelModal({ isOpen, campaignId, onClose, onChannelCreated }: CreateChannelModalProps) {
  const { user } = useAuth();
  const [channelName, setChannelName] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId);
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const supabase = createClient();

  // Fetch campaigns for admins
  useEffect(() => {
    if (!isOpen || user?.role !== 'admin') return;

    const fetchCampaigns = async () => {
      try {
        const { data } = await supabase.rpc('get_all_campaigns');
        if (data) {
          setAvailableCampaigns(data as Campaign[]);
          if (data.length > 0 && !selectedCampaignId) {
            setSelectedCampaignId((data[0] as Campaign).id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch campaigns:', err);
      }
    };

    fetchCampaigns();
  }, [isOpen, user?.role]);

  // Fetch all available members when campaign is selected
  useEffect(() => {
    if (!isOpen) return;

    const fetchAllMembers = async () => {
      try {
        // Fetch all users, not restricted by campaign
        const { data } = await supabase
          .from('users')
          .select('id, name, email, role, campaign_id')
          .order('name', { ascending: true });
        if (data) {
          // Filter out current user
          const others = (data as User[]).filter(m => m.id !== user?.id);
          setAvailableMembers(others);
        }
      } catch (err) {
        console.error('Failed to fetch members:', err);
      }
    };

    fetchAllMembers();
  }, [isOpen, user?.id]);

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      setError('Channel name is required');
      return;
    }

    if (!selectedCampaignId) {
      setError('Please select a campaign');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const memberIds = Array.from(selectedMembers);
      const result = await supabase.rpc('create_channel_with_members', {
        p_channel_name: channelName,
        p_campaign_id: selectedCampaignId,
        p_member_ids: memberIds,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to create channel');
        return;
      }

      // RPC returns data directly
      const data = result.data;
      if (data?.error) {
        setError(data.error);
        return;
      }

      const memberCount = data?.member_count || selectedMembers.size + 1;
      setSuccess(`✓ Channel '${channelName}' created with ${memberCount} member${memberCount !== 1 ? 's' : ''}!`);
      setTimeout(() => {
        onChannelCreated(channelName);
        setChannelName('');
        setSelectedMembers(new Set());
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to create channel');
      console.error('Channel creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (userId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedMembers(newSelected);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-lg font-semibold text-foreground">Create Channel</h2>
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
          {/* Channel Name Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Channel Name
            </label>
            <input
              type="text"
              placeholder="e.g., Q1 Planning, Team Updates"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* Campaign Selection (Admins Only) */}
          {user?.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Campaign
              </label>
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">Select a campaign...</option>
                {availableCampaigns.map(campaign => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Member Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Add Members ({selectedMembers.size}/{availableMembers.length})
            </label>
            <input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary mb-2"
            />
            <div className="border border-border rounded-lg bg-background max-h-48 overflow-y-auto">
              {availableMembers.length === 0 ? (
                <div className="p-4 text-center text-muted text-sm">
                  No members available in this campaign
                </div>
              ) : (
                availableMembers
                  .filter(member =>
                    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    member.email.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(member => (
                  <button
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-border/30 hover:bg-surface-hover transition-colors text-left last:border-b-0 ${
                      selectedMembers.has(member.id) ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedMembers.has(member.id)
                        ? 'bg-primary border-primary'
                        : 'border-border'
                    }`}>
                      {selectedMembers.has(member.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-muted">{member.email}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface border border-border text-muted">
                      {member.role}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
              ✓ {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 bg-background/50 flex gap-2 sticky bottom-0">
          <button
            onClick={() => {
              onClose();
              setSearchTerm('');
            }}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-surface border border-border text-foreground rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateChannel}
            disabled={loading || !channelName.trim()}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
