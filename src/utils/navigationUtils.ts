import { RolePermissions } from "../types";
import {
  APP_MODULES,
  EMPLOYEE_BLOCKED_ADMIN_MODULES,
  EMPLOYEE_ESS_MODULE_ORDER,
  getModuleSubmenusForRole,
} from "../config/permissions";
import { hasPermission } from "./rbacUtils";

export const parseTabPermission = (
  tabId: string
): { moduleId: string; submenuId?: string } => {
  if (tabId === "dashboard" || tabId === "departments" || tabId === "help") {
    return { moduleId: tabId };
  }
  if (tabId === "employees" || tabId.startsWith("employees_")) {
    const sub = tabId.startsWith("employees_")
      ? tabId.replace("employees_", "")
      : undefined;
    return { moduleId: "employees", submenuId: sub };
  }
  if (tabId === "attendance" || tabId.startsWith("attendance_")) {
    const sub = tabId.startsWith("attendance_")
      ? tabId.replace("attendance_", "")
      : undefined;
    return { moduleId: "attendance", submenuId: sub };
  }
  if (tabId === "leaves" || tabId.startsWith("leaves_")) {
    const sub = tabId.startsWith("leaves_")
      ? tabId.replace("leaves_", "")
      : undefined;
    return { moduleId: "leaves", submenuId: sub };
  }
  if (tabId === "medical" || tabId.startsWith("medical_")) {
    const sub = tabId.startsWith("medical_")
      ? tabId.replace("medical_", "")
      : undefined;
    return { moduleId: "medical", submenuId: sub };
  }
  if (tabId === "payroll" || tabId.startsWith("payroll_")) {
    let sub = tabId.startsWith("payroll_")
      ? tabId.replace("payroll_", "")
      : undefined;
    if (sub === "import") sub = "csv_import";
    if (sub === "export") sub = "csv_export";
    return { moduleId: "payroll", submenuId: sub };
  }
  if (tabId === "documents" || tabId.startsWith("documents_")) {
    const sub = tabId.startsWith("documents_")
      ? tabId.replace("documents_", "")
      : undefined;
    return { moduleId: "documents", submenuId: sub };
  }
  if (tabId === "requests" || tabId.startsWith("requests_")) {
    const sub = tabId.startsWith("requests_")
      ? tabId.replace("requests_", "")
      : undefined;
    return { moduleId: "requests", submenuId: sub };
  }
  if (tabId === "notifications" || tabId.startsWith("notifications_")) {
    const sub = tabId.startsWith("notifications_")
      ? tabId.replace("notifications_", "")
      : undefined;
    return { moduleId: "notifications", submenuId: sub };
  }
  if (tabId === "account" || tabId.startsWith("account_")) {
    const sub = tabId.startsWith("account_")
      ? tabId.replace("account_", "")
      : undefined;
    return { moduleId: "account", submenuId: sub };
  }
  if (tabId === "reports" || tabId.startsWith("reports_")) {
    const sub = tabId.startsWith("reports_")
      ? tabId.replace("reports_", "")
      : undefined;
    return { moduleId: "reports", submenuId: sub };
  }
  if (tabId === "settings" || tabId.startsWith("settings_")) {
    let sub = tabId.startsWith("settings_")
      ? tabId.replace("settings_", "")
      : undefined;
    if (sub === "logs") return { moduleId: "reports", submenuId: "audit" };
    if (
      sub === "email" ||
      sub === "email_settings" ||
      sub === "email_config"
    ) {
      sub = "profile";
    }
    return { moduleId: "settings", submenuId: sub };
  }
  return { moduleId: tabId };
};

export const canAccessTab = (
  tabId: string,
  rolePermissions: RolePermissions | undefined,
  userRole?: string,
  roleStatus?: string
): boolean => {
  if (roleStatus === "Inactive") return false;
  const { moduleId, submenuId } = parseTabPermission(tabId);
  if (
    userRole === "Employee" &&
    EMPLOYEE_BLOCKED_ADMIN_MODULES.has(moduleId)
  ) {
    return false;
  }
  if (!hasPermission(rolePermissions, moduleId, "view")) return false;
  const modDef = APP_MODULES.find((m) => m.id === moduleId);
  if (modDef) {
    const subs = getModuleSubmenusForRole(modDef, userRole);
    if (subs.length > 0) {
      if (submenuId) {
        return hasPermission(rolePermissions, moduleId, "view", submenuId);
      }
      return subs.some((s) =>
        hasPermission(rolePermissions, moduleId, "view", s.id)
      );
    }
  }
  return true;
};

export const getFirstPermittedTab = (
  rolePermissions: RolePermissions | undefined,
  userRole?: string
): string => {
  if (userRole === "Employee") {
    for (const modId of EMPLOYEE_ESS_MODULE_ORDER) {
      const mod = APP_MODULES.find((m) => m.id === modId);
      if (!mod || !hasPermission(rolePermissions, mod.id, "view")) continue;
      const subs = getModuleSubmenusForRole(mod, userRole);
      if (subs.length === 0) return mod.id;
      const firstSub = subs.find((s) =>
        hasPermission(rolePermissions, mod.id, "view", s.id)
      );
      if (firstSub) return `${mod.id}_${firstSub.id}`;
    }
    return "dashboard";
  }
  for (const mod of APP_MODULES) {
    if (hasPermission(rolePermissions, mod.id, "view")) {
      const subs = getModuleSubmenusForRole(mod, userRole);
      if (subs.length === 0) return mod.id;
      const firstSub = subs.find((s) =>
        hasPermission(rolePermissions, mod.id, "view", s.id)
      );
      if (firstSub) return `${mod.id}_${firstSub.id}`;
    }
  }
  return "help";
};

export const resolveCanonicalTab = (
  tabId: string,
  rolePermissions: RolePermissions | undefined,
  userRole?: string,
  roleStatus?: string
): string => {
  if (!canAccessTab(tabId, rolePermissions, userRole, roleStatus)) {
    return tabId;
  }

  const { moduleId, submenuId } = parseTabPermission(tabId);
  const modDef = APP_MODULES.find((m) => m.id === moduleId);
  if (!modDef) return tabId;

  const subs = getModuleSubmenusForRole(modDef, userRole);
  if (subs.length === 0) {
    return moduleId;
  }

  if (
    submenuId &&
    subs.some((s) => s.id === submenuId) &&
    hasPermission(rolePermissions, moduleId, "view", submenuId)
  ) {
    return `${moduleId}_${submenuId}`;
  }

  const firstPermittedSub = subs.find((s) =>
    hasPermission(rolePermissions, moduleId, "view", s.id)
  );
  return firstPermittedSub ? `${moduleId}_${firstPermittedSub.id}` : tabId;
};
