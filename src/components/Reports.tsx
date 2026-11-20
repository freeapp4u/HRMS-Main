import { useState, useEffect, useMemo } from "react";
import { Employee, Department, LeaveRecord, AttendanceRecord, ActivityLog, CompanyConfig, User, ModulePermission } from "../types";
import { getDepartmentHeadManagedDeptIds } from "../utils/rbacUtils";
import { formatReportDateTime, ReportExportPayload } from "../utils/reportBranding";
import CompanyReportHeader from "./reports/CompanyReportHeader";
import ReportPrintButton from "./reports/ReportPrintButton";
import ReportPDFExportButton from "./reports/ReportPDFExportButton";
import {
  Calendar, Clock, ShieldCheck, FileSpreadsheet,
  Search, BarChart3, Users
} from "lucide-react";

interface ReportsProps {
  employees: Employee[];
  departments: Department[];
  leaves: LeaveRecord[];
  attendance: AttendanceRecord[];
  auditLogs: ActivityLog[];
  config: CompanyConfig;
  currentUser: User | null;
  initialSubTab?: string;
  permissions?: ModulePermission;
}

export default function Reports({
  employees,
  departments,
  leaves,
  attendance,
  auditLogs,
  config,
  currentUser,
  initialSubTab,
  permissions
}: ReportsProps) {
  const canExport = permissions ? permissions.actions.export : true;
  const canViewSub = (subId: string) => {
    if (!permissions) {
      if (subId === "audit") return currentUser?.role === "Administrator" || currentUser?.role === "Auditor";
      return true;
    }
    if (subId === "statistics") {
      return permissions.submenus.statistics !== undefined
        ? permissions.submenus.statistics !== false
        : permissions.submenus.directory !== false;
    }
    return permissions.submenus[subId] !== false;
  };

  const allowedSubTabs = ["directory", "statistics", "leaves", "attendance", "audit"].filter(canViewSub);
  const [activeReportTab, setActiveReportTab] = useState(() => {
    if (initialSubTab && canViewSub(initialSubTab)) return initialSubTab;
    return allowedSubTabs[0] || "directory";
  });

  useEffect(() => {
    if (initialSubTab && canViewSub(initialSubTab)) {
      setActiveReportTab(initialSubTab);
    } else if (!canViewSub(activeReportTab) && allowedSubTabs[0]) {
      setActiveReportTab(allowedSubTabs[0]);
    }
  }, [initialSubTab, permissions]);

  // --- Role-based data scoping ---
  const isEmployee = currentUser?.role === "Employee" || permissions?.dataScope === "own";
  const isDeptHead = currentUser?.role === "Department Head" || permissions?.dataScope === "team";
  const managedDeptIds = isDeptHead ? getDepartmentHeadManagedDeptIds(currentUser, departments, employees) : [];
  const myEmpId = currentUser?.employeeId;

  const scopedEmployees = employees.filter(emp => {
    if (isEmployee) return (myEmpId && emp.employeeId === myEmpId) || emp.email.toLowerCase() === currentUser?.email.toLowerCase();
    if (isDeptHead && managedDeptIds.length > 0) return managedDeptIds.includes(emp.departmentId);
    return true;
  });
  const scopedEmpIds = new Set(scopedEmployees.map(e => e.employeeId));
  const scopedLeaves = isEmployee || (isDeptHead && managedDeptIds.length > 0)
    ? leaves.filter(l => scopedEmpIds.has(l.employeeId))
    : leaves;
  const scopedAttendance = isEmployee || (isDeptHead && managedDeptIds.length > 0)
    ? attendance.filter(a => scopedEmpIds.has(a.employeeId))
    : attendance;

  // --- Filter states ---
  const [empDept, setEmpDept] = useState("");
  const [empStatus, setEmpStatus] = useState("");
  const [empJoinYear, setEmpJoinYear] = useState("");

  const [leaveDept, setLeaveDept] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");

  const [attDept, setAttDept] = useState("");
  const [attStatus, setAttStatus] = useState("");
  const [attStart, setAttStart] = useState("");
  const [attEnd, setAttEnd] = useState("");

  const [auditModule, setAuditModule] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  // --- 1. Calculations: Employee Directory Report ---
  const filteredEmployees = scopedEmployees.filter(emp => {
    const matchDept = empDept ? emp.departmentId === empDept : true;
    const matchStatus = empStatus ? emp.status === empStatus : true;
    const matchYear = empJoinYear ? emp.hireDate.startsWith(empJoinYear) : true;
    return matchDept && matchStatus && matchYear;
  });

  const totalEmps = filteredEmployees.length;
  const activeEmpsCount = filteredEmployees.filter(e => e.status === "Active").length;
  const deactivatedEmpsCount = filteredEmployees.filter(e => e.status === "Inactive").length;

  const calculateAvgTenure = () => {
    if (filteredEmployees.length === 0) return "0";
    const currentYear = new Date().getFullYear();
    const sumTenure = filteredEmployees.reduce((sum, emp) => {
      const joinYear = new Date(emp.hireDate).getFullYear() || currentYear;
      return sum + (currentYear - joinYear);
    }, 0);
    return (sumTenure / filteredEmployees.length).toFixed(1);
  };

  // --- 1B. Calculations: Employee Statistics ---
  const departmentStats = useMemo(() => {
    const relevantDepts = isDeptHead && managedDeptIds.length > 0
      ? departments.filter(d => managedDeptIds.includes(d.id))
      : departments;

    return relevantDepts.map(d => {
      const deptEmps = scopedEmployees.filter(e => e.departmentId === d.id);
      const activeCount = deptEmps.filter(e => e.status === "Active").length;
      const inactiveCount = deptEmps.filter(e => e.status === "Inactive").length;
      const sharePct = scopedEmployees.length > 0
        ? ((deptEmps.length / scopedEmployees.length) * 100).toFixed(1)
        : "0.0";
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        status: d.status,
        total: deptEmps.length,
        active: activeCount,
        inactive: inactiveCount,
        sharePct
      };
    });
  }, [departments, scopedEmployees, isDeptHead, managedDeptIds]);

  const employmentTypeStats = useMemo(() => {
    const types = ["Permanent", "Contract", "Temporary", "Intern"];
    return types.map(t => {
      const count = scopedEmployees.filter(e => e.employmentType === t).length;
      const activeCount = scopedEmployees.filter(e => e.employmentType === t && e.status === "Active").length;
      const pct = scopedEmployees.length > 0 ? ((count / scopedEmployees.length) * 100).toFixed(1) : "0.0";
      return { type: t, count, activeCount, pct };
    });
  }, [scopedEmployees]);

  const genderStats = useMemo(() => {
    const genders = ["Male", "Female"];
    return genders.map(g => {
      const count = scopedEmployees.filter(e => e.gender === g).length;
      const pct = scopedEmployees.length > 0 ? ((count / scopedEmployees.length) * 100).toFixed(1) : "0.0";
      return { gender: g, count, pct };
    });
  }, [scopedEmployees]);

  // --- 2. Calculations: Leave Utilization Report ---
  const filteredLeaves = scopedLeaves.filter(l => {
    const emp = employees.find(e => e.employeeId === l.employeeId);
    const matchDept = leaveDept ? emp?.departmentId === leaveDept : true;
    const matchType = leaveType ? l.leaveType === leaveType : true;
    const matchStart = leaveStart ? l.startDate >= leaveStart : true;
    const matchEnd = leaveEnd ? l.endDate <= leaveEnd : true;
    return matchDept && matchType && matchStart && matchEnd;
  });

  const totalDaysLost = filteredLeaves.reduce((sum, l) => l.status !== "Cancelled" ? sum + l.daysCount : sum, 0);
  const avgLeaveDuration = filteredLeaves.length > 0
    ? (totalDaysLost / filteredLeaves.filter(l => l.status !== "Cancelled").length || 0).toFixed(1)
    : "0";

  // --- 3. Calculations: Attendance & Lateness Summary ---
  const filteredAttendance = scopedAttendance.filter(att => {
    const emp = employees.find(e => e.employeeId === att.employeeId);
    const matchDept = attDept ? emp?.departmentId === attDept : true;
    const matchStatus = attStatus ? att.status === attStatus : true;
    const matchStart = attStart ? att.date >= attStart : true;
    const matchEnd = attEnd ? att.date <= attEnd : true;
    return matchDept && matchStatus && matchStart && matchEnd;
  });

  const totalDaysLogged = filteredAttendance.length;
  const presentCount = filteredAttendance.filter(a => a.status === "Present" || a.status === "Late").length;
  const absentCount = filteredAttendance.filter(a => a.status === "Absent").length;
  const lateCount = filteredAttendance.filter(a => a.status === "Late" || a.lateStatus === "Yes").length;
  const totalWorkingHours = filteredAttendance.reduce((sum, a) => sum + (Number(a.workingHours) || 0), 0);

  // --- 4. Calculations: Audit Logs ---
  const filteredAuditLogs = auditLogs.filter(log => {
    const matchModule = auditModule ? log.module === auditModule : true;
    const matchSearch = auditSearch
      ? log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.details.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.userEmail.toLowerCase().includes(auditSearch.toLowerCase())
      : true;
    return matchModule && matchSearch;
  });

  const generatedTimestamp = formatReportDateTime();

  // --- Build Centralized Export Payload for Active Report Tab ---
  const buildActiveReportPayload = (): ReportExportPayload => {
    if (activeReportTab === "statistics") {
      const deptUnit = isDeptHead && managedDeptIds.length > 0
        ? departmentStats.map(d => d.name).join(", ")
        : "All Organizational Units";

      return {
        reportTitle: "Employee & Department Statistics Report",
        filePrefix: "Employee_Statistics_Report",
        reportSubtitle: "Workforce distribution across organizational units, employment types, and demographics",
        departmentOrUnit: deptUnit,
        generatedAt: generatedTimestamp,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "portrait",
        summaryMetrics: [
          { label: "Total Personnel", value: `${scopedEmployees.length} Staff` },
          { label: "Active Staff", value: `${scopedEmployees.filter(e => e.status === "Active").length}` },
          { label: "Inactive Staff", value: `${scopedEmployees.filter(e => e.status === "Inactive").length}` },
          { label: "Active Departments", value: `${departmentStats.filter(d => d.status === "Active").length}` }
        ],
        columns: [
          { header: "Dept Code" },
          { header: "Department Name" },
          { header: "Status", align: "center" },
          { header: "Active Staff", align: "center" },
          { header: "Inactive Staff", align: "center" },
          { header: "Total Staff", align: "center" },
          { header: "Share (%)", align: "right" }
        ],
        rows: departmentStats.map(d => [
          d.code,
          d.name,
          d.status,
          d.active,
          d.inactive,
          d.total,
          `${d.sharePct}%`
        ]),
        totalsRow: [
          "TOTAL",
          `${departmentStats.length} Departments`,
          "-",
          departmentStats.reduce((s, d) => s + d.active, 0),
          departmentStats.reduce((s, d) => s + d.inactive, 0),
          scopedEmployees.length,
          "100.0%"
        ],
        additionalTables: [
          {
            title: "Workforce Distribution by Employment Type",
            columns: [
              { header: "Employment Type" },
              { header: "Active Count", align: "center" },
              { header: "Total Personnel", align: "center" },
              { header: "Share (%)", align: "right" }
            ],
            rows: employmentTypeStats.map(t => [t.type, t.activeCount, t.count, `${t.pct}%`]),
            totalsRow: [
              "TOTAL",
              employmentTypeStats.reduce((s, t) => s + t.activeCount, 0),
              scopedEmployees.length,
              "100.0%"
            ]
          },
          {
            title: "Workforce Gender Composition",
            columns: [
              { header: "Gender" },
              { header: "Headcount", align: "center" },
              { header: "Share (%)", align: "right" }
            ],
            rows: genderStats.map(g => [g.gender, g.count, `${g.pct}%`]),
            totalsRow: ["TOTAL", scopedEmployees.length, "100.0%"]
          }
        ]
      };
    }

    if (activeReportTab === "leaves") {
      const deptName = departments.find(d => d.id === leaveDept)?.name || "All Departments";
      const periodLabel = leaveStart || leaveEnd
        ? `${leaveStart || "Start"} to ${leaveEnd || "Present"}`
        : "All Recorded Dates";
      return {
        reportTitle: "Leave Utilization Audit Report",
        filePrefix: "Leave_Report",
        reportSubtitle: `Leave Type: ${leaveType || "All Leave Types"}`,
        reportingPeriod: periodLabel,
        departmentOrUnit: deptName,
        generatedAt: generatedTimestamp,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "landscape",
        summaryMetrics: [
          { label: "Leave Applications", value: `${filteredLeaves.length}` },
          { label: "Working Days Off-Duty", value: `${totalDaysLost} Days` },
          { label: "Average Leave Duration", value: `${avgLeaveDuration} Days` }
        ],
        columns: [
          { header: "Employee ID" },
          { header: "Employee Name" },
          { header: "Department" },
          { header: "Leave Type" },
          { header: "Start Date" },
          { header: "End Date" },
          { header: "Business Days", align: "center" },
          { header: "Status", align: "center" }
        ],
        rows: filteredLeaves.map(l => {
          const emp = employees.find(e => e.employeeId === l.employeeId);
          const dName = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "-";
          return [
            l.employeeId,
            emp?.fullName || l.employeeId,
            dName,
            l.leaveType,
            l.startDate,
            l.endDate,
            `${l.daysCount} days`,
            l.status
          ];
        }),
        totalsRow: [
          "TOTAL",
          `${filteredLeaves.length} Records`,
          "",
          "",
          "",
          "",
          `${totalDaysLost} days`,
          ""
        ],
        emptyMessage: "No leave allocations or bookings match current scope."
      };
    }

    if (activeReportTab === "attendance") {
      const deptName = departments.find(d => d.id === attDept)?.name || "All Departments";
      const periodLabel = attStart || attEnd
        ? `${attStart || "Start"} to ${attEnd || "Present"}`
        : "All Recorded Dates";
      return {
        reportTitle: "Attendance & Lateness Audit Report",
        filePrefix: "Attendance_Report",
        reportSubtitle: `Status Scope: ${attStatus || "All Statuses"}`,
        reportingPeriod: periodLabel,
        departmentOrUnit: deptName,
        generatedAt: generatedTimestamp,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "landscape",
        summaryMetrics: [
          { label: "Total Logs", value: `${totalDaysLogged}` },
          { label: "Present Ratio", value: `${totalDaysLogged > 0 ? ((presentCount / totalDaysLogged) * 100).toFixed(0) : 0}%` },
          { label: "Late Incidents", value: `${lateCount}` },
          { label: "Absent Days", value: `${absentCount}` }
        ],
        columns: [
          { header: "Date" },
          { header: "Employee ID" },
          { header: "Employee Name" },
          { header: "Department" },
          { header: "Check In", align: "center" },
          { header: "Check Out", align: "center" },
          { header: "Working Hours", align: "right" },
          { header: "Status", align: "center" }
        ],
        rows: filteredAttendance.map(a => {
          const emp = employees.find(e => e.employeeId === a.employeeId);
          const dName = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "-";
          return [
            a.date,
            a.employeeId,
            emp?.fullName || a.employeeId,
            dName,
            a.checkInTime || "--:--",
            a.checkOutTime || "--:--",
            `${a.workingHours} hrs`,
            a.status
          ];
        }),
        totalsRow: [
          "TOTAL",
          `${filteredAttendance.length} Entries`,
          "",
          "",
          "",
          "",
          `${totalWorkingHours.toFixed(1)} hrs`,
          ""
        ],
        emptyMessage: "No attendance check-ins recorded for current filters."
      };
    }

    if (activeReportTab === "audit") {
      return {
        reportTitle: "Security Transaction System Audit Log Report",
        filePrefix: "Audit_Log_Report",
        reportSubtitle: `Module: ${auditModule || "All Modules"} | Search Query: ${auditSearch || "None"}`,
        departmentOrUnit: auditModule || "All System Modules",
        generatedAt: generatedTimestamp,
        generatedBy: currentUser?.fullName || currentUser?.email,
        orientation: "landscape",
        summaryMetrics: [
          { label: "Total Logged Events", value: `${filteredAuditLogs.length}` },
          { label: "Module Filter", value: auditModule || "All Modules" }
        ],
        columns: [
          { header: "Timestamp" },
          { header: "Operator (User)" },
          { header: "Module" },
          { header: "Action Logged" },
          { header: "Operation Details" }
        ],
        rows: filteredAuditLogs.map(log => [
          log.timestamp,
          log.userEmail,
          log.module,
          log.action,
          log.details
        ]),
        totalsRow: ["TOTAL", `${filteredAuditLogs.length} Audit Events`, "", "", ""],
        emptyMessage: "No activity transaction records logged for current filters."
      };
    }

    // Default: Directory
    const deptName = departments.find(d => d.id === empDept)?.name || "All Departments";
    return {
      reportTitle: "Employee Directory Summary Report",
      filePrefix: "Employee_Report",
      reportSubtitle: `Status: ${empStatus || "All Statuses"}${empJoinYear ? ` | Joining Year: ${empJoinYear}` : ""}`,
      reportingPeriod: empJoinYear ? `Joining Year ${empJoinYear}` : "All Active & Historical Records",
      departmentOrUnit: deptName,
      generatedAt: generatedTimestamp,
      generatedBy: currentUser?.fullName || currentUser?.email,
      orientation: "landscape",
      summaryMetrics: [
        { label: "Filtered Headcount", value: `${totalEmps} Personnel` },
        { label: "Active Staff", value: `${activeEmpsCount}` },
        { label: "Inactive Staff", value: `${deactivatedEmpsCount}` },
        { label: "Average Tenure", value: `${calculateAvgTenure()} Years` }
      ],
      columns: [
        { header: "ID" },
        { header: "Full Name" },
        { header: "Department" },
        { header: "Position" },
        { header: "Date of Joining" },
        { header: "Status", align: "center" },
        { header: "Phone" }
      ],
      rows: filteredEmployees.map(emp => {
        const deptObj = departments.find(d => d.id === emp.departmentId);
        return [
          emp.employeeId,
          emp.fullName,
          deptObj ? deptObj.name : emp.departmentId,
          emp.position || "-",
          emp.hireDate,
          emp.status,
          emp.phoneNumber || "-"
        ];
      }),
      totalsRow: [
        "TOTAL",
        `${totalEmps} Employees`,
        "",
        "",
        "",
        `${activeEmpsCount} Active`,
        ""
      ],
      emptyMessage: "No employees match selected directory parameters."
    };
  };

  // --- CSV / Excel Export ---
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";

    if (activeReportTab === "directory") {
      csvContent += "Employee ID,Full Name,Email,Phone,Department,Position,Hire Date,Status,Birth Date\r\n";
      filteredEmployees.forEach(e => {
        const dName = departments.find(d => d.id === e.departmentId)?.name || e.departmentId;
        csvContent += `"${e.employeeId}","${e.fullName}","${e.email}","${e.phoneNumber}","${dName}","${e.position}","${e.hireDate}","${e.status}","${e.dob}"\r\n`;
      });
    } else if (activeReportTab === "statistics") {
      csvContent += "Department Code,Department Name,Status,Active Staff,Inactive Staff,Total Staff,Share %\r\n";
      departmentStats.forEach(d => {
        csvContent += `"${d.code}","${d.name}","${d.status}","${d.active}","${d.inactive}","${d.total}","${d.sharePct}%"\r\n`;
      });
    } else if (activeReportTab === "leaves") {
      csvContent += "Leave ID,Employee ID,Employee Name,Leave Type,Start Date,End Date,Working Days,Status,Reason\r\n";
      filteredLeaves.forEach(l => {
        const empName = employees.find(e => e.employeeId === l.employeeId)?.fullName || l.employeeId;
        csvContent += `"${l.id}","${l.employeeId}","${empName}","${l.leaveType}","${l.startDate}","${l.endDate}","${l.daysCount}","${l.status}","${l.reason}"\r\n`;
      });
    } else if (activeReportTab === "attendance") {
      csvContent += "Record ID,Employee ID,Employee Name,Date,Check In,Check Out,Working Hours,Late,Status,Remarks\r\n";
      filteredAttendance.forEach(a => {
        const empName = employees.find(e => e.employeeId === a.employeeId)?.fullName || a.employeeId;
        csvContent += `"${a.id}","${a.employeeId}","${empName}","${a.date}","${a.checkInTime || "-"}","${a.checkOutTime || "-"}","${a.workingHours}","${a.lateStatus}","${a.status}","${a.remarks}"\r\n`;
      });
    } else if (activeReportTab === "audit" && canViewSub("audit")) {
      csvContent += "Timestamp,User,Module,Action,Record,Details\r\n";
      filteredAuditLogs.forEach(log => {
        csvContent += `"${log.timestamp}","${log.userEmail}","${log.module}","${log.action}","${log.recordEntity}","${log.details}"\r\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ethiore_report_${activeReportTab}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Active Report Header & Global Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        {(() => {
          const metaMap: Record<string, { title: string; subtitle: string; icon: any }> = {
            directory: {
              title: "Employee Directory Report",
              subtitle: "Filterable personnel register and tenure analytics",
              icon: Users,
            },
            statistics: {
              title: "Employee Statistics",
              subtitle: "Workforce demographics, gender ratios, and departmental distribution",
              icon: BarChart3,
            },
            leaves: {
              title: "Leave Utilization Report",
              subtitle: "Approved and active leave days utilization tracking",
              icon: Calendar,
            },
            attendance: {
              title: "Attendance & Lateness Report",
              subtitle: "Daily check-in punctuality and attendance analytics",
              icon: Clock,
            },
            audit: {
              title: "Activity Audit Logs",
              subtitle: "System-wide security and operational audit trail",
              icon: ShieldCheck,
            },
          };
          const meta = metaMap[activeReportTab] || metaMap.directory;
          const IconComp = meta.icon;
          return (
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-custom text-white rounded-xl shadow-xs shrink-0">
                <IconComp className="h-5 w-5 text-accent-custom" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-slate-800">{meta.title}</h1>
                <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
              </div>
            </div>
          );
        })()}

        {/* Consistent Report Toolbar: Print | Export PDF | Export Excel */}
        {canExport && (
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            <ReportPrintButton
              printData={buildActiveReportPayload}
              companyConfig={config}
              id="btn-reports-print"
            />
            <ReportPDFExportButton
              reportData={buildActiveReportPayload}
              companyConfig={config}
              id="btn-reports-pdf"
            />
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
              id="btn-reports-excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        )}
      </div>

      {/* --- REPORT VIEW 1: EMPLOYEE DIRECTORY --- */}
      {activeReportTab === "directory" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Filtered headcount</span>
              <span className="text-xl font-extrabold text-slate-800">{totalEmps} Personnel</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Active Staff Status</span>
              <span className="text-xl font-extrabold text-slate-800">{activeEmpsCount} Active</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Average Service Length</span>
              <span className="text-xl font-extrabold text-slate-800">{calculateAvgTenure()} Years Tenure</span>
            </div>
          </div>

          {/* Filters card */}
          <div className="bg-white border rounded-lg p-4 shadow-2xs no-print">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px] space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
                <select
                  value={empDept}
                  onChange={(e) => setEmpDept(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold text-slate-700"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="w-48 space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employment Status</label>
                <select
                  value={empStatus}
                  onChange={(e) => setEmpStatus(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="w-48 space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year of Joining</label>
                <input
                  type="number"
                  placeholder="e.g. 2024"
                  value={empJoinYear}
                  onChange={(e) => setEmpJoinYear(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Branded Report Canvas */}
          <div className="bg-white border rounded-lg p-6 sm:p-8 shadow-2xs max-w-5xl mx-auto printable-canvas">
            <CompanyReportHeader
              companyConfig={config}
              reportTitle="Employee Directory Summary Report"
              reportSubtitle={`Status: ${empStatus || "All Statuses"}${empJoinYear ? ` | Joining Year: ${empJoinYear}` : ""}`}
              reportingPeriod={empJoinYear ? `Joining Year ${empJoinYear}` : "All Active & Historical Records"}
              departmentOrUnit={departments.find(d => d.id === empDept)?.name || "All Departments"}
              generatedAt={generatedTimestamp}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div className="overflow-x-auto">
              <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-2 border-r">ID</th>
                    <th className="px-4 py-2 border-r">Full Name</th>
                    <th className="px-4 py-2 border-r">Department</th>
                    <th className="px-4 py-2 border-r">Position</th>
                    <th className="px-4 py-2 border-r">Date of Joining</th>
                    <th className="px-4 py-2 border-r">Status</th>
                    <th className="px-4 py-2">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800 font-medium">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">No employees match selected directory parameters.</td>
                    </tr>
                  ) : (
                    filteredEmployees.map(emp => {
                      const deptObj = departments.find(d => d.id === emp.departmentId);
                      return (
                        <tr key={emp.employeeId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 border-r font-bold text-primary-custom">{emp.employeeId}</td>
                          <td className="px-4 py-2.5 border-r font-bold">{emp.fullName}</td>
                          <td className="px-4 py-2.5 border-r text-slate-500 font-semibold">{deptObj ? deptObj.name : "N/A"}</td>
                          <td className="px-4 py-2.5 border-r text-slate-600">{emp.position || "-"}</td>
                          <td className="px-4 py-2.5 border-r">{emp.hireDate}</td>
                          <td className="px-4 py-2.5 border-r">
                            <span className={`inline-block text-[10px] font-bold ${
                              emp.status === "Active" ? "text-emerald-700" : "text-rose-700"
                            }`}>
                              {emp.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">{emp.phoneNumber || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredEmployees.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                      <td className="px-4 py-2 border-r">TOTAL</td>
                      <td className="px-4 py-2 border-r">{totalEmps} Employees</td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r">{activeEmpsCount} Active / {deactivatedEmpsCount} Inactive</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- REPORT VIEW 1B: EMPLOYEE & DEPARTMENT STATISTICS --- */}
      {activeReportTab === "statistics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Total Personnel</span>
              <span className="text-xl font-extrabold text-slate-800">{scopedEmployees.length} Staff</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Active Employees</span>
              <span className="text-xl font-extrabold text-emerald-700">{scopedEmployees.filter(e => e.status === "Active").length}</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Inactive / Archived</span>
              <span className="text-xl font-extrabold text-rose-700">{scopedEmployees.filter(e => e.status === "Inactive").length}</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Organizational Units</span>
              <span className="text-xl font-extrabold text-slate-800">{departmentStats.length} Units</span>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 sm:p-8 shadow-2xs max-w-5xl mx-auto printable-canvas space-y-6">
            <CompanyReportHeader
              companyConfig={config}
              reportTitle="Employee & Department Statistics Report"
              reportSubtitle="Workforce distribution across organizational units, employment types, and gender demographics"
              departmentOrUnit={isDeptHead && managedDeptIds.length > 0 ? departmentStats.map(d => d.name).join(", ") : "All Organizational Units"}
              generatedAt={generatedTimestamp}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div>
              <h3 className="text-xs font-extrabold text-primary-custom uppercase tracking-wider mb-2">
                Headcount by Department
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-4 py-2 border-r">Dept Code</th>
                      <th className="px-4 py-2 border-r">Department Name</th>
                      <th className="px-4 py-2 border-r text-center">Status</th>
                      <th className="px-4 py-2 border-r text-center">Active Staff</th>
                      <th className="px-4 py-2 border-r text-center">Inactive Staff</th>
                      <th className="px-4 py-2 border-r text-center">Total Staff</th>
                      <th className="px-4 py-2 text-right">Share (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-800 font-medium">
                    {departmentStats.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 border-r font-bold text-primary-custom">{d.code}</td>
                        <td className="px-4 py-2.5 border-r font-bold">{d.name}</td>
                        <td className="px-4 py-2.5 border-r text-center font-bold">{d.status}</td>
                        <td className="px-4 py-2.5 border-r text-center text-emerald-700 font-bold">{d.active}</td>
                        <td className="px-4 py-2.5 border-r text-center text-rose-700 font-bold">{d.inactive}</td>
                        <td className="px-4 py-2.5 border-r text-center font-extrabold">{d.total}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{d.sharePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                      <td className="px-4 py-2 border-r">TOTAL</td>
                      <td className="px-4 py-2 border-r">{departmentStats.length} Departments</td>
                      <td className="px-4 py-2 border-r text-center">-</td>
                      <td className="px-4 py-2 border-r text-center">{departmentStats.reduce((s, d) => s + d.active, 0)}</td>
                      <td className="px-4 py-2 border-r text-center">{departmentStats.reduce((s, d) => s + d.inactive, 0)}</td>
                      <td className="px-4 py-2 border-r text-center">{scopedEmployees.length}</td>
                      <td className="px-4 py-2 text-right">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-extrabold text-primary-custom uppercase tracking-wider mb-2">
                  By Employment Type
                </h3>
                <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2 border-r">Type</th>
                      <th className="px-3 py-2 border-r text-center">Active</th>
                      <th className="px-3 py-2 border-r text-center">Total</th>
                      <th className="px-3 py-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {employmentTypeStats.map(t => (
                      <tr key={t.type}>
                        <td className="px-3 py-2 border-r font-bold">{t.type}</td>
                        <td className="px-3 py-2 border-r text-center">{t.activeCount}</td>
                        <td className="px-3 py-2 border-r text-center font-bold">{t.count}</td>
                        <td className="px-3 py-2 text-right">{t.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-xs font-extrabold text-primary-custom uppercase tracking-wider mb-2">
                  By Gender Composition
                </h3>
                <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                      <th className="px-3 py-2 border-r">Gender</th>
                      <th className="px-3 py-2 border-r text-center">Headcount</th>
                      <th className="px-3 py-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {genderStats.map(g => (
                      <tr key={g.gender}>
                        <td className="px-3 py-2 border-r font-bold">{g.gender}</td>
                        <td className="px-3 py-2 border-r text-center font-bold">{g.count}</td>
                        <td className="px-3 py-2 text-right">{g.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- REPORT VIEW 2: LEAVE UTILIZATION --- */}
      {activeReportTab === "leaves" && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 no-print">
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Working Days Off-Duty</span>
              <span className="text-xl font-extrabold text-slate-800">{totalDaysLost} Days Lost</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Average booked leave duration</span>
              <span className="text-xl font-extrabold text-slate-800">{avgLeaveDuration} Days average</span>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border rounded-lg p-4 shadow-2xs flex flex-wrap gap-4 no-print">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <select
                value={leaveDept}
                onChange={(e) => setLeaveDept(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="w-48 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Type</label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Types</option>
                <option value="Annual Leave">Annual Leave</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Maternity Leave">Maternity Leave</option>
                <option value="Paternity Leave">Paternity Leave</option>
                <option value="Compassionate Leave">Compassionate Leave</option>
                <option value="Unpaid Leave">Unpaid Leave</option>
              </select>
            </div>

            <div className="w-44 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date From</label>
              <input
                type="date"
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                className="w-full px-3 py-1 border rounded-lg text-xs"
              />
            </div>

            <div className="w-44 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date To</label>
              <input
                type="date"
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className="w-full px-3 py-1 border rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Printable Branded Canvas */}
          <div className="bg-white border rounded-lg p-6 sm:p-8 shadow-2xs max-w-5xl mx-auto printable-canvas">
            <CompanyReportHeader
              companyConfig={config}
              reportTitle="Leave Utilization Audit Report"
              reportSubtitle={`Leave Type: ${leaveType || "All Types"}`}
              reportingPeriod={leaveStart || leaveEnd ? `${leaveStart || "Start"} to ${leaveEnd || "Present"}` : "All Recorded Dates"}
              departmentOrUnit={departments.find(d => d.id === leaveDept)?.name || "All Departments"}
              generatedAt={generatedTimestamp}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div className="overflow-x-auto">
              <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-2 border-r">Employee</th>
                    <th className="px-4 py-2 border-r">Department</th>
                    <th className="px-4 py-2 border-r">Leave Type</th>
                    <th className="px-4 py-2 border-r">Start Date</th>
                    <th className="px-4 py-2 border-r">End Date</th>
                    <th className="px-4 py-2 border-r text-center">Business Days</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800 font-medium">
                  {filteredLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">No leave allocations or bookings match current scope.</td>
                    </tr>
                  ) : (
                    filteredLeaves.map(l => {
                      const emp = employees.find(e => e.employeeId === l.employeeId);
                      const dName = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "-";
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 border-r">
                            <div className="font-bold">{emp?.fullName || l.employeeId}</div>
                            <div className="text-[9px] text-slate-400">{l.employeeId}</div>
                          </td>
                          <td className="px-4 py-2 border-r text-slate-500">{dName}</td>
                          <td className="px-4 py-2 border-r text-primary-custom uppercase text-[10px] font-extrabold">{l.leaveType}</td>
                          <td className="px-4 py-2 border-r">{l.startDate}</td>
                          <td className="px-4 py-2 border-r">{l.endDate}</td>
                          <td className="px-4 py-2 border-r text-center font-bold bg-slate-50/50">{l.daysCount} days</td>
                          <td className="px-4 py-2 text-slate-500 font-bold uppercase tracking-wider text-[10px]">{l.status}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredLeaves.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                      <td className="px-4 py-2 border-r">TOTAL ({filteredLeaves.length} Records)</td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r text-center">{totalDaysLost} days</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- REPORT VIEW 3: ATTENDANCE & LATENESS SUMMARY --- */}
      {activeReportTab === "attendance" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Total Days Evaluated</span>
              <span className="text-xl font-extrabold text-slate-800">{totalDaysLogged} Days Logged</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Present Ratio</span>
              <span className="text-xl font-extrabold text-slate-800">
                {totalDaysLogged > 0 ? ((presentCount / totalDaysLogged) * 100).toFixed(0) : 0}% Present
              </span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Late Check-In Incidents</span>
              <span className="text-xl font-extrabold text-amber-600">{lateCount} Incidents</span>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-2xs">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Absent Folders</span>
              <span className="text-xl font-extrabold text-rose-600">{absentCount} Days Absent</span>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border rounded-lg p-4 shadow-2xs flex flex-wrap gap-4 no-print">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <select
                value={attDept}
                onChange={(e) => setAttDept(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="w-48 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Status</label>
              <select
                value={attStatus}
                onChange={(e) => setAttStatus(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Late">Late</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>

            <div className="w-44 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date From</label>
              <input
                type="date"
                value={attStart}
                onChange={(e) => setAttStart(e.target.value)}
                className="w-full px-3 py-1 border rounded-lg text-xs"
              />
            </div>

            <div className="w-44 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date To</label>
              <input
                type="date"
                value={attEnd}
                onChange={(e) => setAttEnd(e.target.value)}
                className="w-full px-3 py-1 border rounded-lg text-xs"
              />
            </div>
          </div>

          {/* High Fidelity Print Preview Canvas */}
          <div className="bg-white border rounded-lg p-6 sm:p-8 shadow-2xs max-w-5xl mx-auto printable-canvas">
            <CompanyReportHeader
              companyConfig={config}
              reportTitle="Attendance & Lateness Audit Report"
              reportSubtitle={`Status Scope: ${attStatus || "All Statuses"}`}
              reportingPeriod={attStart || attEnd ? `${attStart || "Start"} to ${attEnd || "Present"}` : "All Recorded Dates"}
              departmentOrUnit={departments.find(d => d.id === attDept)?.name || "All Departments"}
              generatedAt={generatedTimestamp}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div className="overflow-x-auto">
              <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-2 border-r">Date</th>
                    <th className="px-4 py-2 border-r">Employee</th>
                    <th className="px-4 py-2 border-r">Department</th>
                    <th className="px-4 py-2 border-r">Check In</th>
                    <th className="px-4 py-2 border-r">Check Out</th>
                    <th className="px-4 py-2 border-r text-center">Working Hours</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800 font-medium">
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">No attendance check-ins recorded for current filters.</td>
                    </tr>
                  ) : (
                    filteredAttendance.map(a => {
                      const emp = employees.find(e => e.employeeId === a.employeeId);
                      const dName = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "-";
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 border-r font-semibold text-slate-600">{a.date}</td>
                          <td className="px-4 py-2.5 border-r">
                            <div className="font-bold">{emp?.fullName || a.employeeId}</div>
                            <div className="text-[9px] text-slate-400">{a.employeeId}</div>
                          </td>
                          <td className="px-4 py-2.5 border-r text-slate-500">{dName}</td>
                          <td className="px-4 py-2.5 border-r font-bold">{a.checkInTime || "--:--"}</td>
                          <td className="px-4 py-2.5 border-r font-bold">{a.checkOutTime || "--:--"}</td>
                          <td className="px-4 py-2.5 border-r text-center font-bold bg-slate-50/50">{a.workingHours} hrs</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-extrabold ${
                              a.status === "Present" ? "text-emerald-700" :
                              a.status === "Late" ? "text-amber-700" : "text-rose-700"
                            }`}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredAttendance.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                      <td className="px-4 py-2 border-r">TOTAL</td>
                      <td className="px-4 py-2 border-r">{filteredAttendance.length} Entries</td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r text-center">{totalWorkingHours.toFixed(1)} hrs</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- REPORT VIEW 4: ACTIVITY AUDIT LOGS --- */}
      {activeReportTab === "audit" && canViewSub("audit") && (
        <div className="space-y-6">
          {/* Quick info banner */}
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg text-xs text-slate-600 font-medium leading-relaxed flex items-center gap-2 no-print">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>This list catalogs immutable transaction actions (Created, Updated, Deleted) performed by operators within this portal session.</span>
          </div>

          {/* Filters */}
          <div className="bg-white border rounded-lg p-4 shadow-2xs flex flex-wrap gap-4 no-print">
            <div className="w-48 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Module</label>
              <select
                value={auditModule}
                onChange={(e) => setAuditModule(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white font-semibold"
              >
                <option value="">All Modules</option>
                <option value="Employees">Employees</option>
                <option value="Departments">Departments</option>
                <option value="Attendance">Attendance</option>
                <option value="Leave">Leave</option>
                <option value="Settings">Settings</option>
                <option value="Users">Users</option>
              </select>
            </div>

            <div className="flex-1 space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Keyword</label>
              <div className="relative">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by action, details, or operator email..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 border rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* Printable Table */}
          <div className="bg-white border rounded-lg p-6 sm:p-8 shadow-2xs max-w-5xl mx-auto printable-canvas">
            <CompanyReportHeader
              companyConfig={config}
              reportTitle="Security Transaction System Audit Log"
              reportSubtitle={`Filter Scope: Module: ${auditModule || "All"} | Query: ${auditSearch || "None"}`}
              departmentOrUnit={auditModule || "All System Modules"}
              generatedAt={generatedTimestamp}
              generatedBy={currentUser?.fullName || currentUser?.email}
            />

            <div className="overflow-x-auto">
              <table className="w-full border text-left text-xs text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b font-extrabold text-[10px] text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-2 border-r">Timestamp</th>
                    <th className="px-4 py-2 border-r">Operator (User)</th>
                    <th className="px-4 py-2 border-r">Module</th>
                    <th className="px-4 py-2 border-r">Action Logged</th>
                    <th className="px-4 py-2">Operation Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800 font-medium">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400">No activity transaction records logged for current filters.</td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 border-r font-semibold text-slate-600">{log.timestamp}</td>
                        <td className="px-4 py-2 border-r text-primary-custom">{log.userEmail}</td>
                        <td className="px-4 py-2 border-r text-slate-400 font-bold uppercase text-[9px] tracking-wider">{log.module}</td>
                        <td className="px-4 py-2 border-r font-extrabold text-slate-800">{log.action}</td>
                        <td className="px-4 py-2.5 text-slate-500 leading-relaxed text-[11px] font-semibold">{log.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredAuditLogs.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900">
                      <td className="px-4 py-2 border-r">TOTAL</td>
                      <td className="px-4 py-2 border-r">{filteredAuditLogs.length} Audit Events</td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2 border-r"></td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
