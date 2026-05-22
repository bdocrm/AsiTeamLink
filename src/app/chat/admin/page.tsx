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
  Lock,
  KeyRound,
} from 'lucide-react';
import type { User, Campaign, UserRole } from '@/lib/types';

interface PasswordResetRequest {
  id: string;
  user_id: string;
  status: 'pending' | 'completed' | 'rejected';
  requested_at: string;
  resolved_at?: string;
  user_name?: string;
  user_email?: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<'users' | 'campaigns' | 'password-reset'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [renameChannelModal, setRenameChannelModal] = useState<{ isOpen: boolean; channelId: string; channelName: string; isLoading: boolean; message?: string }>({ isOpen: false, channelId: '', channelName: '', isLoading: false });
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  
  // Reset password confirmation modal
  const [resetPasswordModal, setResetPasswordModal] = useState<{
    isOpen: boolean;
    requestId: string;
    userId: string;
    userName: string;
    userEmail: string;
    isLoading: boolean;
    message?: string;
    temporaryPassword?: string;
    manualPassword?: string;
    manualPasswordConfirm?: string;
  }>({
    isOpen: false,
    requestId: '',
    userId: '',
    userName: '',
    userEmail: '',
    isLoading: false,
  });
  
  // Direct set/change password modal (from users table)
  const [setPasswordModal, setSetPasswordModal] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
    userEmail: string;
    password?: string;
    passwordConfirm?: string;
    isLoading: boolean;
    message?: string;
  }>({ isOpen: false, userId: '', userName: '', userEmail: '', isLoading: false });

  // Role change modal state
  const [roleChangeModal, setRoleChangeModal] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
    currentRole: UserRole;
    newRole: UserRole;
    isLoading: boolean;
    message?: string;
  }>({
    isOpen: false,
    userId: '',
    userName: '',
    currentRole: 'agent',
    newRole: 'agent',
    isLoading: false,
  });

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/chat');
    }
  }, [user, router]);

  useEffect(() => {
    fetchUsers();
    fetchCampaigns();
    fetchPasswordResetRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const [channelListModal, setChannelListModal] = useState<{ isOpen: boolean; campaignId: string; channels: any[]; isLoading: boolean; message?: string }>({ isOpen: false, campaignId: '', channels: [], isLoading: false });

  const openChannelListModal = async (campaignId: string) => {
    setChannelListModal({ isOpen: true, campaignId, channels: [], isLoading: true });
    try {
      const { data, error } = await supabase.from('channels').select('*').eq('campaign_id', campaignId).order('name');
      if (error) {
        console.error('Failed to load channels for campaign:', error);
        setChannelListModal(prev => ({ ...prev, message: 'Failed to load channels', isLoading: false }));
        return;
      }
      setChannelListModal(prev => ({ ...prev, channels: data || [], isLoading: false }));
    } catch (err) {
      console.error('Unhandled error loading channels for campaign:', err);
      setChannelListModal(prev => ({ ...prev, message: 'Error', isLoading: false }));
    }
  };

  const closeChannelListModal = () => {
    setChannelListModal({ isOpen: false, campaignId: '', channels: [], isLoading: false });
  };

  const fetchUsers = async () => {
    const { data } = await supabase.rpc('get_all_users');
    if (data) setUsers(data);
  };

  const fetchCampaigns = async () => {
    const { data } = await supabase.rpc('get_all_campaigns');
    if (data) setCampaigns(data);
  };

  const fetchPasswordResetRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('password_reset_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) {
        console.error('Error fetching password reset requests:', error);
        return;
      }

      // Enrich with user information
      if (data) {
        const enrichedRequests = await Promise.all(
          data.map(async (req: PasswordResetRequest) => {
            const { data: userProfile } = await supabase
              .from('users')
              .select('name, email')
              .eq('id', req.user_id)
              .single();

            return {
              ...req,
              user_name: userProfile?.name || 'Unknown',
              user_email: userProfile?.email || 'Unknown',
            };
          })
        );
        setPasswordResetRequests(enrichedRequests);
      }
    } catch (err) {
      console.error('Unhandled error fetching password reset requests:', err);
    }
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
    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;
    
    setRoleChangeModal({
      isOpen: true,
      userId,
      userName: selectedUser.name,
      currentRole: selectedUser.role,
      newRole: role,
      isLoading: false,
    });
  };

  const confirmRoleChange = async () => {
    setRoleChangeModal(prev => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: roleChangeModal.userId, role: roleChangeModal.newRole }),
      });

      const result = await res.json();
      
      if (!res.ok) {
        console.error('Role update error:', result.error);
        setRoleChangeModal(prev => ({ ...prev, message: '❌ Error: ' + result.error, isLoading: false }));
        return;
      }

      console.log('Role updated successfully:', result.data);
      setRoleChangeModal(prev => ({ ...prev, message: '✅ Role updated successfully!', isLoading: false }));
      setTimeout(() => {
        setRoleChangeModal(prev => ({ ...prev, isOpen: false }));
        fetchUsers();
      }, 1500);
    } catch (err) {
      console.error('Unhandled error changing role:', err);
      setRoleChangeModal(prev => ({ ...prev, message: '❌ Error updating role', isLoading: false }));
    }
  };

  const closeRoleChangeModal = () => {
    if (!roleChangeModal.isLoading) {
      setRoleChangeModal(prev => ({ ...prev, isOpen: false, message: undefined }));
    }
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

  const handleResetPassword = async (userId: string, userEmail: string) => {
    // Open set-password modal so admin can manually set/change the password
    const selectedUser = users.find(u => u.id === userId);
    setSetPasswordModal({
      isOpen: true,
      userId,
      userName: selectedUser?.name || 'Unknown',
      userEmail: selectedUser?.email || userEmail,
      password: '',
      passwordConfirm: '',
      isLoading: false,
    });
  };

  const openResetPasswordModal = (request: PasswordResetRequest) => {
    setResetPasswordModal({
      isOpen: true,
      requestId: request.id,
      userId: request.user_id,
      userName: request.user_name || 'Unknown',
      userEmail: request.user_email || 'Unknown',
      isLoading: false,
    });
  };

  const confirmResetPassword = async () => {
    // Basic validation for manual password confirmation
    if (resetPasswordModal.manualPassword && resetPasswordModal.manualPassword !== resetPasswordModal.manualPasswordConfirm) {
      setResetPasswordModal(prev => ({ ...prev, message: 'Passwords do not match', isLoading: false }));
      return;
    }

    setResetPasswordModal(prev => ({ ...prev, isLoading: true }));
    try {
      const body: any = { requestId: resetPasswordModal.requestId, userId: resetPasswordModal.userId };
      if (resetPasswordModal.manualPassword && resetPasswordModal.manualPassword.length > 0) {
        body.manualPassword = resetPasswordModal.manualPassword;
      }

      const response = await fetch('/api/admin/reset-password-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Reset password error:', result.error);
        setResetPasswordModal(prev => ({ 
          ...prev, 
          message: '❌ Error: ' + result.error,
          isLoading: false 
        }));
        return;
      }

      console.log('Password reset successful:', result);
      const shownPassword = result.temporaryPassword || result.manualPassword || '';
      setResetPasswordModal(prev => ({ 
        ...prev, 
        message: `✅ Password reset successfully!\n\nTemporary Password:\n${shownPassword}\n\nShare this with the user securely.`,
        temporaryPassword: shownPassword,
        isLoading: false 
      }));

      setTimeout(() => {
        setResetPasswordModal(prev => ({ ...prev, isOpen: false, message: undefined, temporaryPassword: undefined }));
        fetchPasswordResetRequests();
      }, 3000);
    } catch (err) {
      console.error('Unhandled error resetting password:', err);
      setResetPasswordModal(prev => ({ 
        ...prev, 
        message: '❌ Error resetting password',
        isLoading: false 
      }));
    }
  };

  const closeResetPasswordModal = () => {
    if (!resetPasswordModal.isLoading) {
      setResetPasswordModal(prev => ({ ...prev, isOpen: false, message: undefined, temporaryPassword: undefined }));
    }
  };

  const openSetPasswordModal = (userId: string, userEmail: string, userName: string) => {
    setSetPasswordModal({ isOpen: true, userId, userName, userEmail, password: '', passwordConfirm: '', isLoading: false });
  };

  const confirmSetPassword = async () => {
    if (!setPasswordModal.password || setPasswordModal.password !== setPasswordModal.passwordConfirm) {
      setSetPasswordModal(prev => ({ ...prev, message: 'Passwords must match', isLoading: false }));
      return;
    }
    setSetPasswordModal(prev => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/admin/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: setPasswordModal.userId, password: setPasswordModal.password }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSetPasswordModal(prev => ({ ...prev, message: '❌ ' + (result.error || 'Failed'), isLoading: false }));
        return;
      }
      setSetPasswordModal(prev => ({ ...prev, message: '✅ Password updated', isLoading: false }));
      setTimeout(() => setSetPasswordModal({ isOpen: false, userId: '', userName: '', userEmail: '', isLoading: false }), 1500);
    } catch (err) {
      console.error('Unhandled error setting password:', err);
      setSetPasswordModal(prev => ({ ...prev, message: '❌ Error', isLoading: false }));
    }
  };

  const closeSetPasswordModal = () => {
    if (!setPasswordModal.isLoading) setSetPasswordModal({ isOpen: false, userId: '', userName: '', userEmail: '', isLoading: false });
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

  const openRenameChannelModal = (channelId: string, currentName: string) => {
    setRenameChannelModal({ isOpen: true, channelId, channelName: currentName, isLoading: false });
  };

  const confirmRenameChannel = async () => {
    if (!renameChannelModal.channelName.trim()) {
      setRenameChannelModal(prev => ({ ...prev, message: 'Name cannot be empty' }));
      return;
    }
    setRenameChannelModal(prev => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/admin/rename-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: renameChannelModal.channelId, newName: renameChannelModal.channelName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Rename API error:', data.error);
        setRenameChannelModal(prev => ({ ...prev, message: 'Failed to rename channel: ' + (data.error || ''), isLoading: false }));
        return;
      }
      setRenameChannelModal(prev => ({ ...prev, message: '✅ Renamed', isLoading: false }));
      try { window.dispatchEvent(new CustomEvent('channelsUpdated')); } catch {}
      setTimeout(() => {
        setRenameChannelModal({ isOpen: false, channelId: '', channelName: '', isLoading: false });
        fetchCampaigns();
      }, 800);
    } catch (err) {
      console.error('Unhandled error renaming channel:', err);
      setRenameChannelModal(prev => ({ ...prev, message: 'Error', isLoading: false }));
    }
  };

  const closeRenameChannelModal = () => {
    if (!renameChannelModal.isLoading) setRenameChannelModal({ isOpen: false, channelId: '', channelName: '', isLoading: false });
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
          <button
            onClick={() => setTab('password-reset')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'password-reset'
                ? 'bg-primary text-white'
                : 'bg-surface text-muted hover:text-foreground hover:bg-surface-hover border border-border'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Password Reset
            {passwordResetRequests.length > 0 && (
              <span className="bg-warning text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {passwordResetRequests.length}
              </span>
            )}
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
                            {((u.name || '') + '').charAt(0).toUpperCase()}
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
                            <option value="compliance">Compliance</option>
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
                        {u.status === 'approved' && (
                          <button
                            onClick={() => handleResetPassword(u.id, u.email)}
                            className="p-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                            title="Reset Password"
                          >
                            <Lock className="w-4 h-4" />
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                        title="Delete campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          // fetch channels for campaign and prompt rename
                          const { data } = await supabase.from('channels').select('*').eq('campaign_id', campaign.id).order('name');
                          const ch = data && data.length > 0 ? data[0] : null;
                          if (!ch) {
                            alert('No channels available in this campaign to rename');
                            return;
                          }
                          // open rename modal for the first channel as a quick action — admin can use Sidebar to rename others
                          openRenameChannelModal(ch.id, ch.name);
                        }}
                        className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                        title="Rename a channel (quick)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                      </button>
                      <button
                        onClick={() => openChannelListModal(campaign.id)}
                        className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                        title="Manage channels"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                      </button>
                    </div>
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

        {/* Password Reset Requests Tab */}
        {tab === 'password-reset' && (
          <div>
            <div className="space-y-3">
              {passwordResetRequests.length > 0 ? (
                passwordResetRequests.map(request => (
                  <div
                    key={request.id}
                    className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                        <KeyRound className="w-5 h-5 text-warning" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{request.user_name}</p>
                        <p className="text-xs text-muted">{request.user_email}</p>
                        <p className="text-xs text-muted mt-1">
                          Requested: {new Date(request.requested_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-warning/10 text-warning text-xs font-medium rounded-full">
                          Pending
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => openResetPasswordModal(request)}
                      className="ml-4 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4" />
                      Reset Password
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted">
                  <KeyRound className="w-12 h-12 text-muted/20 mx-auto mb-3" />
                  <p className="text-sm">No pending password reset requests</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Role Change Modal */}
      {roleChangeModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="border-b border-border px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserCog className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Change User Role</h2>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {!roleChangeModal.message ? (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-muted mb-1">User</p>
                    <p className="text-base font-medium text-foreground">{roleChangeModal.userName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-background/50 border border-border rounded-lg p-3">
                      <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Current Role</p>
                      <p className="text-sm font-medium text-foreground capitalize">{roleChangeModal.currentRole}</p>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                      <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">New Role</p>
                      <p className="text-sm font-medium text-primary capitalize">{roleChangeModal.newRole}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted mb-6">
                    Are you sure you want to change <strong>{roleChangeModal.userName}'s</strong> role to <strong className="text-primary capitalize">{roleChangeModal.newRole}</strong>?
                  </p>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-base font-medium text-foreground">{roleChangeModal.message}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-4 flex gap-2 justify-end">
              {!roleChangeModal.message && (
                <>
                  <button
                    onClick={closeRoleChangeModal}
                    disabled={roleChangeModal.isLoading}
                    className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRoleChange}
                    disabled={roleChangeModal.isLoading}
                    className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {roleChangeModal.isLoading && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {roleChangeModal.isLoading ? 'Updating...' : 'Confirm'}
                  </button>
                </>
              )}
              {roleChangeModal.message && (
                <button
                  onClick={closeRoleChangeModal}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors w-full"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Set/Change Password Modal (direct) */}
      {setPasswordModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="border-b border-border px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Set / Change User Password</h2>
            </div>

            <div className="px-6 py-6">
              {!setPasswordModal.message ? (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-muted mb-1">User</p>
                    <p className="text-base font-medium text-foreground">{setPasswordModal.userName}</p>
                    <p className="text-xs text-muted">{setPasswordModal.userEmail}</p>
                  </div>

                  <div className="grid gap-2">
                    <input
                      type="password"
                      placeholder="New password"
                      value={setPasswordModal.password || ''}
                      onChange={(e) => setSetPasswordModal(prev => ({ ...prev, password: e.target.value }))}
                      className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={setPasswordModal.passwordConfirm || ''}
                      onChange={(e) => setSetPasswordModal(prev => ({ ...prev, passwordConfirm: e.target.value }))}
                      className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-base font-medium text-foreground">{setPasswordModal.message}</p>
                </div>
              )}
            </div>

            <div className="border-t border-border px-6 py-4 flex gap-2 justify-end">
              {!setPasswordModal.message && (
                <>
                  <button
                    onClick={closeSetPasswordModal}
                    disabled={setPasswordModal.isLoading}
                    className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSetPassword}
                    disabled={setPasswordModal.isLoading}
                    className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {setPasswordModal.isLoading && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {setPasswordModal.isLoading ? 'Setting...' : 'Set Password'}
                  </button>
                </>
              )}
              {setPasswordModal.message && (
                <button
                  onClick={closeSetPasswordModal}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors w-full"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rename Channel Modal */}
      {renameChannelModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <div className="border-b border-border px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground">Rename Channel</h2>
            </div>

            <div className="px-6 py-6">
              {!renameChannelModal.message ? (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-muted mb-1">Channel</p>
                    <input
                      type="text"
                      value={renameChannelModal.channelName}
                      onChange={(e) => setRenameChannelModal(prev => ({ ...prev, channelName: e.target.value }))}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-base font-medium text-foreground">{renameChannelModal.message}</p>
                </div>
              )}
            </div>

            <div className="border-t border-border px-6 py-4 flex gap-2 justify-end">
              {!renameChannelModal.message && (
                <>
                  <button
                    onClick={closeRenameChannelModal}
                    disabled={renameChannelModal.isLoading}
                    className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRenameChannel}
                    disabled={renameChannelModal.isLoading}
                    className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {renameChannelModal.isLoading && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {renameChannelModal.isLoading ? 'Renaming...' : 'Rename'}
                  </button>
                </>
              )}
              {renameChannelModal.message && (
                <button
                  onClick={closeRenameChannelModal}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors w-full"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Channel List Modal */}
      {channelListModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full animate-in zoom-in-95 duration-200">
            <div className="border-b border-border px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Channels</h2>
            </div>

            <div className="px-6 py-4">
              {channelListModal.isLoading && <p className="text-sm text-muted">Loading channels…</p>}
              {!channelListModal.isLoading && channelListModal.channels.length === 0 && (
                <p className="text-sm text-muted">No channels found for this campaign.</p>
              )}
              {!channelListModal.isLoading && channelListModal.channels.length > 0 && (
                <div className="space-y-2">
                  {channelListModal.channels.map(ch => (
                    <div key={ch.id} className="flex items-center justify-between p-2 border border-border rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{ch.name}</p>
                        <p className="text-xs text-muted">{ch.id}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openRenameChannelModal(ch.id, ch.name)}
                          className="px-3 py-1 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20"
                        >
                          Rename
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete channel "' + ch.name + '"? This is permanent.')) return;
                            try {
                              const res = await fetch('/api/admin/delete-channel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId: ch.id, reason: 'Deleted by admin via UI', permanent: true }),
                              });
                              const data = await res.json();
                              if (!res.ok) {
                                console.error('Delete channel error:', data.error);
                                alert('Failed to delete channel: ' + (data.error || ''));
                                return;
                              }
                              try { window.dispatchEvent(new CustomEvent('channelsUpdated')); } catch {}
                              // remove from local list
                              setChannelListModal(prev => ({ ...prev, channels: prev.channels.filter(c => c.id !== ch.id) }));
                            } catch (err) {
                              console.error('Unhandled error deleting channel:', err);
                              alert('Error deleting channel');
                            }
                          }}
                          className="px-3 py-1 text-sm bg-danger/10 text-danger rounded-md hover:bg-danger/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border px-6 py-4 flex gap-2 justify-end">
              <button onClick={closeChannelListModal} className="px-4 py-2 bg-surface border border-border rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="border-b border-border px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-warning" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Reset User Password</h2>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              {!resetPasswordModal.message ? (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-muted mb-1">User</p>
                    <p className="text-base font-medium text-foreground">{resetPasswordModal.userName}</p>
                    <p className="text-xs text-muted">{resetPasswordModal.userEmail}</p>
                  </div>

                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-4">
                    <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Action</p>
                    <p className="text-sm font-medium text-warning">Generate & Set Temporary Password</p>
                    <p className="text-xs text-muted mt-1">Or enter a password manually to set it yourself.</p>
                  </div>

                  <div className="grid gap-2 mb-4">
                    <input
                      type="password"
                      placeholder="Manual password (optional)"
                      value={resetPasswordModal.manualPassword || ''}
                      onChange={(e) => setResetPasswordModal(prev => ({ ...prev, manualPassword: e.target.value }))}
                      className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="Confirm manual password"
                      value={resetPasswordModal.manualPasswordConfirm || ''}
                      onChange={(e) => setResetPasswordModal(prev => ({ ...prev, manualPasswordConfirm: e.target.value }))}
                      className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none"
                    />
                  </div>

                  <p className="text-sm text-muted mb-6">
                    A new temporary password will be generated if you leave the fields empty. If you enter a manual password, it will be set for <strong>{resetPasswordModal.userName}</strong>.
                  </p>
                </>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-4 text-success">✅</div>
                  <p className="text-sm font-medium text-foreground whitespace-pre-line">
                    {resetPasswordModal.message}
                  </p>
                  {resetPasswordModal.temporaryPassword && (
                    <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                      <p className="text-xs text-muted uppercase font-semibold mb-1">Temporary Password</p>
                      <p className="text-sm font-mono text-success font-bold select-all">
                        {resetPasswordModal.temporaryPassword}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-4 flex gap-2 justify-end">
              {!resetPasswordModal.message && (
                <>
                  <button
                    onClick={closeResetPasswordModal}
                    disabled={resetPasswordModal.isLoading}
                    className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmResetPassword}
                    disabled={resetPasswordModal.isLoading}
                    className="px-4 py-2 text-white bg-warning hover:bg-warning-hover rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {resetPasswordModal.isLoading && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {resetPasswordModal.isLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              )}
              {resetPasswordModal.message && (
                <button
                  onClick={closeResetPasswordModal}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors w-full"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
