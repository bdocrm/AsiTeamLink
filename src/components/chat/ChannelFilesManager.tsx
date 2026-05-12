'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { X, Download, Trash2, Image, File, FileText, Music, Video } from 'lucide-react';
import type { Channel } from '@/lib/types';

interface ChannelFilesManagerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

interface FileAttachment {
  message_id: string;
  sender_id: string;
  sender_name: string;
  attachment_url: string;
  attachment_name: string;
  attachment_size: number | null;
  created_at: string;
}

export function ChannelFilesManager({ channel, isOpen, onClose }: ChannelFilesManagerProps) {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const supabase = createClient();

  // Fetch attachments
  useEffect(() => {
    if (!isOpen) return;
    fetchFiles();
  }, [isOpen, channel.id]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError('');
      const { data, error: err } = await supabase
        .from('messages')
        .select('id, sender_id, attachment_url, attachment_name, attachment_size, created_at')
        .eq('channel_id', channel.id)
        .not('attachment_url', 'is', null)
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message);
        return;
      }

      // Fetch sender data separately to avoid relationship ambiguity
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      let senderMap: { [key: string]: string } = {};

      if (senderIds.length > 0) {
        const { data: senders } = await supabase
          .from('users')
          .select('id, name')
          .in('id', senderIds);

        senderMap = (senders || []).reduce((acc, u) => {
          acc[u.id] = u.name;
          return acc;
        }, {} as { [key: string]: string });
      }

      const formattedFiles = (data || []).map(m => ({
        message_id: m.id,
        sender_id: m.sender_id,
        sender_name: senderMap[m.sender_id] || 'Unknown',
        attachment_url: m.attachment_url,
        attachment_name: m.attachment_name,
        attachment_size: m.attachment_size,
        created_at: m.created_at,
      }));

      setFiles(formattedFiles);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: FileAttachment) => {
    try {
      // Log the download via API
      const res = await fetch('/api/compliance/log-file-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'download',
          fileName: file.attachment_name,
          fileSize: file.attachment_size || 0,
          channelId: channel.id,
          status: 'success',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.warn('[AUDIT] Failed to log file download:', data.error);
      } else {
        console.log('[AUDIT] File download logged:', data);
      }
    } catch (err) {
      console.warn('[AUDIT] Failed to log download:', err);
      // Don't block download if logging fails
    }
  };

  const handleDeleteFile = async (messageId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"?`)) return;

    try {
      setDeleting(messageId);

      // Delete from storage
      const { error: storageErr } = await supabase.storage.from('attachments').remove([fileName]);
      if (storageErr) {
        console.warn('Storage delete warning:', storageErr);
      }

      // Update message to remove attachment
      const { error: updateErr } = await supabase
        .from('messages')
        .update({
          attachment_url: null,
          attachment_name: null,
          attachment_size: null,
        })
        .eq('id', messageId);

      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      // Log file deletion via API
      try {
        const file = files.find(f => f.message_id === messageId);
        if (file) {
          // Log to file_audit_logs
          const fileRes = await fetch('/api/compliance/log-file-operation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'delete',
              fileName: file.attachment_name,
              fileSize: file.attachment_size || 0,
              channelId: channel.id,
              status: 'success',
            }),
          });
          const fileData = await fileRes.json();
          if (!fileRes.ok) {
            console.warn('[AUDIT] Failed to log file deletion:', fileData.error);
          } else {
            console.log('[AUDIT] File deletion logged:', fileData);
          }

          // Log to deletion_audit_logs
          const delRes = await fetch('/api/compliance/log-deletion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entityType: 'file',
              entityId: messageId,
              entityName: file.attachment_name,
              reason: 'File deleted from channel',
              permanent: true,
            }),
          });
          const delData = await delRes.json();
          if (!delRes.ok) {
            console.warn('[AUDIT] Failed to log deletion:', delData.error);
          } else {
            console.log('[AUDIT] Deletion logged:', delData);
          }
        }
      } catch (logErr) {
        console.warn('[AUDIT] Failed to log file deletion:', logErr);
      }

      // Remove from local state
      setFiles(files.filter(f => f.message_id !== messageId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
    } finally {
      setDeleting(null);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return <Image className="w-4 h-4" />;
    }
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) {
      return <Music className="w-4 h-4" />;
    }
    if (['mp4', 'webm', 'avi', 'mov'].includes(ext)) {
      return <Video className="w-4 h-4" />;
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
      return <FileText className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-lg font-semibold text-foreground">Channel Files</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <File className="w-12 h-12 mx-auto opacity-20 mb-2" />
              <p>No files shared in this channel yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map(file => (
                <div
                  key={file.message_id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover hover:bg-border/50 transition-colors"
                >
                  {/* File Icon */}
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0 text-primary">
                    {getFileIcon(file.attachment_name)}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.attachment_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span>{file.sender_name}</span>
                      <span>•</span>
                      <span>{formatDate(file.created_at)}</span>
                      {file.attachment_size && (
                        <>
                          <span>•</span>
                          <span>{formatFileSize(file.attachment_size)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={file.attachment_url}
                      download={file.attachment_name}
                      onClick={() => handleDownload(file)}
                      className="p-1.5 text-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => handleDeleteFile(file.message_id, file.attachment_name)}
                        disabled={deleting === file.message_id}
                        className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
