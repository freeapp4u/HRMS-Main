import React, { useState, useMemo, useEffect } from "react";
import { SystemRole, RolePermissions, ActionPermissions, User } from "../types";
import { APP_MODULES, DEFAULT_ACTIONS } from "../config/permissions";
import {
  createEmptyModulePermissions,
  enforceAdminSafeguard,
  getDefaultRolePermissions,
  normalizeRolePermissions
} from "../utils/rbacUtils";
import {
  ShieldCheck, Plus, Search, Save, Trash2, AlertTriangle, CheckCircle2,
  Lock, Settings, Users2, X, Info, Edit, Power, RotateCcw
} from "lucide-react";

interface RoleMatrixProps {
  roles: SystemRole[];
  rolePermissions: RolePermissions[];
  users?: User[];
  currentUser: User | null;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdateRoles: (roles: SystemRole[], deletedRoleId?: string) => void;
  onUpdateRolePermissions: (perms: RolePermissions[]) => void;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

export default function RoleMatrix({
  roles,
  rolePermissions,
  users = [],
  currentUser,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  onUpdateRoles,
  onUpdateRolePermissions,
  onLogAction
}: RoleMatrixProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || "Administrator");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleSearch, setRoleSearch] = useState("");

  // Create / Edit Role Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<SystemRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  // Confirmation & Feedback states
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<SystemRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Local state for the selected role's permissions
  const [localPermissions, setLocalPermissions] = useState<RolePermissions | null>(null);

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId) || roles[0], [roles, selectedRoleId]);

  useEffect(() => {
    if (!roles.some(r => r.id === selectedRoleId) && roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) {
      setLocalPermissions(null);
      return;
    }
    const perm = rolePermissions.find(p => p.roleId === selectedRole.id);
    if (perm) {
      setLocalPermissions(JSON.parse(JSON.stringify(normalizeRolePermissions(perm))));
    } else {
      setLocalPermissions(getDefaultRolePermissions(selectedRole.id));
    }
    setHasUnsavedChanges(false);
  }, [selectedRole?.id, rolePermissions]);

  const showBanner = (type: "success" | "error" | "info", text: string) => {
    setStatusBanner({ type, text });
    setTimeout(() => {
      setStatusBanner(prev => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const assignedUsersCount = useMemo(() => {
    if (!selectedRole) return 0;
    return users.filter(u => u.role === selectedRole.id || u.role === selectedRole.name).length;
  }, [users, selectedRole]);

  const handleToggleModule = (moduleId: string) => {
    if (!localPermissions || !canEdit) return;
    if (selectedRole?.id === "Administrator" && moduleId === "settings" && localPermissions.modulePermissions[moduleId]?.enabled) {
      showBanner("error", "Safeguard: Administration module access cannot be disabled for the Administrator role.");
      return;
    }

    const updated: RolePermissions = JSON.parse(JSON.stringify(localPermissions));
    const modulePerm = updated.modulePermissions[moduleId];
    modulePerm.enabled = !modulePerm.enabled;

    if (!modulePerm.enabled) {
      Object.keys(modulePerm.submenus).forEach(key => {
        modulePerm.submenus[key] = false;
      });
      Object.keys(modulePerm.actions).forEach(key => {
        (modulePerm.actions as any)[key] = false;
      });
    } else {
      modulePerm.actions.view = true;
      const modMeta = APP_MODULES.find(m => m.id === moduleId);
      if (modMeta && modMeta.submenus.length > 0) {
        const anySubEnabled = Object.values(modulePerm.submenus).some(Boolean);
        if (!anySubEnabled) {
          modulePerm.submenus[modMeta.submenus[0].id] = true;
        }
      }
    }

    setLocalPermissions(updated);
    setHasUnsavedChanges(true);
  };

  const handleToggleSubmenu = (moduleId: string, submenuId: string) => {
    if (!localPermissions || !canEdit) return;
    if (
      selectedRole?.id === "Administrator" &&
      moduleId === "settings" &&
      (submenuId === "roles" || submenuId === "users") &&
      localPermissions.modulePermissions[moduleId]?.submenus[submenuId]
    ) {
      showBanner("error", "Safeguard: Administrators must retain access to Roles & Permissions and User Management.");
      return;
    }

    const updated: RolePermissions = JSON.parse(JSON.stringify(localPermissions));
    const nextVal = !updated.modulePermissions[moduleId].submenus[submenuId];
    updated.modulePermissions[moduleId].submenus[submenuId] = nextVal;

    if (nextVal) {
      updated.modulePermissions[moduleId].enabled = true;
      updated.modulePermissions[moduleId].actions.view = true;
    }

    setLocalPermissions(updated);
    setHasUnsavedChanges(true);
  };

  const handleToggleAction = (moduleId: string, action: keyof ActionPermissions) => {
    if (!localPermissions || !canEdit) return;
    if (
      selectedRole?.id === "Administrator" &&
      moduleId === "settings" &&
      (action === "view" || action === "edit") &&
      localPermissions.modulePermissions[moduleId]?.actions[action]
    ) {
      showBanner("error", "Safeguard: Administrators must retain View and Edit permissions for Administration.");
      return;
    }

    const updated: RolePermissions = JSON.parse(JSON.stringify(localPermissions));
    updated.modulePermissions[moduleId].actions[action] = !updated.modulePermissions[moduleId].actions[action];

    if (updated.modulePermissions[moduleId].actions[action]) {
      updated.modulePermissions[moduleId].enabled = true;
      if (action !== "view") {
        updated.modulePermissions[moduleId].actions.view = true;
      }
    }

    setLocalPermissions(updated);
    setHasUnsavedChanges(true);
  };

  const handleSelectAllActions = (type: "all" | "view" | "edit" | "none") => {
    if (!localPermissions || !canEdit) return;
    const updated: RolePermissions = JSON.parse(JSON.stringify(localPermissions));

    Object.keys(updated.modulePermissions).forEach(moduleId => {
      const module = updated.modulePermissions[moduleId];
      if (type === "none") {
        module.enabled = false;
        Object.keys(module.actions).forEach(a => ((module.actions as any)[a] = false));
        Object.keys(module.submenus).forEach(s => (module.submenus[s] = false));
      } else {
        module.enabled = true;
        module.actions.view = true;
        if (type === "all") {
          Object.keys(module.actions).forEach(a => ((module.actions as any)[a] = true));
          Object.keys(module.submenus).forEach(s => (module.submenus[s] = true));
        } else if (type === "edit") {
          module.actions.edit = true;
          module.actions.create = true;
        }
      }
    });

    const safeguarded = selectedRole?.id === "Administrator" ? enforceAdminSafeguard(updated) : updated;
    setLocalPermissions(safeguarded);
    setHasUnsavedChanges(true);
  };

  const handleCopyFromRole = (fromRoleId: string) => {
    if (!localPermissions || !canEdit || !fromRoleId) return;
    const fromPerm = rolePermissions.find(p => p.roleId === fromRoleId) || getDefaultRolePermissions(fromRoleId);
    const sourceRole = roles.find(r => r.id === fromRoleId);

    const updated: RolePermissions = {
      ...localPermissions,
      modulePermissions: JSON.parse(JSON.stringify(normalizeRolePermissions(fromPerm).modulePermissions))
    };

    const safeguarded = selectedRole?.id === "Administrator" ? enforceAdminSafeguard(updated) : updated;
    setLocalPermissions(safeguarded);
    setHasUnsavedChanges(true);
    showBanner("info", `Copied permission template from "${sourceRole?.name || fromRoleId}". Click "Save & Apply" to commit.`);
  };

  const handleCancelChanges = () => {
    if (!selectedRole) return;
    const saved = rolePermissions.find(p => p.roleId === selectedRole.id);
    setLocalPermissions(saved ? JSON.parse(JSON.stringify(normalizeRolePermissions(saved))) : getDefaultRolePermissions(selectedRole.id));
    setHasUnsavedChanges(false);
    showBanner("info", "Unsaved permission edits discarded.");
  };

  const executeSavePermissions = () => {
    if (!localPermissions || !selectedRole || !canEdit) return;

    setIsSaving(true);
    const timestamp = new Date().toISOString();
    const cleanPerm = selectedRole.id === "Administrator"
      ? enforceAdminSafeguard({ ...localPermissions, updatedAt: timestamp, updatedBy: currentUser?.email || "Admin" })
      : { ...localPermissions, updatedAt: timestamp, updatedBy: currentUser?.email || "Admin" };

    const existsInList = rolePermissions.some(p => p.roleId === selectedRole.id);
    const updatedPerms = existsInList
      ? rolePermissions.map(p => (p.roleId === selectedRole.id ? cleanPerm : p))
      : [...rolePermissions, cleanPerm];

    const updatedRoles = roles.map(r =>
      r.id === selectedRole.id ? { ...r, updatedDate: timestamp.split("T")[0] } : r
    );

    onUpdateRolePermissions(updatedPerms);
    onUpdateRoles(updatedRoles);
    onLogAction(
      "Security",
      "Update Role Permissions",
      selectedRole.name,
      `Applied dynamic RBAC matrix changes for role "${selectedRole.name}" (${Object.values(cleanPerm.modulePermissions).filter((m: any) => m?.enabled).length} modules enabled)`
    );

    setConfirmSaveOpen(false);
    setIsSaving(false);
    setHasUnsavedChanges(false);
    showBanner("success", `Permissions for "${selectedRole.name}" saved and applied immediately across the system.`);
  };

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleDesc("");
    setShowRoleModal(true);
  };

  const handleOpenEditModal = (role: SystemRole) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description);
    setShowRoleModal(true);
  };

  const handleSaveRoleModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    const today = new Date().toISOString().split("T")[0];

    if (editingRole) {
      const updatedName = editingRole.isSystem ? editingRole.name : roleName.trim();
      const duplicate = roles.some(r => r.id !== editingRole.id && r.name.toLowerCase() === updatedName.toLowerCase());
      if (duplicate) {
        showBanner("error", `A role named "${updatedName}" already exists.`);
        return;
      }

      const updatedRoles = roles.map(r =>
        r.id === editingRole.id
          ? { ...r, name: updatedName, description: roleDesc.trim(), updatedDate: today }
          : r
      );
      onUpdateRoles(updatedRoles);
      onLogAction("Security", "Edit Role", updatedName, `Updated role metadata for "${updatedName}"`);
      setShowRoleModal(false);
      setEditingRole(null);
      showBanner("success", `Role "${updatedName}" updated.`);
      return;
    }

    const candidateName = roleName.trim();
    const candidateId = candidateName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    if (!candidateId) {
      showBanner("error", "Role name must contain alphanumeric characters.");
      return;
    }

    const exists = roles.some(
      r => r.id.toLowerCase() === candidateId.toLowerCase() || r.name.toLowerCase() === candidateName.toLowerCase()
    );
    if (exists) {
      showBanner("error", `Role "${candidateName}" already exists.`);
      return;
    }

    const newRole: SystemRole = {
      id: candidateId,
      name: candidateName,
      description: roleDesc.trim() || `Custom system role: ${candidateName}`,
      status: "Active",
      isSystem: false,
      createdDate: today,
      updatedDate: today
    };

    const newPerm: RolePermissions = {
      id: newRole.id,
      roleId: newRole.id,
      modulePermissions: createEmptyModulePermissions(),
      updatedBy: currentUser?.email || "Admin",
      updatedAt: new Date().toISOString()
    };

    onUpdateRoles([...roles, newRole]);
    onUpdateRolePermissions([...rolePermissions, newPerm]);
    onLogAction("Security", "Create Role", newRole.name, `Created custom system role "${newRole.name}" with zero default permissions`);

    setSelectedRoleId(newRole.id);
    setShowRoleModal(false);
    setRoleName("");
    setRoleDesc("");
    showBanner("success", `Custom role "${newRole.name}" created. Configure its module permissions below.`);
  };

  const handleToggleRoleStatus = (role: SystemRole) => {
    if (!canEdit) return;
    if (role.id === "Administrator") {
      showBanner("error", "Safeguard: The Administrator system role cannot be deactivated.");
      return;
    }
    if (currentUser?.role === role.id || currentUser?.role === role.name) {
      showBanner("error", "Safeguard: You cannot deactivate the role assigned to your own active session.");
      return;
    }

    const nextStatus: "Active" | "Inactive" = role.status === "Active" ? "Inactive" : "Active";
    const updatedRoles = roles.map(r =>
      r.id === role.id ? { ...r, status: nextStatus, updatedDate: new Date().toISOString().split("T")[0] } : r
    );
    onUpdateRoles(updatedRoles);
    onLogAction(
      "Security",
      nextStatus === "Active" ? "Activate Role" : "Deactivate Role",
      role.name,
      `Set role "${role.name}" status to ${nextStatus}`
    );
    showBanner("info", `Role "${role.name}" is now ${nextStatus}.`);
  };

  const handleDeleteCustomRole = (role: SystemRole) => {
    if (!canDelete) return;
    if (role.isSystem) {
      showBanner("error", "Core system roles cannot be deleted.");
      return;
    }
    const inUseCount = users.filter(u => u.role === role.id || u.role === role.name).length;
    if (inUseCount > 0) {
      showBanner("error", `Cannot delete "${role.name}": ${inUseCount} user account(s) are currently assigned to this role. Reassign them first.`);
      return;
    }

    const remainingRoles = roles.filter(r => r.id !== role.id);
    const remainingPerms = rolePermissions.filter(p => p.roleId !== role.id);
    onUpdateRoles(remainingRoles, role.id);
    onUpdateRolePermissions(remainingPerms);
    onLogAction("Security", "Delete Role", role.name, `Deleted custom role "${role.name}"`);
    setConfirmDeleteRole(null);
    setSelectedRoleId(remainingRoles[0]?.id || "Administrator");
    showBanner("success", `Custom role "${role.name}" deleted.`);
  };

  const enabledModulesCount = useMemo(() => {
    if (!localPermissions) return 0;
    return Object.values(localPermissions.modulePermissions).filter((m: any) => m?.enabled).length;
  }, [localPermissions]);

  const filteredModules = APP_MODULES.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.submenus.some(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const visibleRoles = roles.filter(r =>
    r.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
    r.description.toLowerCase().includes(roleSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-custom" />
            Roles &amp; Permissions Matrix
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Configure dynamic module, submenu, and action permissions per role. Saved changes apply immediately.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {canCreate && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                New Role
              </button>
            )}
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleCancelChanges}
                className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmSaveOpen(true)}
              disabled={!hasUnsavedChanges || isSaving}
              className="px-4 py-1.5 bg-primary-custom text-white text-xs font-black rounded-lg hover:opacity-95 flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {isSaving ? <Settings className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save &amp; Apply
            </button>
          </div>
        )}
      </div>

      {statusBanner && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 ${
            statusBanner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : statusBanner.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-sky-50 border-sky-200 text-sky-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : statusBanner.type === "error" ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-sky-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button type="button" onClick={() => setStatusBanner(null)} className="opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <span>Unsaved permission changes for "{selectedRole?.name}".</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={handleCancelChanges} className="text-[10px] font-bold uppercase text-slate-600 hover:underline">
              Discard
            </button>
            <button type="button" onClick={() => setConfirmSaveOpen(true)} className="text-[10px] font-black uppercase text-amber-900 underline">
              Review &amp; Apply
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Role List Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500">System Roles ({roles.length})</h3>
              <Users2 className="h-4 w-4 text-slate-400" />
            </div>
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                placeholder="Filter roles..."
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium focus:bg-white"
              />
            </div>
            <div className="p-2 space-y-1 max-h-[360px] overflow-y-auto">
              {visibleRoles.map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-all ${
                    selectedRole?.id === role.id
                      ? "bg-primary-custom text-white shadow-md font-bold"
                      : "text-slate-600 hover:bg-slate-50 font-medium"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <span className="text-xs truncate block">{role.name}</span>
                    {role.status === "Inactive" && (
                      <span className={`text-[9px] uppercase font-bold ${selectedRole?.id === role.id ? "text-amber-200" : "text-rose-500"}`}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {role.isSystem && (
                    <Lock className={`h-3 w-3 shrink-0 ${selectedRole?.id === role.id ? "text-white/60" : "text-slate-300"}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedRole && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase text-slate-400">Role Summary</h4>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(selectedRole)}
                      className="p-1 text-slate-500 hover:text-primary-custom bg-white border border-slate-200 rounded"
                      title="Edit Role Details"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    {selectedRole.id !== "Administrator" && (
                      <button
                        type="button"
                        onClick={() => handleToggleRoleStatus(selectedRole)}
                        className={`p-1 bg-white border border-slate-200 rounded ${
                          selectedRole.status === "Active" ? "text-emerald-600 hover:text-rose-600" : "text-rose-600 hover:text-emerald-600"
                        }`}
                        title={selectedRole.status === "Active" ? "Deactivate Role" : "Activate Role"}
                      >
                        <Power className="h-3 w-3" />
                      </button>
                    )}
                    {canDelete && !selectedRole.isSystem && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRole(selectedRole)}
                        className="p-1 text-slate-400 hover:text-rose-600 bg-white border border-slate-200 rounded"
                        title="Delete Custom Role"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">{selectedRole.name}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{selectedRole.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold uppercase">Status</span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                      selectedRole.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {selectedRole.status}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold uppercase">Assigned Users</span>
                  <span className="text-slate-700 font-bold">{assignedUsersCount}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold uppercase">Enabled Modules</span>
                  <span className="text-slate-700 font-bold">{enabledModulesCount} / {APP_MODULES.length}</span>
                </div>
                {localPermissions && (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold uppercase">Last Updated</span>
                    <span className="text-slate-600 font-medium">{new Date(localPermissions.updatedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Permission Matrix */}
        <div className="lg:col-span-9 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter modules or submenus..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-primary-custom"
                />
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => handleSelectAllActions("view")} className="px-2 py-1 bg-white border rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50">All View</button>
                    <button type="button" onClick={() => handleSelectAllActions("edit")} className="px-2 py-1 bg-white border rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50">All Edit</button>
                    <button type="button" onClick={() => handleSelectAllActions("all")} className="px-2 py-1 bg-white border rounded text-[10px] font-bold text-primary-custom hover:bg-blue-50 border-primary-custom">Select All</button>
                    <button type="button" onClick={() => handleSelectAllActions("none")} className="px-2 py-1 bg-white border rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 border-rose-200">Clear All</button>
                  </div>
                  <div className="h-6 w-px bg-slate-300 mx-1 shrink-0" />
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Copy From:</span>
                    <select
                      onChange={(e) => handleCopyFromRole(e.target.value)}
                      value=""
                      className="text-[10px] font-bold bg-white border rounded px-2 py-1 outline-none"
                    >
                      <option value="" disabled>Choose role</option>
                      {roles.filter(r => r.id !== selectedRole?.id).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-3 w-1/3">Module &amp; Hierarchy</th>
                    <th className="px-3 py-3 text-center">View</th>
                    <th className="px-3 py-3 text-center">Create</th>
                    <th className="px-3 py-3 text-center">Edit</th>
                    <th className="px-3 py-3 text-center">Delete</th>
                    <th className="px-3 py-3 text-center">Approve</th>
                    <th className="px-3 py-3 text-center">Export</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredModules.map(module => {
                    const localModule = localPermissions?.modulePermissions[module.id];
                    if (!localModule) return null;

                    return (
                      <React.Fragment key={module.id}>
                        <tr className={`group transition-colors ${localModule.enabled ? "bg-white" : "bg-slate-50/50"}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={localModule.enabled}
                                disabled={!canEdit}
                                onChange={() => handleToggleModule(module.id)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-primary-custom focus:ring-primary-custom disabled:opacity-50"
                              />
                              <span className={`text-xs font-bold ${localModule.enabled ? "text-slate-800" : "text-slate-400"}`}>
                                {module.name}
                              </span>
                            </div>
                          </td>
                          {(["view", "create", "edit", "delete", "approve", "export"] as (keyof ActionPermissions)[]).map(action => (
                            <td key={action} className="px-3 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={localModule.actions[action]}
                                disabled={!localModule.enabled || !canEdit}
                                onChange={() => handleToggleAction(module.id, action)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-primary-custom focus:ring-primary-custom disabled:opacity-30"
                              />
                            </td>
                          ))}
                        </tr>
                        {module.submenus.length > 0 && localModule.enabled && (
                          module.submenus.map(sub => (
                            <tr key={sub.id} className="bg-slate-50/30 border-l-4 border-l-primary-custom/20">
                              <td className="px-12 py-2.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(localModule.submenus[sub.id])}
                                    disabled={!canEdit}
                                    onChange={() => handleToggleSubmenu(module.id, sub.id)}
                                    className="h-3 w-3 rounded border-slate-300 text-primary-custom focus:ring-primary-custom disabled:opacity-50"
                                  />
                                  <span className="text-[11px] font-semibold text-slate-600">{sub.name}</span>
                                </div>
                              </td>
                              <td colSpan={6} className="px-3 py-2.5 text-[10px] text-slate-400">
                                Submenu visibility
                              </td>
                            </tr>
                          ))
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-primary-custom p-4 flex items-center justify-between text-white">
              <h3 className="font-black text-sm uppercase tracking-wider">
                {editingRole ? `Edit Role: ${editingRole.name}` : "Create New System Role"}
              </h3>
              <button type="button" onClick={() => setShowRoleModal(false)} className="hover:bg-white/20 rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRoleModal} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Role Name</label>
                <input
                  autoFocus
                  required
                  disabled={Boolean(editingRole?.isSystem)}
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Finance Officer"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-primary-custom disabled:opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Description</label>
                <textarea
                  rows={3}
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="Describe the responsibilities of this role..."
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-primary-custom"
                />
              </div>
              {!editingRole && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3">
                  <Info className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                    New roles are created with <strong>zero permissions</strong> by default. Configure their access matrix or copy from an existing role after creation.
                  </p>
                </div>
              )}
              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 py-2 text-xs font-black text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-black text-white bg-primary-custom hover:bg-blue-900 rounded-xl shadow-md shadow-blue-900/20 transition-all"
                >
                  {editingRole ? "Save Role" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal Before Saving Permissions */}
      {confirmSaveOpen && selectedRole && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-primary-custom p-4 flex items-center justify-between text-white">
              <h3 className="font-black text-sm uppercase tracking-wider">Confirm Permission Update</h3>
              <button type="button" onClick={() => setConfirmSaveOpen(false)} className="hover:bg-white/20 rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                You are about to update the dynamic access permissions for role{" "}
                <strong className="text-slate-900">{selectedRole.name}</strong> ({enabledModulesCount} of {APP_MODULES.length} modules enabled).
              </p>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-900 font-medium">
                These changes will take effect immediately for {assignedUsersCount} assigned user(s), updating navigation menus, route access, and action controls.
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSaveOpen(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeSavePermissions}
                  className="flex-1 py-2 text-xs font-black text-white bg-primary-custom hover:opacity-95 rounded-xl shadow-sm"
                >
                  Confirm &amp; Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Custom Role Confirmation Modal */}
      {confirmDeleteRole && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-rose-600 p-4 flex items-center justify-between text-white">
              <h3 className="font-black text-sm uppercase tracking-wider">Delete Custom Role</h3>
              <button type="button" onClick={() => setConfirmDeleteRole(null)} className="hover:bg-white/20 rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <p>
                Are you sure you want to permanently delete the role <strong>{confirmDeleteRole.name}</strong> and its permission matrix?
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteRole(null)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCustomRole(confirmDeleteRole)}
                  className="flex-1 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
                >
                  Delete Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
