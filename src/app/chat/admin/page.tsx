'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  X,
  UserCog,
  Shield,
  Building2,
  Plus,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
} from 'lucide-react';
import type { User, Campaign, UserRole } from '@/lib/types';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<'users' | 'campaigns'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/chat');
    }
  }, [user, router]);

  useEffect(() => {
    fetchUsers();
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.rpc('get_all_users');
    if (data) setUsers(data);
  };

  const fetchCampaigns = async () => {
    const { data } = await supabase.rpc('get_all_campaigns');
    if (data) setCampaigns(data);
  };

  const handleApprove = async (userId: string) => {
    try {
      const res = await supabase.from('users').update({ status: 'approved' }).eq('id', userId);
      if (res.error) console.error('Supabase update error (users.status=approved):', res.error);
      else console.log('Supabase update success (users.status=approved):', res.data);
    } catch (err) {
      console.error('Unhandled error approving user:', err);
    }
    fetchUsers();
  };

  const handleReject = async (userId: string) => {
    try {
      const res = await supabase.from('users').update({ status: 'rejected' }).eq('id', userId);
      if (res.error) console.error('Supabase update error (users.status=rejected):', res.error);
      else console.log('Supabase update success (users.status=rejected):', res.data);
    } catch (err) {
      console.error('Unhandled error rejecting user:', err);
    }
    fetchUsers();
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      const res = await supabase.from('users').update({ role }).eq('id', userId);
      if (res.error) console.error('Supabase update error (users.role):', res.error);
      else console.log('Supabase update success (users.role):', res.data);
    } catch (err) {
      console.error('Unhandled error changing role:', err);
    }
    fetchUsers();
  };

  const handleCampaignAssign = async (userId: string, campaignId: string | null) => {
    try {
      const res = await supabase
        .from('users')
        .update({ campaign_id: campaignId || null })
        .eq('id', userId);
      if (res.error) console.error('Supabase update error (users.campaign_id):', res.error);
      else console.log('Supabase update success (users.campaign_id):', res.data);
    } catch (err) {
      console.error('Unhandled error assigning campaign:', err);
    }
    fetchUsers();
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return;
    try {
      const res = await supabase.from('campaigns').insert({ name: newCampaignName.trim() });
      if (res.error) console.error('Supabase insert error (campaigns):', res.error);
      else console.log('Supabase insert success (campaigns):', res.data);
    } catch (err) {
      console.error('Unhandled error creating campaign:', err);
    }
    setNewCampaignName('');
    fetchCampaigns();
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure? This will remove all channels in this campaign.')) return;
    try {
      const res = await supabase.from('campaigns').delete().eq('id', id);
      if (res.error) console.error('Supabase delete error (campaigns):', res.error);
      else console.log('Supabase delete success (campaigns):', res.data);
    } catch (err) {
      console.error('Unhandled error deleting campaign:', err);
    }
    fetchCampaigns();
  };

  const filteredUsers = users.filter(u => {
    if (filterStatus === 'all') return true;
    return u.status === filterStatus;
  });

  const pendingCount = users.filter(u => u.status === 'pending').length;

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/chat')}
            className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted">Manage users, campaigns, and roles</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'users'
                ? 'bg-primary text-white'
                : 'bg-surface text-muted hover:text-foreground hover:bg-surface-hover border border-border'
            }`}
          >
            <Users className="w-4 h-4" />
            Users
            {pendingCount > 0 && (
              <span className="bg-danger text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('campaigns')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'campaigns'
                ? 'bg-primary text-white'
                : 'bg-surface text-muted hover:text-foreground hover:bg-surface-hover border border-border'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Campaigns
          </button>
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div>
            {/* Status filter */}
            <div className="flex gap-2 mb-4">
              {(['all', 'pending', 'approved', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    filterStatus === status
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-surface text-muted hover:text-foreground border border-border'
                  }`}
                >
                  {status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                  {status === 'approved' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                  {status === 'rejected' && <XCircle className="w-3 h-3 inline mr-1" />}
                  {status} ({status === 'all' ? users.length : users.filter(u => u.status === status).length})
                </button>
              ))}
            </div>

            {/* Users table */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">User</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Role</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Campaign</th>
                    <th className="text-right text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-hover/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{u.name}</p>
                            <p className="text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          u.status === 'approved' ? 'bg-success/10 text-success' :
                          u.status === 'pending' ? 'bg-warning/10 text-warning' :
                          'bg-danger/10 text-danger'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.id === user.id ? (
                          <span className="text-xs text-muted italic">You (Admin)</span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                            className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="agent">Agent</option>
                            <option value="tl">Team Leader</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.campaign_id || ''}
                          onChange={(e) => handleCampaignAssign(u.id, e.target.value || null)}
                          className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">No Campaign</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleApprove(u.id)}
                              className="p-1.5 bg-success/10 text-success hover:bg-success/20 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReject(u.id)}
                              className="p-1.5 bg-danger/10 text-danger hover:bg-danger/20 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {u.status === 'rejected' && (
                          <button
                            onClick={() => handleApprove(u.id)}
                            className="p-1.5 bg-success/10 text-success hover:bg-success/20 rounded-lg transition-colors text-xs"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Campaigns Tab */}
        {tab === 'campaigns' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="New campaign name"
                maxLength={50}
                className="flex-1 max-w-xs px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCampaign()}
              />
              <button
                onClick={handleCreateCampaign}
                disabled={!newCampaignName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Create
              </button>
            </div>

            <div className="grid gap-3">
              {campaigns.map(campaign => {
                const memberCount = users.filter(u => u.campaign_id === campaign.id && u.status === 'approved').length;
                return (
                  <div
                    key={campaign.id}
                    className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{campaign.name}</p>
                        <p className="text-xs text-muted">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCampaign(campaign.id)}
                      className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="Delete campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {campaigns.length === 0 && (
                <div className="text-center py-8 text-muted text-sm">
                  No campaigns yet. Create one to get started.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
