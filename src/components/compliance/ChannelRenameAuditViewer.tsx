'use client';

import { useEffect, useState } from 'react';

interface RenameLog {
  id: string;
  channel_id: string;
  old_name?: string | null;
  new_name: string;
  user_id: string;
  ip_address?: string | null;
  created_at: string;
}

export default function ChannelRenameAuditViewer() {
  const [logs, setLogs] = useState<RenameLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/compliance/channel-rename-logs?limit=200');
      const json = await res.json();
      if (!res.ok) {
        console.error('Failed to fetch rename logs:', json.error);
        setLogs([]);
        setLoading(false);
        return;
      }
      setLogs(json.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Channel Rename Logs</h3>
        <button onClick={fetchLogs} className="px-3 py-1 bg-primary/10 text-primary rounded">Refresh</button>
      </div>
      {loading && <p className="text-sm text-muted">Loading…</p>}
      {!loading && logs.length === 0 && <p className="text-sm text-muted">No rename logs found.</p>}
      {!loading && logs.length > 0 && (
        <div className="overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Channel ID</th>
                <th className="px-2 py-2">Old Name</th>
                <th className="px-2 py-2">New Name</th>
                <th className="px-2 py-2">By</th>
                <th className="px-2 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-2 py-2 text-xs text-muted">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2 break-all">{l.channel_id}</td>
                  <td className="px-2 py-2">{l.old_name || '-'}</td>
                  <td className="px-2 py-2 font-medium">{l.new_name}</td>
                  <td className="px-2 py-2">{l.user_id}</td>
                  <td className="px-2 py-2">{l.ip_address || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
