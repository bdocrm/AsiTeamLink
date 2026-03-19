'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';

interface VideoCallProps {
  roomName: string;
  displayName: string;
  onClose: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: Record<string, unknown>) => JitsiAPI;
  }
}

interface JitsiAPI {
  dispose: () => void;
  addListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

export function VideoCall({ roomName, displayName, onClose }: VideoCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load Jitsi Meet External API script
    const script = document.createElement('script');
    script.src = 'https://meet.ffmuc.net/external_api.js';
    script.async = true;
    script.onload = () => {
      if (!containerRef.current) return;

      const api = new window.JitsiMeetExternalAPI('meet.ffmuc.net', {
        roomName: `AsiTeamLink-${roomName}`,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          toolbarButtons: [
            'camera',
            'chat',
            'closedcaptions',
            'desktop',
            'fullscreen',
            'hangup',
            'microphone',
            'participants-pane',
            'raisehand',
            'select-background',
            'settings',
            'tileview',
            'toggle-camera',
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          DEFAULT_BACKGROUND: '#1a1a2e',
          TOOLBAR_ALWAYS_VISIBLE: true,
        },
        userInfo: {
          displayName,
        },
      });

      apiRef.current = api;
      setLoading(false);

      api.addListener('readyToClose', () => {
        onClose();
      });
    };

    document.body.appendChild(script);

    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
      // Remove script if still in DOM
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [roomName, displayName, onClose]);

  return (
    <div
      className={`fixed z-50 flex flex-col bg-black rounded-xl overflow-hidden shadow-2xl border border-border ${
        isFullscreen
          ? 'inset-0 rounded-none'
          : 'bottom-4 right-4 w-[720px] h-[480px]'
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface/90 shrink-0">
        <span className="text-sm font-medium text-foreground truncate">
          Video Call — #{roomName}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded transition-colors"
            title={isFullscreen ? 'Minimize' : 'Maximize'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
            title="Leave call"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Jitsi container */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-white/70">Connecting to call...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
