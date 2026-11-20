import React, { useState, useMemo, useEffect } from "react";
import { User, EmployeeNotification, ModulePermission } from "../../types";
import { Bell, Megaphone, CheckCheck, Send } from "lucide-react";
import { validateAnnouncementForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast } from "../ui/ToastProvider";

interface NotificationsViewProps {
  currentUser: User | null;
  notifications: EmployeeNotification[];
  permissions?: ModulePermission;
  initialSubTab?: string;
  onMarkRead: (notificationId: string) => void;
  onPublishAnnouncement?: (announcement: EmployeeNotification) => Promise<boolean> | boolean;
}

export default function NotificationsView({
  currentUser,
  notifications,
  permissions,
  initialSubTab,
  onMarkRead,
  onPublishAnnouncement,
}: NotificationsViewProps) {
  const { showSuccess, showError } = useToast();
  const isEmployee = currentUser?.role === "Employee";
  const canPublish =
    !isEmployee &&
    (permissions ? permissions.actions.create : currentUser?.role === "Administrator" || currentUser?.role === "HR Officer");

  const visibleTabs = [
    { id: "personal", label: "Personal Notifications", icon: Bell },
    { id: "announcements", label: "HR Announcements", icon: Megaphone },
  ].filter((t) => !permissions || permissions.submenus[t.id] !== false);

  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) return initialSubTab;
    return visibleTabs[0]?.id || "personal";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    } else if (!visibleTabs.some((t) => t.id === activeSubTab) && visibleTabs[0]) {
      setActiveSubTab(visibleTabs[0].id);
    }
  }, [initialSubTab, permissions]);

  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);

  const personalNotifications = useMemo(() => {
    const empId = currentUser?.employeeId;
    const emailNorm = (currentUser?.email || "").trim().toLowerCase();
    return notifications
      .filter((n) => {
        if (n.category !== "personal") return false;
        if (!isEmployee && !empId) return true;
        return (
          (empId && n.recipientEmployeeId === empId) ||
          (emailNorm && n.recipientEmail?.trim().toLowerCase() === emailNorm) ||
          (currentUser?.id && n.ownerUid === currentUser.id)
        );
      })
      .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
  }, [notifications, currentUser, isEmployee]);

  const announcements = useMemo(() => {
    return notifications
      .filter((n) => n.category === "announcement")
      .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
  }, [notifications]);

  const isRead = (n: EmployeeNotification): boolean => {
    if (!currentUser) return true;
    if (n.category === "announcement") {
      return Boolean(n.readByUserIds?.includes(currentUser.id));
    }
    return Boolean(n.isRead);
  };

  const handlePublish = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canPublish || !onPublishAnnouncement || publishing) return;

    const validation = validateAnnouncementForm({ title: annTitle, message: annMessage });
    if (!validation.valid) {
      setErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setErrors({});
    setPublishing(true);
    try {
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      const item: EmployeeNotification = {
        id: `ANN_${Date.now()}`,
        category: "announcement",
        title: annTitle.trim(),
        message: annMessage.trim(),
        module: "HR Announcements",
        readByUserIds: [],
        createdBy: currentUser?.email || "HR Administration",
        createdDate: now,
      };
      const ok = await onPublishAnnouncement(item);
      if (ok) {
        showSuccess("HR Announcement published to all employees.");
        setAnnTitle("");
        setAnnMessage("");
      } else {
        showError("Failed to publish HR announcement.");
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">Notifications</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Personal workflow alerts and official Ethiopian Reinsurance Human Resources announcements.
          </p>
        </div>
      </div>

      {/* 1. Personal Notifications */}
      {activeSubTab === "personal" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-slate-800">Personal Notifications ({personalNotifications.length})</h2>
          </div>

          {personalNotifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No personal notifications yet. Leave, request, and payroll updates will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {personalNotifications.map((n) => {
                const read = isRead(n);
                return (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      read ? "bg-slate-50 border-slate-200" : "bg-amber-50/50 border-amber-200"
                    }`}
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        {!read && <span className="h-2 w-2 rounded-full bg-amber-500"></span>}
                        <span className="font-extrabold text-slate-800">{n.title}</span>
                      </div>
                      <p className="text-slate-600">{n.message}</p>
                      <p className="text-[10px] text-slate-400">
                        {n.createdDate} • {n.module || "HR System"}
                      </p>
                    </div>
                    {!read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-primary-custom rounded-lg flex items-center gap-1 shrink-0"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark Read
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. HR Announcements */}
      {activeSubTab === "announcements" && (
        <div className="space-y-6">
          {canPublish && onPublishAnnouncement && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
              <h2 className="text-sm font-extrabold text-slate-800">Publish New HR Announcement</h2>
              <form noValidate onSubmit={handlePublish} className="space-y-3">
                <ValidationSummary errors={errors} />
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Title *</label>
                  <input
                    data-field="annTitle"
                    type="text"
                    value={annTitle}
                    onChange={(e) => {
                      setAnnTitle(e.target.value);
                      if (errors.annTitle) setErrors((p) => ({ ...p, annTitle: "" }));
                    }}
                    placeholder="Announcement headline"
                    className={fieldInputClass(Boolean(errors.annTitle), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.annTitle} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Message *</label>
                  <textarea
                    data-field="annMessage"
                    rows={3}
                    value={annMessage}
                    onChange={(e) => {
                      setAnnMessage(e.target.value);
                      if (errors.annMessage) setErrors((p) => ({ ...p, annMessage: "" }));
                    }}
                    placeholder="Write official HR notice to all employees..."
                    className={fieldInputClass(Boolean(errors.annMessage), "w-full px-3 py-2 border rounded-lg text-xs")}
                  />
                  <FormFieldError error={errors.annMessage} />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={publishing}
                    className="px-4 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5 text-accent-custom" />
                    <span>{publishing ? "Publishing..." : "Publish Announcement"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            <h2 className="text-sm font-extrabold text-slate-800">HR Announcements ({announcements.length})</h2>
            {announcements.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No HR announcements posted at this time.
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => {
                  const read = isRead(ann);
                  return (
                    <div
                      key={ann.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        read ? "bg-slate-50 border-slate-200" : "bg-sky-50/50 border-sky-200"
                      }`}
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <Megaphone className="h-4 w-4 text-primary-custom shrink-0" />
                          <span className="font-extrabold text-slate-800">{ann.title}</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{ann.message}</p>
                        <p className="text-[10px] text-slate-400">
                          Posted by {ann.createdBy} on {ann.createdDate}
                        </p>
                      </div>
                      {!read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(ann.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-primary-custom rounded-lg flex items-center gap-1 shrink-0"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Acknowledge
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
