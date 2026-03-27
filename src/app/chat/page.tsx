'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [memberDrawerOpen, setMemberDrawerOpen] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setShowMembers(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    if (isMobile) {
      setSidebarDrawerOpen(prev => !prev);
    } else {
      setSidebarCollapsed(prev => !prev);
    }
  }, [isMobile]);

  const handleToggleMembers = useCallback(() => {
    if (isMobile) {
      setMemberDrawerOpen(prev => !prev);
    } else {
      setShowMembers(prev => !prev);
    }
  }, [isMobile]);

  const handleSelectChannelMobile = useCallback((c: Channel) => {
    setSelectedChannel(c);
    setSidebarDrawerOpen(false);
  }, []);

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Mobile sidebar drawer - smooth slide from left */}
      {isMobile && (
        <>
          <div
            className={`drawer-overlay ${sidebarDrawerOpen ? 'active' : ''}`}
            onClick={() => setSidebarDrawerOpen(false)}
          />
          <div className={`drawer-panel-left w-[82%] max-w-[320px] ${sidebarDrawerOpen ? 'open' : ''}`}>
            <Sidebar
              selectedChannel={selectedChannel}
              onSelectChannel={handleSelectChannelMobile}
              collapsed={false}
              onToggleCollapse={() => setSidebarDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <ChatArea
        channel={selectedChannel}
        showMembers={!isMobile && showMembers}
        onToggleMembers={handleToggleMembers}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Desktop: inline member panel */}
      {!isMobile && selectedChannel && showMembers && (
        <MemberList channel={selectedChannel} />
      )}

      {/* Mobile member drawer - smooth slide from right */}
      {isMobile && selectedChannel && (
        <>
          <div
            className={`drawer-overlay ${memberDrawerOpen ? 'active' : ''}`}
            onClick={() => setMemberDrawerOpen(false)}
          />
          <div className={`drawer-panel-right w-[82%] max-w-[320px] ${memberDrawerOpen ? 'open' : ''}`}>
            <div className="h-full bg-surface flex flex-col">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Members</h3>
                <button
                  onClick={() => setMemberDrawerOpen(false)}
                  className="p-2 text-muted hover:text-foreground rounded-xl hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <MemberList channel={selectedChannel} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
