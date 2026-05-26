'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';

interface Props {
  isOpen: boolean;
  campaignId: string;
  initialChannelId?: string;
  onClose: () => void;
  onCreated?: (created?: { campaign_id: string; channel_id: string | null; id?: string }) => void;
}

export function CreateAnnouncementModal({ isOpen, campaignId, initialChannelId, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCampaignId(campaignId);
    setSelectedChannelId(initialChannelId || '__all__');
    const loadCampaigns = async () => {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_all_campaigns');
        if (!rpcErr && Array.isArray(rpcData)) {
          setCampaigns(
            (rpcData as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }))
          );
          return;
        }
      } catch {}
      try {
        const { data, error } = await supabase.from('campaigns').select('id,name').order('name', { ascending: true });
        if (!error && data) setCampaigns(data as { id: string; name: string }[]);
      } catch {}
    };
    loadCampaigns();
  }, [isOpen, campaignId, initialChannelId, supabase]);

  useEffect(() => {
    if (!isOpen || !selectedCampaignId || !user) return;
    const loadChannels = async () => {
      try {
        let base = supabase
          .from('channels')
          .select('id,name,campaign_id')
          .eq('campaign_id', selectedCampaignId)
          .order('name', { ascending: true });
        if (user.role !== 'admin') {
          const { data: members, error: memErr } = await supabase
            .from('channel_members')
            .select('channel_id')
            .eq('user_id', user.id);
          if (memErr) {
            setChannels([]);
            return;
          }
          const channelIds = (members || []).map((m: { channel_id: string }) => m.channel_id).filter(Boolean);
          if (channelIds.length === 0) {
            setChannels([]);
            return;
          }
          base = base.in('id', channelIds as string[]);
        }
        const { data, error } = await base;
        if (error) {
          setChannels([]);
          return;
        }
        const list = (data || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
        setChannels(list);
        if (list.length > 0) {
          setSelectedChannelId((prev) => {
            if (prev === '__all__') return '__all__';
            if (prev && list.some((c) => c.id === prev)) return prev;
            if (initialChannelId && list.some((c) => c.id === initialChannelId)) return initialChannelId;
            return '__all__';
          });
        }
      } catch {
        setChannels([]);
      }
    };
    loadChannels();
  }, [isOpen, selectedCampaignId, user, initialChannelId, supabase]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!selectedCampaignId) return;
    if (!selectedChannelId) return;
    if (!title.trim() && !body.trim()) return;
    setLoading(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        setUploadingImage(true);
        const fd = new FormData();
        fd.append('file', imageFile);
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok || !uj?.url) {
          alert('Failed to upload image: ' + (uj?.error || up.statusText));
          setUploadingImage(false);
          setLoading(false);
          return;
        }
        imageUrl = uj.url;
        setUploadingImage(false);
      }

      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaignId,
          channel_id: selectedChannelId === '__all__' ? null : selectedChannelId,
          title: title.trim(),
          body: body.trim(),
          image_url: imageUrl,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert('Failed to create announcement: ' + (j?.error || res.statusText));
        return;
      }
      const created = await res.json().catch(() => ({}));
      setSuccess('Announcement posted successfully.');
      setTitle('');
      setBody('');
      setImageFile(null);
      onCreated?.({
        campaign_id: selectedCampaignId,
        channel_id: selectedChannelId === '__all__' ? null : selectedChannelId,
        id: created?.data?.id,
      });
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 900);
    } catch (e) {
      console.error(e);
      alert('Failed to create announcement');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (f: File | null) => {
    setImageFile(f);
  };
  const selectedCampaignName =
    campaigns.find((c) => c.id === selectedCampaignId)?.name || 'campaign';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="bg-surface border border-border rounded-lg p-4 w-full max-w-lg z-10">
        <h3 className="text-lg font-semibold mb-2">Post Announcement</h3>
        <select
          value={selectedCampaignId}
          onChange={(e) => {
            setSelectedCampaignId(e.target.value);
            setSelectedChannelId('__all__');
          }}
          className="w-full mb-2 p-2 border rounded bg-surface"
        >
          {(campaigns.length > 0 ? campaigns : [{ id: campaignId, name: 'Current Campaign' }]).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedChannelId}
          onChange={(e) => setSelectedChannelId(e.target.value)}
          className="w-full mb-2 p-2 border rounded bg-surface"
        >
          <option value="__all__">{`All ${selectedCampaignName} members`}</option>
          {channels.length === 0 && <option value="">No channel available</option>}
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full mb-2 p-2 border rounded"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Announcement body"
          className="w-full mb-3 p-2 border rounded h-28"
        />
        <div className="mb-3">
          {success && (
            <div className="mb-2 p-2 rounded-md bg-success/10 border border-success/30 text-success text-sm">
              {success}
            </div>
          )}
          <label className="text-xs text-muted">Optional image</label>
          <input type="file" accept="image/*" onChange={(e) => handleImageChange(e.target.files?.[0] || null)} className="block mt-1" />
          {uploadingImage && <div className="text-xs text-muted">Uploading image…</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-muted text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !selectedCampaignId || !selectedChannelId} className="px-3 py-2 rounded bg-primary text-white text-sm">
            {loading ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateAnnouncementModal;
