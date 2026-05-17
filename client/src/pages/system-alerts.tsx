/**
 * B-NEW-40 — System Alerts dashboard tab
 *
 * Lists alerts in `state: active | scheduled` from the server-side
 * `/var/log/dawntrader/system-alerts.jsonl` queue. 30-second polling refresh.
 * Ack button moves an entry to `acknowledged` state.
 *
 * Minimum viable per B_NEW_40_SCOPE.md §2.8.e. UI polish (filtering,
 * sorting, search, detail view, history) explicitly deferred to a future batch
 * — see scope §3 out-of-scope list.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth';

interface SystemAlert {
  id: string;
  created_at: string;
  triggers_at: string;
  fired_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  state: 'scheduled' | 'active' | 'acknowledged' | 'resolved';
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

interface SystemAlertsResponse {
  ok: boolean;
  capturedAt: string;
  counts: { active: number; scheduled: number; surfaceableNow: number };
  entries: SystemAlert[];
}

function severityColor(severity: SystemAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'info':
    default:
      return 'bg-blue-100 text-blue-800 border-blue-300';
  }
}

function stateColor(state: SystemAlert['state']): string {
  switch (state) {
    case 'active':
      return 'bg-orange-100 text-orange-800';
    case 'scheduled':
      return 'bg-gray-100 text-gray-700';
    case 'acknowledged':
      return 'bg-green-100 text-green-700';
    case 'resolved':
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SystemAlertsPage() {
  const queryClient = useQueryClient();
  const [actorOverride, setActorOverride] = useState<string>('kyle');

  const { data, isLoading, error, refetch } = useQuery<SystemAlertsResponse>({
    queryKey: ['/api/system-alerts'],
    queryFn: async () => {
      const res = await authFetch('/api/system-alerts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000, // 30s polling per scope
  });

  const ackMutation = useMutation({
    mutationFn: async ({ id, by }: { id: string; by: string }) => {
      const res = await authFetch(`/api/system-alerts/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system-alerts'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">System Alerts</h1>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">System Alerts</h1>
        <div className="text-red-600">Failed to load alerts: {(error as Error).message}</div>
        <button
          onClick={() => refetch()}
          className="mt-2 px-3 py-1 border rounded text-sm hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const counts = data?.counts ?? { active: 0, scheduled: 0, surfaceableNow: 0 };

  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">System Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Captured at {fmtTs(data?.capturedAt ?? null)} · auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded bg-orange-100 text-orange-800 font-medium">
            {counts.active} active
          </span>
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 font-medium">
            {counts.scheduled} scheduled
          </span>
          {counts.surfaceableNow > 0 && (
            <span className="px-2 py-1 rounded bg-red-100 text-red-800 font-medium">
              {counts.surfaceableNow} surfaceable now
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="text-gray-600">Ack as:</label>
        <input
          value={actorOverride}
          onChange={(e) => setActorOverride(e.target.value)}
          className="px-2 py-1 border rounded text-sm w-40"
          placeholder="kyle"
        />
        <span className="text-gray-400 text-xs">(written to acknowledged_by audit field)</span>
      </div>

      {entries.length === 0 ? (
        <div className="border rounded p-8 text-center text-gray-500 bg-white">
          No active or scheduled alerts. The queue is empty.
        </div>
      ) : (
        <div className="border rounded bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-gray-700">State</th>
                <th className="px-3 py-2 font-medium text-gray-700">Severity</th>
                <th className="px-3 py-2 font-medium text-gray-700">Category</th>
                <th className="px-3 py-2 font-medium text-gray-700">Triggers At</th>
                <th className="px-3 py-2 font-medium text-gray-700">Title</th>
                <th className="px-3 py-2 font-medium text-gray-700">Body</th>
                <th className="px-3 py-2 font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((alert) => (
                <tr key={alert.id} className="border-t hover:bg-gray-50 align-top">
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateColor(alert.state)}`}>
                      {alert.state}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${severityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{alert.category}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtTs(alert.triggers_at)}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{alert.title}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-md whitespace-pre-wrap">{alert.body}</td>
                  <td className="px-3 py-2">
                    {alert.state === 'active' && (
                      <button
                        onClick={() => ackMutation.mutate({ id: alert.id, by: actorOverride })}
                        disabled={ackMutation.isPending}
                        className="px-3 py-1 border rounded text-xs hover:bg-green-50 hover:border-green-300 disabled:opacity-50"
                      >
                        {ackMutation.isPending ? 'Acking…' : 'Ack'}
                      </button>
                    )}
                    {alert.state === 'scheduled' && (
                      <span className="text-xs text-gray-400">waiting</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mt-6 text-sm text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">About this tab</summary>
        <div className="mt-2 space-y-2 pl-2">
          <p>
            This is the canonical queue of system events that need human or AI review. AI sessions
            (CC + Langston) read the same data on every conversation turn per CLAUDE.md §10.5. The
            server-side dispatcher promotes scheduled alerts to active when their trigger time
            arrives. Critical-severity alerts also fire a Telegram notification.
          </p>
          <p>
            Acknowledging an alert moves it out of the surfaceable set. Use the "Ack as" field
            above to record who's acknowledging. Resolved alerts are kept in history but not
            shown here.
          </p>
          <p>
            Sources: <code>/var/log/dawntrader/system-alerts.jsonl</code> · CLI:{' '}
            <code>npm run system-alerts</code> · Scope:{' '}
            <code>B_NEW_40_SCOPE.md §2.8</code>
          </p>
        </div>
      </details>
    </div>
  );
}
