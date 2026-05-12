import { useState, useEffect } from 'react';
import { AlertCircle, Download, Loader, File, Upload, FileDown, User } from 'lucide-react';

interface FileAuditLog {
  id: string;
  user_id: string;
  users?: {
    id: string;
    email: string;
    name: string;
  };
  file_id?: string;
  file_name: string;
  file_size: number;
  file_type: string;
  action: string; // 'upload', 'download', 'delete', 'view'
  channel_id?: string;
  ip_address?: string;
  status: string; // 'success', 'failed'
  error_message?: string;
  created_at: string;
}

export default function FileAuditViewer() {
  const [logs, setLogs] = useState<FileAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async (start?: string, end?: string, action?: string) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (action) params.append('action', action);

      const response = await fetch(`/api/compliance/file-audit?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch file audit logs');
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
    fetchLogs(startDate, endDate, actionFilter);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'upload':
        return <Upload className="w-4 h-4" />;
      case 'download':
        return <FileDown className="w-4 h-4" />;
      case 'view':
        return <File className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      upload: 'bg-success/10 text-success',
      download: 'bg-blue/10 text-blue',
      view: 'bg-purple/10 text-purple',
      delete: 'bg-danger/10 text-danger',
    };
    const color = colors[action] || 'bg-gray/10 text-gray';
    return (
      <span className={`px-2 py-1 rounded-full ${color} text-xs font-medium flex items-center gap-1 w-fit`}>
        {getActionIcon(action)}
        {action.charAt(0).toUpperCase() + action.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === 'success') {
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

  const downloadCSV = () => {
    const headers = [
      'User',
      'Email',
      'Action',
      'File Name',
      'File Size',
      'File Type',
      'Status',
      'Error',
      'IP Address',
      'Timestamp',
    ];
    const rows = logs.map((log) => [
      log.users?.name || 'Unknown',
      log.users?.email || 'Unknown',
      log.action,
      log.file_name,
      formatFileSize(log.file_size),
      log.file_type || 'N/A',
      log.status,
      log.error_message || 'N/A',
      log.ip_address || 'N/A',
      formatDate(log.created_at),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `file-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-5 h-5 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Loading file audit logs...</span>
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
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="chat-input-field text-sm py-2"
        >
          <option value="">All Actions</option>
          <option value="upload">Uploads</option>
          <option value="download">Downloads</option>
          <option value="view">Views</option>
          <option value="delete">Deletions</option>
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

      {/* Stats */}
      {logs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-lg p-4 border border-border/50">
            <p className="text-xs text-muted font-medium mb-1">Total Operations</p>
            <p className="text-2xl font-bold text-foreground">{logs.length}</p>
          </div>
          <div className="bg-surface rounded-lg p-4 border border-border/50">
            <p className="text-xs text-muted font-medium mb-1">Successful</p>
            <p className="text-2xl font-bold text-success">{logs.filter((l) => l.status === 'success').length}</p>
          </div>
          <div className="bg-surface rounded-lg p-4 border border-border/50">
            <p className="text-xs text-muted font-medium mb-1">Failed</p>
            <p className="text-2xl font-bold text-danger">{logs.filter((l) => l.status === 'failed').length}</p>
          </div>
          <div className="bg-surface rounded-lg p-4 border border-border/50">
            <p className="text-xs text-muted font-medium mb-1">Total Size</p>
            <p className="text-2xl font-bold text-foreground">
              {formatFileSize(logs.reduce((acc, l) => acc + l.file_size, 0))}
            </p>
          </div>
        </div>
      )}

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="text-center py-8">
          <File className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted">No file operations found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/50 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted">User</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Action</th>
                <th className="px-4 py-2 text-left font-medium text-muted">File</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Size</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Details</th>
                <th className="px-4 py-2 text-left font-medium text-muted">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-2 text-foreground">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted" />
                      <div>
                        <p className="font-medium text-xs">{log.users?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted">{log.users?.email || 'N/A'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">{getActionBadge(log.action)}</td>
                  <td className="px-4 py-2 text-foreground">
                    <div className="flex items-center gap-2">
                      <File className="w-4 h-4 text-muted" />
                      <div>
                        <p className="font-medium text-xs max-w-xs truncate">{log.file_name}</p>
                        <p className="text-xs text-muted">{log.file_type || 'unknown'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted text-xs font-mono">{formatFileSize(log.file_size)}</td>
                  <td className="px-4 py-2">{getStatusBadge(log.status)}</td>
                  <td className="px-4 py-2 text-muted text-xs">
                    {log.error_message ? (
                      <span title={log.error_message} className="max-w-xs truncate block text-danger">
                        {log.error_message}
                      </span>
                    ) : (
                      log.ip_address || 'N/A'
                    )}
                  </td>
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
