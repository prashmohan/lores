import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, History, Loader2, RefreshCw, User, ChevronDown, ChevronUp, Clock, PlusCircle, Edit3, Trash2, RotateCcw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AuditLogRead } from '../../types/api';

interface ActivityFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  isViewer?: boolean;
}

export const redactAuditChanges = (
  changes: Record<string, unknown> | null | undefined,
  isViewer: boolean
): Record<string, unknown> | null | undefined => {
  if (!isViewer || !changes) return changes;

  // If explicitly marked not living (deceased), birth/death dates are historical
  const isLiving =
    changes.is_living !== false &&
    (typeof changes.is_living === 'object' && changes.is_living !== null
      ? (changes.is_living as { new?: boolean }).new !== false
      : true);

  if (!isLiving) {
    return changes;
  }

  const sensitiveKeys = new Set([
    'birth_date',
    'birth_place',
    'biography',
    'bio',
    'notes',
    'phone',
    'email',
    'ssn',
  ]);

  const redactValue = (val: unknown): unknown => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if ('old' in obj || 'new' in obj) {
        return {
          ...obj,
          old: obj.old ? '[Redacted for privacy]' : obj.old,
          new: obj.new ? '[Redacted for privacy]' : obj.new,
        };
      }
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        cleaned[k] = sensitiveKeys.has(k.toLowerCase()) ? redactValue(v) : v;
      }
      return cleaned;
    }
    return '[Redacted for privacy]';
  };

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = redactValue(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = redactValue(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

export const ActivityFeedModal: React.FC<ActivityFeedModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  isViewer = false,
}) => {
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.trash.getAuditLogs(workspaceId, { limit: 50 });
      setLogs(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load activity logs.');
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, fetchLogs]);

  if (!isOpen) return null;

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const getActionBadge = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create') || act.includes('insert') || act.includes('add')) {
      return {
        label: 'Created',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: <PlusCircle className="w-3.5 h-3.5" />,
      };
    }
    if (act.includes('update') || act.includes('edit') || act.includes('patch')) {
      return {
        label: 'Updated',
        color: 'bg-sky-100 text-sky-800 border-sky-200',
        icon: <Edit3 className="w-3.5 h-3.5" />,
      };
    }
    if (act.includes('delete') || act.includes('trash') || act.includes('remove')) {
      return {
        label: 'Deleted',
        color: 'bg-rose-100 text-rose-800 border-rose-200',
        icon: <Trash2 className="w-3.5 h-3.5" />,
      };
    }
    if (act.includes('restore')) {
      return {
        label: 'Restored',
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: <RotateCcw className="w-3.5 h-3.5" />,
      };
    }
    return {
      label: action,
      color: 'bg-slate-100 text-slate-800 border-slate-200',
      icon: <Clock className="w-3.5 h-3.5" />,
    };
  };

  const formatEntityType = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'person') return 'Person';
    if (t === 'lore_note' || t === 'lore') return 'Lore Note';
    if (t === 'union' || t === 'relationship' || t === 'childrelationship' || t === 'familyunion') return 'Relationship';
    return type.replace(/_/g, ' ');
  };

  const formatEventDescription = (log: AuditLogRead) => {
    const changes = log.changes || {};
    const actor = log.actor_name || log.actor_email || 'A family member';
    const entity = log.entity_type.toLowerCase();
    const action = log.action.toUpperCase();

    // 1. Relationship events
    if (entity.includes('relationship') || entity.includes('union')) {
      if (changes.action === 'add_relative') {
        const target = (changes.target_person as string) || 'relative';
        const base = (changes.base_person as string) || 'family member';
        const rel = (changes.relationship_type as string) || 'relative';
        return `${actor} connected ${target} as ${rel} of ${base}`;
      }
      if (changes.action === 'disconnect_partner') {
        const p1 = (changes.partner1 as string) || 'partner';
        const p2 = (changes.partner2 as string) || 'partner';
        return `${actor} disconnected partnership between ${p1} and ${p2}`;
      }
      if (changes.action === 'disconnect_parent_child') {
        const parent = (changes.parent as string) || 'parent';
        const child = (changes.child as string) || 'child';
        return `${actor} disconnected ${parent} as parent of ${child}`;
      }
      return `${actor} updated a family relationship`;
    }

    // 2. Person events
    if (entity.includes('person')) {
      const personName = (changes.person as string) || 'family member';
      if (action === 'CREATE') {
        return `${actor} added ${personName} to the family tree`;
      }
      if (action === 'UPDATE') {
        return `${actor} updated profile details for ${personName}`;
      }
      if (action === 'DELETE') {
        return `${actor} moved ${personName} to Family Trash`;
      }
      if (action === 'RESTORE') {
        return `${actor} restored ${personName} from Family Trash`;
      }
    }

    // 3. Lore events
    if (entity.includes('lore')) {
      const title = (changes.title as string) ? `"${changes.title}"` : 'a story';
      if (action === 'CREATE') {
        return `${actor} recorded a new story ${title}`;
      }
      if (action === 'DELETE') {
        return `${actor} moved story ${title} to Family Trash`;
      }
      if (action === 'RESTORE') {
        return `${actor} restored story ${title} from Family Trash`;
      }
    }

    return `${actor} performed ${log.action.toLowerCase()} on ${formatEntityType(log.entity_type)}`;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" />
        <Dialog.Content
          className="fixed bottom-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-50 max-h-[85vh] flex flex-col border-2 border-slate-200 focus:outline-none"
          aria-describedby="activity-feed-description"
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                <History className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <Dialog.Title className="text-2xl font-extrabold text-slate-900 leading-tight">
                  Family Activity Feed
                </Dialog.Title>
                <p id="activity-feed-description" className="text-sm text-slate-600 font-medium">
                  Audit log of all family tree edits, additions, and updates.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchLogs}
                disabled={loading}
                aria-label="Refresh activity logs"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close activity feed"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {error && (
              <div
                role="alert"
                className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-800 text-sm font-semibold flex items-center justify-between"
              >
                <span>{error}</span>
                <button
                  onClick={fetchLogs}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg text-xs font-bold text-red-900"
                >
                  Retry
                </button>
              </div>
            )}

            {loading && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-sm font-bold text-slate-600">Loading activity feed...</p>
              </div>
            )}

            {!loading && logs.length === 0 && !error && (
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <History className="w-7 h-7" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">No Activity Yet</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto mt-1">
                  Changes to members, relations, and stories will appear here in chronological order.
                </p>
              </div>
            )}

            {logs.map((log) => {
              const badge = getActionBadge(log.action);
              const isExpanded = expandedLogId === log.id;
              const sanitizedChanges = redactAuditChanges(log.changes, isViewer);
              const hasChanges = sanitizedChanges && Object.keys(sanitizedChanges).length > 0;

              return (
                <div
                  key={log.id}
                  className="p-4 rounded-2xl border-2 border-slate-200 hover:border-slate-300 transition-colors bg-white shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${badge.color}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {formatEntityType(log.entity_type)}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTimestamp(log.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-800 font-semibold">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{formatEventDescription(log)}</span>
                    </div>

                    {hasChanges && (
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-xs font-bold text-amber-700 hover:text-amber-800 shrink-0 flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide Changes' : 'View Changes'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {isExpanded && hasChanges && (
                    <div className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto">
                      <pre>{JSON.stringify(sanitizedChanges, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-colors cursor-pointer flex items-center justify-center text-sm"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
