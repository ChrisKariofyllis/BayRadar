"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { MonitorFormModal } from "@/components/monitors/MonitorFormModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { cronLabel, formatBuyingType, formatEuro, formatRelative, parseKeywords } from "@/lib/format-ui";
import type { Monitor } from "@/lib/types";

export function MonitorsView() {
  const { push } = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Monitor | null>(null);

  async function load() {
    const data = await api<{ monitors: Monitor[] }>("/api/monitors");
    setMonitors(data.monitors);
  }

  useEffect(() => {
    load()
      .catch((error) => {
        push({
          tone: "error",
          title: "Could not load monitors",
          description: error instanceof ApiError ? error.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, [push]);

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/monitors/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        push({ tone: "success", title: "Monitor updated" });
      } else {
        await api("/api/monitors", { method: "POST", body: JSON.stringify(payload) });
        push({ tone: "success", title: "Monitor created" });
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (error) {
      push({
        tone: "error",
        title: "Save failed",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(monitor: Monitor, isActive: boolean) {
    setMonitors((current) => current.map((item) => (item.id === monitor.id ? { ...item, isActive } : item)));
    try {
      await api(`/api/monitors/${monitor.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
    } catch (error) {
      setMonitors((current) => current.map((item) => (item.id === monitor.id ? { ...item, isActive: monitor.isActive } : item)));
      push({
        tone: "error",
        title: "Could not update status",
        description: error instanceof ApiError ? error.message : undefined,
      });
    }
  }

  async function remove(monitor: Monitor) {
    setSaving(true);
    try {
      await api(`/api/monitors/${monitor.id}`, { method: "DELETE" });
      setPendingDelete(null);
      push({ tone: "success", title: "Monitor deleted" });
      await load();
    } catch (error) {
      push({
        tone: "error",
        title: "Delete failed",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Monitors</h1>
          <p className="mt-1 text-sm text-zinc-400">Search queries BayRadar watches for new deals.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New monitor
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading monitors…</p>
      ) : monitors.length === 0 ? (
        <Card className="p-8 text-center text-sm text-zinc-400">
          No monitors yet. Create one to start scanning eBay.
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Monitor</th>
                  <th className="px-4 py-3 font-medium">Query / filters</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last run</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                {monitors.map((monitor) => (
                  <tr key={monitor.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-medium text-zinc-100">{monitor.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{cronLabel(monitor.cronSchedule)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-zinc-200">{monitor.query}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge>{formatBuyingType(monitor.buyingType)}</Badge>
                        {monitor.categoryId ? <Badge tone="info">Cat {monitor.categoryId}</Badge> : null}
                        {monitor.maxRemainingHours ? <Badge tone="warning">{monitor.maxRemainingHours}h left</Badge> : null}
                        {parseKeywords(monitor.negativeKeywords).map((keyword) => (
                          <Badge key={keyword} tone="danger">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-zinc-100">{formatEuro(monitor.maxPrice)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Switch checked={monitor.isActive} onCheckedChange={(value) => toggle(monitor, value)} label={`Toggle ${monitor.name}`} />
                        <Badge tone={monitor.isActive ? "success" : "neutral"}>{monitor.isActive ? "Active" : "Paused"}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{monitor.seenListingsCount} seen</div>
                    </td>
                    <td className="px-4 py-4 text-zinc-400">{formatRelative(monitor.lastRunAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => setEditing(monitor)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="danger" size="icon" onClick={() => setPendingDelete(monitor)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:hidden">
            {monitors.map((monitor) => (
              <Card key={monitor.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium text-zinc-50">{monitor.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{monitor.query}</p>
                  </div>
                  <Badge tone={monitor.isActive ? "success" : "neutral"}>{monitor.isActive ? "Active" : "Paused"}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge>{formatEuro(monitor.maxPrice)}</Badge>
                  <Badge>{formatBuyingType(monitor.buyingType)}</Badge>
                  {monitor.maxRemainingHours ? <Badge tone="warning">{monitor.maxRemainingHours}h</Badge> : null}
                  {parseKeywords(monitor.negativeKeywords).map((keyword) => (
                    <Badge key={keyword} tone="danger">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={monitor.isActive} onCheckedChange={(value) => toggle(monitor, value)} />
                    <span className="text-xs text-zinc-500">{formatRelative(monitor.lastRunAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(monitor)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setPendingDelete(monitor)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <MonitorFormModal
        open={creating || Boolean(editing)}
        monitor={editing}
        saving={saving}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={save}
      />

      <Modal
        open={Boolean(pendingDelete)}
        title="Delete monitor?"
        description={pendingDelete ? `This removes “${pendingDelete.name}” and all of its seen listings.` : undefined}
        onClose={() => setPendingDelete(null)}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={saving} onClick={() => pendingDelete && remove(pendingDelete)}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
