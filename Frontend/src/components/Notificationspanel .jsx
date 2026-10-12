

import { useState, useEffect, useCallback } from "react";
import API from "../api";

const tok = () => localStorage.getItem("token");
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

const authGet = (url) =>
  fetch(`${API}${url}`, { headers: hdr() }).then(r => (r.ok ? r.json() : []));
const authPut = (url) =>
  fetch(`${API}${url}`, { method: "PUT", headers: hdr() });

const TYPE_ICON = {
  loan:    "💼",
  warning: "⚠️",
  salary:  "💰",
  message: "💬",
  info:    "ℹ️",
};

const TYPE_BG = {
  loan:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-red-50 border-red-200 text-red-800",
  salary:  "bg-green-50 border-green-200 text-green-800",
  message: "bg-purple-50 border-purple-200 text-purple-800",
  info:    "bg-gray-50 border-gray-200 text-gray-700",
};

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authGet("/notifications/my");
      if (Array.isArray(data)) setNotifications(data);
    } catch (_) { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  const markRead = async (id) => {
    await authPut(`/notifications/${id}/read`);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    await authPut("/notifications/read-all");
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative">
      {/* ── Bell button ── */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none"
        title="Notifications"
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white
            text-xs font-black rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-slate-200
            rounded-2xl shadow-2xl z-50 overflow-hidden">

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50
              flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 text-sm">Notifications</h3>
                <p className="text-xs text-slate-400">{unread} unread</p>
              </div>
              <div className="flex gap-3 items-center">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-50">
              {loading && notifications.length === 0 ? (
                <p className="p-6 text-center text-slate-400 text-sm">Loading…</p>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-3xl mb-2">🔔</p>
                  <p className="text-slate-400 text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markRead(n.id)}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors
                      ${!n.is_read ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex gap-3">
                      {/* icon badge */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center
                        text-base flex-shrink-0 border ${TYPE_BG[n.type] || TYPE_BG.info}`}
                        style={{ fontSize: 16 }}>
                        {TYPE_ICON[n.type] || "ℹ️"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-0.5">
                          <p className={`text-sm text-slate-800 leading-snug
                            ${!n.is_read ? "font-black" : "font-semibold"}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {n.sender_name ? `From: ${n.sender_name} · ` : ""}
                          {new Date(n.created_at).toLocaleString("en-KE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
              <button
                onClick={fetchNotifications}
                className="text-xs text-slate-500 hover:text-slate-700 font-bold"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}