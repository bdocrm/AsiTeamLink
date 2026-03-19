'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { MemberList } from '@/components/chat/MemberList';
import type { Channel } from '@/lib/types';

export default function ChatPage() {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [showMembers, setShowMembers] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport and hide members panel by default on small screens
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    // Hide members on mobile by default
    if (window.innerWidth <= 640) setShowMembers(false);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        selectedChannel={selectedChannel}
        onSelectChannel={setSelectedChannel}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <ChatArea
        channel={selectedChannel}
        showMembers={showMembers}
        onToggleMembers={() => setShowMembers(!showMembers)}
      />
      {/* Desktop: inline member panel. Mobile: overlay panel when toggled */}
      {selectedChannel && (
        isMobile ? (
          showMembers && (
            <div className="fixed inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/40" onClick={() => setShowMembers(false)} />
              <div className="relative ml-auto w-[85%] max-w-xs bg-surface border-l border-border h-full">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Members</h3>
                  <button onClick={() => setShowMembers(false)} className="p-2 text-muted hover:text-foreground rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <MemberList channel={selectedChannel} />
              </div>
            </div>
          )
        ) : (
          showMembers && <MemberList channel={selectedChannel} />
        )
      )}
    </div>
  );
}
