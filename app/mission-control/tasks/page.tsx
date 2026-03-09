"use client";
/**
 * app/mission-control/tasks/page.tsx
 * Kanban task board — ClawDeck-style 5-column board.
 */

import { useState, useEffect, useCallback } from "react";

type TaskStatus   = "backlog" | "planned" | "in_progress" | "blocked" | "done";
type TaskPriority = "low" | "med" | "high";

interface MissionTask {
  id:              string;
  title:           string;
  description:     string;
  status:          TaskStatus;
  priority:        TaskPriority;
  agent_id:        string;
  conversation_id: string;
  created_at:      string;
  updated_at:      string;
}

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog",     label: "Backlog",     color: "bg-gray-100 text-gray-600" },
  { key: "planned",     label: "Planned",     color: "bg-blue-100 text-blue-700" },
  { key: "in_progress", label: "In Progress", color: "bg-violet-100 text-violet-700" },
  { key: "blocked",     label: "Blocked",     color: "bg-red-100 text-red-600" },
  { key: "done",        label: "Done",        color: "bg-emerald-100 text-emerald-700" },
];

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low:  "bg-gray-100 text-gray-500",
  med:  "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-600",
};

const STATUS_ORDER: TaskStatus[] = ["backlog","planned","in_progress","blocked","done"];

function TaskCard({ task, onMove, onDelete }: {
  task:     MissionTask;
  onMove:   (id: string, newStatus: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const currentIdx = STATUS_ORDER.indexOf(task.status);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{task.title}</p>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>
      )}
      {task.agent_id && (
        <p className="text-xs text-gray-400 font-mono">Agent: {task.agent_id.slice(0, 12)}…</p>
      )}
      {/* Move controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1">
          {currentIdx > 0 && (
            <button
              onClick={() => { void onMove(task.id, STATUS_ORDER[currentIdx - 1]); }}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
              title={`Move to ${STATUS_ORDER[currentIdx - 1]}`}
            >← Back</button>
          )}
          {currentIdx < STATUS_ORDER.length - 1 && (
            <button
              onClick={() => { void onMove(task.id, STATUS_ORDER[currentIdx + 1]); }}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
              title={`Move to ${STATUS_ORDER[currentIdx + 1]}`}
            >Next →</button>
          )}
        </div>
        <button
          onClick={() => { void onDelete(task.id); }}
          className="text-xs text-red-400 hover:text-red-600 px-1"
          title="Delete task"
        >✕</button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks,   setTasks]   = useState<MissionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // New task form
  const [title,   setTitle]   = useState("");
  const [desc,    setDesc]    = useState("");
  const [status,  setStatus]  = useState<TaskStatus>("backlog");
  const [priority,setPriority]= useState<TaskPriority>("med");
  const [agentId, setAgentId] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/mission-control/tasks");
      const data = await res.json() as { tasks?: MissionTask[] };
      setTasks(data.tasks ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  async function moveTask(id: string, newStatus: TaskStatus) {
    await fetch(`/api/mission-control/tasks/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: newStatus }),
    });
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/mission-control/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/mission-control/tasks", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ title: title.trim(), description: desc, status, priority, agent_id: agentId || undefined }),
    });
    if (res.ok) {
      const data = await res.json() as { task?: MissionTask };
      if (data.task) setTasks((prev) => [data.task!, ...prev]);
      setTitle(""); setDesc(""); setStatus("backlog"); setPriority("med"); setAgentId(""); setShowAdd(false);
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Failed to create task");
    }
    setSaving(false);
  }

  const tasksByStatus: Record<TaskStatus, MissionTask[]> = {
    backlog:     tasks.filter((t) => t.status === "backlog"),
    planned:     tasks.filter((t) => t.status === "planned"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    blocked:     tasks.filter((t) => t.status === "blocked"),
    done:        tasks.filter((t) => t.status === "done"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">Kanban board — track your missions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void fetchTasks()} className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200">
            Refresh
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
            + New Task
          </button>
        </div>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">New Task</h3>
          <form onSubmit={(e) => { void createTask(e); }} className="space-y-3">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title *"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <div className="grid grid-cols-3 gap-3">
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300">
                {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="low">Low</option>
                <option value="med">Medium</option>
                <option value="high">High</option>
              </select>
              <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Agent ID (optional)"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create Task"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading tasks…</p>
      ) : (
        /* Kanban board */
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          {COLUMNS.map((col) => (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${col.color}`}>{col.label}</span>
                <span className="text-xs text-gray-400">{tasksByStatus[col.key].length}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {tasksByStatus[col.key].map((task) => (
                  <TaskCard key={task.id} task={task} onMove={moveTask} onDelete={deleteTask} />
                ))}
                {tasksByStatus[col.key].length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-300">Empty</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
