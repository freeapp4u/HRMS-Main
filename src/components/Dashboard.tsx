import {
  Employee,
  Department,
  AttendanceRecord,
  LeaveRecord,
  User,
  ActivityLog,
  UserRole,
  RolePermissions,
  Payslip,
  HRRequest,
  EmployeeNotification,
  CompanyConfig,
} from "../types";
import { hasPermission, getDepartmentHeadManagedDeptIds, resolveOwnEmployeeRecord } from "../utils/rbacUtils";
import { calculateEmployeeLeaveBalance } from "../utils/leaveUtils";
import {
  Users,
  Landmark,
  UserCheck,
  UserX,
  CalendarDays,
  Plus,
  Clock,
  FileSpreadsheet,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  User as UserIcon,
  DollarSign,
  FolderOpen,
  ClipboardList,
  Bell,
  Lock,
} from "lucide-react";

interface DashboardProps {
  employees: Employee[];
  departments: Department[];
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  users: User[];
  logs: ActivityLog[];
  currentUser: User | null;
  role: UserRole;
  rolePermissions?: RolePermissions;
  payslips?: Payslip[];
  hrRequests?: HRRequest[];
  notifications?: EmployeeNotification[];
  companyConfig?: CompanyConfig;
  onNavigate: (tabId: string) => void;
  onOpenQuickAddEmployee: () => void;
  onOpenQuickRecordAttendance: () => void;
  onOpenQuickRegisterLeave: () => void;
}

export default function Dashboard({
  employees,
  departments,
  attendance,
  leaves,
  users,
  logs,
  currentUser,
  role,
  rolePermissions,
  payslips = [],
  hrRequests = [],
  notifications = [],
  companyConfig,
  onNavigate,
  onOpenQuickAddEmployee,
  onOpenQuickRecordAttendance,
  onOpenQuickRegisterLeave
}: DashboardProps) {
  
  // Calculate today's date in YYYY-MM-DD
  const todayStr = new Date().toISOString().split("T")[0];
  
  // Today's attendance counters
  const todayAttendance = attendance.filter(a => a.date === todayStr);
  
  // Role-based filtering for metrics and lists
  const isEmployee = role === "Employee";
  const isDeptHead = role === "Department Head";
  const managedDeptIds = isDeptHead ? getDepartmentHeadManagedDeptIds(currentUser, departments, employees) : [];
  const ownEmp = resolveOwnEmployeeRecord(currentUser, employees);
  const myEmpId = ownEmp?.employeeId || currentUser?.employeeId;

  const displayEmployees = isEmployee
    ? employees.filter(e => e.employeeId === myEmpId)
    : isDeptHead && managedDeptIds.length > 0
      ? employees.filter(e => managedDeptIds.includes(e.departmentId))
      : employees;
  const scopedEmpIds = new Set(displayEmployees.map(e => e.employeeId));
  const displayAttendance = isEmployee
    ? attendance.filter(a => a.employeeId === myEmpId)
    : isDeptHead && managedDeptIds.length > 0
      ? attendance.filter(a => scopedEmpIds.has(a.employeeId))
      : attendance;
  const displayLeaves = isEmployee
    ? leaves.filter(l => l.employeeId === myEmpId)
    : isDeptHead && managedDeptIds.length > 0
      ? leaves.filter(l => scopedEmpIds.has(l.employeeId))
      : leaves;

  const activeEmployees = displayEmployees.filter(e => e.status === "Active");
  const totalEmployeesCount = activeEmployees.length;
  const activeDepartmentsCount = isDeptHead && managedDeptIds.length > 0
    ? departments.filter(d => d.status === "Active" && managedDeptIds.includes(d.id)).length
    : departments.filter(d => d.status === "Active").length;
  
  const todayDisplayAttendance = todayAttendance.filter(a =>
    isEmployee ? a.employeeId === myEmpId : isDeptHead && managedDeptIds.length > 0 ? scopedEmpIds.has(a.employeeId) : true
  );
  const presentTodayCount = todayDisplayAttendance.filter(a => a.status === "Present" || a.status === "Late" || a.status === "Half Day").length;
  const leaveTodayCount = todayDisplayAttendance.filter(a => a.status === "On Leave").length;
  
  const checkedInIds = new Set(todayDisplayAttendance.map(a => a.employeeId));
  const absentTodayCount = activeEmployees.filter(e => !checkedInIds.has(e.employeeId)).length;

  // Dynamic permission checks for dashboard quick actions and admin panels
  const canViewUsersMetrics = !isEmployee && (rolePermissions
    ? hasPermission(rolePermissions, "settings", "view", "users")
    : role === "Administrator" || role === "Auditor");
  const canViewAuditLogs = !isEmployee && (rolePermissions
    ? hasPermission(rolePermissions, "reports", "view", "audit")
    : role === "Administrator" || role === "Auditor");
  const canCreateEmployees = rolePermissions
    ? hasPermission(rolePermissions, "employees", "create")
    : role !== "Auditor" && role !== "Employee";
  const canViewEmployees = rolePermissions
    ? hasPermission(rolePermissions, "employees", "view")
    : true;
  const canCreateAttendance = rolePermissions
    ? hasPermission(rolePermissions, "attendance", "create")
    : role !== "Auditor" && role !== "Employee";
  const canCreateLeave = rolePermissions
    ? hasPermission(rolePermissions, "leaves", "create")
    : role !== "Auditor";
  const canViewReports = !isEmployee && (rolePermissions
    ? hasPermission(rolePermissions, "reports", "view")
    : true);

  // Recent attendance
  const recentAttendance = [...displayAttendance]
    .sort((a, b) => (b.date || b.createdDate || "").localeCompare(a.date || a.createdDate || ""))
    .slice(0, 5);

  // Recent leaves
  const recentLeaves = [...displayLeaves]
    .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""))
    .slice(0, 5);

  // Recent system logs (Authorized roles)
  const recentLogs = [...logs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  // =========================================================
  // DEDICATED EMPLOYEE SELF-SERVICE (MY DASHBOARD) VIEW
  // =========================================================
  if (isEmployee) {
    const myDept = departments.find(d => d.id === ownEmp?.departmentId);
    const activeLeaveYear = companyConfig?.leaveYearConfig?.yearName || String(new Date().getFullYear());
    const annualLeaveType =
      companyConfig?.leaveTypesConfig?.find(t => t.name.toLowerCase().includes("annual") && t.status === "Active") ||
      companyConfig?.leaveTypesConfig?.find(t => t.status === "Active");

    let annualRemaining = 0;
    let annualOpening = 0;
    if (myEmpId && annualLeaveType) {
      const bal = calculateEmployeeLeaveBalance(myEmpId, annualLeaveType, activeLeaveYear, displayLeaves);
      annualRemaining = bal.remainingBalance;
      annualOpening = bal.openingBalance;
    } else {
      const defaultAlloc = companyConfig?.leaveAllocations?.["Annual Leave"] ?? 20;
      const usedDays = displayLeaves
        .filter(l => l.leaveType === "Annual Leave" && l.status !== "Cancelled")
        .reduce((sum, l) => sum + (l.daysCount || 0), 0);
      annualOpening = defaultAlloc;
      annualRemaining = Math.max(0, defaultAlloc - usedDays);
    }

    const myTodayAtt = todayDisplayAttendance[0] || recentAttendance[0];
    const myPayslips = myEmpId
      ? payslips
          .filter(p => p.employeeId === myEmpId)
          .sort((a, b) => (b.paymentDate || b.generatedDate || "").localeCompare(a.paymentDate || a.generatedDate || ""))
      : [];
    const latestPayslip = myPayslips[0];

    const myPendingRequests = myEmpId
      ? hrRequests.filter(r => r.employeeId === myEmpId && r.status === "Pending")
      : [];

    const myNotifications = notifications
      .filter(
        n =>
          n.category === "announcement" ||
          (myEmpId && n.recipientEmployeeId === myEmpId) ||
          (currentUser?.email && n.recipientEmail?.toLowerCase() === currentUser.email.toLowerCase())
      )
      .sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));

    const unreadNotifCount = myNotifications.filter(
      n => !n.isRead && !(currentUser && n.readByUserIds?.includes(currentUser.id))
    ).length;

    return (
      <div className="space-y-6">
        {/* Employee Welcome Header */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">My Dashboard</h1>
              {myEmpId && (
                <span className="text-[11px] font-bold bg-[#002B5B]/10 text-[#002B5B] border border-[#002B5B]/20 px-2.5 py-0.5 rounded-full">
                  ID: {myEmpId}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Welcome, <span className="font-bold text-slate-700">{ownEmp?.fullName || currentUser?.fullName}</span>
              {ownEmp ? ` • ${ownEmp.position} (${myDept?.name || "Department"})` : ""} • Date:{" "}
              <span className="font-bold text-slate-700">{todayStr}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px] px-3 py-1 rounded-full">
              Employee Self-Service
            </span>
          </div>
        </div>

        {/* 4 ESS KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="h-11 w-11 bg-blue-50 text-[#002B5B] rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Balance ({activeLeaveYear})</p>
              <p className="text-xl font-black text-slate-800">{annualRemaining} <span className="text-xs font-semibold text-slate-500">/ {annualOpening} days</span></p>
              <p className="text-[11px] text-slate-500 font-medium">{displayLeaves.filter(l => l.status === "Active").length} active request(s)</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="h-11 w-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Status</p>
              <p className="text-lg font-black text-slate-800">
                {todayDisplayAttendance[0] ? todayDisplayAttendance[0].status : (myTodayAtt ? `Last: ${myTodayAtt.status}` : "Not Logged")}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                {myTodayAtt ? `${myTodayAtt.date} (${myTodayAtt.checkInTime || "--:--"})` : "No check-in recorded"}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="h-11 w-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 border border-amber-100">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latest Net Payslip</p>
              <p className="text-lg font-black text-slate-800">
                {latestPayslip ? `${latestPayslip.netSalary.toLocaleString()} ETB` : "Not Published"}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                {latestPayslip ? latestPayslip.payrollPeriodName : "Awaiting payroll run"}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="h-11 w-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Requests &amp; Alerts</p>
              <p className="text-lg font-black text-slate-800">
                {myPendingRequests.length} Pending • {unreadNotifCount} Unread
              </p>
              <p className="text-[11px] text-slate-500 font-medium">Self-service activity</p>
            </div>
          </div>
        </div>

        {/* ESS Quick Self-Service Shortcuts */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Self-Service Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {hasPermission(rolePermissions, "employees", "view") && (
              <button
                onClick={() => onNavigate("employees_personal_info")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <UserIcon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">My Profile</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Personal details</span>
              </button>
            )}

            {hasPermission(rolePermissions, "leaves", "view", "apply") && (
              <button
                onClick={() => onNavigate("leaves_apply")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Apply for Leave</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Submit leave form</span>
              </button>
            )}

            {hasPermission(rolePermissions, "payroll", "view", "payslips") && (
              <button
                onClick={() => onNavigate("payroll_payslips")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <DollarSign className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">My Payslips</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Salary &amp; tax</span>
              </button>
            )}

            {hasPermission(rolePermissions, "requests", "view") && (
              <button
                onClick={() => onNavigate("requests_submit")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Submit HR Request</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Profile or letters</span>
              </button>
            )}

            {hasPermission(rolePermissions, "documents", "view") && (
              <button
                onClick={() => onNavigate("documents_employment_contract")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">My Documents</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Contracts &amp; letters</span>
              </button>
            )}

            {hasPermission(rolePermissions, "notifications", "view") && (
              <button
                onClick={() => onNavigate("notifications_personal")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <Bell className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Notifications</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{unreadNotifCount} unread alert(s)</span>
              </button>
            )}

            {hasPermission(rolePermissions, "account", "view", "change_password") && (
              <button
                onClick={() => onNavigate("account_change_password")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-center transition-all group cursor-pointer"
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-[#002B5B] group-hover:text-white text-[#002B5B] flex items-center justify-center mb-2 transition-all">
                  <Lock className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Change Password</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Account security</span>
              </button>
            )}
          </div>
        </div>

        {/* ESS Personal Summary Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Recent Attendance */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[360px]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#002B5B]" />
                My Recent Attendance
              </h3>
              {hasPermission(rolePermissions, "attendance", "view") && (
                <button
                  onClick={() => onNavigate("attendance_history")}
                  className="text-[10px] font-bold text-[#002B5B] hover:underline"
                >
                  View All
                </button>
              )}
            </div>
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              {recentAttendance.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">No personal attendance records found.</div>
              ) : (
                recentAttendance.map(a => (
                  <div key={a.id} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{a.date}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        {a.checkInTime || "--:--"} to {a.checkOutTime || "--:--"}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        a.status === "Present"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : a.status === "Late"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : a.status === "On Leave"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-slate-50 text-slate-700 border"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* My Recent Leaves */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[360px]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#002B5B]" />
                My Leave Requests
              </h3>
              {hasPermission(rolePermissions, "leaves", "view") && (
                <button
                  onClick={() => onNavigate("leaves_history")}
                  className="text-[10px] font-bold text-[#002B5B] hover:underline"
                >
                  View All
                </button>
              )}
            </div>
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              {recentLeaves.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">No leave requests submitted yet.</div>
              ) : (
                recentLeaves.map(l => (
                  <div key={l.id} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{l.leaveType}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        {l.startDate} to {l.endDate} • {l.daysCount} day(s)
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        l.status === "Active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : l.status === "Completed"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notifications & HR Announcements */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[360px]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#002B5B]" />
                Notifications &amp; Announcements
              </h3>
              {hasPermission(rolePermissions, "notifications", "view") && (
                <button
                  onClick={() => onNavigate("notifications_personal")}
                  className="text-[10px] font-bold text-[#002B5B] hover:underline"
                >
                  Open Center
                </button>
              )}
            </div>
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              {myNotifications.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">No personal notifications or announcements.</div>
              ) : (
                myNotifications.slice(0, 6).map(n => {
                  const isRead = n.isRead || Boolean(currentUser && n.readByUserIds?.includes(currentUser.id));
                  return (
                    <div key={n.id} className={`p-3 hover:bg-slate-50 transition-colors text-xs ${!isRead ? "bg-blue-50/40" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 truncate">{n.title}</span>
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                          {n.category === "announcement" ? "HR Notice" : "Personal"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{n.createdDate}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Ethio-Re Operational Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Human Resource Management &amp; Analytics Console • Active Date: <span className="font-bold text-slate-700">{todayStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === "Auditor" && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
              <span>Read-Only Auditor</span>
            </span>
          )}
          <div className="text-xs bg-slate-100 border px-3 py-1.5 rounded-lg text-slate-600 font-semibold">
            Signed in: <span className="text-primary-custom capitalize font-bold">{role}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0 border border-blue-100">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Employees</p>
            <p className="text-xl font-black text-slate-800">{totalEmployeesCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center shrink-0 border border-slate-200">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Departments</p>
            <p className="text-xl font-black text-slate-800">{activeDepartmentsCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Present Today</p>
            <p className="text-xl font-black text-slate-800">{presentTodayCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0 border border-rose-100">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Absent Today</p>
            <p className="text-xl font-black text-slate-800">{absentTodayCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">On Leave Today</p>
            <p className="text-xl font-black text-slate-800">{leaveTodayCount}</p>
          </div>
        </div>
      </div>

      {/* Admin / Auditor Extra Metrics Panel */}
      {canViewUsersMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-primary-custom" />
            <div>
              <p className="text-xs font-bold text-slate-700">Total System Users</p>
              <p className="text-sm font-semibold text-slate-500">
                <span className="text-lg font-black text-slate-800">{users.length}</span> registered operators &amp; auditors
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs font-bold text-slate-700">Active System Users</p>
              <p className="text-sm font-semibold text-slate-500">
                <span className="text-lg font-black text-slate-800">{users.filter(u => u.status === "Active").length}</span> authorized logging accounts
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Panel */}
      {(canCreateEmployees || canCreateAttendance || canCreateLeave || canViewEmployees || canViewReports) && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            {role === "Auditor" ? "Audit Navigation Shortcuts" : "Quick HR Actions"}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {canCreateEmployees && (
              <button 
                onClick={onOpenQuickAddEmployee}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-center transition-all group"
                id="qa-add-employee"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-primary-custom group-hover:text-white text-primary-custom flex items-center justify-center mb-2 transition-all">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Add Employee</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Enroll new resource</span>
              </button>
            )}

            {canCreateAttendance && (
              <button 
                onClick={onOpenQuickRecordAttendance}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-center transition-all group"
                id="qa-record-attendance"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-primary-custom group-hover:text-white text-primary-custom flex items-center justify-center mb-2 transition-all">
                  <Clock className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Record Attendance</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Log daily attendance</span>
              </button>
            )}

            {canCreateLeave && (
              <button 
                onClick={onOpenQuickRegisterLeave}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-center transition-all group"
                id="qa-register-leave"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-primary-custom group-hover:text-white text-primary-custom flex items-center justify-center mb-2 transition-all">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Register Leave</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Book leave directly</span>
              </button>
            )}

            {canViewEmployees && (
              <button 
                onClick={() => onNavigate("employees")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-center transition-all group"
                id="qa-view-employees"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-primary-custom group-hover:text-white text-primary-custom flex items-center justify-center mb-2 transition-all">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Employee Directory</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Audit personnel folders</span>
              </button>
            )}

            {canViewReports && (
              <button 
                onClick={() => onNavigate("reports")}
                className="flex flex-col items-center justify-center p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-center transition-all group"
                id="qa-view-reports"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-primary-custom group-hover:text-white text-primary-custom flex items-center justify-center mb-2 transition-all">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">View Reports</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Extract audit reports</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lists Section: Attendance vs. Leaves (vs. Activity Logs if permitted) */}
      <div className={`grid grid-cols-1 ${canViewAuditLogs ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-6`}>
        {/* Recent Attendance */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col h-[380px]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-custom" />
              Recent Attendance
            </h3>
            <button 
              onClick={() => onNavigate("attendance")} 
              className="text-[10px] font-bold text-primary-custom hover:underline"
            >
              View All
            </button>
          </div>
          <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
            {recentAttendance.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No recent attendance records.</div>
            ) : (
              recentAttendance.map(a => {
                const emp = employees.find(e => e.employeeId === a.employeeId);
                const empName = emp ? emp.fullName : a.employeeId;
                return (
                  <div key={a.id} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{empName}</p>
                      <div className="flex items-center gap-2 text-slate-400 mt-0.5 font-medium">
                        <span>{a.date}</span>
                        <span>•</span>
                        <span>{a.checkInTime || "--:--"} to {a.checkOutTime || "--:--"}</span>
                      </div>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        a.status === "Present" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        a.status === "Late" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        a.status === "On Leave" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        "bg-slate-50 text-slate-700 border"
                      }`}>
                        {a.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Leaves */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col h-[380px]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary-custom" />
              Recent Leave Records
            </h3>
            <button 
              onClick={() => onNavigate("leaves")} 
              className="text-[10px] font-bold text-primary-custom hover:underline"
            >
              View All
            </button>
          </div>
          <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
            {recentLeaves.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No recent leave records.</div>
            ) : (
              recentLeaves.map(l => {
                const emp = employees.find(e => e.employeeId === l.employeeId);
                const empName = emp ? emp.fullName : l.employeeId;
                return (
                  <div key={l.id} className="p-3 hover:bg-slate-50 transition-colors flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{empName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-semibold text-primary-custom uppercase">
                        {l.leaveType}
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-400 mt-1 font-medium">
                        <span>{l.startDate} to {l.endDate}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-600">{l.daysCount} Working Days</span>
                      </div>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        l.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        l.status === "Completed" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}>
                        {l.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Admin Logs - Permitted roles */}
        {canViewAuditLogs && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col h-[380px]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Security Activities
              </h3>
              <button 
                onClick={() => onNavigate("logs")} 
                className="text-[10px] font-bold text-primary-custom hover:underline"
              >
                Full Logs
              </button>
            </div>
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              {recentLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">No recent activities.</div>
              ) : (
                recentLogs.map(g => (
                  <div key={g.id} className="p-3 hover:bg-slate-50 transition-colors text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-700">{g.userEmail}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{g.timestamp.split(" ")[1]}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold mt-1">
                      <span className="text-primary-custom">[{g.module}]</span> {g.action}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium mt-0.5 leading-tight">{g.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
