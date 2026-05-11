import { useState, useEffect } from 'react';
import { Smartphone, X, Loader, AlertCircle } from 'lucide-react';

interface Session {
  id: string;
  device_name: string;
  ip_address: string;
  last_activity_at: string;
  login_at: string;
}

export default function SessionsManager() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/sessions');
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch sessions');
        return;
      }

      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Fetch sessions error:', err);
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevoking(sessionId);
      const response = await fetch('/api/auth/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to revoke session');
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Revoke session error:', err);
      setError('An error occurred');
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-5 h-5 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading sessions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm border border-danger/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <Smartphone className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted">No active sessions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 rounded-lg bg-surface/50 border border-border hover:border-border/80 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Smartphone className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{session.device_name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    IP: {session.ip_address} • Last active: {formatDate(session.last_activity_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRevokeSession(session.id)}
                disabled={revoking === session.id}
                className="ml-2 p-2 rounded-lg hover:bg-danger/10 text-danger hover:text-danger-hover transition-colors disabled:opacity-50 flex-shrink-0"
                title="Revoke this session"
              >
                {revoking === session.id ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted pt-2 border-t border-border">
        <p>
          🔒 <strong>Tip:</strong> Revoke sessions from devices you no longer use. This will sign you out on that
          device.
        </p>
      </div>
    </div>
  );
}
