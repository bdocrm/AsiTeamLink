import { useState, useEffect } from 'react';
import { AlertCircle, Download, Loader, Trash2, MessageCircle, Users } from 'lucide-react';

interface DeletionAuditLog {
  id: string;
  user_id: string;
  users?: {
    id: string;
    email: string;
    name: string;
  };
  entity_type: string; // 'message', 'channel', 'file'
  entity_id: string;
  entity_name?: string;
  reason?: string;
  permanent: boolean;
  deleted_at: string;
  created_at: string;
}

export default function DeletionAuditViewer() {
  const [logs, setLogs] = useState<DeletionAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async (start?: string, end?: string, entityType?: string) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (entityType) params.append('entityType', entityType);

      const response = await fetch(`/api/compliance/deletion-audit?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch deletion logs');
        return;
      }

      setLogs(data.logs || []);
      setError('');
    } catch (err) {
      console.error('Fetch logs error:', err);
      setError('An error occurred while fetching logs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterClick = () => {
    fetchLogs(startDate, endDate, entityTypeFilter);
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

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageCircle className="w-4 h-4" />;
      case 'channel':
        return <Users className="w-4 h-4" />;
      case 'file':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <Trash2 className="w-4 h-4" />;
    }
  };

  const getEntityBadge = (type: string) => {
    const colors: Record<string, string> = {
      message: 'bg-blue/10 text-blue',
      channel: 'bg-purple/10 text-purple',
      file: 'bg-orange/10 text-orange',
    };
    const color = colors[type] || 'bg-gray/10 text-gray';
    return (
      <span className={`px-2 py-1 rounded-full ${color} text-xs font-medium flex items-center gap-1 w-fit`}>
        {getEntityIcon(type)}
        {(((type || '') + '').charAt(0) || '').toUpperCase() + ((type || '').slice(1) || '')}
      </span>
    );
  };

  const getPermanentBadge = (permanent: boolean) => {
    if (permanent) {
      return (
        <span className="px-2 py-1 rounded-full bg-danger/10 text-danger text-xs font-medium">
          Permanent
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
        Soft Delete
      </span>
    );
  };

  const downloadCSV = () => {
    const headers = [
      'User',
      'Email',
      'Type',
      'Entity Name',
      'Deletion Type',
      'Reason',
      'Deleted At',
      'Timestamp',
    ];
    const rows = logs.map((log) => [
      log.users?.name || 'Unknown',
      log.users?.email || 'Unknown',
      log.entity_type,
      log.entity_name || log.entity_id,
      log.permanent ? 'Permanent' : 'Soft Delete',
      log.reason || 'N/A',
      formatDate(log.deleted_at),
      formatDate(log.created_at),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deletion-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-5 h-5 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading deletion logs...</span>
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
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="chat-input-field text-sm py-2"
        >
          <option value="">All Entity Types</option>
          <option value="message">Messages</option>
          <option value="channel">Channels</option>
          <option value="file">Files</option>
        </select>
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
          <Trash2 className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted">No deletions found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/50 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted">User</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Entity</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Deletion Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Reason</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Deleted At</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-2 text-foreground">
                    <div>
                      <p className="font-medium">{log.users?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted">{log.users?.email || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2">{getEntityBadge(log.entity_type)}</td>
                  <td className="px-4 py-2 text-foreground">
                    <p>{log.entity_name || 'Unknown'}</p>
                    <p className="text-xs text-muted font-mono">{log.entity_id}</p>
                  </td>
                  <td className="px-4 py-2">{getPermanentBadge(log.permanent)}</td>
                  <td className="px-4 py-2 text-muted text-xs max-w-xs truncate">{log.reason || 'N/A'}</td>
                  <td className="px-4 py-2 text-muted text-xs">{formatDate(log.deleted_at)}</td>
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
