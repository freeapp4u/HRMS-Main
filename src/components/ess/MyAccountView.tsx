import React, { useState, useEffect } from "react";
import { User, ModulePermission } from "../../types";
import { auth } from "../../firebase";
import { Lock, ShieldCheck, LogOut, KeyRound, CheckCircle2 } from "lucide-react";
import { validatePasswordChangeForm, focusFirstInvalidField } from "../../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "../ui/FormFeedback";
import { useToast } from "../ui/ToastProvider";

interface MyAccountViewProps {
  currentUser: User | null;
  permissions?: ModulePermission;
  initialSubTab?: string;
  onUpdateOwnPassword: (
    oldPass: string,
    newPass: string
  ) => Promise<{ ok: boolean; error?: string }> | boolean;
  onLogout: () => void;
}

const SUBTABS = [
  { id: "change_password", label: "Change Password", icon: KeyRound },
  { id: "security", label: "Account Security", icon: ShieldCheck },
  { id: "logout", label: "Logout", icon: LogOut },
];

export default function MyAccountView({
  currentUser,
  permissions,
  initialSubTab,
  onUpdateOwnPassword,
  onLogout,
}: MyAccountViewProps) {
  const { showSuccess, showError } = useToast();
  const visibleTabs = SUBTABS.filter((t) => !permissions || permissions.submenus[t.id] !== false);
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) return initialSubTab;
    return visibleTabs[0]?.id || "change_password";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isUpdating) return;

    const validation = validatePasswordChangeForm({
      oldPassword,
      newPassword,
      confirmPassword,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setErrors({});
    setIsUpdating(true);
    try {
      const res = await onUpdateOwnPassword(oldPassword, newPassword);
      const ok = typeof res === "boolean" ? res : res.ok;
      const errText =
        typeof res === "object" && res.error
          ? res.error
          : "Current password verification failed. Please check and retry.";
      if (ok) {
        showSuccess("Your portal password has been updated.");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setErrors({ oldPassword: errText });
        showError(errText);
        focusFirstInvalidField({ oldPassword: errText }, e.currentTarget);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const fbUser = auth.currentUser;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">My Account</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your login credentials, review session security status, or safely sign out of ETRHRMS.
          </p>
        </div>
      </div>

      {/* Submenu Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                active ? "bg-primary-custom text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Change Password */}
      {activeSubTab === "change_password" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs max-w-lg">
          <h2 className="text-sm font-extrabold text-slate-800">Change Password</h2>
          <form noValidate onSubmit={handlePasswordSubmit} className="space-y-4">
            <ValidationSummary errors={errors} />
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Current Password *</label>
              <input
                data-field="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  if (errors.oldPassword) setErrors((p) => ({ ...p, oldPassword: "" }));
                }}
                className={fieldInputClass(Boolean(errors.oldPassword), "w-full px-3 py-2 border rounded-lg text-xs")}
              />
              <FormFieldError error={errors.oldPassword} />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">New Password *</label>
              <input
                data-field="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errors.newPassword) setErrors((p) => ({ ...p, newPassword: "" }));
                }}
                className={fieldInputClass(Boolean(errors.newPassword), "w-full px-3 py-2 border rounded-lg text-xs")}
              />
              <FormFieldError error={errors.newPassword} />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Confirm New Password *</label>
              <input
                data-field="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: "" }));
                }}
                className={fieldInputClass(Boolean(errors.confirmPassword), "w-full px-3 py-2 border rounded-lg text-xs")}
              />
              <FormFieldError error={errors.confirmPassword} />
            </div>

            <div className="pt-2 border-t flex justify-end">
              <button
                type="submit"
                disabled={isUpdating}
                className="px-4 py-2 bg-primary-custom text-white text-xs font-bold rounded-lg hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{isUpdating ? "Updating..." : "Update Password"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Account Security */}
      {activeSubTab === "security" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Account Security &amp; Access Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Account Email</span>
              <p className="font-bold text-slate-800 mt-1">{currentUser?.email}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Email Verification</span>
              <p className="font-bold text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {fbUser?.emailVerified || currentUser?.emailVerified ? "Verified" : "Pending Verification"}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Assigned Role &amp; Scope</span>
              <p className="font-bold text-primary-custom mt-1">{currentUser?.role} (Own Records Only)</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Linked Employee ID</span>
              <p className="font-mono font-bold text-slate-800 mt-1">{currentUser?.employeeId || "Not Linked"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Account Status</span>
              <p className="font-bold text-slate-800 mt-1">{currentUser?.status}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400">Last Login</span>
              <p className="font-bold text-slate-700 mt-1">{currentUser?.lastLogin || "Current Session"}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Logout */}
      {activeSubTab === "logout" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Sign Out of ETRHRMS</h2>
          <p className="text-xs text-slate-500">
            Signing out ends your authenticated Firebase session and clears cached personal records from this browser.
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Confirm Logout
          </button>
        </div>
      )}
    </div>
  );
}
