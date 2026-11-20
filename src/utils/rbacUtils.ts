import {
  SystemRole,
  RolePermissions,
  ActionPermissions,
  ModulePermission,
  DataScope,
  User,
  Department,
  Employee,
} from "../types";
import {
  APP_MODULES,
  DEFAULT_ACTIONS,
  EMPLOYEE_BLOCKED_ADMIN_MODULES,
  getModuleSubmenusForRole,
} from "../config/permissions";

export const UNAUTHORIZED_EMPLOYEE_RECORD_MSG =
  "You are not authorized to access this employee record.";

export const DEFAULT_ROLES: SystemRole[] = [
  {
    id: "Administrator",
    name: "Administrator",
    description: "Full system access with all administrative privileges.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  },
  {
    id: "HR Officer",
    name: "HR Officer",
    description:
      "Operational access to employee management, attendance, leaves, medical benefits, and payroll processing.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  },
  {
    id: "Department Head",
    name: "Department Head",
    description:
      "Access to department-specific employee directories, reports, attendance, and leave approvals.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  },
  {
    id: "Employee",
    name: "Employee",
    description:
      "Employee Self-Service (ESS) access strictly limited to own profile, attendance, leave, payslips, documents, requests, notifications, and account settings.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  },
  {
    id: "Auditor",
    name: "Auditor",
    description:
      "Read-only access to operational modules, audit logs, and compliance reports.",
    status: "Active",
    isSystem: true,
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  },
];

export const getDefaultDataScope = (roleId?: string): DataScope => {
  if (roleId === "Employee") return "own";
  if (roleId === "Department Head") return "team";
  return "all";
};

const getFullActions = (): ActionPermissions => ({
  view: true,
  create: true,
  edit: true,
  delete: true,
  approve: true,
  export: true,
});

const getReadOnlyActions = (): ActionPermissions => ({
  view: true,
  create: false,
  edit: false,
  delete: false,
  approve: false,
  export: true,
});

export const createEmptyModulePermissions = (
  roleId?: string
): { [moduleId: string]: ModulePermission } => {
  const defaultScope = getDefaultDataScope(roleId);
  const modulePermissions: { [moduleId: string]: ModulePermission } = {};
  APP_MODULES.forEach((module) => {
    const submenus: { [submenuId: string]: boolean } = {};
    getModuleSubmenusForRole(module, roleId).forEach((sub) => {
      submenus[sub.id] = false;
    });
    modulePermissions[module.id] = {
      enabled: false,
      actions: { ...DEFAULT_ACTIONS },
      submenus,
      dataScope: defaultScope,
    };
  });
  return modulePermissions;
};

export const getDefaultRolePermissions = (roleId: string): RolePermissions => {
  const modulePermissions = createEmptyModulePermissions(roleId);

  if (roleId === "Administrator") {
    APP_MODULES.forEach((m) => {
      modulePermissions[m.id].enabled = true;
      modulePermissions[m.id].actions = getFullActions();
      modulePermissions[m.id].dataScope = "all";
      Object.keys(modulePermissions[m.id].submenus).forEach((s) => {
        modulePermissions[m.id].submenus[s] = true;
      });
    });
  } else if (roleId === "HR Officer") {
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: false,
      export: true,
    };
    modulePermissions.employees.submenus = {
      directory: true,
      enrollment: true,
      bulk_import: true,
    };

    modulePermissions.departments.enabled = true;
    modulePermissions.departments.actions = {
      view: true,
      create: true,
      edit: true,
      delete: false,
      approve: false,
      export: true,
    };

    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: true,
      export: true,
    };
    modulePermissions.leaves.submenus = {
      dashboard: true,
      applications: true,
      balances: true,
      calendar: true,
      config: false,
      reports: true,
    };

    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: true,
      export: true,
    };

    modulePermissions.medical.enabled = true;
    modulePermissions.medical.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: true,
      export: true,
    };
    modulePermissions.medical.submenus = {
      dashboard: true,
      claims: true,
      family: true,
      policy: true,
      reports: true,
    };

    modulePermissions.payroll.enabled = true;
    modulePermissions.payroll.actions = {
      view: true,
      create: true,
      edit: true,
      delete: false,
      approve: true,
      export: true,
    };
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
      history: true,
    };

    modulePermissions.documents.enabled = true;
    modulePermissions.documents.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: false,
      export: true,
    };

    modulePermissions.requests.enabled = true;
    modulePermissions.requests.actions = {
      view: true,
      create: true,
      edit: true,
      delete: false,
      approve: true,
      export: true,
    };
    modulePermissions.requests.submenus = {
      review_queue: true,
      submit: true,
      my_requests: true,
      status: true,
    };

    modulePermissions.notifications.enabled = true;
    modulePermissions.notifications.actions = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: false,
      export: false,
    };
    modulePermissions.notifications.submenus = {
      personal: true,
      announcements: true,
    };

    modulePermissions.account.enabled = true;
    modulePermissions.account.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true,
    };
    modulePermissions.account.submenus = {
      change_password: true,
      security: true,
      logout: true,
    };

    modulePermissions.reports.enabled = true;
    modulePermissions.reports.actions = getReadOnlyActions();
    modulePermissions.reports.submenus = {
      directory: true,
      statistics: true,
      leaves: true,
      attendance: true,
      audit: false,
    };

    modulePermissions.help.enabled = true;
    modulePermissions.help.actions = { ...DEFAULT_ACTIONS, view: true };
  } else if (roleId === "Department Head") {
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = getReadOnlyActions();
    modulePermissions.employees.submenus = {
      directory: true,
      enrollment: false,
      bulk_import: false,
    };

    modulePermissions.departments.enabled = true;
    modulePermissions.departments.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = {
      view: true,
      create: true,
      edit: false,
      delete: false,
      approve: true,
      export: true,
    };
    modulePermissions.leaves.submenus = {
      dashboard: true,
      applications: true,
      balances: true,
      calendar: true,
      config: false,
      reports: true,
    };

    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      approve: true,
      export: true,
    };

    modulePermissions.medical.enabled = true;
    modulePermissions.medical.actions = {
      view: true,
      create: true,
      edit: false,
      delete: false,
      approve: false,
      export: false,
    };
    modulePermissions.medical.submenus = {
      dashboard: true,
      claims: true,
      family: true,
      policy: false,
      reports: false,
    };

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
      history: false,
    };

    modulePermissions.documents.enabled = true;
    modulePermissions.documents.actions = { ...DEFAULT_ACTIONS, view: true };

    modulePermissions.requests.enabled = true;
    modulePermissions.requests.actions = {
      view: true,
      create: true,
      edit: true,
      delete: false,
      approve: false,
      export: false,
    };
    modulePermissions.requests.submenus = {
      review_queue: false,
      submit: true,
      my_requests: true,
      status: true,
    };

    modulePermissions.notifications.enabled = true;
    modulePermissions.notifications.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true,
    };
    modulePermissions.notifications.submenus = {
      personal: true,
      announcements: true,
    };

    modulePermissions.account.enabled = true;
    modulePermissions.account.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true,
    };
    modulePermissions.account.submenus = {
      change_password: true,
      security: true,
      logout: true,
    };

    modulePermissions.reports.enabled = true;
    modulePermissions.reports.actions = getReadOnlyActions();
    modulePermissions.reports.submenus = {
      directory: true,
      statistics: true,
      leaves: true,
      attendance: true,
      audit: false,
    };

    modulePermissions.help.enabled = true;
    modulePermissions.help.actions = { ...DEFAULT_ACTIONS, view: true };
  } else if (roleId === "Auditor") {
    APP_MODULES.forEach((m) => {
      modulePermissions[m.id].enabled = true;
      modulePermissions[m.id].actions = getReadOnlyActions();
      modulePermissions[m.id].dataScope = "all";
      Object.keys(modulePermissions[m.id].submenus).forEach((s) => {
        modulePermissions[m.id].submenus[s] = true;
      });
    });
    modulePermissions.account.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true,
    };
  } else if (roleId === "Employee") {
    // 1. My Dashboard
    modulePermissions.dashboard.enabled = true;
    modulePermissions.dashboard.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.dashboard.dataScope = "own";

    // 2. My Profile
    modulePermissions.employees.enabled = true;
    modulePermissions.employees.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.employees.dataScope = "own";
    modulePermissions.employees.submenus = {
      personal_info: true,
      employment_info: true,
      contact_info: true,
      dept_position: true,
      my_documents: true,
      request_update: true,
    };

    // 3. My Attendance
    modulePermissions.attendance.enabled = true;
    modulePermissions.attendance.actions = { ...DEFAULT_ACTIONS, view: true };
    modulePermissions.attendance.dataScope = "own";
    modulePermissions.attendance.submenus = {
      daily: true,
      monthly: true,
      history: true,
      correction: true,
    };

    // 4. My Leave
    modulePermissions.leaves.enabled = true;
    modulePermissions.leaves.actions = {
      view: true,
      create: true,
      edit: true, // Used strictly for workflow cancellation of own Active leave request
      delete: false,
      approve: false,
      export: false,
    };
    modulePermissions.leaves.dataScope = "own";
    modulePermissions.leaves.submenus = {
      apply: true,
      history: true,
      balances: true,
      requests: true,
      status: true,
    };

    // 5. My Payroll (Read-only & Export/Download own payslip)
    modulePermissions.payroll.enabled = true;
    modulePermissions.payroll.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      export: true,
    };
    modulePermissions.payroll.dataScope = "own";
    modulePermissions.payroll.submenus = {
      payslips: true,
      salary_history: true,
      tax_deductions: true,
      download_payslip: true,
    };

    // 6. My Documents
    modulePermissions.documents.enabled = true;
    modulePermissions.documents.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      export: true,
    };
    modulePermissions.documents.dataScope = "own";
    modulePermissions.documents.submenus = {
      employment_contract: true,
      appointment_letter: true,
      promotion_transfer: true,
      other_hr: true,
    };

    // 7. My Requests
    modulePermissions.requests.enabled = true;
    modulePermissions.requests.actions = {
      view: true,
      create: true,
      edit: true, // For cancelling own pending requests
      delete: false,
      approve: false,
      export: false,
    };
    modulePermissions.requests.dataScope = "own";
    modulePermissions.requests.submenus = {
      submit: true,
      my_requests: true,
      status: true,
    };

    // 8. Notifications
    modulePermissions.notifications.enabled = true;
    modulePermissions.notifications.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true, // Mark notifications read
    };
    modulePermissions.notifications.dataScope = "own";
    modulePermissions.notifications.submenus = {
      personal: true,
      announcements: true,
    };

    // 9. My Account
    modulePermissions.account.enabled = true;
    modulePermissions.account.actions = {
      ...DEFAULT_ACTIONS,
      view: true,
      edit: true,
    };
    modulePermissions.account.dataScope = "own";
    modulePermissions.account.submenus = {
      change_password: true,
      security: true,
      logout: true,
    };

    // Explicitly disabled administrative/non-ESS modules for Employee
    modulePermissions.departments.enabled = false;
    modulePermissions.medical.enabled = false;
    modulePermissions.reports.enabled = false;
    modulePermissions.settings.enabled = false;
    modulePermissions.help.enabled = false;
  }

  return {
    id: roleId,
    roleId,
    modulePermissions,
    essMigrated: roleId === "Employee",
    updatedBy: "System",
    updatedAt: new Date().toISOString(),
  };
};

export const normalizeRolePermissions = (
  perm: RolePermissions
): RolePermissions => {
  // Migrate legacy Employee role permissions from Firestore once to the strict 9-section ESS model
  if (perm.roleId === "Employee" && !perm.essMigrated) {
    const essDefaults = getDefaultRolePermissions("Employee");
    return {
      ...essDefaults,
      id: perm.id || "Employee",
      updatedBy: perm.updatedBy || "System ESS Migration",
      updatedAt: perm.updatedAt || new Date().toISOString(),
      essMigrated: true,
    };
  }

  const defaultForRole = getDefaultRolePermissions(perm.roleId);
  const defaultScope = getDefaultDataScope(perm.roleId);
  const normalized = createEmptyModulePermissions(perm.roleId);

  Object.keys(normalized).forEach((moduleId) => {
    const existingMod = perm.modulePermissions?.[moduleId];
    if (existingMod !== undefined) {
      normalized[moduleId].enabled = Boolean(existingMod.enabled);
      normalized[moduleId].dataScope =
        existingMod.dataScope ||
        (perm.roleId === "Employee" ? "own" : defaultScope);
      normalized[moduleId].actions = {
        view: Boolean(existingMod.actions?.view),
        create: Boolean(existingMod.actions?.create),
        edit: Boolean(existingMod.actions?.edit),
        delete: Boolean(existingMod.actions?.delete),
        approve: Boolean(existingMod.actions?.approve),
        export: Boolean(existingMod.actions?.export),
      };
      Object.keys(normalized[moduleId].submenus).forEach((subId) => {
        if (
          moduleId === "reports" &&
          subId === "statistics" &&
          existingMod.submenus?.statistics === undefined
        ) {
          normalized[moduleId].submenus[subId] = Boolean(
            existingMod.submenus?.directory
          );
        } else {
          normalized[moduleId].submenus[subId] = Boolean(
            existingMod.submenus?.[subId]
          );
        }
      });
    } else if (defaultForRole.modulePermissions[moduleId]) {
      // Seed newly introduced modules (requests, notifications, account) cleanly onto older Firestore docs
      normalized[moduleId] = JSON.parse(
        JSON.stringify(defaultForRole.modulePermissions[moduleId])
      );
    }
  });

  if (perm.roleId === "Employee") {
    EMPLOYEE_BLOCKED_ADMIN_MODULES.forEach((blocked) => {
      if (normalized[blocked]) {
        normalized[blocked].enabled = false;
        normalized[blocked].actions = { ...DEFAULT_ACTIONS };
      }
    });
  }

  return {
    ...perm,
    essMigrated: perm.essMigrated ?? perm.roleId === "Employee",
    modulePermissions: normalized,
  };
};

export const enforceAdminSafeguard = (
  perm: RolePermissions
): RolePermissions => {
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
  const roleObj = roles.find((r) => r.id === roleId || r.name === roleId);
  if (roleObj && roleObj.status === "Inactive") {
    return undefined;
  }
  const found = rolePermissions.find(
    (p) => p.roleId === roleId || (roleObj && p.roleId === roleObj.id)
  );
  if (found) {
    return normalizeRolePermissions(found);
  }
  if (DEFAULT_ROLES.some((r) => r.id === roleId)) {
    return getDefaultRolePermissions(roleId);
  }
  return undefined;
};

/**
 * Resolves effective permissions for a user by layering optional per-user overrides
 * (`user.permissionOverrides`) onto the active role's permissions, while strictly
 * clamping Employee accounts so they cannot escalate to Admin/HR modules or team/all scope.
 */
export const resolveUserPermissions = (
  user: User | null,
  roles: SystemRole[],
  rolePermissions: RolePermissions[]
): RolePermissions | undefined => {
  if (!user) return undefined;
  const base = getEffectiveRolePermissions(roles, rolePermissions, user.role);
  if (!base) return undefined;

  const isEmployee = user.role === "Employee";
  const resolved: RolePermissions = JSON.parse(JSON.stringify(base));

  if (user.permissionOverrides) {
    Object.entries(user.permissionOverrides).forEach(([moduleId, override]) => {
      if (!override) return;
      if (isEmployee && EMPLOYEE_BLOCKED_ADMIN_MODULES.has(moduleId)) {
        return; // Anti-escalation: blocked administrative modules can never be unlocked for Employee
      }
      const target = resolved.modulePermissions[moduleId];
      if (!target) return;

      if (typeof override.enabled === "boolean") {
        target.enabled = override.enabled;
      }
      if (override.dataScope) {
        target.dataScope = isEmployee ? "own" : override.dataScope;
      }
      if (override.actions) {
        (
          Object.keys(override.actions) as (keyof ActionPermissions)[]
        ).forEach((actKey) => {
          const val = override.actions?.[actKey];
          if (typeof val === "boolean") {
            target.actions[actKey] = val;
          }
        });
      }
      if (override.submenus) {
        Object.entries(override.submenus).forEach(([subId, val]) => {
          if (typeof val === "boolean" && subId in target.submenus) {
            target.submenus[subId] = val;
          }
        });
      }
    });
  }

  // Enforce strict anti-escalation clamp for Employee role regardless of stored overrides
  if (isEmployee) {
    EMPLOYEE_BLOCKED_ADMIN_MODULES.forEach((blocked) => {
      if (resolved.modulePermissions[blocked]) {
        resolved.modulePermissions[blocked].enabled = false;
        resolved.modulePermissions[blocked].actions = { ...DEFAULT_ACTIONS };
      }
    });

    Object.keys(resolved.modulePermissions).forEach((mId) => {
      resolved.modulePermissions[mId].dataScope = "own";
    });

    if (resolved.modulePermissions.employees) {
      resolved.modulePermissions.employees.actions.create = false;
      resolved.modulePermissions.employees.actions.edit = false;
      resolved.modulePermissions.employees.actions.delete = false;
      resolved.modulePermissions.employees.actions.approve = false;
    }
    if (resolved.modulePermissions.attendance) {
      resolved.modulePermissions.attendance.actions.create = false;
      resolved.modulePermissions.attendance.actions.edit = false;
      resolved.modulePermissions.attendance.actions.delete = false;
      resolved.modulePermissions.attendance.actions.approve = false;
    }
    if (resolved.modulePermissions.leaves) {
      resolved.modulePermissions.leaves.actions.delete = false;
      resolved.modulePermissions.leaves.actions.approve = false;
    }
    if (resolved.modulePermissions.payroll) {
      resolved.modulePermissions.payroll.actions.create = false;
      resolved.modulePermissions.payroll.actions.edit = false;
      resolved.modulePermissions.payroll.actions.delete = false;
      resolved.modulePermissions.payroll.actions.approve = false;
    }
    if (resolved.modulePermissions.documents) {
      resolved.modulePermissions.documents.actions.create = false;
      resolved.modulePermissions.documents.actions.edit = false;
      resolved.modulePermissions.documents.actions.delete = false;
      resolved.modulePermissions.documents.actions.approve = false;
    }
    if (resolved.modulePermissions.requests) {
      resolved.modulePermissions.requests.actions.delete = false;
      resolved.modulePermissions.requests.actions.approve = false;
      if ("review_queue" in resolved.modulePermissions.requests.submenus) {
        resolved.modulePermissions.requests.submenus.review_queue = false;
      }
    }
    if (resolved.modulePermissions.notifications) {
      resolved.modulePermissions.notifications.actions.create = false;
      resolved.modulePermissions.notifications.actions.delete = false;
      resolved.modulePermissions.notifications.actions.approve = false;
    }
  }

  return enforceAdminSafeguard(resolved);
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

export const getModuleDataScope = (
  rolePermissions: RolePermissions | undefined,
  moduleId: string,
  userRole?: string
): DataScope => {
  if (userRole === "Employee") return "own";
  const scope = rolePermissions?.modulePermissions?.[moduleId]?.dataScope;
  if (scope) return scope;
  return getDefaultDataScope(userRole);
};

export const getDepartmentHeadManagedDeptIds = (
  currentUser: User | null,
  departments: Department[],
  employees: Employee[]
): string[] => {
  if (!currentUser || currentUser.role !== "Department Head") return [];
  const emailLower = currentUser.email.trim().toLowerCase();
  const linkedEmp = employees.find(
    (e) =>
      (currentUser.employeeId && e.employeeId === currentUser.employeeId) ||
      e.email.trim().toLowerCase() === emailLower
  );
  const empId = currentUser.employeeId || linkedEmp?.employeeId;

  const headed = departments
    .filter((d) => empId && d.headEmployeeId === empId)
    .map((d) => d.id);

  if (headed.length > 0) return headed;
  return linkedEmp?.departmentId ? [linkedEmp.departmentId] : [];
};

export const resolveOwnEmployeeRecord = (
  currentUser: User | null,
  employees: Employee[]
): Employee | undefined => {
  if (!currentUser) return undefined;
  const normEmail = currentUser.email.trim().toLowerCase();
  return employees.find(
    (e) =>
      !e.isDeleted &&
      ((currentUser.employeeId && e.employeeId === currentUser.employeeId) ||
        e.email.trim().toLowerCase() === normEmail)
  );
};

export const canAccessEmployeeRecord = (
  currentUser: User | null,
  rolePermissions: RolePermissions | undefined,
  moduleId: string,
  targetEmployeeId: string,
  employees: Employee[],
  departments: Department[]
): boolean => {
  if (!currentUser || !targetEmployeeId) return false;

  const scope = getModuleDataScope(rolePermissions, moduleId, currentUser.role);
  if (scope === "all") return true;

  const ownEmp = resolveOwnEmployeeRecord(currentUser, employees);
  const ownEmpId = currentUser.employeeId || ownEmp?.employeeId;

  if (scope === "own" || currentUser.role === "Employee") {
    return Boolean(ownEmpId && ownEmpId === targetEmployeeId);
  }

  if (scope === "team") {
    if (ownEmpId && ownEmpId === targetEmployeeId) return true;
    const managedDeptIds = getDepartmentHeadManagedDeptIds(
      currentUser,
      departments,
      employees
    );
    const targetEmp = employees.find((e) => e.employeeId === targetEmployeeId);
    return Boolean(targetEmp && managedDeptIds.includes(targetEmp.departmentId));
  }

  return false;
};

export const assertEmployeeRecordAccess = (
  currentUser: User | null,
  rolePermissions: RolePermissions | undefined,
  moduleId: string,
  targetEmployeeId: string,
  employees: Employee[],
  departments: Department[]
): { allowed: boolean; message?: string } => {
  const allowed = canAccessEmployeeRecord(
    currentUser,
    rolePermissions,
    moduleId,
    targetEmployeeId,
    employees,
    departments
  );
  if (!allowed) {
    return { allowed: false, message: UNAUTHORIZED_EMPLOYEE_RECORD_MSG };
  }
  return { allowed: true };
};
