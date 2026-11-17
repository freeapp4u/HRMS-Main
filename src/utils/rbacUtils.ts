import { SystemRole, RolePermissions, ActionPermissions, ModulePermission, User, Department, Employee } from "../types";
import { APP_MODULES, DEFAULT_ACTIONS } from "../config/permissions";

export const DEFAULT_ROLES: SystemRole[] = [
  {
    id: "Administrator",
    name: "Administrator",
    description: "Full system access with all administrative privileges.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01"
  },
  {
    id: "HR Officer",
    name: "HR Officer",
    description: "Operational access to employee management, attendance, leaves, medical benefits, and payroll processing.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01"
  },
  {
    id: "Department Head",
    name: "Department Head",
    description: "Access to department-specific employee directories, reports, attendance, and leave approvals.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01"
  },
  {
    id: "Employee",
    name: "Employee",
    description: "An employee can access only their own employee information and records associated with their registered company email.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01"
  },
  {
    id: "Auditor",
    name: "Auditor",
    description: "Read-only access to operational modules, audit logs, and compliance reports.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01"
  }
];

const getFullActions = (): ActionPermissions => ({
  view: true,
  create: true,
  edit: true,
  delete: true,
  approve: true,
  export: true
});

const getReadOnlyActions = (): ActionPermissions => ({
  view: true,
  create: false,
  edit: false,
  delete: false,
  approve: false,
  export: true
});

export const createEmptyModulePermissions = (): { [moduleId: string]: ModulePermission } => {
  const modulePermissions: { [moduleId: string]: ModulePermission } = {};
  APP_MODULES.forEach(module => {
    const submenus: { [submenuId: string]: boolean } = {};
    module.submenus.forEach(sub => {
      submenus[sub.id] = false;
    });
    modulePermissions[module.id] = {
      enabled: false,
      actions: { ...DEFAULT_ACTIONS },
      submenus
    };
  });
  return modulePermissions;
};

export const normalizeRolePermissions = (perm: RolePermissions): RolePermissions => {
  const normalized = createEmptyModulePermissions();
  Object.keys(normalized).forEach(moduleId => {
    const existingMod = perm.modulePermissions?.[moduleId];
    if (existingMod) {
      normalized[moduleId].enabled = Boolean(existingMod.enabled);
      normalized[moduleId].actions = {
        view: Boolean(existingMod.actions?.view),
        create: Boolean(existingMod.actions?.create),
        edit: Boolean(existingMod.actions?.edit),
        delete: Boolean(existingMod.actions?.delete),
        approve: Boolean(existingMod.actions?.approve),
        export: Boolean(existingMod.actions?.export)
      };
      Object.keys(normalized[moduleId].submenus).forEach(subId => {
        normalized[moduleId].submenus[subId] = Boolean(existingMod.submenus?.[subId]);
      });
    }
  });
  return {
    ...perm,
    modulePermissions: normalized
  };
};

export const getDefaultRolePermissions = (roleId: string): RolePermissions => {
  const modulePermissions = createEmptyModulePermissions();

  if (roleId === "Administrator") {
    APP_MODULES.forEach(m => {
      modulePermissions[m.id].enabled = true;
      modulePermissions[m.id].actions = getFullActions();
      Object.keys(modulePermissions[m.id].submenus).forEach(s => {
        modulePermissions[m.id].submenus[s] = true;
      });
    });
  } else if (roleId === "HR Officer") {
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = { view: true, create: true, edit: true, delete: true, approve: false, export: true };
    modulePermissions.employees.submenus = { directory: true, enrollment: true, bulk_import: true };

    modulePermissions.departments.enabled = true;
    modulePermissions.departments.actions = { view: true, create: true, edit: true, delete: false, approve: false, export: true };

    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = { view: true, create: true, edit: true, delete: true, approve: true, export: true };
    modulePermissions.leaves.submenus = { dashboard: true, applications: true, balances: true, calendar: true, config: false, reports: true };

    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = { view: true, create: true, edit: true, delete: true, approve: true, export: true };

    modulePermissions.medical.enabled = true;
    modulePermissions.medical.actions = { view: true, create: true, edit: true, delete: true, approve: true, export: true };
    modulePermissions.medical.submenus = { dashboard: true, claims: true, family: true, policy: true, reports: true };

    modulePermissions.payroll.enabled = true;
    modulePermissions.payroll.actions = { view: true, create: true, edit: true, delete: false, approve: true, export: true };
    modulePermissions.payroll.submenus = {
      dashboard: true,
      config: false,
      salary_setup: true,
      processing: true,
      approval: true,
      payslips: true,
      csv_import: true,
      csv_export: true,
      reports: true,
      history: true
    };

    modulePermissions.documents.enabled = true;
    modulePermissions.documents.actions = { view: true, create: true, edit: true, delete: true, approve: false, export: true };

    modulePermissions.reports.enabled = true;
    modulePermissions.reports.actions = getReadOnlyActions();
    modulePermissions.reports.submenus = { directory: true, leaves: true, attendance: true, audit: false };

    modulePermissions.help.enabled = true;
    modulePermissions.help.actions = { ...DEFAULT_ACTIONS, view: true };
  } else if (roleId === "Department Head") {
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = getReadOnlyActions();
    modulePermissions.employees.submenus = { directory: true, enrollment: false, bulk_import: false };

    modulePermissions.departments.enabled = true;
    modulePermissions.departments.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = { view: true, create: true, edit: false, delete: false, approve: true, export: true };
    modulePermissions.leaves.submenus = { dashboard: true, applications: true, balances: true, calendar: true, config: false, reports: true };

    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = { view: true, create: false, edit: false, delete: false, approve: true, export: true };

    modulePermissions.medical.enabled = true;
    modulePermissions.medical.actions = { view: true, create: true, edit: false, delete: false, approve: false, export: false };
    modulePermissions.medical.submenus = { dashboard: true, claims: true, family: true, policy: false, reports: false };

    modulePermissions.payroll.enabled = true;
    modulePermissions.payroll.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.payroll.submenus = {
      dashboard: true,
      config: false,
      salary_setup: false,
      processing: false,
      approval: false,
      payslips: true,
      csv_import: false,
      csv_export: false,
      reports: false,
      history: false
    };

    modulePermissions.documents.enabled = true;
    modulePermissions.documents.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.reports.enabled = true;
    modulePermissions.reports.actions = getReadOnlyActions();
    modulePermissions.reports.submenus = { directory: true, leaves: true, attendance: true, audit: false };

    modulePermissions.help.enabled = true;
    modulePermissions.help.actions = { ...DEFAULT_ACTIONS, view: true };
  } else if (roleId === "Auditor") {
    APP_MODULES.forEach(m => {
      modulePermissions[m.id].enabled = true;
      modulePermissions[m.id].actions = getReadOnlyActions();
      Object.keys(modulePermissions[m.id].submenus).forEach(s => {
        modulePermissions[m.id].submenus[s] = true;
      });
    });
  } else if (roleId === "Employee") {
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.employees.submenus = { directory: true, enrollment: false, bulk_import: false };

    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = { view: true, create: true, edit: false, delete: false, approve: false, export: false };
    modulePermissions.leaves.submenus = { dashboard: true, applications: true, balances: true, calendar: true, config: false, reports: false };

    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.medical.enabled = true;
    modulePermissions.medical.actions = { view: true, create: true, edit: false, delete: false, approve: false, export: false };
    modulePermissions.medical.submenus = { dashboard: true, claims: true, family: true, policy: false, reports: false };

    modulePermissions.payroll.enabled = true;
    modulePermissions.payroll.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.payroll.submenus = {
      dashboard: true,
      config: false,
      salary_setup: false,
      processing: false,
      approval: false,
      payslips: true,
      csv_import: false,
      csv_export: false,
      reports: false,
      history: false
    };

    modulePermissions.help.enabled = true;
    modulePermissions.help.actions = { ...DEFAULT_ACTIONS, view: true };
  }

  return {
    id: roleId,
    roleId,
    modulePermissions,
    updatedBy: "System",
    updatedAt: new Date().toISOString()
  };
};

export const enforceAdminSafeguard = (perm: RolePermissions): RolePermissions => {
  if (perm.roleId !== "Administrator") return perm;
  const cloned: RolePermissions = JSON.parse(JSON.stringify(perm));
  if (cloned.modulePermissions.settings) {
    cloned.modulePermissions.settings.enabled = true;
    cloned.modulePermissions.settings.actions.view = true;
    cloned.modulePermissions.settings.actions.edit = true;
    cloned.modulePermissions.settings.submenus.roles = true;
    cloned.modulePermissions.settings.submenus.users = true;
  }
  return cloned;
};

export const getEffectiveRolePermissions = (
  roles: SystemRole[],
  rolePermissions: RolePermissions[],
  roleId: string | undefined
): RolePermissions | undefined => {
  if (!roleId) return undefined;
  const roleObj = roles.find(r => r.id === roleId || r.name === roleId);
  if (roleObj && roleObj.status === "Inactive") {
    return undefined;
  }
  const found = rolePermissions.find(p => p.roleId === roleId || (roleObj && p.roleId === roleObj.id));
  if (found) {
    return normalizeRolePermissions(found);
  }
  if (DEFAULT_ROLES.some(r => r.id === roleId)) {
    return getDefaultRolePermissions(roleId);
  }
  return undefined;
};

export const hasPermission = (
  rolePermissions: RolePermissions | undefined,
  moduleId: string,
  action?: keyof ActionPermissions,
  submenuId?: string
): boolean => {
  if (!rolePermissions) return false;

  const modulePerm = rolePermissions.modulePermissions?.[moduleId];
  if (!modulePerm || !modulePerm.enabled) return false;

  if (action && !modulePerm.actions?.[action]) return false;

  if (submenuId && !modulePerm.submenus?.[submenuId]) return false;

  return true;
};

export const getDepartmentHeadManagedDeptIds = (
  currentUser: User | null,
  departments: Department[],
  employees: Employee[]
): string[] => {
  if (!currentUser || currentUser.role !== "Department Head") return [];
  const emailLower = currentUser.email.trim().toLowerCase();
  const linkedEmp = employees.find(
    e =>
      (currentUser.employeeId && e.employeeId === currentUser.employeeId) ||
      e.email.trim().toLowerCase() === emailLower
  );
  const empId = currentUser.employeeId || linkedEmp?.employeeId;

  const headed = departments
    .filter(d => empId && d.headEmployeeId === empId)
    .map(d => d.id);

  if (headed.length > 0) return headed;
  return linkedEmp?.departmentId ? [linkedEmp.departmentId] : [];
};
