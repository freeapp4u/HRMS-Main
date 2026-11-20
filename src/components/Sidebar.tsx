import {
  LayoutDashboard,
  UserCheck,
  CalendarDays,
  BarChart3,
  Users,
  Landmark,
  FileText,
  Palette,
  Calendar,
  Users2,
  ShieldCheck,
  History,
  ChevronDown,
  ChevronRight,
  X,
  FolderOpen,
  HeartPulse,
  DollarSign,
  Mail,
  Info,
  Settings,
  Lock,
  ClipboardList,
  Bell,
  UserCog,
  LogOut,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { RolePermissions, User } from "../types";
import {
  APP_MODULES,
  EMPLOYEE_BLOCKED_ADMIN_MODULES,
  EMPLOYEE_ESS_MODULE_ORDER,
  getModuleLabelForRole,
  getModuleSubmenusForRole,
} from "../config/permissions";
import { hasPermission } from "../utils/rbacUtils";
import { getRisingWithAfricaMapUrl } from "../utils/reportBranding";

interface SidebarProps {
  currentUser: User | null;
  rolePermissions: RolePermissions | undefined;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout?: () => void;
  unreadNotificationsCount?: number;
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  logoUrl?: string;
}

const IconMap: { [key: string]: any } = {
  LayoutDashboard,
  Users,
  Landmark,
  CalendarDays,
  Clock: UserCheck,
  HeartPulse,
  DollarSign,
  FileText,
  FileSpreadsheet: BarChart3,
  Settings,
  Info,
  History,
  ShieldCheck,
  Users2,
  Palette,
  Calendar,
  Mail,
  ClipboardList,
  Bell,
  UserCog,
  LogOut,
};

export default function Sidebar({
  currentUser,
  rolePermissions,
  activeTab,
  onTabChange,
  onLogout,
  unreadNotificationsCount = 0,
  isOpen,
  onClose,
}: SidebarProps) {
  const isEmployee = currentUser?.role === "Employee";

  const orderedModules = useMemo(() => {
    if (!isEmployee) return APP_MODULES;
    const orderIndex = (id: string) => {
      const idx = EMPLOYEE_ESS_MODULE_ORDER.indexOf(id);
      return idx === -1 ? 999 : idx;
    };
    return [...APP_MODULES]
      .filter((m) => !EMPLOYEE_BLOCKED_ADMIN_MODULES.has(m.id))
      .sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
  }, [isEmployee]);

  const [expandedModules, setExpandedModules] = useState<{ [key: string]: boolean }>(() => {
    const initial: { [key: string]: boolean } = {};
    orderedModules.forEach((m) => {
      const subs = getModuleSubmenusForRole(m, currentUser?.role);
      if (subs.length > 0) {
        initial[m.id] = activeTab === m.id || activeTab.startsWith(`${m.id}_`);
      }
    });
    return initial;
  });

  // Auto-expand active module group when activeTab changes externally
  useEffect(() => {
    orderedModules.forEach((m) => {
      const subs = getModuleSubmenusForRole(m, currentUser?.role);
      if (subs.length > 0 && (activeTab === m.id || activeTab.startsWith(`${m.id}_`))) {
        setExpandedModules((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: true }));
      }
    });
  }, [activeTab, orderedModules, currentUser?.role]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const navigateTo = (tabId: string) => {
    if (tabId === "account_logout" && onLogout) {
      onLogout();
      if (window.innerWidth < 1024) {
        onClose();
      }
      return;
    }
    onTabChange(tabId);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const navItemClass = (tabId: string) => {
    const isActive = activeTab === tabId || activeTab.startsWith(tabId + "_");
    return `w-full text-left py-2.5 flex items-center gap-3 text-xs font-semibold tracking-wide transition-all ${
      isActive
        ? "bg-accent-custom/20 text-accent-custom border-l-4 border-accent-custom pl-4 pr-3 rounded-r"
        : "text-slate-300 hover:bg-white/10 hover:text-white pl-5 pr-3 rounded"
    }`;
  };

  const subNavItemClass = (tabId: string) => {
    const isActive = activeTab === tabId;
    return `w-full text-left pl-9 pr-3 py-2 rounded-lg flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase transition-all ${
      isActive
        ? "text-accent-custom bg-white/10 font-bold border-l-2 border-accent-custom"
        : "text-slate-400 hover:text-white hover:bg-white/5"
    }`;
  };

  const filteredModules = orderedModules.filter((module) => {
    if (isEmployee && (EMPLOYEE_BLOCKED_ADMIN_MODULES.has(module.id) || module.id === "medical" || module.id === "help")) {
      return false;
    }
    const canViewModule = hasPermission(rolePermissions, module.id, "view");
    if (!canViewModule) return false;

    const submenus = getModuleSubmenusForRole(module, currentUser?.role);
    if (submenus.length > 0) {
      return submenus.some((sub) => hasPermission(rolePermissions, module.id, "view", sub.id));
    }

    return true;
  });

  return (
    <>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 bg-black/50 z-40 lg:hidden"></div>
      )}

      <aside
        className={`fixed inset-y-0 left-0 bg-primary-custom text-white w-64 z-50 flex flex-col justify-between border-r border-white/10 transition-transform duration-300 transform lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="h-20 px-4 py-3 flex items-center justify-between gap-2 border-b border-white/10 shrink-0 bg-[#001F44]">
            <div className="flex items-center min-w-0">
              <img
                src={getRisingWithAfricaMapUrl()}
                alt="Rising with Africa - Glossy Blue Africa Map"
                className="h-11 w-11 sm:h-12 sm:w-12 object-contain rounded-md shrink-0 bg-transparent"
                title="Rising with Africa - ETRHRMS"
              />
              <div className="h-8 w-px bg-white/20 mx-3 shrink-0" />
              <div className="flex flex-col justify-center text-left leading-tight shrink-0">
                <span className="font-black italic text-sm tracking-tight text-white drop-shadow-xs">Rising</span>
                <span className="font-extrabold italic text-xs tracking-tight text-[#FED100] drop-shadow-xs">with Africa</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-full hover:bg-white/10 text-white transition-colors"
              aria-label="Close Navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
              {isEmployee ? "Employee Self-Service" : "Navigator"}
            </p>

            {filteredModules.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-slate-400 bg-white/5 rounded-lg flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-400 shrink-0" />
                <span>No modules enabled for your current role.</span>
              </div>
            ) : (
              filteredModules.map((module) => {
                const IconComp = IconMap[module.icon] || FolderOpen;
                const displayLabel = getModuleLabelForRole(module, currentUser?.role);
                const roleSubmenus = getModuleSubmenusForRole(module, currentUser?.role);
                const hasSubmenus = roleSubmenus.length > 0;
                const isExpanded = expandedModules[module.id];
                const allowedSubmenus = roleSubmenus.filter((sub) =>
                  hasPermission(rolePermissions, module.id, "view", sub.id)
                );

                if (hasSubmenus && allowedSubmenus.length === 0) return null;

                return (
                  <div key={module.id} className="space-y-1">
                    <div className="flex items-center justify-between group">
                      <button
                        onClick={() => {
                          if (hasSubmenus) {
                            toggleModule(module.id);
                          } else {
                            navigateTo(module.id);
                          }
                        }}
                        className={navItemClass(module.id)}
                      >
                        <IconComp className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{displayLabel}</span>
                        {module.id === "notifications" && unreadNotificationsCount > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-amber-400 text-[#001F44]">
                            {unreadNotificationsCount}
                          </span>
                        )}
                      </button>
                      {hasSubmenus && (
                        <button
                          onClick={() => toggleModule(module.id)}
                          className="p-2 text-slate-400 hover:text-white transition-colors"
                          aria-label={`Toggle ${displayLabel} submenu`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {hasSubmenus && isExpanded && (
                      <div className="space-y-0.5 pl-2 border-l border-white/10 ml-5 my-1">
                        {allowedSubmenus.map((sub) => {
                          const isLogoutSub = module.id === "account" && sub.id === "logout";
                          return (
                            <button
                              key={sub.id}
                              onClick={() => navigateTo(`${module.id}_${sub.id}`)}
                              className={
                                isLogoutSub
                                  ? "w-full text-left pl-9 pr-3 py-2 rounded-lg flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase transition-all text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                                  : subNavItemClass(`${module.id}_${sub.id}`)
                              }
                            >
                              {isLogoutSub && <LogOut className="h-3 w-3" />}
                              <span>{sub.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/10 flex flex-col gap-1 text-[10px] text-slate-400">
          <p className="font-bold text-slate-300">Ethiopian Reinsurance S.C.</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-medium">Active Session ({currentUser?.role || "Guest"})</span>
          </div>
        </div>
      </aside>
    </>
  );
}
