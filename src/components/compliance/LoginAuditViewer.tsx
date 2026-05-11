import { useState, useEffect } from 'react';
import { LogIn, LogOut, AlertCircle, Download, Loader } from 'lucide-react';

interface LoginAuditLog {
  id: string;
  user_id: string;
  users: {
    id: string;
    email: string;
    name: string;
  };
  ip_address: string;
  device_name: string;
  attempt_type: string; // 'password', 'otp', 'session_check'
  success: boolean;
  reason: string;
  created_at: string;
}

export default function LoginAuditViewer() {
  const [logs, setLogs] = useState<LoginAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async (start?: string, end?: string) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);

      const response = await fetch(`/api/compliance/login-audit?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch logs');
        return;
      }

      setLogs(data.logs || []);
    } catch (err) {
      console.error('Fetch logs error:', err);
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterClick = () => {
    fetchLogs(startDate, endDate);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const getStatusBadge = (success: boolean, reason: string) => {
    if (success) {
      return (
        <span className="px-2 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
          ✓ Success
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full bg-danger/10 text-danger text-xs font-medium">
        ✗ Failed
      </span>
    );
  };

  const getAttemptBadge = (type: string) => {
    const colors: Record<string, string> = {
      password: 'bg-blue/10 text-blue',
      otp: 'bg-purple/10 text-purple',
      session_check: 'bg-green/10 text-green',
    };
    const color = colors[type] || 'bg-gray/10 text-gray';
    return <span className={`px-2 py-1 rounded-full ${color} text-xs font-medium`}>{type}</span>;
  };

  const downloadCSV = () => {
    const headers = ['User Email', 'Device', 'IP Address', 'Attempt Type', 'Success', 'Reason', 'Timestamp'];
    const rows = logs.map((log) => [
      log.users.email,
      log.device_name || 'Unknown',
      log.ip_address || 'Unknown',
      log.attempt_type,
      log.success ? 'Yes' : 'No',
      log.reason,
      formatDate(log.created_at),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `login-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-5 h-5 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading audit logs...</span>
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

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="chat-input-field text-sm py-2"
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="chat-input-field text-sm py-2"
          placeholder="End date"
        />
        <button onClick={handleFilterClick} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
          Filter
        </button>
        {logs.length > 0 && (
          <button onClick={downloadCSV} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="text-center py-8">
          <LogIn className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted">No login attempts found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/50 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted">User</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Device</th>
                <th className="px-4 py-2 text-left font-medium text-muted">IP Address</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Reason</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-2 text-foreground">
                    <div>
                      <p className="font-medium">{log.users.name}</p>
                      <p className="text-xs text-muted">{log.users.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-foreground">{log.device_name || 'Unknown'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{log.ip_address || 'N/A'}</td>
                  <td className="px-4 py-2">{getAttemptBadge(log.attempt_type)}</td>
                  <td className="px-4 py-2">{getStatusBadge(log.success, log.reason)}</td>
                  <td className="px-4 py-2 text-muted text-xs">{log.reason}</td>
                  <td className="px-4 py-2 text-muted text-xs">{formatDate(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
