import type { DataScope } from "../types";

export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  submenus: { id: string; name: string }[];
  essName?: string;
  essSubmenus?: { id: string; name: string }[];
  defaultScope?: DataScope;
}

export const APP_MODULES: ModuleConfig[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    essName: "My Dashboard",
    icon: "LayoutDashboard",
    submenus: [],
    essSubmenus: []
  },
  {
    id: "employees",
    name: "Employee Master",
    essName: "My Profile",
    icon: "Users",
    submenus: [
      { id: "directory", name: "Employee Directory" },
      { id: "enrollment", name: "Employee Enrollment" },
      { id: "bulk_import", name: "Bulk Import" }
    ],
    essSubmenus: [
      { id: "personal_info", name: "Personal Information" },
      { id: "employment_info", name: "Employment Information" },
      { id: "contact_info", name: "Contact Information" },
      { id: "dept_position", name: "Department and Position" },
      { id: "my_documents", name: "My Documents" },
      { id: "request_update", name: "Request Profile Update" }
    ]
  },
  {
    id: "departments",
    name: "Department Admin",
    icon: "Landmark",
    submenus: []
  },
  {
    id: "leaves",
    name: "Leave Management",
    essName: "My Leave",
    icon: "CalendarDays",
    submenus: [
      { id: "dashboard", name: "Leave Dashboard" },
      { id: "applications", name: "Leave Applications" },
      { id: "balances", name: "Leave Balances" },
      { id: "calendar", name: "Leave Calendar" },
      { id: "config", name: "Leave Configuration" },
      { id: "reports", name: "Leave Reports" }
    ],
    essSubmenus: [
      { id: "apply", name: "Apply for Leave" },
      { id: "history", name: "My Leave History" },
      { id: "balances", name: "My Leave Balance" },
      { id: "requests", name: "My Leave Requests" },
      { id: "status", name: "Leave Approval Status" }
    ]
  },
  {
    id: "attendance",
    name: "Attendance",
    essName: "My Attendance",
    icon: "Clock",
    submenus: [],
    essSubmenus: [
      { id: "daily", name: "Daily Attendance" },
      { id: "monthly", name: "Monthly Attendance Summary" },
      { id: "history", name: "Attendance History" },
      { id: "correction", name: "Attendance Correction Request" }
    ]
  },
  {
    id: "medical",
    name: "Benefits & Medical",
    icon: "HeartPulse",
    submenus: [
      { id: "dashboard", name: "Medical Dashboard" },
      { id: "claims", name: "Expense Claims" },
      { id: "family", name: "Family Members" },
      { id: "policy", name: "Policy Settings" },
      { id: "reports", name: "Medical Reports" }
    ]
  },
  {
    id: "payroll",
    name: "Payroll",
    essName: "My Payroll",
    icon: "DollarSign",
    submenus: [
      { id: "dashboard", name: "Payroll Dashboard" },
      { id: "config", name: "Statutory Rules" },
      { id: "salary_setup", name: "Salary Setup" },
      { id: "processing", name: "Payroll Processing" },
      { id: "approval", name: "Payroll Approval" },
      { id: "payslips", name: "Payslip Management" },
      { id: "csv_import", name: "CSV Import" },
      { id: "csv_export", name: "CSV Export" },
      { id: "reports", name: "Payroll Reports" },
      { id: "history", name: "Payroll History" }
    ],
    essSubmenus: [
      { id: "payslips", name: "My Payslips" },
      { id: "salary_history", name: "Salary History" },
      { id: "tax_deductions", name: "Tax and Deductions" },
      { id: "download_payslip", name: "Download Payslip" }
    ]
  },
  {
    id: "documents",
    name: "Document Vault",
    essName: "My Documents",
    icon: "FileText",
    submenus: [],
    essSubmenus: [
      { id: "employment_contract", name: "Employment Contract" },
      { id: "appointment_letter", name: "Appointment Letter" },
      { id: "promotion_transfer", name: "Promotion and Transfer Letters" },
      { id: "other_hr", name: "Other Personal HR Documents" }
    ]
  },
  {
    id: "requests",
    name: "HR Requests",
    essName: "My Requests",
    icon: "ClipboardList",
    submenus: [
      { id: "review_queue", name: "HR Approval Queue" },
      { id: "submit", name: "Submit HR Request" },
      { id: "my_requests", name: "Submitted Requests" },
      { id: "status", name: "Request Status" }
    ],
    essSubmenus: [
      { id: "submit", name: "Submit HR Request" },
      { id: "my_requests", name: "My Submitted Requests" },
      { id: "status", name: "Request Status" }
    ]
  },
  {
    id: "notifications",
    name: "Notifications",
    essName: "Notifications",
    icon: "Bell",
    submenus: [
      { id: "personal", name: "Personal Notifications" },
      { id: "announcements", name: "HR Announcements" }
    ],
    essSubmenus: [
      { id: "personal", name: "Personal Notifications" },
      { id: "announcements", name: "HR Announcements" }
    ]
  },
  {
    id: "account",
    name: "My Account",
    essName: "My Account",
    icon: "UserCog",
    submenus: [
      { id: "change_password", name: "Change Password" },
      { id: "security", name: "Account Security" },
      { id: "logout", name: "Logout" }
    ],
    essSubmenus: [
      { id: "change_password", name: "Change Password" },
      { id: "security", name: "Account Security" },
      { id: "logout", name: "Logout" }
    ]
  },
  {
    id: "reports",
    name: "Reports",
    icon: "FileSpreadsheet",
    submenus: [
      { id: "directory", name: "Directory Report" },
      { id: "leaves", name: "Leave Report" },
      { id: "attendance", name: "Attendance Report" },
      { id: "audit", name: "Audit Logs" }
    ]
  },
  {
    id: "settings",
    name: "Administration",
    icon: "Settings",
    submenus: [
      { id: "profile", name: "Company Profile" },
      { id: "branding", name: "System Branding" },
      { id: "holidays", name: "Public Holidays" },
      { id: "users", name: "User Management" },
      { id: "roles", name: "Roles & Permissions" }
    ]
  },
  {
    id: "help",
    name: "Help Center",
    icon: "Info",
    submenus: []
  }
];

export const EMPLOYEE_ESS_MODULE_ORDER = [
  "dashboard",
  "employees",
  "attendance",
  "leaves",
  "payroll",
  "documents",
  "requests",
  "notifications",
  "account"
];

export const EMPLOYEE_BLOCKED_ADMIN_MODULES = new Set([
  "departments",
  "reports",
  "settings"
]);

export function getModuleLabelForRole(module: ModuleConfig, roleId?: string): string {
  if (roleId === "Employee" && module.essName) {
    return module.essName;
  }
  return module.name;
}

export function getModuleSubmenusForRole(
  module: ModuleConfig,
  roleId?: string
): { id: string; name: string }[] {
  if (roleId === "Employee" && module.essSubmenus) {
    return module.essSubmenus;
  }
  return module.submenus;
}

export const DEFAULT_ACTIONS = {
  view: false,
  create: false,
  edit: false,
  delete: false,
  approve: false,
  export: false
};
