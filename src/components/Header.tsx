import React, { useState, useMemo } from "react";
import { User, EmployeeNotification } from "../types";
import { Bell, HelpCircle, LogOut, User as UserIcon, Lock, Menu, X, Save, ShieldCheck } from "lucide-react";
import { useToast } from "./ui/ToastProvider";
import { FormFieldError, ValidationSummary, fieldInputClass } from "./ui/FormFeedback";
import { validatePasswordChangeForm, isValidEmail, isAuthorizedCompanyEmail, focusFirstInvalidField } from "../utils/validation";

interface HeaderProps {
  currentUser: User | null;
  companyName: string;
  logoUrl: string;
  notifications?: EmployeeNotification[];
  showHelpShortcut?: boolean;
  onMarkNotificationRead?: (notificationId: string) => void;
  onOpenNotifications?: () => void;
  onNavigateToProfile?: () => void;
  onLogout: () => void;
  onOpenHelp: () => void;
  onToggleSidebar: () => void;
  onUpdateOwnProfile: (fullName: string, email: string) => boolean;
  onUpdateOwnPassword: (
    oldPass: string,
    newPass: string
  ) => Promise<{ ok: boolean; error?: string }> | boolean;
}

export default function Header({
  currentUser,
  companyName,
  logoUrl,
  notifications = [],
  showHelpShortcut = true,
  onMarkNotificationRead,
  onOpenNotifications,
  onNavigateToProfile,
  onLogout,
  onOpenHelp,
  onToggleSidebar,
  onUpdateOwnProfile,
  onUpdateOwnPassword,
}: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);

  // Form states
  const [profileName, setProfileName] = useState(currentUser?.fullName || "");
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  const { showSuccess, showError } = useToast();
  const [notifMessage, setNotifMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEmployee = currentUser?.role === "Employee";

  const isNotifRead = (n: EmployeeNotification): boolean => {
    if (!currentUser) return true;
    if (n.category === "announcement") {
      return Boolean(n.readByUserIds?.includes(currentUser.id));
    }
    return Boolean(n.isRead);
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !isNotifRead(n)).length,
    [notifications, currentUser?.id]
  );

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setNotifMessage(null);
    const errors: Record<string, string> = {};
    if (!profileName.trim()) {
      errors.profileName = "Full name is required.";
    } else if (profileName.trim().length < 2) {
      errors.profileName = "Full name must be at least 2 characters.";
    }
    if (!profileEmail.trim()) {
      errors.profileEmail = "Email address is required.";
    } else if (!isValidEmail(profileEmail)) {
      errors.profileEmail = "Please enter a valid email address.";
    } else if (!isAuthorizedCompanyEmail(profileEmail)) {
      errors.profileEmail = "Email must be an official @ethiopianre.com address.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotifMessage({ type: "error", text: "Please correct the highlighted fields." });
      focusFirstInvalidField(errors);
      return;
    }

    const effectiveEmail = isEmployee && currentUser ? currentUser.email : profileEmail.trim();
    const ok = onUpdateOwnProfile(profileName.trim(), effectiveEmail);
    if (ok) {
      setFieldErrors({});
      setNotifMessage({ type: "success", text: "Profile details updated successfully." });
      showSuccess("Your account profile has been updated.");
      setTimeout(() => setEditProfileModal(false), 900);
    } else {
      const msg = "This email address is already assigned to another account.";
      setFieldErrors({ profileEmail: msg });
      setNotifMessage({ type: "error", text: msg });
      showError(msg);
      focusFirstInvalidField({ profileEmail: msg });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpdatingPass) return;
    setNotifMessage(null);
    const check = validatePasswordChangeForm({
      oldPassword,
      newPassword,
      confirmPassword,
    });
    if (!check.valid) {
      setFieldErrors(check.errors);
      setNotifMessage({ type: "error", text: check.summaryMessage || "Please correct the highlighted password fields." });
      focusFirstInvalidField(check.errors);
      return;
    }

    setIsUpdatingPass(true);
    try {
      const res = await onUpdateOwnPassword(oldPassword, newPassword);
      const ok = typeof res === "boolean" ? res : res.ok;
      const errText =
        typeof res === "object" && res.error
          ? res.error
          : "Incorrect current password. Please verify and try again.";

      if (ok) {
        setFieldErrors({});
        setNotifMessage({ type: "success", text: "Password changed successfully." });
        showSuccess("Your password has been updated.");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setChangePasswordModal(false), 900);
      } else {
        setFieldErrors({ oldPassword: errText });
        setNotifMessage({ type: "error", text: errText });
        showError(errText);
        focusFirstInvalidField({ oldPassword: errText });
      }
    } finally {
      setIsUpdatingPass(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left section: mobile button + company info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden focus:outline-hidden"
          id="btn-toggle-sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-8 max-w-[120px] object-contain" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary-custom flex items-center justify-center text-white font-black text-xs border border-accent-custom shadow-xs">
              ER
            </div>
          )}
          <span className="font-bold text-slate-800 text-sm md:text-base tracking-tight truncate max-w-[200px] sm:max-w-xs md:max-w-md lg:max-w-xl">
            {companyName}
          </span>
        </div>
      </div>

      {/* Right section: Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen(!notifOpen);
              setProfileOpen(false);
            }}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all relative"
            id="btn-notifications"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50 animate-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-sm text-slate-800">Notifications</span>
                {unreadCount > 0 ? (
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                    {unreadCount} Unread
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-semibold">All caught up</span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    No notifications or HR announcements at this time.
                  </div>
                ) : (
                  notifications.slice(0, 8).map((n) => {
                    const read = isNotifRead(n);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (!read && onMarkNotificationRead) {
                            onMarkNotificationRead(n.id);
                          }
                          setNotifOpen(false);
                          if (onOpenNotifications) onOpenNotifications();
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors ${
                          !read ? "bg-amber-50/40" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs leading-tight ${!read ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                            {n.title}
                          </p>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                            {n.category === "announcement" ? "HR" : "Personal"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{n.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">{n.createdDate}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {onOpenNotifications && (
                <div className="px-4 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onOpenNotifications();
                    }}
                    className="w-full py-1.5 text-center text-xs font-bold text-primary-custom hover:underline"
                  >
                    Open Notifications Center
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Help Center Shortcut */}
        {showHelpShortcut && (
          <button
            onClick={onOpenHelp}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all flex items-center justify-center gap-1.5"
            id="btn-header-help"
            title="Open Help Guides"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="hidden md:inline text-xs font-semibold text-slate-600">Help</span>
          </button>
        )}

        {/* Read-Only Auditor Badge */}
        {currentUser?.role === "Auditor" && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-full text-xs font-bold shadow-2xs">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <span>Read-Only Auditor Mode</span>
          </div>
        )}

        {/* User Account Controls */}
        {currentUser && (
          <div className="relative">
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full hover:bg-slate-100 transition-all border border-slate-200"
              id="btn-user-profile-menu"
            >
              <div className="h-7 w-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                {currentUser.fullName.substring(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-800 max-w-[120px] truncate">{currentUser.fullName}</p>
                <p className="text-[10px] text-slate-500 font-medium">{currentUser.role}</p>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 animate-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-400 font-medium">Logged in as</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{currentUser.fullName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{currentUser.email}</p>
                  <span className="inline-block text-[9px] font-bold uppercase tracking-wider bg-primary-custom text-white px-2 py-0.5 rounded-full mt-1.5">
                    {currentUser.role}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setProfileOpen(false);
                    if (isEmployee && onNavigateToProfile) {
                      onNavigateToProfile();
                      return;
                    }
                    setProfileName(currentUser.fullName);
                    setProfileEmail(currentUser.email);
                    setFieldErrors({});
                    setNotifMessage(null);
                    setEditProfileModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <UserIcon className="h-4 w-4 text-slate-400" />
                  {isEmployee ? "My Profile" : "Manage Profile"}
                </button>

                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setOldPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setFieldErrors({});
                    setNotifMessage(null);
                    setChangePasswordModal(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Lock className="h-4 w-4 text-slate-400" />
                  Change Password
                </button>

                <div className="border-t border-slate-100 my-1"></div>

                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4 text-rose-400" />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm">Manage Profile Details</h3>
              <button onClick={() => setEditProfileModal(false)} className="text-white/80 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} noValidate className="p-5 space-y-4">
              {notifMessage && notifMessage.type === "success" && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {notifMessage.text}
                </div>
              )}
              {notifMessage && notifMessage.type === "error" && (
                <ValidationSummary errors={fieldErrors} message={notifMessage.text} />
              )}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Full Name <span className="text-rose-500">*</span></label>
                <input
                  data-field="profileName"
                  type="text"
                  value={profileName}
                  onChange={(e) => {
                    setProfileName(e.target.value);
                    if (fieldErrors.profileName) setFieldErrors((p) => ({ ...p, profileName: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.profileName), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={fieldErrors.profileName} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Email Address <span className="text-rose-500">*</span></label>
                <input
                  data-field="profileEmail"
                  type="email"
                  value={profileEmail}
                  disabled={isEmployee}
                  onChange={(e) => {
                    setProfileEmail(e.target.value);
                    if (fieldErrors.profileEmail) setFieldErrors((p) => ({ ...p, profileEmail: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.profileEmail), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom disabled:bg-slate-100")}
                />
                <FormFieldError error={fieldErrors.profileEmail} />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <button
                  type="button"
                  onClick={() => setEditProfileModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-primary-custom hover:opacity-90 rounded-lg flex items-center gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {changePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm">Change Security Password</h3>
              <button onClick={() => setChangePasswordModal(false)} className="text-white/80 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} noValidate className="p-5 space-y-4">
              {notifMessage && notifMessage.type === "success" && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {notifMessage.text}
                </div>
              )}
              {notifMessage && notifMessage.type === "error" && (
                <ValidationSummary errors={fieldErrors} message={notifMessage.text} />
              )}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Current Password <span className="text-rose-500">*</span></label>
                <input
                  data-field="oldPassword"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value);
                    if (fieldErrors.oldPassword) setFieldErrors((p) => ({ ...p, oldPassword: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.oldPassword), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={fieldErrors.oldPassword} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">New Password <span className="text-rose-500">*</span></label>
                <input
                  data-field="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (fieldErrors.newPassword) setFieldErrors((p) => ({ ...p, newPassword: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.newPassword), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={fieldErrors.newPassword} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Confirm New Password <span className="text-rose-500">*</span></label>
                <input
                  data-field="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.confirmPassword), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={fieldErrors.confirmPassword} />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <button
                  type="button"
                  onClick={() => setChangePasswordModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPass}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-primary-custom hover:opacity-90 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {isUpdatingPass ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
