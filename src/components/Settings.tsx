import React, { useState, useEffect } from "react";
import { CompanyConfig, User, PublicHoliday, UserRole, AccountStatus, Employee, EmailActivityLog, SystemRole, RolePermissions, ModulePermission } from "../types";
import { 
  Building, Palette, Calendar, ShieldCheck, Users2, Plus, Edit, 
  Trash2, X, Save, CheckCircle2, UserCheck, UserMinus, Eye, Mail, Upload, RefreshCw, AlertCircle
} from "lucide-react";
import RoleMatrix from "./RoleMatrix";
import { uploadFileToStorage, deleteFileFromStorage } from "../firebase";
import ReportPrintButton from "./reports/ReportPrintButton";
import ReportPDFExportButton from "./reports/ReportPDFExportButton";
import { formatReportDateTime, ReportExportPayload } from "../utils/reportBranding";

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
    return init;
  });

  useEffect(() => {
    if (initialSubTab) {
      let mapped = initialSubTab;
      if (mapped === "email" || mapped === "email_settings" || mapped === "email_config") mapped = "profile";
      setActiveSubTab(mapped);
    }
  }, [initialSubTab]);

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

  // User Form fields
  const [userFullName, setUserFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("HR Officer");
  const [userStatus, setUserStatus] = useState<AccountStatus>("Active");
  const [userEmailVerified, setUserEmailVerified] = useState(false);
  const [userEmployeeId, setUserEmployeeId] = useState("");

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Save Company Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
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
    alert("Company profile updated successfully.");
  };

  // Save Branding Theme Settings
  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
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
    alert("Branding configuration saved! Theme applied dynamically.");
  };

  const handleResetBranding = () => {
    setPrimaryColor("#0F2942");
    setSecondaryColor("#1D4E7B");
    setAccentColor("#D4AF37");
  };

  // Upload Logo to Firebase Storage (branding/) and persist download URL
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploadError("");
    setLogoUploadSuccess("");

    if (file.size > 1024 * 1024) {
      setLogoUploadError("Logo file exceeds the 1MB maximum size limit.");
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
    } catch (err: any) {
      setLogoUploadError(err?.message || "Failed to upload logo to Firebase Storage.");
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
  };

  // Add Public Holiday
  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName.trim() || !holidayDate) return;

    const exists = holidays.some(h => h.date === holidayDate);
    if (exists) {
      alert("A public holiday is already registered on this date.");
      return;
    }

    const newH: PublicHoliday = {
      id: `H_${Date.now()}`,
      name: holidayName.trim(),
      date: holidayDate
    };

    const updated = [...holidays, newH].sort((a, b) => a.date.localeCompare(b.date));
    onUpdateHolidays(updated);
    onLogAction("Settings", "Public Holiday Created", newH.name, `Added holiday on date ${newH.date}`);
    setHolidayName("");
    setHolidayDate("");
  };

  const handleDeleteHoliday = (id: string, name: string) => {
    if (window.confirm(`Permanently remove public holiday: ${name}?`)) {
      if (onDeleteHoliday) {
        onDeleteHoliday(id);
      } else {
        const updated = holidays.filter(h => h.id !== id);
        onUpdateHolidays(updated);
      }
      onLogAction("Settings", "Public Holiday Deleted", name, `Removed public holiday date`);
    }
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
    setEditUserMode(true);
    setUserModalOpen(true);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!userFullName.trim() || !userEmail.trim()) {
      setFormError("Full Name and Email are required.");
      return;
    }

    const emailNormalized = userEmail.trim().toLowerCase();

    // 1. Domain verification for email (with special exception contactesfaye@gmail.com)
    if (emailNormalized !== "contactesfaye@gmail.com" && !emailNormalized.endsWith("@ethiopianre.com")) {
      setFormError("Only users with an @ethiopianre.com company email address are allowed to register.");
      return;
    }

    if (editUserMode && selectedUser) {
      // Edit User mode
      // Check duplicate email
      const isDuplicate = users.some(u => u.id !== selectedUser.id && u.email.toLowerCase() === emailNormalized);
      if (isDuplicate) {
        setFormError("A user with this email address already exists.");
        return;
      }

      // Self-role modification safeguard
      if (selectedUser.id === currentUser?.id && userRole !== selectedUser.role) {
        setFormError("Safeguard: You cannot change the assigned role of your own active account.");
        return;
      }

      // Last active Admin Safeguard
      if (selectedUser.role === "Administrator" && selectedUser.status === "Active") {
        const activeAdminsCount = users.filter(u => u.role === "Administrator" && u.status === "Active").length;
        const isDowngradingRole = userRole !== "Administrator";
        const isDeactivatingStatus = userStatus !== "Active";
        if ((isDowngradingRole || isDeactivatingStatus) && activeAdminsCount <= 1) {
          setFormError("Safeguard: You cannot deactivate or downgrade this account. The system must always have at least one active Administrator account.");
          return;
        }
      }

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
            // Only update password if a new one is typed
            ...(userPassword.trim() ? { password: userPassword.trim() } : {})
          };
        }
        return u;
      });

      const updatedUser = updatedUsers.find(u => u.id === selectedUser.id);
      onUpdateUsers(updatedUsers, updatedUser);
      setFormSuccess("User updated successfully!");
      onLogAction(
        "Users",
        roleChanged ? "Assign Role" : "User Updated",
        emailNormalized,
        roleChanged
          ? `Changed role for ${userFullName} (${emailNormalized}) from "${selectedUser.role}" to "${userRole}"`
          : `Modified account details for ${userFullName}`
      );
      setTimeout(() => setUserModalOpen(false), 1000);

    } else {
      // Add User mode
      if (!userPassword.trim()) {
        setFormError("Password is required for new accounts.");
        return;
      }

      // Check duplicate
      const isDuplicate = users.some(u => u.email.toLowerCase() === emailNormalized);
      if (isDuplicate) {
        setFormError("A user with this email address is already registered.");
        return;
      }

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
      setFormSuccess("User account created successfully!");
      onLogAction("Users", "User Created", emailNormalized, `Enrolled user role ${userRole} under email ${emailNormalized}`);
      setTimeout(() => setUserModalOpen(false), 1000);
    }
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser?.id) {
      alert("Self-Deletion Safeguard: You cannot delete your own active administrative session!");
      return;
    }

    if (u.role === "Administrator" && u.status === "Active") {
      const activeAdminsCount = users.filter(usr => usr.role === "Administrator" && usr.status === "Active").length;
      if (activeAdminsCount <= 1) {
        alert("Safeguard: You cannot delete this account. The system must always have at least one active Administrator account.");
        return;
      }
    }

    const confirmCheck = window.confirm(`Are you absolutely sure you want to permanently delete user account: ${u.fullName} (${u.email})?`);
    if (confirmCheck) {
      if (onDeleteUser) {
        onDeleteUser(u.id);
      } else {
        const updated = users.filter(usr => usr.id !== u.id);
        onUpdateUsers(updated);
      }
      onLogAction("Users", "User Deleted", u.email, `Permanently deleted user account: ${u.fullName}`);
    }
  };

  const handleToggleUserStatus = (u: User) => {
    if (u.id === currentUser?.id) {
      alert("Self-Deactivation Safeguard: You cannot deactivate your own administrative session!");
      return;
    }

    const nextStatus = u.status === "Active" ? "Inactive" : "Active";

    if (u.role === "Administrator" && u.status === "Active" && nextStatus !== "Active") {
      const activeAdminsCount = users.filter(usr => usr.role === "Administrator" && usr.status === "Active").length;
      if (activeAdminsCount <= 1) {
        alert("Safeguard: You cannot deactivate this account. The system must always have at least one active Administrator account.");
        return;
      }
    }

    const updated = users.map(usr => {
      if (usr.id === u.id) {
        // If activating, we can also ensure verified
        const autoVerify = nextStatus === "Active" ? true : usr.emailVerified;
        return { ...usr, status: nextStatus as any, emailVerified: autoVerify };
      }
      return usr;
    });
    const toggledUser = updated.find(usr => usr.id === u.id);
    onUpdateUsers(updated, toggledUser);
    onLogAction("Users", nextStatus === "Active" ? "User Activated" : "User Deactivated", u.email, `Set status of user to ${nextStatus}`);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sub-menu Navigation Sidebar */}
      <div className="w-full lg:w-56 shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-200 pr-0 lg:pr-4">
        {allowedSubTabs.map(item => {
          const Icon = item.icon;
          const isActive = activeSubTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSubTab(item.id)}
              className={`whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${
                isActive 
                  ? "bg-primary-custom text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Form Fields Container */}
      <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6 shadow-2xs">
        
        {/* TAB 1: COMPANY PROFILE */}
        {activeSubTab === "profile" && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">Company Profile</h3>
              <p className="text-xs text-slate-500 mt-1">Configure physical coordinates and centralized legal identification metadata.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Display Brand Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Legal Name *</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Short Name</label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-semibold ring-primary-custom"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Central Email Address</label>
                <input
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
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
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
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
              <div className="h-20 w-20 border border-slate-200 bg-white rounded-lg flex items-center justify-center p-2 shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Branding Logo" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-xs font-extrabold text-slate-400 uppercase">No Logo</span>
                )}
              </div>
              <div className="space-y-2 flex-1 text-center sm:text-left w-full">
                <h4 className="font-bold text-xs text-slate-700">Ethio-Re Company Logo</h4>
                {canEdit && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="px-3.5 py-1.5 bg-white border hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-2xs">
                      {logoUploading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary-custom" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-primary-custom" />
                      )}
                      <span>{logoUploading ? "Uploading to Storage..." : "Choose New Logo"}</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={logoUploading} className="hidden" />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg"
                      >
                        Remove Logo
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
                <p className="text-[10px] text-slate-400">Supported formats: JPEG, PNG, SVG (Max 1MB). Stored in Firebase Storage and rendered across Sidebar, Header, and Reports.</p>
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
              <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-lg border border-slate-100 items-end">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Holiday Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Adwa Victory Day"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Holiday Date</label>
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Date
                </button>
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
                            {canEdit && !u.emailVerified && (
                              <button
                                type="button"
                                onClick={() => {
                                  alert(`Verification email link dispatched to ${u.email}.`);
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

            <form onSubmit={handleUserSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                  {formSuccess}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Martha Teshome"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom animate-pulse-once"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. martha@ethio-re.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {editUserMode ? "New Password (leave empty to keep current)" : "Access Password *"}
                </label>
                <input
                  type="password"
                  placeholder="Password value"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                  required={!editUserMode}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">System Role</label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold text-slate-800"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Account Status</label>
                  <select
                    value={userStatus}
                    onChange={(e) => setUserStatus(e.target.value as AccountStatus)}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Pending Verification">Pending Verification</option>
                  </select>
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
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  Save Account
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

