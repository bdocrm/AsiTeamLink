'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';

interface Props {
  isOpen: boolean;
  campaignId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateAnnouncementModal({ isOpen, campaignId, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!user) return;
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
        body: JSON.stringify({ campaign_id: campaignId, title: title.trim(), body: body.trim(), image_url: imageUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert('Failed to create announcement: ' + (j?.error || res.statusText));
        return;
      }
      setTitle('');
      setBody('');
      setImageFile(null);
      onClose();
      onCreated && onCreated();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="bg-surface border border-border rounded-lg p-4 w-full max-w-lg z-10">
        <h3 className="text-lg font-semibold mb-2">Post Announcement</h3>
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
          <label className="text-xs text-muted">Optional image</label>
          <input type="file" accept="image/*" onChange={(e) => handleImageChange(e.target.files?.[0] || null)} className="block mt-1" />
          {uploadingImage && <div className="text-xs text-muted">Uploading image…</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-muted text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="px-3 py-2 rounded bg-primary text-white text-sm">
            {loading ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateAnnouncementModal;
