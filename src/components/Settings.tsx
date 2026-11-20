import React, { useState, useEffect } from "react";
import { CompanyConfig, User, PublicHoliday, UserRole, AccountStatus, Employee, EmailActivityLog, SystemRole, RolePermissions, ModulePermission, ModulePermissionOverride, ActionPermissions } from "../types";
import { 
  Building, Palette, Calendar, ShieldCheck, Users2, Plus, Edit, 
  Trash2, X, Save, CheckCircle2, UserCheck, UserMinus, Eye, Mail, Upload, RefreshCw, AlertCircle, SlidersHorizontal, RotateCcw
} from "lucide-react";
import RoleMatrix from "./RoleMatrix";
import { APP_MODULES, EMPLOYEE_BLOCKED_ADMIN_MODULES, getModuleLabelForRole, getModuleSubmenusForRole } from "../config/permissions";
import { resolveUserPermissions } from "../utils/rbacUtils";
import { uploadFileToStorage, deleteFileFromStorage } from "../firebase";
import ReportPrintButton from "./reports/ReportPrintButton";
import ReportPDFExportButton from "./reports/ReportPDFExportButton";
import { formatReportDateTime, getOfficialLogoUrl, ReportExportPayload } from "../utils/reportBranding";
import {
  validateCompanyProfileForm,
  validateHolidayForm,
  validateUserAccountForm,
  validateDocumentUpload,
  focusFirstInvalidField
} from "../utils/validation";
import { FormFieldError, ValidationSummary, fieldInputClass } from "./ui/FormFeedback";
import { useToast, ConfirmDialog } from "./ui/ToastProvider";

interface SettingsProps {
  config: CompanyConfig;
  users: User[];
  employees?: Employee[];
  holidays: PublicHoliday[];
  emailLogs?: EmailActivityLog[];
  currentUser: User | null;
  initialSubTab?: string;
  permissions?: ModulePermission;
  onUpdateConfig: (config: CompanyConfig) => void;
  onUpdateUsers: (users: User[], userToSync?: User) => void;
  onUpdateHolidays: (holidays: PublicHoliday[]) => void;
  onUpdateEmailLogs?: (logs: EmailActivityLog[]) => void;
  onDeleteHoliday?: (id: string) => boolean;
  onDeleteUser?: (id: string) => boolean;
  // RBAC props
  roles: SystemRole[];
  rolePermissions: RolePermissions[];
  onUpdateRoles: (roles: SystemRole[], deletedRoleId?: string) => void;
  onUpdateRolePermissions: (perms: RolePermissions[]) => void;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

export default function Settings({
  config,
  users,
  employees = [],
  holidays,
  currentUser,
  initialSubTab,
  permissions,
  onUpdateConfig,
  onUpdateUsers,
  onUpdateHolidays,
  onDeleteHoliday,
  onDeleteUser,
  roles,
  rolePermissions,
  onUpdateRoles,
  onUpdateRolePermissions,
  onLogAction
}: SettingsProps) {
  const canCreate = permissions ? permissions.actions.create : currentUser?.role !== "Auditor";
  const canEdit = permissions ? permissions.actions.edit : currentUser?.role !== "Auditor";
  const canDelete = permissions ? permissions.actions.delete : currentUser?.role !== "Auditor";
  const canExport = permissions
    ? permissions.actions.export
    : currentUser?.role === "Administrator" || currentUser?.role === "Auditor" || currentUser?.role === "HR Officer";

  const allowedSubTabs = [
    { id: "profile", label: "Company Profile", icon: Building },
    { id: "branding", label: "Branding Theme", icon: Palette },
    { id: "holidays", label: "Public Holidays", icon: Calendar },
    { id: "users", label: "User Management", icon: Users2 },
    { id: "roles", label: "Roles & Matrix", icon: ShieldCheck }
  ].filter(item => !permissions || permissions.submenus[item.id] !== false);

  const [activeSubTab, setActiveSubTab] = useState(() => {
    let init = initialSubTab || allowedSubTabs[0]?.id || "profile";
    if (init === "email" || init === "email_settings" || init === "email_config") init = "profile";
    if (allowedSubTabs.some(item => item.id === init)) return init;
    return allowedSubTabs[0]?.id || "profile";
  });

  useEffect(() => {
    let mapped = initialSubTab || allowedSubTabs[0]?.id || "profile";
    if (mapped === "email" || mapped === "email_settings" || mapped === "email_config") mapped = "profile";
    if (allowedSubTabs.some(item => item.id === mapped)) {
      setActiveSubTab(mapped);
    } else if (allowedSubTabs[0]) {
      setActiveSubTab(allowedSubTabs[0].id);
    }
  }, [initialSubTab, permissions]);

  // --- 1. Company Profile Form States ---
  const [displayName, setDisplayName] = useState(config.profile.displayName);
  const [legalName, setLegalName] = useState(config.profile.legalName);
  const [shortName, setShortName] = useState(config.profile.shortName);
  const [logoUrl, setLogoUrl] = useState(config.profile.logoUrl);
  const [companyEmail, setCompanyEmail] = useState(config.profile.email);
  const [companyPhone, setCompanyPhone] = useState(config.profile.phoneNumber);
  const [companyWebsite, setCompanyWebsite] = useState(config.profile.website);
  const [companyAddress, setCompanyAddress] = useState(config.profile.address);
  const [companyCity, setCompanyCity] = useState(config.profile.city);
  const [companyCountry, setCompanyCountry] = useState(config.profile.country);
  const [companyDescription, setCompanyDescription] = useState(config.profile.description);

  // --- 2. Branding Form States ---
  const [primaryColor, setPrimaryColor] = useState(config.branding.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(config.branding.secondaryColor);
  const [accentColor, setAccentColor] = useState(config.branding.accentColor);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [logoUploadSuccess, setLogoUploadSuccess] = useState("");

  // --- 3. Public Holidays States ---
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  // --- 4. User Management States ---
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editUserMode, setEditUserMode] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [overrideUser, setOverrideUser] = useState<User | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<{ [moduleId: string]: ModulePermissionOverride }>({});

  // User Form fields
  const [userFullName, setUserFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("HR Officer");
  const [userStatus, setUserStatus] = useState<AccountStatus>("Active");
  const [userEmailVerified, setUserEmailVerified] = useState(false);
  const [userEmployeeId, setUserEmployeeId] = useState("");

  const toast = useToast();
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [holErrors, setHolErrors] = useState<Record<string, string>>({});
  const [userFieldErrors, setUserFieldErrors] = useState<Record<string, string>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => void;
  } | null>(null);

  const clearProfileError = (key: string) => {
    setProfileErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearHolError = (key: string) => {
    setHolErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearUserFieldError = (key: string) => {
    setUserFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Save Company Profile
  const handleSaveProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateCompanyProfileForm({
      displayName,
      legalName,
      shortName,
      email: companyEmail,
      website: companyWebsite
    });
    if (!validation.valid) {
      setProfileErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      toast.showWarning(validation.summaryMessage || "Please correct highlighted profile fields.", "Validation Error");
      return;
    }
    setProfileErrors({});

    const updatedConfig: CompanyConfig = {
      ...config,
      profile: {
        displayName: displayName.trim(),
        legalName: legalName.trim(),
        shortName: shortName.trim(),
        logoUrl: logoUrl.trim(),
        email: companyEmail.trim(),
        phoneNumber: companyPhone.trim(),
        website: companyWebsite.trim(),
        address: companyAddress.trim(),
        city: companyCity.trim(),
        country: companyCountry.trim(),
        description: companyDescription.trim()
      }
    };
    onUpdateConfig(updatedConfig);
    onLogAction("Settings", "Company Profile Updated", "CompanyProfile", "Saved legal description and contact details");
    toast.showSuccess("Company profile updated successfully.", "Profile Saved");
  };

  // Save Branding Theme Settings
  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    const isHex = (c: string) => /^#[0-9A-Fa-f]{6}$/.test((c || "").trim());
    if (!isHex(primaryColor) || !isHex(secondaryColor) || !isHex(accentColor)) {
      toast.showError("Brand colors must be valid 6-digit hex codes (e.g. #0F2942).", "Invalid Color Format");
      return;
    }

    const updatedConfig: CompanyConfig = {
      ...config,
      branding: {
        primaryColor,
        secondaryColor,
        accentColor
      }
    };
    onUpdateConfig(updatedConfig);
    onLogAction("Settings", "Branding Updated", "BrandingColors", `Changed primary hex color to: ${primaryColor}`);
    toast.showSuccess("Branding configuration saved! Theme applied dynamically.", "Branding Applied");
  };

  const handleResetBranding = () => {
    setPrimaryColor("#0F2942");
    setSecondaryColor("#1D4E7B");
    setAccentColor("#D4AF37");
    toast.showInfo("Default Ethiopian Reinsurance color tokens loaded. Click Apply Branding to save.", "Defaults Loaded");
  };

  // Upload Logo to Firebase Storage (branding/) and persist download URL
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploadError("");
    setLogoUploadSuccess("");

    const fileCheck = validateDocumentUpload(file, {
      maxSizeMB: 1,
      allowedExtensions: ["png", "jpg", "jpeg", "webp", "svg"]
    });
    if (!fileCheck.valid) {
      const msg = fileCheck.error || "Invalid logo file.";
      setLogoUploadError(msg);
      toast.showError(msg, "Logo Validation Error");
      e.target.value = "";
      return;
    }

    setLogoUploading(true);
    try {
      const uploaded = await uploadFileToStorage("branding", file);
      setLogoUrl(uploaded.url);
      const updatedConfig: CompanyConfig = {
        ...config,
        profile: {
          ...config.profile,
          logoUrl: uploaded.url
        }
      };
      onUpdateConfig(updatedConfig);
      onLogAction("Settings", "Logo Uploaded", "CompanyLogo", `Uploaded logo '${file.name}' to Firebase Storage`);
      setLogoUploadSuccess("Logo uploaded to Firebase Storage and saved.");
      toast.showSuccess("Company logo uploaded and saved.", "Logo Updated");
    } catch (err: any) {
      const msg = err?.message || "Failed to upload logo to Firebase Storage.";
      setLogoUploadError(msg);
      toast.showError(msg, "Upload Failed");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    const previousUrl = logoUrl;
    setLogoUrl("");
    setLogoUploadError("");
    setLogoUploadSuccess("");
    if (previousUrl && previousUrl.includes("firebasestorage.googleapis.com")) {
      try {
        await deleteFileFromStorage(previousUrl);
      } catch {
        // Ignore cleanup errors if object already deleted
      }
    }
    onUpdateConfig({
      ...config,
      profile: {
        ...config.profile,
        logoUrl: ""
      }
    });
    toast.showInfo("Custom company logo removed. Official Ethiopian Reinsurance S.C. logo restored.", "Default Logo Restored");
  };

  // Add Public Holiday
  const handleAddHoliday = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateHolidayForm({ name: holidayName, date: holidayDate }, holidays);
    if (!validation.valid) {
      setHolErrors(validation.errors);
      focusFirstInvalidField(validation.errors, e.currentTarget);
      toast.showWarning(validation.summaryMessage || "Please check the holiday details.", "Validation Error");
      return;
    }
    setHolErrors({});

    const newH: PublicHoliday = {
      id: `H_${Date.now()}`,
      name: holidayName.trim(),
      date: holidayDate
    };

    const updated = [...holidays, newH].sort((a, b) => a.date.localeCompare(b.date));
    onUpdateHolidays(updated);
    onLogAction("Settings", "Public Holiday Created", newH.name, `Added holiday on date ${newH.date}`);
    toast.showSuccess(`Added public holiday "${newH.name}" (${newH.date}).`, "Holiday Added");
    setHolidayName("");
    setHolidayDate("");
  };

  const handleDeleteHoliday = (id: string, name: string) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Public Holiday",
      message: (
        <span>
          Permanently remove public holiday <strong>{name}</strong>? Leave duration calculations will no longer exclude this date.
        </span>
      ),
      confirmText: "Remove Holiday",
      variant: "danger",
      onConfirm: () => {
        if (onDeleteHoliday) {
          onDeleteHoliday(id);
        } else {
          const updated = holidays.filter(h => h.id !== id);
          onUpdateHolidays(updated);
        }
        onLogAction("Settings", "Public Holiday Deleted", name, `Removed public holiday date`);
        toast.showSuccess(`Removed public holiday "${name}".`, "Holiday Removed");
        setConfirmState(null);
      }
    });
  };

  // --- User Management CRUD ---
  const handleOpenAddUser = () => {
    setSelectedUser(null);
    setUserFullName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("HR Officer");
    setUserStatus("Active");
    setUserEmailVerified(false);
    setUserEmployeeId("");
    setFormError("");
    setFormSuccess("");
    setUserFieldErrors({});
    setEditUserMode(false);
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setSelectedUser(u);
    setUserFullName(u.fullName);
    setUserEmail(u.email);
    setUserPassword(""); // Don't prefill password
    setUserRole(u.role);
    setUserStatus(u.status);
    setUserEmailVerified(!!u.emailVerified);
    setUserEmployeeId(u.employeeId || "");
    setFormError("");
    setFormSuccess("");
    setUserFieldErrors({});
    setEditUserMode(true);
    setUserModalOpen(true);
  };

  const handleUserSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingUser) return;
    setFormError("");
    setFormSuccess("");

    const validation = validateUserAccountForm({
      editingUser: editUserMode ? selectedUser : null,
      fullName: userFullName,
      email: userEmail,
      password: userPassword,
      role: userRole,
      status: userStatus,
      employeeId: userEmployeeId,
      existingUsers: users,
      roles,
      currentUser
    });

    if (!validation.valid) {
      setUserFieldErrors(validation.errors);
      setFormError(validation.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(validation.errors, e.currentTarget);
      return;
    }

    setUserFieldErrors({});
    setIsSavingUser(true);
    const emailNormalized = userEmail.trim().toLowerCase();

    if (editUserMode && selectedUser) {
      const roleChanged = selectedUser.role !== userRole;
      const updatedUsers = users.map(u => {
        if (u.id === selectedUser.id) {
          return {
            ...u,
            fullName: userFullName.trim(),
            email: emailNormalized,
            role: userRole,
            status: userStatus,
            emailVerified: userEmailVerified,
            employeeId: userEmployeeId || undefined,
            ...(userPassword.trim() ? { password: userPassword.trim() } : {})
          };
        }
        return u;
      });

      const updatedUser = updatedUsers.find(u => u.id === selectedUser.id);
      onUpdateUsers(updatedUsers, updatedUser);
      setIsSavingUser(false);
      setFormSuccess("User updated successfully!");
      toast.showSuccess(`Updated account for ${userFullName.trim()} (${userRole}).`, "User Updated");
      onLogAction(
        "Users",
        roleChanged ? "Assign Role" : "User Updated",
        emailNormalized,
        roleChanged
          ? `Changed role for ${userFullName} (${emailNormalized}) from "${selectedUser.role}" to "${userRole}"`
          : `Modified account details for ${userFullName}`
      );
      setUserModalOpen(false);
    } else {
      const newUser: User = {
        id: `U_${Date.now()}`,
        fullName: userFullName.trim(),
        email: emailNormalized,
        password: userPassword.trim(),
        role: userRole,
        status: userStatus,
        emailVerified: userEmailVerified,
        employeeId: userEmployeeId || undefined,
        createdDate: new Date().toISOString().split("T")[0]
      };

      const updatedUsers = [...users, newUser];
      onUpdateUsers(updatedUsers, newUser);
      setIsSavingUser(false);
      setFormSuccess("User account created successfully!");
      toast.showSuccess(`Created user account for ${newUser.fullName} (${newUser.role}).`, "User Created");
      onLogAction("Users", "User Created", emailNormalized, `Enrolled user role ${userRole} under email ${emailNormalized}`);
      setUserModalOpen(false);
    }
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser?.id) {
      toast.showError("Self-Deletion Safeguard: You cannot delete your own active administrative session.", "Action Blocked");
      return;
    }

    if (u.role === "Administrator" && u.status === "Active") {
      const activeAdminsCount = users.filter(usr => usr.role === "Administrator" && usr.status === "Active").length;
      if (activeAdminsCount <= 1) {
        toast.showError("Safeguard: You cannot delete the last active Administrator account in the system.", "Action Blocked");
        return;
      }
    }

    setConfirmState({
      isOpen: true,
      title: "Delete User Account",
      message: (
        <span>
          Are you sure you want to permanently delete portal account <strong>{u.fullName}</strong> ({u.email})?
        </span>
      ),
      confirmText: "Delete User",
      variant: "danger",
      onConfirm: () => {
        if (onDeleteUser) {
          onDeleteUser(u.id);
        } else {
          const updated = users.filter(usr => usr.id !== u.id);
          onUpdateUsers(updated);
        }
        onLogAction("Users", "User Deleted", u.email, `Permanently deleted user account: ${u.fullName}`);
        toast.showSuccess(`Deleted user account ${u.email}.`, "User Deleted");
        setConfirmState(null);
      }
    });
  };

  const handleToggleUserStatus = (u: User) => {
    if (u.id === currentUser?.id) {
      toast.showError("Self-Deactivation Safeguard: You cannot deactivate your own active administrative session.", "Action Blocked");
      return;
    }

    const nextStatus = u.status === "Active" ? "Inactive" : "Active";

    if (u.role === "Administrator" && u.status === "Active" && nextStatus !== "Active") {
      const activeAdminsCount = users.filter(usr => usr.role === "Administrator" && usr.status === "Active").length;
      if (activeAdminsCount <= 1) {
        toast.showError("Safeguard: The system must always retain at least one active Administrator account.", "Action Blocked");
        return;
      }
    }

    const updated = users.map(usr => {
      if (usr.id === u.id) {
        const autoVerify = nextStatus === "Active" ? true : usr.emailVerified;
        return { ...usr, status: nextStatus as any, emailVerified: autoVerify };
      }
      return usr;
    });
    const toggledUser = updated.find(usr => usr.id === u.id);
    onUpdateUsers(updated, toggledUser);
    onLogAction("Users", nextStatus === "Active" ? "User Activated" : "User Deactivated", u.email, `Set status of user to ${nextStatus}`);
    toast.showInfo(`${u.fullName} account is now ${nextStatus}.`, "Account Status Updated");
  };

  return (
    <div className="w-full">
      {/* Main Form Fields Container */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs">
        
        {/* TAB 1: COMPANY PROFILE */}
        {activeSubTab === "profile" && (
          <form noValidate onSubmit={handleSaveProfile} className="space-y-6">
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">Company Profile</h3>
              <p className="text-xs text-slate-500 mt-1">Configure physical coordinates and centralized legal identification metadata.</p>
            </div>

            <ValidationSummary errors={profileErrors} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Display Brand Name *</label>
                <input
                  type="text"
                  data-field="displayName"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    clearProfileError("displayName");
                  }}
                  className={fieldInputClass(!!profileErrors.displayName, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={profileErrors.displayName} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Legal Name *</label>
                <input
                  type="text"
                  data-field="legalName"
                  value={legalName}
                  onChange={(e) => {
                    setLegalName(e.target.value);
                    clearProfileError("legalName");
                  }}
                  className={fieldInputClass(!!profileErrors.legalName, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={profileErrors.legalName} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Short Name *</label>
                <input
                  type="text"
                  data-field="shortName"
                  value={shortName}
                  onChange={(e) => {
                    setShortName(e.target.value);
                    clearProfileError("shortName");
                  }}
                  className={fieldInputClass(!!profileErrors.shortName, "w-full px-3 py-2 border rounded-lg text-xs font-semibold ring-primary-custom")}
                />
                <FormFieldError error={profileErrors.shortName} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Central Email Address</label>
                <input
                  type="email"
                  data-field="companyEmail"
                  value={companyEmail}
                  onChange={(e) => {
                    setCompanyEmail(e.target.value);
                    clearProfileError("companyEmail");
                  }}
                  className={fieldInputClass(!!profileErrors.companyEmail, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={profileErrors.companyEmail} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Telephone / Fax</label>
                <input
                  type="text"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Website URL</label>
                <input
                  type="text"
                  data-field="companyWebsite"
                  value={companyWebsite}
                  onChange={(e) => {
                    setCompanyWebsite(e.target.value);
                    clearProfileError("companyWebsite");
                  }}
                  className={fieldInputClass(!!profileErrors.companyWebsite, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={profileErrors.companyWebsite} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-1">
                <label className="block text-xs font-bold text-slate-700">Country</label>
                <input
                  type="text"
                  value={companyCountry}
                  onChange={(e) => setCompanyCountry(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="block text-xs font-bold text-slate-700">City</label>
                <input
                  type="text"
                  value={companyCity}
                  onChange={(e) => setCompanyCity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="block text-xs font-bold text-slate-700">Physical Location Address</label>
                <input
                  type="text"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Company Legal Description</label>
              <textarea
                rows={3}
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom leading-relaxed"
              />
            </div>

            {canEdit ? (
              <div className="pt-4 border-t flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  Save Profile
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Read-Only Mode: Organization profile modifications are restricted for your role.</span>
              </div>
            )}
          </form>
        )}

        {/* TAB 2: BRANDING THEME */}
        {activeSubTab === "branding" && (
          <form onSubmit={handleSaveBranding} className="space-y-6">
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">Corporate Branding Theme</h3>
              <p className="text-xs text-slate-500 mt-1">Configure corporate color tokens and company branding logos. Changes are instantly applied to the live workspace layout.</p>
            </div>

            {/* Logo Section */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col sm:flex-row items-center gap-5">
              <div className="h-24 w-24 border border-slate-200 bg-white rounded-lg flex items-center justify-center p-1.5 shrink-0">
                <img
                  src={logoUrl || getOfficialLogoUrl()}
                  alt="Ethiopian Reinsurance S.C. Official Logo"
                  className="max-h-full max-w-full object-contain rounded"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="space-y-2 flex-1 text-center sm:text-left w-full">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h4 className="font-bold text-xs text-slate-700">Ethio-Re Company Logo</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    logoUrl
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}>
                    {logoUrl ? "Custom Uploaded Logo" : "Official Bundled Default"}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="px-3.5 py-1.5 bg-white border hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-2xs">
                      {logoUploading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary-custom" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-primary-custom" />
                      )}
                      <span>{logoUploading ? "Uploading to Storage..." : "Choose Custom Logo"}</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} className="hidden" />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg"
                      >
                        Restore Default Official Logo
                      </button>
                    )}
                  </div>
                )}
                {logoUploadError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] font-semibold text-rose-700 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{logoUploadError}</span>
                  </div>
                )}
                {logoUploadSuccess && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{logoUploadSuccess}</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">
                  Defaults to the bundled official Ethiopian Reinsurance S.C. logo. Optionally upload a custom JPEG, PNG, or SVG (Max 1MB) to override across Sidebar, Header, Print, and PDF Reports.
                </p>
              </div>
            </div>

            {/* Colors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex justify-between">
                  <span>Primary Color</span>
                  <span className="font-mono font-bold text-slate-400">{primaryColor}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    disabled={currentUser?.role === "Auditor"}
                    className="h-9 w-12 border rounded-md cursor-pointer shrink-0 disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    readOnly={currentUser?.role === "Auditor"}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold read-only:bg-slate-50"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Primary brand color. Governs headers, primary buttons, and navigation blocks.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex justify-between">
                  <span>Secondary Color</span>
                  <span className="font-mono font-bold text-slate-400">{secondaryColor}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    disabled={currentUser?.role === "Auditor"}
                    className="h-9 w-12 border rounded-md cursor-pointer shrink-0 disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    readOnly={currentUser?.role === "Auditor"}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold read-only:bg-slate-50"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Supporting brand accent color. Applies on submenus and secondary details.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 flex justify-between">
                  <span>Accent Color</span>
                  <span className="font-mono font-bold text-slate-400">{accentColor}</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    disabled={currentUser?.role === "Auditor"}
                    className="h-9 w-12 border rounded-md cursor-pointer shrink-0 disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    readOnly={currentUser?.role === "Auditor"}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold read-only:bg-slate-50"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Highlights. Governs active tabs, alerts, and subtle brand lines.</p>
              </div>
            </div>

            {canEdit ? (
              <div className="pt-4 border-t flex justify-between">
                <button
                  type="button"
                  onClick={handleResetBranding}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg"
                >
                  Reset Default Ethio-Re Colors
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  Apply Branding
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Read-Only Mode: Branding color palette and logo changes are restricted.</span>
              </div>
            )}
          </form>
        )}

        {/* TAB 3: PUBLIC HOLIDAYS */}
        {activeSubTab === "holidays" && (() => {
          const buildHolidaysReportPayload = (): ReportExportPayload => ({
            reportTitle: "Official Public Holidays Calendar Report",
            reportSubtitle: "Statutory Ethiopian Public Holidays Excluded from Leave Calculations",
            filePrefix: "Public_Holidays_Report",
            generatedAt: formatReportDateTime(),
            generatedBy: currentUser?.fullName || currentUser?.email || "Administrator",
            orientation: "portrait",
            summaryMetrics: [
              { label: "Total Registered Holidays", value: String(holidays.length) }
            ],
            columns: [
              { header: "#", align: "center" },
              { header: "Holiday Name", align: "left" },
              { header: "Observed Date", align: "left" }
            ],
            rows: holidays.map((h, i) => [i + 1, h.name, h.date]),
            emptyMessage: "No public holidays registered."
          });

          return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">Public Holidays</h3>
                <p className="text-xs text-slate-500 mt-1">Add legal public holidays. The leave management module automatically references this list to exclude these dates from booked leave totals.</p>
              </div>
              {canExport && (
                <div className="flex flex-wrap items-center gap-2">
                  <ReportPrintButton
                    printData={buildHolidaysReportPayload}
                    companyConfig={config}
                    orientation="portrait"
                    label="Print"
                  />
                  <ReportPDFExportButton
                    reportData={buildHolidaysReportPayload}
                    companyConfig={config}
                    orientation="portrait"
                    label="Export PDF"
                  />
                </div>
              )}
            </div>

            {/* Add Holiday Inline Form */}
            {canCreate && (
              <form noValidate onSubmit={handleAddHoliday} className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                <ValidationSummary errors={holErrors} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Holiday Name *</label>
                    <input
                      type="text"
                      data-field="holName"
                      placeholder="e.g. Adwa Victory Day"
                      value={holidayName}
                      onChange={(e) => {
                        setHolidayName(e.target.value);
                        clearHolError("holName");
                      }}
                      className={fieldInputClass(!!holErrors.holName, "w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom")}
                    />
                    <FormFieldError error={holErrors.holName} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Holiday Date *</label>
                    <input
                      type="date"
                      data-field="holDate"
                      value={holidayDate}
                      onChange={(e) => {
                        setHolidayDate(e.target.value);
                        clearHolError("holDate");
                      }}
                      className={fieldInputClass(!!holErrors.holDate, "w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold")}
                    />
                    <FormFieldError error={holErrors.holDate} />
                  </div>
                  <div className="sm:pt-5">
                    <button
                      type="submit"
                      className="w-full py-2 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Add Date
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Holidays List */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="px-5 py-2.5">Holiday Name</th>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-slate-400">No public holidays registered.</td>
                    </tr>
                  ) : (
                    holidays.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3 font-semibold text-slate-800">{h.name}</td>
                        <td className="px-5 py-3 font-bold text-primary-custom">{h.date}</td>
                        <td className="px-5 py-3 text-right">
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(h.id, h.name)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Read-Only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          );
        })()}



        {/* TAB 4: USER MANAGEMENT */}
        {activeSubTab === "users" && (() => {
          const buildUserDirectoryPayload = (): ReportExportPayload => {
            const activeCount = users.filter(u => u.status === "Active").length;
            const verifiedCount = users.filter(u => u.emailVerified).length;
            return {
              reportTitle: "System User Directory & Security Report",
              reportSubtitle: "Authorized Portal Accounts, Assigned Roles & Verification Audit",
              filePrefix: "User_Directory_Report",
              generatedAt: formatReportDateTime(),
              generatedBy: currentUser?.fullName || currentUser?.email || "Administrator",
              orientation: "landscape",
              summaryMetrics: [
                { label: "Total Accounts", value: String(users.length) },
                { label: "Active Users", value: String(activeCount) },
                { label: "Email Verified", value: String(verifiedCount) }
              ],
              columns: [
                { header: "Full Name", align: "left" },
                { header: "Email Address", align: "left" },
                { header: "Assigned Role", align: "left" },
                { header: "Verification", align: "center" },
                { header: "Account Status", align: "center" },
                { header: "Created Date", align: "left" },
                { header: "Last Login", align: "left" }
              ],
              rows: users.map(u => [
                u.fullName,
                u.email,
                u.role,
                u.emailVerified ? "Verified" : "Not Verified",
                u.status,
                u.createdDate || "-",
                u.lastLogin || "Never"
              ])
            };
          };

          return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">User Directory &amp; Security</h3>
                <p className="text-xs text-slate-500 mt-1">Manage personnel authorized to operate this portal (Admins and HR Officers).</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canExport && (
                  <>
                    <ReportPrintButton
                      printData={buildUserDirectoryPayload}
                      companyConfig={config}
                      label="Print"
                    />
                    <ReportPDFExportButton
                      reportData={buildUserDirectoryPayload}
                      companyConfig={config}
                      label="Export PDF"
                    />
                  </>
                )}
                {canCreate && (
                  <button
                    type="button"
                    onClick={handleOpenAddUser}
                    className="px-3 py-1.5 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-all shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add User</span>
                  </button>
                )}
              </div>
            </div>

            {/* Users table */}
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="px-4 py-3">Full Name</th>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-center">Verification Status</th>
                    <th className="px-4 py-3 text-center">Account Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3.5 font-bold text-slate-800">{u.fullName}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-500">{u.email}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          u.role === "Administrator" ? "bg-primary-custom text-white" :
                          u.role === "Auditor" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                          "bg-slate-100 text-slate-700"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                          u.emailVerified 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                            : "bg-amber-50 text-amber-700 border border-amber-100"
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${u.emailVerified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {u.emailVerified ? "Verified" : "Not Verified"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          u.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                          u.status === "Pending Verification" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                          u.status === "Inactive" ? "bg-slate-100 text-slate-500 border border-slate-200" :
                          "bg-rose-50 text-rose-700 border border-rose-100"
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 font-medium">{u.createdDate}</td>
                      <td className="px-4 py-3.5 text-slate-500 font-bold">{u.lastLogin || "Never"}</td>
                      <td className="px-4 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingUser(u)}
                          className="p-1 text-slate-400 hover:text-primary-custom hover:bg-slate-50 rounded-md transition-colors inline-block"
                          title="View User Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {(canEdit || canDelete) && (
                          <>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditUser(u)}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md transition-colors inline-block"
                                title="Edit Account Details"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit && u.role !== "Administrator" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideUser(u);
                                  setDraftOverrides(JSON.parse(JSON.stringify(u.permissionOverrides || {})));
                                }}
                                className={`p-1 rounded-md transition-colors inline-block ${
                                  u.permissionOverrides && Object.keys(u.permissionOverrides).length > 0
                                    ? "text-primary-custom bg-blue-50 hover:bg-blue-100"
                                    : "text-slate-400 hover:text-primary-custom hover:bg-slate-50"
                                }`}
                                title="Configure Individual Permission Overrides"
                              >
                                <SlidersHorizontal className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit && !u.emailVerified && (
                              <button
                                type="button"
                                onClick={() => {
                                  toast.showInfo(`Verification email link queued for ${u.email}.`, "Verification Sent");
                                  onLogAction("Users", "Resend Verification", u.email, "Dispatched manual email verification link");
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors inline-block"
                                title="Resend Verification Email"
                              >
                                <Mail className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u)}
                                className={`p-1 rounded-md transition-colors inline-block ${
                                  u.status === "Active" ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                                title={u.status === "Active" ? "Deactivate User" : "Activate User"}
                              >
                                {u.status === "Active" ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors inline-block"
                                title="Delete Account"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          );
        })()}

        {/* TAB 5: DYNAMIC ROLES AND PERMISSIONS MATRIX */}
        <RoleMatrixView 
          activeSubTab={activeSubTab}
          roles={roles}
          rolePermissions={rolePermissions}
          users={users}
          currentUser={currentUser}
          companyConfig={config}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canExport={canExport}
          onUpdateRoles={onUpdateRoles}
          onUpdateRolePermissions={onUpdateRolePermissions}
          onLogAction={onLogAction}
        />
      </div>


      {/* USER MANAGEMENT DIALOG (ADD/EDIT USER) */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">
                {editUserMode ? "Modify Portal Account" : "Authorize Portal Account"}
              </h3>
              <button onClick={() => setUserModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleUserSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              <ValidationSummary errors={userFieldErrors} message={formError} />
              {formSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                  {formSuccess}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  data-field="uName"
                  placeholder="e.g. Martha Teshome"
                  value={userFullName}
                  onChange={(e) => {
                    setUserFullName(e.target.value);
                    clearUserFieldError("uName");
                  }}
                  className={fieldInputClass(!!userFieldErrors.uName, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom animate-pulse-once")}
                />
                <FormFieldError error={userFieldErrors.uName} />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Email Address *</label>
                <input
                  type="email"
                  data-field="uEmail"
                  placeholder="e.g. martha@ethiopianre.com"
                  value={userEmail}
                  onChange={(e) => {
                    setUserEmail(e.target.value);
                    clearUserFieldError("uEmail");
                  }}
                  className={fieldInputClass(!!userFieldErrors.uEmail, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={userFieldErrors.uEmail} />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {editUserMode ? "New Password (leave empty to keep current)" : "Access Password *"}
                </label>
                <input
                  type="password"
                  data-field="uPass"
                  placeholder={editUserMode ? "Leave blank to keep existing password" : "Minimum 6 characters"}
                  value={userPassword}
                  onChange={(e) => {
                    setUserPassword(e.target.value);
                    clearUserFieldError("uPass");
                  }}
                  className={fieldInputClass(!!userFieldErrors.uPass, "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom")}
                />
                <FormFieldError error={userFieldErrors.uPass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">System Role *</label>
                  <select
                    data-field="uRole"
                    value={userRole}
                    onChange={(e) => {
                      setUserRole(e.target.value);
                      clearUserFieldError("uRole");
                    }}
                    className={fieldInputClass(!!userFieldErrors.uRole, "w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold text-slate-800")}
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <FormFieldError error={userFieldErrors.uRole} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Account Status *</label>
                  <select
                    data-field="uStatus"
                    value={userStatus}
                    onChange={(e) => {
                      setUserStatus(e.target.value as AccountStatus);
                      clearUserFieldError("uStatus");
                    }}
                    className={fieldInputClass(!!userFieldErrors.uStatus, "w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold")}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Pending Verification">Pending Verification</option>
                  </select>
                  <FormFieldError error={userFieldErrors.uStatus} />
                </div>
              </div>

              {/* Linked Employee Master Reference */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Linked Employee Master Folder</label>
                <select
                  value={userEmployeeId}
                  onChange={(e) => setUserEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-semibold text-slate-800"
                >
                  <option value="">-- No Direct Employee Link (System Account) --</option>
                  {employees.filter(emp => emp.status === "Active").map(emp => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} ({emp.employeeId} - {emp.position})
                    </option>
                  ))}
                </select>
              </div>

              {/* Email Verified Toggle */}
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                <input
                  type="checkbox"
                  id="userEmailVerified"
                  checked={userEmailVerified}
                  onChange={(e) => setUserEmailVerified(e.target.checked)}
                  className="h-4 w-4 rounded-md text-primary-custom border-slate-300 ring-primary-custom"
                />
                <label htmlFor="userEmailVerified" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                  Email Address is Verified
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  <span>{isSavingUser ? "Saving..." : "Save Account"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW USER DETAILS MODAL */}
      {viewingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">
                Operator Security Dossier
              </h3>
              <button onClick={() => setViewingUser(null)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-full bg-primary-custom/10 text-primary-custom flex items-center justify-center font-bold text-sm">
                  {viewingUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{viewingUser.fullName}</h4>
                  <p className="text-slate-500 font-medium">{viewingUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block font-bold text-[10px] text-slate-400 uppercase tracking-wider">Assigned Role</span>
                  <span className="font-bold text-slate-800">{viewingUser.role}</span>
                </div>
                <div>
                  <span className="block font-bold text-[10px] text-slate-400 uppercase tracking-wider">Account Status</span>
                  <span className="font-bold text-slate-800">{viewingUser.status}</span>
                </div>
                <div>
                  <span className="block font-bold text-[10px] text-slate-400 uppercase tracking-wider">Email Verified</span>
                  <span className="font-bold text-slate-800">{viewingUser.emailVerified ? "Yes" : "No"}</span>
                </div>
                <div>
                  <span className="block font-bold text-[10px] text-slate-400 uppercase tracking-wider">Created Date</span>
                  <span className="font-semibold text-slate-800">{viewingUser.createdDate}</span>
                </div>
              </div>
              <div>
                <span className="block font-bold text-[10px] text-slate-400 uppercase tracking-wider">Last Portal Check-In</span>
                <span className="font-bold text-primary-custom">{viewingUser.lastLogin || "Never"}</span>
              </div>
              <div className="flex justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setViewingUser(null)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
                >
                  Close Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INDIVIDUAL EMPLOYEE/USER PERMISSION OVERRIDES MODAL */}
      {overrideUser && (() => {
        const previewResolved = resolveUserPermissions(
          { ...overrideUser, permissionOverrides: draftOverrides },
          roles,
          rolePermissions
        );
        const isEmpTarget = overrideUser.role === "Employee";
        const editableModules = APP_MODULES.filter((m) =>
          isEmpTarget ? !EMPLOYEE_BLOCKED_ADMIN_MODULES.has(m.id) && m.id !== "medical" && m.id !== "help" : true
        );

        const toggleModuleOverride = (moduleId: string, currentVal: boolean) => {
          setDraftOverrides((prev) => ({
            ...prev,
            [moduleId]: {
              ...(prev[moduleId] || {}),
              enabled: !currentVal,
            },
          }));
        };

        const toggleActionOverride = (moduleId: string, action: keyof ActionPermissions, currentVal: boolean) => {
          setDraftOverrides((prev) => ({
            ...prev,
            [moduleId]: {
              ...(prev[moduleId] || {}),
              actions: {
                ...(prev[moduleId]?.actions || {}),
                [action]: !currentVal,
              },
            },
          }));
        };

        const toggleSubmenuOverride = (moduleId: string, subId: string, currentVal: boolean) => {
          setDraftOverrides((prev) => ({
            ...prev,
            [moduleId]: {
              ...(prev[moduleId] || {}),
              submenus: {
                ...(prev[moduleId]?.submenus || {}),
                [subId]: !currentVal,
              },
            },
          }));
        };

        const handleSaveOverrides = () => {
          const updatedUsers = users.map((u) =>
            u.id === overrideUser.id
              ? {
                  ...u,
                  permissionOverrides: Object.keys(draftOverrides).length > 0 ? draftOverrides : undefined,
                }
              : u
          );
          const updatedTarget = updatedUsers.find((u) => u.id === overrideUser.id);
          onUpdateUsers(updatedUsers, updatedTarget);
          onLogAction(
            "Security",
            "User Permission Override",
            overrideUser.email,
            `Updated individual module/submenu permission overrides for ${overrideUser.fullName} (${overrideUser.role})`
          );
          toast.showSuccess(`Saved individual permission overrides for ${overrideUser.fullName}.`);
          setOverrideUser(null);
        };

        return (
          <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[88vh]">
              <div className="bg-primary-custom text-white px-5 py-3.5 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-xs uppercase tracking-wider">
                    Individual Access Overrides — {overrideUser.fullName}
                  </h3>
                  <p className="text-[10px] text-white/80">
                    Role: {overrideUser.role} • {overrideUser.email}
                  </p>
                </div>
                <button onClick={() => setOverrideUser(null)} className="text-white/80 hover:text-white rounded-full p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {isEmpTarget && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                    Self-Service Security Guardrail: Administrative modules, cross-employee records, payroll administration, and approval queues are permanently locked off for Employee accounts. You can selectively enable or restrict individual ESS modules and submenus below.
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500">
                        <th className="px-4 py-2.5">Module / Submenu</th>
                        <th className="px-2 py-2.5 text-center">View</th>
                        <th className="px-2 py-2.5 text-center">Create</th>
                        <th className="px-2 py-2.5 text-center">Edit</th>
                        <th className="px-2 py-2.5 text-center">Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editableModules.map((mod) => {
                        const effMod = previewResolved?.modulePermissions[mod.id];
                        if (!effMod) return null;
                        const label = getModuleLabelForRole(mod, overrideUser.role);
                        const subs = getModuleSubmenusForRole(mod, overrideUser.role);
                        return (
                          <React.Fragment key={mod.id}>
                            <tr className={effMod.enabled ? "bg-white" : "bg-slate-50/70"}>
                              <td className="px-4 py-2.5 font-bold text-slate-800">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={effMod.enabled}
                                    onChange={() => toggleModuleOverride(mod.id, effMod.enabled)}
                                    className="h-3.5 w-3.5 rounded text-primary-custom"
                                  />
                                  <span>{label}</span>
                                </label>
                              </td>
                              {(["view", "create", "edit", "export"] as (keyof ActionPermissions)[]).map((act) => {
                                const clampedOut =
                                  isEmpTarget &&
                                  ((mod.id === "employees" && (act === "create" || act === "edit")) ||
                                    (mod.id === "attendance" && (act === "create" || act === "edit")) ||
                                    (mod.id === "payroll" && (act === "create" || act === "edit")) ||
                                    (mod.id === "documents" && (act === "create" || act === "edit")) ||
                                    (mod.id === "notifications" && act === "create"));
                                return (
                                  <td key={act} className="px-2 py-2.5 text-center">
                                    <input
                                      type="checkbox"
                                      checked={effMod.actions[act]}
                                      disabled={!effMod.enabled || clampedOut}
                                      onChange={() => toggleActionOverride(mod.id, act, effMod.actions[act])}
                                      className="h-3.5 w-3.5 rounded text-primary-custom disabled:opacity-30"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                            {effMod.enabled && subs.length > 0 && (
                              <tr className="bg-slate-50/40">
                                <td colSpan={5} className="px-8 py-2">
                                  <div className="flex flex-wrap gap-3">
                                    {subs.map((sub) => (
                                      <label key={sub.id} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 font-medium cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(effMod.submenus[sub.id])}
                                          onChange={() => toggleSubmenuOverride(mod.id, sub.id, Boolean(effMod.submenus[sub.id]))}
                                          className="h-3 w-3 rounded text-primary-custom"
                                        />
                                        <span>{sub.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-5 py-3 border-t bg-slate-50 flex justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftOverrides({})}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border hover:bg-slate-100 rounded-lg flex items-center gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to Role Defaults
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideUser(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOverrides}
                    className="px-4 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5 text-accent-custom" />
                    Apply Overrides
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmState && (
        <ConfirmDialog
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

// Subtab Role Matrix Integration
function RoleMatrixView({ activeSubTab, roles, rolePermissions, users, currentUser, companyConfig, canCreate, canEdit, canDelete, canExport, onUpdateRoles, onUpdateRolePermissions, onLogAction }: any) {
  if (activeSubTab !== "roles") return null;
  return (
    <RoleMatrix 
      roles={roles}
      rolePermissions={rolePermissions}
      users={users}
      currentUser={currentUser}
      companyConfig={companyConfig}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      canExport={canExport}
      onUpdateRoles={onUpdateRoles}
      onUpdateRolePermissions={onUpdateRolePermissions}
      onLogAction={onLogAction}
    />
  );
}

