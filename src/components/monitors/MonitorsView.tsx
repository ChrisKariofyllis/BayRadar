"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { MonitorFormModal } from "@/components/monitors/MonitorFormModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { cronLabel, formatBuyingType, formatMonitorPriceRange, formatRelative, parseKeywords } from "@/lib/format-ui";
import type { Monitor } from "@/lib/types";
import { NEW_MONITOR_EVENT } from "@/lib/ui-events";

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

  useEffect(() => {
    const open = () => setCreating(true);
    window.addEventListener(NEW_MONITOR_EVENT, open);
    return () => window.removeEventListener(NEW_MONITOR_EVENT, open);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setCreating(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Monitors</h1>
        <p className="mt-1 text-sm text-zinc-400">Search queries BayRadar watches for new deals.</p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading monitors…</p>
      ) : monitors.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-400">
          No monitors yet. Use <span className="text-zinc-200">New Monitor</span> to start scanning eBay.
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md lg:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-5 py-3.5 font-medium">Monitor</th>
                  <th className="px-5 py-3.5 font-medium">Query / filters</th>
                  <th className="px-5 py-3.5 font-medium">Price</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Last run</th>
                  <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((monitor) => (
                  <tr
                    key={monitor.id}
                    className="border-b border-white/[0.06] align-top last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-5">
                      <div className="font-medium text-zinc-100">{monitor.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{cronLabel(monitor.cronSchedule)}</div>
                    </td>
                    <td className="px-5 py-5">
                      <div className="text-zinc-200">{monitor.query}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Capsule>{formatBuyingType(monitor.buyingType)}</Capsule>
                        {monitor.categoryId ? <Capsule>Cat {monitor.categoryId}</Capsule> : null}
                        {monitor.maxRemainingHours ? <Capsule>{monitor.maxRemainingHours}h left</Capsule> : null}
                        {parseKeywords(monitor.negativeKeywords).map((keyword) => (
                          <Capsule key={keyword}>{keyword}</Capsule>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-5 font-medium tabular-nums text-zinc-100">
                      {formatMonitorPriceRange(monitor.minPrice, monitor.maxPrice)}
                    </td>
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={monitor.isActive}
                          onCheckedChange={(value) => toggle(monitor, value)}
                          label={`Toggle ${monitor.name}`}
                        />
                        <span className="text-xs text-zinc-500">{monitor.isActive ? "Active" : "Paused"}</span>
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-zinc-500">{monitor.seenListingsCount} seen</div>
                    </td>
                    <td className="px-5 py-5 text-zinc-400">{formatRelative(monitor.lastRunAt)}</td>
                    <td className="px-5 py-5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(monitor)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setPendingDelete(monitor)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {monitors.map((monitor) => (
              <Card key={monitor.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium text-zinc-50">{monitor.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{monitor.query}</p>
                  </div>
                  <Switch
                    checked={monitor.isActive}
                    onCheckedChange={(value) => toggle(monitor, value)}
                    label={`Toggle ${monitor.name}`}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Capsule className="tabular-nums font-medium">
                    {formatMonitorPriceRange(monitor.minPrice, monitor.maxPrice)}
                  </Capsule>
                  <Capsule>{formatBuyingType(monitor.buyingType)}</Capsule>
                  {monitor.maxRemainingHours ? <Capsule>{monitor.maxRemainingHours}h</Capsule> : null}
                  {parseKeywords(monitor.negativeKeywords).map((keyword) => (
                    <Capsule key={keyword}>{keyword}</Capsule>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{formatRelative(monitor.lastRunAt)}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(monitor)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => setPendingDelete(monitor)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
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

function Capsule({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-300 ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
