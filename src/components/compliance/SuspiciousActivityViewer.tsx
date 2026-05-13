import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Download,
  Trash2,
  Globe,
  RefreshCw,
  Loader,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { SuspiciousEvent } from '@/app/api/compliance/suspicious-activity/route';

const TYPE_CONFIG: Record<
  SuspiciousEvent['type'],
  { label: string; icon: typeof AlertTriangle }
> = {
  brute_force: { label: 'Brute Force', icon: ShieldAlert },
  after_hours_login: { label: 'After-Hours Login', icon: Clock },
  mass_download: { label: 'Mass Download', icon: Download },
  bulk_deletion: { label: 'Bulk Deletion', icon: Trash2 },
  ip_hopping: { label: 'IP Hopping', icon: Globe },
};

const SEVERITY_STYLES: Record<SuspiciousEvent['severity'], string> = {
  high: 'bg-red-500/15 text-red-500 border-red-500/30',
  medium: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  low: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
};

const SEVERITY_ROW: Record<SuspiciousEvent['severity'], string> = {
  high: 'border-l-4 border-l-red-500',
  medium: 'border-l-4 border-l-orange-500',
  low: 'border-l-4 border-l-yellow-500',
};

function formatDatePHT(utcStr: string) {
  return new Date(utcStr).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function SuspiciousActivityViewer() {
  const [events, setEvents] = useState<SuspiciousEvent[]>([]);
  const [scannedSince, setScannedSince] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | SuspiciousEvent['severity']>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | SuspiciousEvent['type']>('all');

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/compliance/suspicious-activity');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch suspicious activity');
        return;
      }
      setEvents(data.events ?? []);
      setScannedSince(data.scanned_since ?? '');
    } catch {
      setError('An error occurred while fetching data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filtered = events.filter((e) => {
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    return true;
  });

  const countBySeverity = (s: SuspiciousEvent['severity']) =>
    events.filter((e) => e.severity === s).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Suspicious Activity Detection
          </h2>
          {scannedSince && (
            <p className="text-xs text-muted mt-0.5">
              Scanning the last 24 hours — since {formatDatePHT(scannedSince)}
            </p>
          )}
        </div>
        <button
          onClick={fetchEvents}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {(['high', 'medium', 'low'] as const).map((s) => (
          <div
            key={s}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${SEVERITY_STYLES[s]}`}
          >
            <span className="capitalize">{s}</span>
            <span className="font-bold">{countBySeverity(s)}</span>
          </div>
        ))}
        {events.length === 0 && !isLoading && (
          <div className="flex items-center gap-2 text-xs text-green-500">
            <CheckCircle className="w-4 h-4" />
            No suspicious activity detected in the last 24 hours
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="text-xs px-2 py-1.5 rounded-md border border-border bg-surface text-foreground"
        >
          <option value="all">All Severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="text-xs px-2 py-1.5 rounded-md border border-border bg-surface text-foreground"
        >
          <option value="all">All Types</option>
          <option value="brute_force">Brute Force</option>
          <option value="after_hours_login">After-Hours Login</option>
          <option value="mass_download">Mass Download</option>
          <option value="bulk_deletion">Bulk Deletion</option>
          <option value="ip_hopping">IP Hopping</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted">
          <Loader className="w-5 h-5 animate-spin mr-2" />
          Scanning audit logs for suspicious patterns…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 text-sm py-4">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          {events.length > 0
            ? 'No events match the selected filters.'
            : 'No suspicious activity detected.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => {
            const cfg = TYPE_CONFIG[event.type];
            const Icon = cfg.icon;
            const isExpanded = expandedId === event.id;

            return (
              <div
                key={event.id}
                className={`rounded-lg border border-border bg-surface/40 overflow-hidden ${SEVERITY_ROW[event.severity]}`}
              >
                {/* Row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface/60 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <Icon className="w-4 h-4 shrink-0 text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {event.description}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${SEVERITY_STYLES[event.severity]}`}
                      >
                        {event.severity}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted uppercase tracking-wide">
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-muted">
                      <span>{event.user_name} &lt;{event.user_email}&gt;</span>
                      <span>{formatDatePHT(event.detected_at)}</span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/50 text-sm text-foreground/80 bg-surface/20">
                    <p>{event.detail}</p>
                    <p className="text-xs text-muted mt-2">User ID: {event.user_id}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
