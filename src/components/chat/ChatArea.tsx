 'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Send,
  Hash,
  Users,
  Download,
  FileText,
  X,
  MessageSquare,
  Paperclip,
  Loader2,
  Video,
  Phone,
  Reply,
  SmilePlus,
  Eye,
  MapPin,
  AtSign,
  Edit,
  Trash2,
  Search,
  Bell,
  BellOff,
  Menu,
} from 'lucide-react';
import type { Channel, Message, User, Reaction } from '@/lib/types';
import dynamic from 'next/dynamic';
const GifPicker = dynamic(() => import('./GifPicker').then((m) => m.GifPicker), { ssr: false });
const VideoCall = dynamic(() => import('./VideoCall').then((m) => m.VideoCall), { ssr: false });
const ChannelMembersManager = dynamic(() => import('./ChannelMembersManager').then((m) => m.ChannelMembersManager), { ssr: false });
const ChannelFilesManager = dynamic(() => import('./ChannelFilesManager').then((m) => m.ChannelFilesManager), { ssr: false });
import MessageBox from '@/components/ui/MessageBox';
import { checkText } from '@/lib/languageClient';

interface ChatAreaProps {
  channel: Channel | null;
  showMembers: boolean;
  onToggleMembers: () => void;
  onToggleSidebar?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function formatMessageTime(dateStr: string): string {
  return format(new Date(dateStr), 'h:mm a');
}

function isImageUrl(url: string): boolean {
  // Match common image extensions and also Giphy/Tenor/image CDN URLs
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url)) return true;
  if (/giphy\.com\/media/i.test(url)) return true;
  if (/media[\d]*\.giphy\.com/i.test(url)) return true;
  if (/tenor\.com/i.test(url) && /\.gif/i.test(url)) return true;
  if (/imgur\.com/i.test(url)) return true;
  // Data URLs for pasted images
  if (url.startsWith('data:image/')) return true;
  return false;
}

// Parse message text to find URLs and render them as clickable links + auto-embed images
// Also highlights @mentions
function parseMessageContent(text: string): { parts: { type: 'text' | 'link' | 'image' | 'mention'; value: string }[] } {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const mentionRegex = /(@[^\s@,!.?:;]+)/g;
  const combined: { type: 'url' | 'mention'; value: string; index: number }[] = [];
  let match;

  // Find all URLs
  while ((match = urlRegex.exec(text)) !== null) {
    combined.push({ type: 'url', value: match[1], index: match.index });
  }

  // Find all mentions
  while ((match = mentionRegex.exec(text)) !== null) {
    combined.push({ type: 'mention', value: match[1], index: match.index });
  }

  // Sort by index
  combined.sort((a, b) => a.index - b.index);

  const parts: { type: 'text' | 'link' | 'image' | 'mention'; value: string }[] = [];
  let lastIndex = 0;

  for (const item of combined) {
    // Add text before this item
    if (item.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, item.index) });
    }

    if (item.type === 'url') {
      const url = item.value;
      if (isImageUrl(url)) {
        parts.push({ type: 'image', value: url });
      } else {
        parts.push({ type: 'link', value: url });
      }
      lastIndex = item.index + item.value.length;
    } else if (item.type === 'mention') {
      parts.push({ type: 'mention', value: item.value });
      lastIndex = item.index + item.value.length;
    }
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return { parts };
}

export function ChatArea({ channel, showMembers, onToggleMembers, onToggleSidebar }: ChatAreaProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; isImage: boolean } | null>(null);
  const [fileAttachment, setFileAttachment] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [attachmentError, setAttachmentError] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [checksLoading, setChecksLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showChecks, setShowChecks] = useState(false);
  const [checkMode, setCheckMode] = useState<'both' | 'grammar' | 'spelling'>('both');
  const [checkBeforeSend, setCheckBeforeSend] = useState(false);
  const [lastAppliedText, setLastAppliedText] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState<number>(0);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const [inCall, setInCall] = useState(false);
  const [activeCall, setActiveCall] = useState<{ startedBy: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; users: { id: string; name: string }[] }[]>>({});
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; timer: NodeJS.Timeout }>>({});
  const [channelReaders, setChannelReaders] = useState<{ user_id: string; user_name: string; last_read_at: string }[]>([]);
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [myMentions, setMyMentions] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmBox, setConfirmBox] = useState<{ open: boolean; variant?: 'admin-delete' | 'soft-delete'; msg?: Message | null }>({ open: false });
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set()); // Track online user IDs
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]); // message ids
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeUsersInChannel, setActiveUsersInChannel] = useState<{ id: string; name: string; is_online: boolean }[]>([]); // Users viewing this channel
  const [showChannelMembersManager, setShowChannelMembersManager] = useState(false);
  const [showChannelFilesManager, setShowChannelFilesManager] = useState(false);
  const [duplicateFileConfirm, setDuplicateFileConfirm] = useState<{ show: boolean; fileName: string; file: File | null }>({ show: false, fileName: '', file: null });

  // Members for mention-autocomplete
  const [channelMembers, setChannelMembers] = useState<User[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [suggestionPos, setSuggestionPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const [mentionSelectedIds, setMentionSelectedIds] = useState<string[]>([]); // track selected mention user ids for the pending message

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const messageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToMessage = (messageId: string) => {
    const el = messageRefs.current[messageId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Play a short notification sound using WebAudio (no external file)
  const playNotification = () => {
    if (muted) return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      o.stop(now + 0.3);
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 500);
    } catch (e) {
      // ignore
    }
  };

  // Utility to escape search string for regex
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Update search results when query or messages change
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setActiveSearchIndex(0);
      return;
    }
    const ids: string[] = [];
    for (const m of messages) {
      if ((m.text && m.text.toLowerCase().includes(q)) || (m.attachment_name && m.attachment_name.toLowerCase().includes(q))) {
        ids.push(m.id);
      }
    }
    setSearchResults(ids);
    setActiveSearchIndex(0);
    // auto-scroll to first match
    if (ids.length > 0) {
      setTimeout(() => scrollToMessage(ids[0]), 150);
    }
  }, [searchQuery, messages]);

  // Load muted preference from localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem('asiteam_muted');
      setMuted(v === '1');
    } catch (e) {
      // ignore
    }
  }, []);

  // Load & persist check preferences
  useEffect(() => {
    try {
      const v = localStorage.getItem('asiteam_check_before_send');
      if (v !== null) setCheckBeforeSend(v === '1');
      const m = localStorage.getItem('asiteam_check_mode');
      if (m === 'grammar' || m === 'spelling' || m === 'both') setCheckMode(m as any);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('asiteam_check_before_send', checkBeforeSend ? '1' : '0');
    } catch (e) {}
  }, [checkBeforeSend]);

  useEffect(() => {
    try {
      localStorage.setItem('asiteam_check_mode', checkMode);
    } catch (e) {}
  }, [checkMode]);

  // Top-level handlers for delete confirmation modal
  const handleDelete = async (msg: Message) => {
    if (!user) return;
    if (user.role === 'admin') {
      setConfirmBox({ open: true, variant: 'admin-delete', msg });
      return;
    }
    setConfirmBox({ open: true, variant: 'soft-delete', msg });
  };

  const confirmPermanentDelete = async () => {
    const target = confirmBox.msg;
    if (!target) {
      setConfirmBox({ open: false });
      return;
    }
    
    // Prevent duplicate delete requests
    if (deletingMessageId === target.id) {
      console.log('Delete already in progress for message:', target.id);
      return;
    }
    
    try {
      setDeletingMessageId(target.id);
      console.log('Deleting message:', target.id, target);
      const resp = await fetch('/api/admin/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: target.id }),
      });
      let json: any = {};
      try {
        json = await resp.json();
      } catch (parseErr) {
        console.error('Failed to parse API response:', parseErr);
      }
      
      if (!resp.ok) {
        const errorMsg = json?.error || `HTTP ${resp.status}`;
        console.error('admin delete API error:', errorMsg, json);
        alert('Failed to delete message: ' + errorMsg);
        return;
      }
      
      console.log('Message deleted successfully');
      setMessages(prev => prev.filter(m => m.id !== target.id));
    } catch (e: any) {
      console.error('admin delete failed:', e?.message || String(e), e);
      alert('Failed to delete message: ' + (e?.message || 'Unknown error'));
      return;
    } finally {
      setDeletingMessageId(null);
      setConfirmBox({ open: false });
    }
  };

  const confirmSoftDelete = async () => {
    const target = confirmBox.msg;
    if (!target || !user) {
      setConfirmBox({ open: false });
      return;
    }
    try {
      const res = await supabase.rpc('delete_message', { p_message_id: target.id });
      if ((res as any)?.error) {
        console.error('delete_message RPC error', (res as any).error);
        const updates: any = {
          text: null,
          attachment_url: null,
          attachment_name: null,
          attachment_size: null,
          reply_to_id: null,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
        };
        const { data: updData, error: updError } = await supabase
          .from('messages')
          .update(updates)
          .eq('id', target.id)
          .select('*')
          .single();
        if (updError) {
          alert('Failed to delete message: ' + ((res as any).error.message || JSON.stringify((res as any).error)) + (updError ? ' ; fallback failed: ' + updError.message : ''));
          return;
        }
        setMessages(prev => prev.map(m => (m.id === updData.id ? updData : m)));
        return;
      }

      setMessages(prev => prev.map(m => m.id === target.id ? { ...m, text: null, attachment_url: null, attachment_name: null, attachment_size: null, reply_to_id: null, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id } : m));
    } catch (e: any) {
      console.error('Soft delete failed', e);
      alert('Failed to delete message: ' + (e?.message || e));
    } finally {
      setConfirmBox({ open: false });
    }
  };

  // Fetch messages
  useEffect(() => {
    if (!channel) return;

    

    const fetchPinned = async () => {
      const { data } = await supabase.rpc('get_pinned_for_channel', { p_channel_id: channel.id });
      if (data) setPinnedMessages(data as any[]);
    };

    fetchPinned();

    const pinSub = supabase
      .channel(`pinned:${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `channel_id=eq.${channel.id}` }, () => {
        fetchPinned();
      })
      .subscribe();

    return () => { supabase.removeChannel(pinSub); };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load: fetch existing messages for the channel so chat persists across reloads
  useEffect(() => {
    if (!channel) {
      setMessages([]);
      return;
    }

    let mounted = true;

    const fetchMessages = async () => {
      try {
        // Fetch most recent messages (limit) and reverse to ascending order
        const LIMIT = 200;
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .range(0, LIMIT - 1);

        if (error) {
          console.error('Failed to fetch messages', error);
          return;
        }

        if (!data || !mounted) return;

        const msgs = Array.isArray(data) ? (data as Message[]).slice().reverse() : (data as Message[]);
        setMessages(msgs as Message[]);

        // Populate usersMap for senders found in the fetched messages
        const senderIds = Array.from(new Set(msgs.map(m => m.sender_id).filter(Boolean)));
        const fetchedUsers: Record<string, User> = {};
        for (const id of senderIds) {
          try {
            const { data: userArr } = await supabase.rpc('get_user_by_id', { user_id: id });
            if (userArr?.[0]) fetchedUsers[userArr[0].id] = userArr[0] as User;
          } catch (e) {
            // ignore per-user fetch failures
            console.warn('get_user_by_id failed for', id, e);
          }
        }

        if (mounted && Object.keys(fetchedUsers).length > 0) {
          setUsersMap(prev => ({ ...prev, ...fetchedUsers }));
        }
      } catch (e) {
        console.error('fetchMessages error', e);
      }
    };

    fetchMessages();

    return () => { mounted = false; };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch channel members for mention autocomplete
  useEffect(() => {
    if (!channel) return;
    let mounted = true;
    const fetchMembers = async () => {
      try {
        const { data, error } = await supabase.rpc('get_campaign_members', { campaign_uuid: channel.campaign_id });
        if (error) {
          console.error('Error fetching campaign members for mentions:', error);
          return;
        }
        if (mounted && data) {
          console.log('Fetched campaign members for mentions:', data);
          setChannelMembers(data as User[]);
        }
      } catch (e) {
        console.error('Exception fetching campaign members:', e);
      }
    };
    fetchMembers();
    return () => { mounted = false; };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch mentions for current user and subscribe to new mentions
  useEffect(() => {
    if (!channel || !user) return;

    const fetchMentions = async () => {
      const { data } = await supabase.rpc('get_mentions_for_user', { p_user_id: user.id });
      const map: Record<string, boolean> = {};
      if (data) {
        (data as any[]).forEach((m) => {
          if (m.channel_id === channel.id) map[m.message_id] = true;
        });
      }
      setMyMentions(map);
    };

    fetchMentions();

    const mentionSub = supabase
      .channel(`mentions:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_mentions', filter: `mentioned_user_id=eq.${user.id}` }, (payload) => {
        const newRow = payload.new as any;
        if (newRow && newRow.message_id && newRow.channel_id === channel.id) {
          setMyMentions(prev => ({ ...prev, [newRow.message_id]: true }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(mentionSub); };
  }, [channel, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark as read when new messages arrive
  useEffect(() => {
    if (!channel || !user || messages.length === 0) return;
    supabase.rpc('mark_channel_read', { p_user_id: user.id, p_channel_id: channel.id });
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription - handle INSERT, UPDATE, DELETE
  useEffect(() => {
    if (!channel) return;

    const subscription = supabase
      .channel(`messages:${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => [...prev, newMsg]);

          // Fetch sender if not cached
          if (!usersMap[newMsg.sender_id]) {
            const { data: senderArr } = await supabase.rpc('get_user_by_id', { user_id: newMsg.sender_id });
            if (senderArr?.[0]) {
              setUsersMap(prev => ({ ...prev, [senderArr[0].id]: senderArr[0] }));
            }
          }
          // Play notification for incoming messages (not from current user)
          if (newMsg.sender_id !== user?.id) {
            // Only play when channel is active; respect muted setting
            playNotification();
          }
        }
      )
      // Handle message edits (UPDATE events)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages(prev =>
            prev.map(m => (m.id === updatedMsg.id ? updatedMsg : m))
          );
          console.log('Message updated:', updatedMsg.id);
        }
      )
      // Handle message deletes (DELETE events)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const deletedMsg = payload.old as Message;
          // Only update if it's from the current channel
          if (deletedMsg.channel_id === channel.id) {
            setMessages(prev =>
              prev.filter(m => m.id !== deletedMsg.id)
            );
            console.log('Message deleted in real-time:', deletedMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Typing indicator via Broadcast
  useEffect(() => {
    if (!channel || !user) return;

    const typingChannel = supabase.channel(`typing:${channel.id}`);

    typingChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, user_name } = payload.payload as { user_id: string; user_name: string };
        if (user_id === user.id) return; // ignore own typing

        setTypingUsers(prev => {
          // Clear previous timer for this user
          if (prev[user_id]?.timer) clearTimeout(prev[user_id].timer);
          // Set new timer to remove after 3s
          const timer = setTimeout(() => {
            setTypingUsers(p => {
              const next = { ...p };
              delete next[user_id];
              return next;
            });
          }, 3000);
          return { ...prev, [user_id]: { name: user_name, timer } };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
      // Clean up all timers
      setTypingUsers(prev => {
        Object.values(prev).forEach(v => clearTimeout(v.timer));
        return {};
      });
    };
  }, [channel, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presence tracking - show who's viewing this channel
  useEffect(() => {
    if (!channel || !user) return;

    const presenceChannel = supabase.channel(`presence:${channel.id}`, {
      config: {
        broadcast: { self: true },
        presence: { key: user.id },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeUsers = Object.values(state).flat() as any[];
        console.log('Channel presence sync:', activeUsers);
        
        setActiveUsersInChannel(
          activeUsers.map((presence: any) => ({
            id: presence.user_id || user.id,
            name: presence.user_name || user.name,
            is_online: presence.is_online !== false,
          }))
        );
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        console.log('User joined presence:', key, newPresences);
        setOnlineUsers(prev => new Set([...prev, key]));
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        console.log('User left presence:', key, leftPresences);
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Announce this user's presence
          await presenceChannel.track({
            user_id: user.id,
            user_name: user.name,
            is_online: true,
            timestamp: new Date().toISOString(),
          });
        }
      });

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [channel, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Video call broadcast
  useEffect(() => {
    if (!channel || !user) return;

    const callChannel = supabase.channel(`call:${channel.id}`);

    callChannel
      .on('broadcast', { event: 'call_started' }, (payload) => {
        const { user_name } = payload.payload as { user_id: string; user_name: string };
        setActiveCall({ startedBy: user_name });
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        setActiveCall(null);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(callChannel);
    };
  }, [channel, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCall = () => {
    if (!channel || !user) return;
    setInCall(true);
    setActiveCall({ startedBy: user.name });
    supabase.channel(`call:${channel.id}`).send({
      type: 'broadcast',
      event: 'call_started',
      payload: { user_id: user.id, user_name: user.name },
    });
  };

  const endCall = () => {
    setInCall(false);
    if (!channel) return;
    supabase.channel(`call:${channel.id}`).send({
      type: 'broadcast',
      event: 'call_ended',
      payload: {},
    });
    setActiveCall(null);
  };

  const joinCall = () => {
    setInCall(true);
  };

  const broadcastTyping = () => {
    if (!channel || !user) return;
    // Throttle: only send every 2s
    if (typingTimeoutRef.current) return;
    supabase.channel(`typing:${channel.id}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, user_name: user.name },
    });
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    setAttachmentError('');
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for image files first — treat pasted images like file attachments
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;

        // Use the same fileAttachment flow as file input so the image is uploaded
        setFileAttachment(file);
        setAttachment(null);
        setFileInputKey(k => k + 1);
        return;
      }
    }

    // Check for text/URL
    const pastedText = e.clipboardData?.getData('text/plain');
    if (pastedText) {
      try {
        new URL(pastedText);
        // Valid URL
        setAttachment({
          url: pastedText,
          isImage: isImageUrl(pastedText),
        });
      } catch (err) {
        // Not a URL, just regular text - do nothing
      }
    }
  };

  const handleSelectGif = (gifUrl: string) => {
    setAttachment({
      url: gifUrl,
      isImage: true,
    });
  };

  const handleCheck = async (mode = checkMode) => {
    const t = text || '';
    if (!t.trim()) return [];
    setChecksLoading(true);
    setShowChecks(false);
    try {
      const json = await checkText(t);
      let matches = json.matches || [];
      if (mode === 'grammar') {
        matches = matches.filter((m: any) => (m.rule && String(m.rule.issueType).toLowerCase().includes('grammar')));
      } else if (mode === 'spelling') {
        matches = matches.filter((m: any) => (m.rule && String(m.rule.issueType).toLowerCase().includes('misspelling')));
      }
      setSuggestions(matches || []);
      setShowChecks(true);
      return matches || [];
    } catch (e) {
      console.error('Check failed', e);
      setSuggestions([]);
      setShowChecks(false);
      alert('Grammar check failed.');
      return [];
    } finally {
      setChecksLoading(false);
    }
  };

  const applySuggestion = async (index: number, replacement: string) => {
    const match = suggestions[index];
    if (!match) return;
    const offset = match.offset || 0;
    const length = match.length || 0;
    const before = text.slice(0, offset);
    const after = text.slice(offset + length);
    const newText = before + replacement + after;
    setText(newText);
    // re-run check to update suggestions
    setTimeout(() => handleCheck(), 80);
  };

  const applyAllSuggestions = () => {
    if (!suggestions || suggestions.length === 0) return;
    // Save previous text for undo
    setLastAppliedText(text);
    // Apply replacements from end to start to preserve offsets
    const sorted = suggestions.slice().sort((a: any, b: any) => b.offset - a.offset);
    let newText = text;
    let applied = 0;
    for (const m of sorted) {
      const rep = (m.replacements && m.replacements[0] && (m.replacements[0].value || m.replacements[0])) || null;
      if (!rep) continue;
      const off = m.offset || 0;
      const len = m.length || 0;
      newText = newText.slice(0, off) + rep + newText.slice(off + len);
      applied += 1;
    }
    setText(newText);
    setAppliedCount(applied);
    setShowUndo(true);
    // clear any existing timer
    try { if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current); } catch (e) {}
    // hide undo after 8s
    undoTimerRef.current = window.setTimeout(() => {
      setShowUndo(false);
      setLastAppliedText(null);
      setAppliedCount(0);
      undoTimerRef.current = null;
    }, 8000) as unknown as number;
    setTimeout(() => handleCheck(), 80);
  };

  const handleUndoApplyAll = () => {
    if (undoTimerRef.current) {
      try { window.clearTimeout(undoTimerRef.current); } catch (e) {}
      undoTimerRef.current = null;
    }
    if (lastAppliedText !== null) {
      setText(lastAppliedText);
      setLastAppliedText(null);
      setShowUndo(false);
      setAppliedCount(0);
      setTimeout(() => handleCheck(), 80);
    }
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    messageInputRef.current?.focus();
  };

  const handleStartEdit = (msg: Message) => {
    if (!user) return;
    // Only sender or admin can start edit
    if (user.id !== msg.sender_id && user.role !== 'admin') return;
    setEditingMessageId(msg.id);
    setEditingText(msg.text || '');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (silent = false) => {
    if (!editingMessageId || !user) return;
    try {
      // Try RPC first
      const rpcName = silent && user.role === 'admin' ? 'admin_edit_message' : 'edit_message';
      const res = await supabase.rpc(rpcName as any, { p_message_id: editingMessageId, p_text: editingText });

      if ((res as any)?.error) {
        console.error('Edit RPC error', (res as any).error);
        // Attempt fallback direct update of just the text column so edits still save
        // (metadata columns like edited_at may not exist until migration is applied)
        const updatesTextOnly: any = { text: editingText };
        const { data: updData, error: updError } = await supabase
          .from('messages')
          .update(updatesTextOnly)
          .eq('id', editingMessageId)
          .select('*')
          .single();

        if (updError) {
          alert('Failed to save edit: ' + ((res as any).error.message || JSON.stringify((res as any).error)) + (updError ? ' ; fallback failed: ' + updError.message : ''));
          return; // keep edit UI open
        }

        setMessages(prev => prev.map(m => (m.id === updData.id ? updData : m)));
        setEditingMessageId(null);
        setEditingText('');
        alert('Edit saved, but DB migration not applied — run supabase-edit-delete.sql to enable full metadata and RPCs.');
        return;
      }

      const updated = Array.isArray((res as any).data) ? (res as any).data[0] : (res as any).data;
      if (updated) setMessages(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      setEditingMessageId(null);
      setEditingText('');
    } catch (e: any) {
      console.error('Edit failed', e);
      alert('Failed to save edit: ' + (e?.message || e));
    }
  };


  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    setShowEmojiFor(null);
    await supabase.rpc('toggle_reaction', { p_message_id: messageId, p_user_id: user.id, p_emoji: emoji });

    // Optimistic update — one reaction per user per message
    setReactions(prev => {
      const copy = { ...prev };
      let msgReactions = [...(copy[messageId] || [])];

      // Check if clicking the same emoji (toggle off)
      const idx = msgReactions.findIndex(r => r.emoji === emoji);
      const alreadyReacted = idx >= 0 && msgReactions[idx].users.some(u => u.id === user.id);

      // Remove user from ALL existing reactions on this message
      msgReactions = msgReactions.map(r => ({
        ...r,
        users: r.users.filter(u => u.id !== user.id),
      })).filter(r => r.users.length > 0);

      // If not toggling off, add the new reaction
      if (!alreadyReacted) {
        const existingIdx = msgReactions.findIndex(r => r.emoji === emoji);
        if (existingIdx >= 0) {
          msgReactions[existingIdx] = { ...msgReactions[existingIdx], users: [...msgReactions[existingIdx].users, { id: user.id, name: user.name }] };
        } else {
          msgReactions.push({ emoji, users: [{ id: user.id, name: user.name }] });
        }
      }

      copy[messageId] = msgReactions;
      return copy;
    });
  };

  const togglePin = async (messageId: string) => {
    if (!user) return;
    await supabase.rpc('toggle_pin', { p_message_id: messageId, p_user_id: user.id });
    // Refresh pinned list
    if (channel) {
      const { data } = await supabase.rpc('get_pinned_for_channel', { p_channel_id: channel.id });
      if (data) setPinnedMessages(data as any[]);
    }
  };

  const handleDuplicateFileConfirm = async (shouldUpload: boolean) => {
    setDuplicateFileConfirm({ show: false, fileName: '', file: null });
    if (!shouldUpload || !duplicateFileConfirm.file || !channel || !user) return;

    // Set the file attachment again and trigger send
    setFileAttachment(duplicateFileConfirm.file);
    // Create a synthetic form event to trigger handleSend
    const event = new Event('submit', { bubbles: true, cancelable: true }) as any;
    event.preventDefault = () => {};
    
    // Set a flag to skip duplicate check
    (event as any).skipDuplicateCheck = true;
    
    // We need a better approach - just do the upload directly
    setSending(true);
    setUploading(true);
    const file = duplicateFileConfirm.file;
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setAttachmentError(data.error || 'Upload failed.');
        setSending(false);
        setUploading(false);
        return;
      }

      // Now create the message with the uploaded file
      const messageText = text.trim();
      const { data: insertedMsg, error: insertError } = await supabase
        .from('messages')
        .insert({
          channel_id: channel!.id,
          sender_id: user!.id,
          text: messageText || null,
          attachment_url: data.url,
          attachment_name: data.name,
          attachment_size: data.size,
          reply_to_id: replyTo?.id || null,
        })
        .select('*')
        .single();

      if (!insertError && insertedMsg) {
        // Detect mentions
        try {
          const mentionRegex = /@([^\s@,!.?:;]+)/g;
          const names: string[] = [];
          let m;
          while ((m = mentionRegex.exec(messageText)) !== null) {
            names.push(m[1]);
          }
          if (names.length > 0) {
            await supabase.rpc('create_message_mentions', { p_message_id: insertedMsg.id, p_names: names });
          }
        } catch (e) {
          console.warn('Failed creating mentions', e);
        }

        setText('');
        setAttachment(null);
        setFileAttachment(null);
        setFileInputKey(k => k + 1);
        setAttachmentError('');
        setReplyTo(null);
      }
    } catch {
      setAttachmentError('Upload failed. Please try again.');
    }
    
    setSending(false);
    setUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setAttachmentError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is 5MB.`);
      setFileInputKey(k => k + 1);
      return;
    }

    setFileAttachment(file);
    setAttachment(null); // Clear URL-based attachment
    setFileInputKey(k => k + 1); // Reset input so same file can be re-selected
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !attachment && !fileAttachment) || !channel || !user || sending) return;

    setSending(true);
    // If user opted to check before send, run checks and stop send if suggestions exist
    if (checkBeforeSend && text.trim()) {
      try {
        const matches = await handleCheck(checkMode);
        if (matches && matches.length > 0) {
          // show suggestions and abort send
          setSending(false);
          setShowChecks(true);
          return;
        }
      } catch (e) {
        console.error('Pre-send check failed', e);
        // allow send to continue on check failure
      }
    }
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentSize: number | null = null;
    const messageText = text.trim();

    // Upload file attachment if present
    if (fileAttachment) {
      // Check for duplicate filenames first
      try {
        const { data: existingAttachments } = await supabase
          .from('messages')
          .select('attachment_name')
          .eq('channel_id', channel.id)
          .not('attachment_url', 'is', null);

        const existingNames = existingAttachments?.map(m => m.attachment_name) || [];
        if (existingNames.includes(fileAttachment.name)) {
          setSending(false);
          setDuplicateFileConfirm({ show: true, fileName: fileAttachment.name, file: fileAttachment });
          return;
        }
      } catch (err) {
        console.error('Failed to check for duplicate filenames:', err);
        // Continue with upload anyway
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', fileAttachment);

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
          setAttachmentError(data.error || 'Upload failed.');
          setSending(false);
          setUploading(false);
          return;
        }

        attachmentUrl = data.url;
        attachmentName = data.name;
        attachmentSize = data.size;
      } catch {
        setAttachmentError('Upload failed. Please try again.');
        setSending(false);
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (attachment) {
      // URL/GIF/pasted image attachment
      attachmentUrl = attachment.url;
      attachmentName = attachment.isImage ? 'Image' : 'Link';
    }

    const { data: insertedMsg, error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channel.id,
        sender_id: user.id,
        text: messageText || null,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_size: attachmentSize,
        reply_to_id: replyTo?.id || null,
      })
      .select('*')
      .single();

    if (insertError || !insertedMsg) {
      setSending(false);
      return;
    }

    // Create mention rows via RPC. Prefer explicit IDs collected from selection for reliability.
    try {
      if (mentionSelectedIds && mentionSelectedIds.length > 0) {
        console.log('Creating mentions by ids:', mentionSelectedIds);
        const { data, error } = await supabase.rpc('create_message_mentions_by_ids', { p_message_id: insertedMsg.id, p_user_ids: mentionSelectedIds });
        if (error) {
          console.error('Error creating mentions by ids:', error);
        } else {
          console.log('Mentions created successfully (by ids):', data);
        }
      } else {
        // Fallback: detect simple @name mentions and create mention rows via name-based RPC
        const mentionRegex = /@([^\s@,!.?:;]+)/g;
        const names: string[] = [];
        let m;
        // eslint-disable-next-line no-cond-assign
        while ((m = mentionRegex.exec(messageText)) !== null) {
          names.push(m[1]);
        }
        if (names.length > 0) {
          console.log('Creating mentions for names (fallback):', names);
          const { data, error } = await supabase.rpc('create_message_mentions', { p_message_id: insertedMsg.id, p_names: names });
          if (error) {
            console.error('Error creating mentions (names):', error);
          } else {
            console.log('Mentions created successfully (names):', data);
          }
        }
      }
    } catch (e) {
      console.error('Failed creating mentions:', e);
    }

    setText('');
    setMentionSelectedIds([]);
    setAttachment(null);
    setFileAttachment(null);
    setFileInputKey(k => k + 1);
    setAttachmentError('');
    setReplyTo(null);
    setSending(false);
  };

  // Mention helpers - improved matching (token startsWith, substring, email, initials)
  const normalizeForSearch = (s: string) => {
    if (!s) return '';
    try {
      // remove diacritics and lowercase
      return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    } catch (e) {
      return s.toLowerCase();
    }
  };

  const q = normalizeForSearch(mentionQuery || '');

  const mentionResults = (q.length > 0
    ? channelMembers.filter(m => {
        const name = m.name || '';
        const email = (m as any).email || '';
        const nName = normalizeForSearch(name);
        const nEmail = normalizeForSearch(email);

        if (nName.includes(q)) return true; // substring anywhere

        // match word starts (typing first letters of a token)
        const tokens = nName.split(/\s+/).filter(Boolean);
        if (tokens.some(t => t.startsWith(q))) return true;

        // match email
        if (nEmail.includes(q)) return true;

        // initials: e.g., "John Doe" -> "jd"
        const initials = tokens.map(t => t[0] || '').join('');
        if (initials.startsWith(q)) return true;

        return false;
      })
    : []).slice(0, 6);

  // Debug: log mention results
  if (mentionOpen && q) {
    console.log('Mention results:', { q, memberCount: channelMembers.length, resultsCount: mentionResults.length, results: mentionResults.map(m => m.name) });
  }

  const selectMention = (member: User) => {
    if (!messageInputRef.current) {
      setMentionOpen(false);
      return;
    }
    const inputEl = messageInputRef.current;
    const caret = inputEl.selectionStart || text.length;
    const at = mentionAtIndex !== null ? mentionAtIndex : text.lastIndexOf('@', caret - 1);
    if (at === -1) {
      setMentionOpen(false);
      return;
    }
    const before = text.slice(0, at);
    const after = text.slice(caret);
    const inserted = `@${member.name} `;
    // Debug: log mention insertion details to help diagnose unexpected rendering
    try { console.debug('selectMention -> insert', { inserted, before, after, caret, at, textLength: text.length }); } catch (e) {}
    const newText = before + inserted + after;
    setText(newText);
    // track the selected user's id so we can reliably create mentions on send
    try {
      setMentionSelectedIds(prev => {
        if (!member.id) return prev;
        if (prev.includes(member.id)) return prev;
        return [...prev, member.id];
      });
    } catch (e) {
      // ignore
    }
    // Close dropdown and reset
    setMentionOpen(false);
    setMentionQuery('');
    setMentionSelectedIndex(0);
    setTimeout(() => {
      const pos = before.length + inserted.length;
      inputEl.focus();
      try {
        inputEl.setSelectionRange(pos, pos);
      } catch (e) {
        // ignore
      }
    }, 0);
  };

  const updateSuggestionPos = () => {
    const el = messageInputRef.current;
    if (!el) return setSuggestionPos(null);
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;

    // Prefer below on desktop / when there's enough space; prefer above when mobile or small space
    const preferBelow = window.innerWidth >= 640 ? true : spaceBelow > 200;

    if (preferBelow) {
      setSuggestionPos({ left: r.left, top: r.bottom, width: r.width });
    } else {
      // position above input using bottom offset from viewport
      const bottomOffset = Math.max(8, Math.round(vh - r.top));
      setSuggestionPos({ left: r.left, bottom: bottomOffset, width: r.width });
    }
  };

  // Update suggestion position when open, on resize and scroll
  useEffect(() => {
    if (!mentionOpen) return setSuggestionPos(null);
    updateSuggestionPos();
    const onResize = () => updateSuggestionPos();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [mentionOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    broadcastTyping();

    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at !== -1 && (at === 0 || /\s/.test(before.charAt(at - 1)))) {
      const q = before.slice(at + 1);
      // only trigger when there's no whitespace in the query
      if (!/\s/.test(q)) {
        console.log('Mention trigger:', { at, q, channelMembersCount: channelMembers.length, beforeAt: before.charAt(at - 1) });
        setMentionQuery(q);
        setMentionAtIndex(at);
        setMentionSelectedIndex(0);
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionOpen) return;
    const resultsLen = mentionResults.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionSelectedIndex(i => Math.min(i + 1, resultsLen - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (resultsLen > 0) {
        e.preventDefault();
        selectMention(mentionResults[mentionSelectedIndex] || mentionResults[0]);
      }
      return;
    }
    if (e.key === 'Escape') {
      setMentionOpen(false);
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  messages.forEach(msg => {
    const date = formatMessageDate(msg.created_at);
    if (date !== currentDate) {
      currentDate = date;
      groupedMessages.push({ date, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  if (!channel) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        {/* Mobile header with sidebar toggle when no channel selected */}
        <div className="md:hidden p-4 flex items-center gap-3">
          <button
            onClick={() => onToggleSidebar && onToggleSidebar()}
            className="p-2.5 rounded-xl text-muted hover:text-primary hover:bg-primary-light transition-all duration-200"
            title="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold gradient-brand-text">AsiTeamLink</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center animate-fade-in px-6">
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="w-20 h-20 rounded-2xl gradient-brand opacity-10 absolute inset-0 animate-float" />
              <MessageSquare className="w-10 h-10 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-2xl font-bold gradient-brand-text mb-2">Welcome to AsiTeamLink</h2>
            <p className="text-muted text-sm max-w-xs mx-auto mb-6">Select a channel from the sidebar to start chatting with your team</p>
            <button
              onClick={() => onToggleSidebar && onToggleSidebar()}
              className="md:hidden inline-flex items-center gap-2 px-5 py-2.5 btn-primary text-sm font-semibold"
            >
              <Menu className="w-4 h-4" />
              Open Channels
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area flex-1 flex flex-col bg-background min-w-0" onClick={() => showEmojiFor && setShowEmojiFor(null)}>
      {/* Channel header */}
      <div className="channel-header">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onToggleSidebar && onToggleSidebar()}
            className="p-2 rounded-xl md:hidden text-muted hover:text-primary hover:bg-primary-light transition-all duration-200 shrink-0"
            title="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Hash className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-semibold text-foreground truncate text-[15px]">{channel.name}</h2>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Search */}
          <div className="relative hidden sm:block">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              placeholder="Search..."
              className="chat-input-field !py-1.5 !px-3 !text-xs w-32 focus:w-44 transition-all duration-300 !rounded-full"
            />
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          </div>
          {(searchFocused || searchQuery.trim().length > 0) && (
            <div className="flex items-center gap-0.5 animate-fade-in">
              <button onClick={() => { if (searchResults.length === 0) return; const prev = (activeSearchIndex - 1 + searchResults.length) % searchResults.length; setActiveSearchIndex(prev); scrollToMessage(searchResults[prev]); }} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover" title="Previous">◀</button>
              <button onClick={() => { if (searchResults.length === 0) return; const next = (activeSearchIndex + 1) % searchResults.length; setActiveSearchIndex(next); scrollToMessage(searchResults[next]); }} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover" title="Next">▶</button>
              <span className="text-[10px] text-muted px-1">{searchResults.length > 0 ? `${activeSearchIndex + 1}/${searchResults.length}` : '0/0'}</span>
            </div>
          )}
          <button onClick={() => { const next = !muted; setMuted(next); try { localStorage.setItem('asiteam_muted', next ? '1' : '0'); } catch (e) {} }} title={muted ? 'Unmute' : 'Mute'} className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-hover transition-all duration-200 hidden sm:flex">
            {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
          <button onClick={startCall} className={`p-2 rounded-xl transition-all duration-200 hidden sm:flex ${inCall ? 'bg-success/10 text-success' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`} title="Video call">
            <Video className="w-4 h-4" />
          </button>
          <button onClick={() => setShowChannelMembersManager(true)} className="p-2 rounded-xl text-muted hover:text-secondary hover:bg-secondary-light transition-all duration-200 hidden sm:flex" title="Manage members">
            <Users className="w-4 h-4" />
          </button>
          <button onClick={onToggleMembers} className={`p-2 rounded-xl transition-all duration-200 ${showMembers ? 'bg-primary/10 text-primary' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`} title="Members">
            <Eye className="w-4 h-4" />
          </button>
          <button onClick={() => setShowChannelFilesManager(true)} className="p-2 rounded-xl text-muted hover:text-accent hover:bg-accent-light transition-all duration-200 hidden sm:flex" title="Files">
            <FileText className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-surface/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">Pinned</span>
            <span className="text-xs text-muted">({pinnedMessages.length})</span>
          </div>
          <button onClick={() => setShowPinnedPanel(s => !s)} className="text-xs text-primary">
            {showPinnedPanel ? 'Hide' : 'Show'}
          </button>
        </div>
      )}

      {showPinnedPanel && pinnedMessages.length > 0 && (
        <div className="max-h-36 overflow-y-auto border-b border-border">
          {pinnedMessages.map(pm => (
            <div key={pm.pin_id} className="px-4 py-2 text-sm">
              <div className="font-medium text-foreground truncate">{pm.message_text || 'Attachment'}</div>
              <div className="text-xs text-muted">Pinned by {pm.pinned_by_name || 'Unknown'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active call banner */}
      {activeCall && !inCall && (
        <div className="px-4 py-2 bg-success/10 border-b border-success/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-success animate-pulse" />
            <span className="text-sm text-success font-medium">
              {activeCall.startedBy} started a call
            </span>
          </div>
          <button
            onClick={joinCall}
            className="px-3 py-1 bg-success hover:bg-success/90 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Join Call
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="messages-scroll-area flex-1 overflow-y-auto px-4 py-2 sm:pb-4 pb-32">
        {groupedMessages.map((group, gi) => (
          <div key={gi}>
            {/* Date separator */}
            <div className="date-separator">
              <span>{group.date}</span>
            </div>

            {group.messages.map((msg, mi) => {
              const sender = usersMap[msg.sender_id];
              const isOwn = msg.sender_id === user?.id;
              const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
              const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
              const isPinned = pinnedMessages.some(pm => pm.message_id === msg.id);
              const isMentioned = !!myMentions[msg.id];

              const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
              const replySender = replyMsg ? usersMap[replyMsg.sender_id] : null;
              const msgReactions = reactions[msg.id] || [];

              return (
                <div
                  key={msg.id}
                  ref={(el) => { messageRefs.current[msg.id] = el; }}
                  className={`msg-enter group relative flex gap-2.5 px-2 py-0.5 hover:bg-surface-hover/30 rounded-xl transition-colors duration-150 ${
                    showAvatar ? 'mt-4' : 'mt-0.5'
                  } ${isOwn ? 'flex-row-reverse items-end' : 'items-start'} ${searchResults[activeSearchIndex] === msg.id ? 'ring-2 ring-secondary/30 bg-secondary-light/30' : ''}`}
                >
                  {/* Hover action buttons */}
                  <div className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-0.5 bg-surface border border-border rounded-lg shadow-sm px-1 py-0.5 z-10">
                    <button
                      onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)}
                      className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
                      title="React"
                    >
                      <SmilePlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => togglePin(msg.id)}
                      className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                    {(user?.id === msg.sender_id || user?.role === 'admin') && (
                      <>
                        <button
                          onClick={() => handleStartEdit(msg)}
                          className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(msg)}
                          className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleReply(msg)}
                      className="p-1 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Emoji picker popup */}
                  {showEmojiFor === msg.id && (
                    <div className="absolute -top-10 right-2 flex items-center gap-0.5 bg-surface border border-border rounded-lg shadow-lg px-2 py-1.5 z-20">
                      {QUICK_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className="text-base hover:scale-125 transition-transform px-0.5"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="w-9 shrink-0">
                    {showAvatar && (
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                          isOwn
                            ? 'avatar-gradient'
                            : 'avatar-secondary'
                        }`}
                      >
                        {sender?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 min-w-0 ${isMentioned ? 'border-l-2 border-accent/40 pl-2' : ''} flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                    {showAvatar && (
                      <div className={`flex items-baseline gap-2 mb-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <span className="font-semibold text-sm text-foreground">
                          {sender?.name || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-muted/70">
                          {formatMessageTime(msg.created_at)}
                        </span>
                      </div>
                    )}

                    {/* Reply preview */}
                    {replyMsg && (
                      <div className="flex items-center gap-2 mb-1 pl-2 border-l-2 border-primary/40 rounded-sm">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-primary">
                            {replySender?.name || 'Unknown'}
                          </span>
                          <p className="text-xs text-muted truncate max-w-xs">
                            {replyMsg.text || (replyMsg.attachment_name ? `📎 ${replyMsg.attachment_name}` : 'Attachment')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Editing UI / Deleted placeholder / Message content */}
                    {editingMessageId === msg.id ? (
                      <div className={`inline-block max-w-[70%] ${isOwn ? 'ml-auto text-right' : ''}`}>
                        <div className={`rounded-2xl px-4 py-2.5 ${isOwn ? 'msg-bubble-own' : 'msg-bubble-other'}`}>
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-inherit"
                          />
                          <div className="mt-2 flex gap-2 justify-end">
                            <button onClick={() => handleSaveEdit(false)} className="px-2 py-1 bg-primary text-white rounded">Save</button>
                            {user?.role === 'admin' && (
                              <button onClick={() => handleSaveEdit(true)} className="px-2 py-1 bg-amber-600 text-white rounded">Save silently</button>
                            )}
                            <button onClick={handleCancelEdit} className="px-2 py-1 bg-surface hover:bg-surface-hover border border-border rounded">Cancel</button>
                          </div>
                        </div>
                      </div>
                    ) : msg.is_deleted ? (
                      <div className={`inline-block max-w-[70%] ${isOwn ? 'ml-auto text-right' : ''}`}>
                        <div className="rounded-2xl px-4 py-2.5 bg-surface-hover/50 border border-border/50 text-muted italic">
                          <p className="text-sm">Message deleted</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && (() => {
                          const { parts } = parseMessageContent(msg.text);
                          const hasInlineImages = parts.some(p => p.type === 'image');
                          return (
                            <div className={`inline-block max-w-[70%] ${isOwn ? 'ml-auto text-right' : ''}`}>
                              <div className={`px-4 py-2.5 ${isOwn ? 'msg-bubble-own' : 'msg-bubble-other'}`}>
                                <p className="text-sm break-words whitespace-pre-wrap">
                                  {parts.map((part, pi) => {
                                    if (part.type === 'text') {
                                      if (!searchQuery) return <span key={pi}>{part.value}</span>;
                                      const q = searchQuery.trim().toLowerCase();
                                      if (!q) return <span key={pi}>{part.value}</span>;
                                      const tokens = part.value.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
                                      return (
                                        <span key={pi}>
                                          {tokens.map((t, ti) => (
                                            t.toLowerCase() === q ? (
                                              <span key={ti} className="bg-yellow-200 text-foreground rounded px-0.5">{t}</span>
                                            ) : (
                                              <span key={ti}>{t}</span>
                                            )
                                          ))}
                                        </span>
                                      );
                                    }
                                    if (part.type === 'mention') {
                                      return (
                                        <span
                                          key={pi}
                                          className={`font-semibold ${isOwn ? 'text-yellow-200' : 'text-blue-600'}`}
                                        >
                                          {part.value}
                                        </span>
                                      );
                                    }
                                    if (part.type === 'link') {
                                      return (
                                        <a
                                          key={pi}
                                          href={part.value}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`${isOwn ? 'text-white/90' : 'text-primary'} hover:underline break-all`}
                                        >
                                          {part.value}
                                        </a>
                                      );
                                    }
                                    return null;
                                  })}
                                </p>
                                {/* Render inline images from URLs in text */}
                                {hasInlineImages && (
                                  <div className="mt-2 space-y-2">
                                    {parts.filter(p => p.type === 'image').map((part, pi) => (
                                      <div key={pi} className="max-w-md">
                                        <a href={part.value} target="_blank" rel="noopener noreferrer">
                                          <img
                                            src={part.value}
                                            alt="Shared image"
                                            className="rounded-lg max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                            loading="lazy"
                                          />
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msg.edited_at && (
                                  <div className="text-[11px] text-muted mt-1">edited</div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {msg.attachment_url && (
                          <div className={`mt-1 ${isOwn ? 'flex justify-end' : ''}`}>
                            <div className={`inline-block max-w-[70%] ${isOwn ? 'ml-auto' : ''}`}>
                              {isImageUrl(msg.attachment_url) ? (
                                <div className="max-w-md">
                                  <a
                                    href={msg.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <img
                                      src={msg.attachment_url}
                                      alt={msg.attachment_name || 'Image'}
                                      className="rounded-lg max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                      loading="lazy"
                                    />
                                  </a>
                                </div>
                              ) : !msg.attachment_name || msg.attachment_name === 'Link' ? (
                                <a
                                  href={msg.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center px-3 py-2 rounded-lg ${isOwn ? 'text-white/90 hover:text-white' : 'text-primary hover:text-primary-hover'} hover:underline break-all`}
                                >
                                  {msg.attachment_url.substring(0, 60)}
                                </a>
                              ) : (
                                <a
                                  href={msg.attachment_url}
                                  download={msg.attachment_name}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${isOwn ? 'bg-primary/90 text-white' : 'bg-surface border border-border text-foreground'} hover:opacity-95 transition-colors max-w-sm mt-1`}
                                >
                                  <FileText className={`w-8 h-8 ${isOwn ? 'text-white' : 'text-primary'} shrink-0`} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{msg.attachment_name || 'Attachment'}</p>
                                    <p className="text-xs text-muted">{msg.attachment_size ? formatFileSize(msg.attachment_size) : 'Link'}</p>
                                  </div>
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {/* Reactions display */}
                    {msgReactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                        {msgReactions.map(r => {
                          const hasOwn = r.users.some(u => u.id === user?.id);
                          const reactionKey = `${msg.id}-${r.emoji}`;
                          return (
                            <div key={r.emoji} className="relative">
                              <button
                                onClick={() => toggleReaction(msg.id, r.emoji)}
                                onMouseEnter={() => setHoveredReaction(reactionKey)}
                                onMouseLeave={() => setHoveredReaction(null)}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                                  hasOwn
                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                    : 'bg-surface border-border text-muted hover:border-primary/30'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-medium">{r.users.length}</span>
                              </button>
                              {/* Reaction tooltip */}
                              {hoveredReaction === reactionKey && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-foreground text-background text-xs rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none">
                                  <div className="font-medium mb-0.5">{r.emoji} {r.users.length === 1 ? 'reaction' : 'reactions'}</div>
                                  {r.users.map(u => (
                                    <div key={u.id} className="text-background/80">{u.name}{u.id === user?.id ? ' (you)' : ''}</div>
                                  ))}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-foreground" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Seen by indicator — show below the last message in the channel */}
                    {msg.id === messages[messages.length - 1]?.id && (() => {
                      const seenUsers = channelReaders.filter(
                        r => r.user_id !== user?.id && new Date(r.last_read_at) >= new Date(msg.created_at)
                      );
                      if (seenUsers.length === 0) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted">
                          <Eye className="w-3 h-3" />
                          <span>
                            Seen by{' '}
                            {seenUsers.length <= 3
                              ? seenUsers.map(u => u.user_name).join(', ')
                              : `${seenUsers.slice(0, 2).map(u => u.user_name).join(', ')} and ${seenUsers.length - 2} more`
                            }
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Time on hover for non-avatar msgs */}
                  {!showAvatar && (
                    <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                      {formatMessageTime(msg.created_at)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-container shrink-0">
        {/* Typing indicator */}
        {Object.keys(typingUsers).length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted animate-fade-in">
            <div className="flex gap-1">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span>
              {(() => {
                const names = Object.values(typingUsers).map(v => v.name);
                if (names.length === 1) return `${names[0]} is typing...`;
                if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
                return `${names[0]} and ${names.length - 1} others are typing...`;
              })()}
            </span>
          </div>
        )}
        {/* Reply preview bar */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl animate-fade-in-down">
            <Reply className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-primary">
                Replying to {usersMap[replyTo.sender_id]?.name || 'Unknown'}
              </span>
              <p className="text-xs text-muted truncate">
                {replyTo.text || (replyTo.attachment_name ? `📎 ${replyTo.attachment_name}` : 'Attachment')}
              </p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted hover:text-danger shrink-0 p-1 rounded-lg hover:bg-danger/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {attachmentError && (
          <div className="mb-2 px-3 py-2 bg-danger/10 text-danger text-sm rounded-xl border border-danger/20 animate-fade-in">
            {attachmentError}
          </div>
        )}
        {attachment && (
          <div className="mb-2 flex items-start gap-3 px-3 py-2 bg-surface border border-border rounded-xl animate-fade-in-up">
            {attachment.isImage ? (
              <img src={attachment.url} alt="Preview" className="h-20 max-w-[180px] object-contain rounded-lg shrink-0" />
            ) : (
              <div className="h-14 w-14 bg-surface-hover rounded-xl border border-border flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 self-center">
              <p className="text-xs text-muted">{attachment.isImage ? 'Image attached' : 'Link attached'}</p>
            </div>
            <button onClick={() => { setAttachment(null); setAttachmentError(''); }} className="text-muted hover:text-danger shrink-0 self-start p-1 rounded-lg hover:bg-danger/5">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {fileAttachment && (
          <div className="mb-2 flex items-start gap-3 px-3 py-2 bg-surface border border-border rounded-xl animate-fade-in-up">
            {fileAttachment.type.startsWith('image/') ? (
              <img src={URL.createObjectURL(fileAttachment)} alt="Preview" className="h-20 max-w-[180px] object-contain rounded-lg shrink-0" />
            ) : (
              <div className="h-14 w-14 bg-surface-hover rounded-xl border border-border flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 self-center">
              <p className="text-sm font-medium text-foreground truncate">{fileAttachment.name}</p>
              <p className="text-xs text-muted">{formatFileSize(fileAttachment.size)}</p>
            </div>
            <button onClick={() => { setFileAttachment(null); setAttachmentError(''); }} className="text-muted hover:text-danger shrink-0 self-start p-1 rounded-lg hover:bg-danger/5">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex flex-col gap-2">
          {/* Main input row */}
          <div className="flex items-end gap-2">
            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.mp4,.webm,.mp3,.wav,.ogg"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-muted hover:text-primary hover:bg-primary-light rounded-xl transition-all duration-200 shrink-0"
              title="Attach file (max 5MB)"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="relative flex-1">
              <input
                ref={messageInputRef}
                type="text"
                value={text}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onPaste={handlePaste}
                placeholder={`Message #${channel.name}`}
                className="chat-input-field"
              />

              {/* Grammar/spell suggestions */}
              {showChecks && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-xl p-3 max-h-44 overflow-auto shadow-lg animate-fade-in-up z-20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-foreground">Suggestions ({suggestions.length})</div>
                    <div className="flex items-center gap-1.5">
                      {showUndo ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Applied {appliedCount}</span>
                          <button type="button" onClick={handleUndoApplyAll} className="px-2 py-1 text-xs border border-border rounded-lg hover:bg-surface-hover">Undo</button>
                        </div>
                      ) : (
                        <>
                          <button type="button" onClick={() => applyAllSuggestions()} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-lg font-medium">Apply all</button>
                          <button type="button" onClick={() => setShowChecks(false)} className="px-2 py-1 text-xs border border-border rounded-lg hover:bg-surface-hover">Dismiss</button>
                        </>
                      )}
                    </div>
                  </div>
                  {suggestions.map((m, idx) => (
                    <div key={idx} className="mb-2">
                      <div className="text-xs text-muted">{m.message}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {(m.replacements || []).slice(0, 4).map((r: any, ri: number) => (
                          <button key={ri} type="button" onClick={() => applySuggestion(idx, r.value || r)} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-lg font-medium hover:bg-primary/20 transition-colors">{r.value || r}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mention suggestions dropdown */}
              {mentionOpen && mentionResults.length > 0 && suggestionPos && (
                <div
                  style={{
                    left: suggestionPos.left,
                    width: suggestionPos.width,
                    ...(suggestionPos.top ? { top: suggestionPos.top } : {}),
                    ...(suggestionPos.bottom ? { bottom: suggestionPos.bottom } : {}),
                  }}
                  className="mention-suggestions fixed z-[9999] max-w-full animate-fade-in"
                >
                  <ul className="max-h-48 overflow-auto">
                    {mentionResults.map((m, idx) => (
                      <li
                        key={m.id}
                        onMouseDown={(ev) => { ev.preventDefault(); selectMention(m); }}
                        onMouseEnter={() => setMentionSelectedIndex(idx)}
                        className={`px-3 py-2.5 cursor-pointer transition-colors ${mentionSelectedIndex === idx ? 'bg-primary/10' : 'hover:bg-surface-hover'}`}
                      >
                        <div className="text-sm font-medium text-foreground">{m.name}</div>
                        <div className="text-xs text-muted">{(m as any).email}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowGifPicker(true)}
              className="p-2.5 text-xs font-bold text-muted hover:text-accent hover:bg-accent-light rounded-xl transition-all duration-200 shrink-0 hidden sm:flex"
              title="Search GIFs"
            >
              GIF
            </button>
            <button
              type="submit"
              disabled={(!text.trim() && !attachment && !fileAttachment) || sending}
              className="p-2.5 btn-primary rounded-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none shrink-0"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          {/* Tools row - hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2 px-1">
            <select
              value={checkMode}
              onChange={(e) => setCheckMode(e.target.value as any)}
              className="text-xs px-2 py-1 rounded-lg border border-border bg-surface text-foreground"
              title="Check mode"
            >
              <option value="both">Both</option>
              <option value="grammar">Grammar</option>
              <option value="spelling">Spelling</option>
            </select>
            <label className="text-xs text-muted flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={checkBeforeSend} onChange={(e) => setCheckBeforeSend(e.target.checked)} className="rounded" />
              <span>Auto-check</span>
            </label>
            <button
              type="button"
              onClick={() => handleCheck(checkMode)}
              className="px-2.5 py-1.5 text-xs font-medium text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-all duration-200"
              title="Check spelling / grammar"
              disabled={checksLoading || !text.trim()}
            >
              {checksLoading ? 'Checking...' : '✓ Check'}
            </button>
          </div>
        </form>
      </div>

      {/* GIF Picker Modal */}
      <GifPicker
        isOpen={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelectGif={handleSelectGif}
      />

      {/* Video Call */}
      {inCall && channel && user && (
        <VideoCall
          roomName={channel.id.replace(/-/g, '')}
          displayName={user.name}
          onClose={endCall}
        />
      )}
      {/* In-app confirm / message box for deletes */}
      <MessageBox
        open={confirmBox.open}
        title={confirmBox.variant === 'admin-delete' ? 'Delete permanently (no trace)?' : 'Delete message'}
        message={
          confirmBox.variant === 'admin-delete'
            ? 'Permanent delete will remove the message and attachments with no trace. Choose Permanent or Soft-delete.'
            : 'Delete this message? This will remove its content.'
        }
        primaryLabel={confirmBox.variant === 'admin-delete' ? 'Permanent Delete' : 'Delete'}
        secondaryLabel={confirmBox.variant === 'admin-delete' ? 'Soft Delete' : undefined}
        onPrimary={confirmBox.variant === 'admin-delete' ? confirmPermanentDelete : confirmSoftDelete}
        onSecondary={confirmBox.variant === 'admin-delete' ? confirmSoftDelete : undefined}
        onClose={() => setConfirmBox({ open: false })}
      />

      {/* Duplicate file confirmation dialog */}
      <MessageBox
        open={duplicateFileConfirm.show}
        title="File already exists"
        message={`A file named "${duplicateFileConfirm.fileName}" already exists in this channel. Do you want to replace it?`}
        primaryLabel="Replace"
        secondaryLabel="Cancel"
        onPrimary={() => handleDuplicateFileConfirm(true)}
        onSecondary={() => handleDuplicateFileConfirm(false)}
        onClose={() => handleDuplicateFileConfirm(false)}
      />

      {/* Channel Members Manager Modal */}
      {channel && (
        <ChannelMembersManager
          channel={channel}
          isOpen={showChannelMembersManager}
          onClose={() => setShowChannelMembersManager(false)}
        />
      )}

      {/* Channel Files Manager Modal */}
      {channel && (
        <ChannelFilesManager
          channel={channel}
          isOpen={showChannelFilesManager}
          onClose={() => setShowChannelFilesManager(false)}
        />
      )}
    </div>
  );
}
