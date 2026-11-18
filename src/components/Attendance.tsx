import React, { useState } from "react";
import { AttendanceRecord, Employee, Department, User, ModulePermission, CompanyConfig } from "../types";
import { getDepartmentHeadManagedDeptIds, resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../utils/rbacUtils";
import { formatReportDateTime, ReportExportPayload } from "../utils/reportBranding";
import ReportPrintButton from "./reports/ReportPrintButton";
import ReportPDFExportButton from "./reports/ReportPDFExportButton";
import { 
  Plus, Search, Edit, Clock, Calendar, Check, X, Save, 
  FileSpreadsheet, Filter, BookOpen, Trash2 
} from "lucide-react";
import { useToast, ConfirmDialog } from "./ui/ToastProvider";
import { FormFieldError, ValidationSummary, fieldInputClass } from "./ui/FormFeedback";
import { validateAttendanceForm, focusFirstInvalidField } from "../utils/validation";

interface AttendanceProps {
  attendance: AttendanceRecord[];
  employees: Employee[];
  departments: Department[];
  companyConfig?: CompanyConfig;
  currentUser: User | null;
  permissions?: ModulePermission;
  onAddAttendance: (record: AttendanceRecord) => boolean;
  onUpdateAttendance: (record: AttendanceRecord) => void;
  onDeleteAttendance?: (id: string) => boolean;
  onLogAction: (module: string, action: string, record: string, details: string) => void;
}

export default function Attendance({
  attendance,
  employees,
  departments,
  companyConfig,
  currentUser,
  permissions,
  onAddAttendance,
  onUpdateAttendance,
  onDeleteAttendance,
  onLogAction
}: AttendanceProps) {
  const canCreate = permissions ? permissions.actions.create : currentUser?.role !== "Auditor";
  const canEdit = permissions ? permissions.actions.edit : currentUser?.role !== "Auditor";
  const canDelete = permissions ? permissions.actions.delete : currentUser?.role !== "Auditor";
  const canExport = permissions ? permissions.actions.export : true;

  const isEmployeeRole = currentUser?.role === "Employee";
  const isDeptHead = currentUser?.role === "Department Head";
  const effectiveScope = isEmployeeRole ? "own" : (permissions?.dataScope || (isDeptHead ? "team" : "all"));
  const managedDeptIds = (isDeptHead || effectiveScope === "team") ? getDepartmentHeadManagedDeptIds(currentUser, departments, employees) : [];
  const ownEmp = resolveOwnEmployeeRecord(currentUser, employees);
  const myEmpId = ownEmp?.employeeId || currentUser?.employeeId;

  const isAttendanceInScope = (employeeId: string): boolean => {
    if (effectiveScope === "own") {
      return Boolean(myEmpId && employeeId === myEmpId);
    }
    if (effectiveScope === "team" && managedDeptIds.length > 0) {
      const emp = employees.find(e => e.employeeId === employeeId);
      return Boolean(emp && managedDeptIds.includes(emp.departmentId));
    }
    return true;
  };

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Modals
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  // Form Fields
  const [empIdInput, setEmpIdInput] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [checkIn, setCheckIn] = useState("08:30");
  const [checkOut, setCheckOut] = useState("17:00");
  const [status, setStatus] = useState<any>("Present");
  const [remarks, setRemarks] = useState("");

  const { showSuccess, showError } = useToast();

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState<{ rec: AttendanceRecord; empName: string } | null>(null);

  // Filtered lists
  const activeEmployees = employees.filter(e => {
    if (e.status !== "Active") return false;
    return isAttendanceInScope(e.employeeId);
  });

  const filteredAttendance = attendance.filter(rec => {
    if (!isAttendanceInScope(rec.employeeId)) return false;

    const emp = employees.find(e => e.employeeId === rec.employeeId);
    const empName = emp ? emp.fullName.toLowerCase() : "";
    
    const matchSearch = 
      empName.includes(searchTerm.toLowerCase()) || 
      rec.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchDept = filterDept ? emp?.departmentId === filterDept : true;
    const matchStatus = filterStatus ? rec.status === filterStatus : true;
    const matchDate = filterDate ? rec.date === filterDate : true;

    return matchSearch && matchDept && matchStatus && matchDate;
  });

  const resetForm = () => {
    setEmpIdInput(activeEmployees[0]?.employeeId || "");
    setAttendanceDate(new Date().toISOString().split("T")[0]);
    setCheckIn("08:30");
    setCheckOut("17:00");
    setStatus("Present");
    setRemarks("");
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});
  };

  const handleOpenRecord = () => {
    resetForm();
    setRecordModalOpen(true);
  };

  const handleOpenEdit = (rec: AttendanceRecord) => {
    if (!isAttendanceInScope(rec.employeeId)) {
      showError(UNAUTHORIZED_EMPLOYEE_RECORD_MSG);
      return;
    }
    setSelectedRecord(rec);
    setEmpIdInput(rec.employeeId);
    setAttendanceDate(rec.date);
    setCheckIn(rec.checkInTime || "08:30");
    setCheckOut(rec.checkOutTime || "17:00");
    setStatus(rec.status);
    setRemarks(rec.remarks);
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});
    setEditModalOpen(true);
  };

  // Helper: auto calculate working hours
  const calculateHours = (inTime: string, outTime: string): number => {
    if (!inTime || !outTime) return 0;
    const [inH, inM] = inTime.split(":").map(Number);
    const [outH, outM] = outTime.split(":").map(Number);
    const diffMin = (outH * 60 + outM) - (inH * 60 + inM);
    return Math.max(0, parseFloat((diffMin / 60).toFixed(1)));
  };

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});

    const workingHrs = calculateHours(checkIn, checkOut);
    const check = validateAttendanceForm(
      {
        employeeId: empIdInput,
        date: attendanceDate,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        status,
        workingHours: status === "Absent" || status === "On Leave" ? 0 : workingHrs,
      },
      attendance,
      "add"
    );

    if (!check.valid) {
      setFieldErrors(check.errors);
      setFormError(check.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(check.errors);
      return;
    }

    const empObj = employees.find(e => e.employeeId === empIdInput);
    if (!empObj) {
      setFieldErrors({ employeeId: "Selected employee record does not exist." });
      setFormError("Selected employee is invalid.");
      return;
    }

    setIsSubmitting(true);

    // Calculate Late Status: Standard check-in limit is 08:30
    let isLate: "Yes" | "No" = "No";
    if (status === "Present" && checkIn) {
      const [h, m] = checkIn.split(":").map(Number);
      if (h > 8 || (h === 8 && m > 30)) {
        isLate = "Yes";
      }
    }
    const computedStatus = isLate === "Yes" && status === "Present" ? "Late" : status;

    const newRec: AttendanceRecord = {
      id: `ATT_${Date.now()}`,
      employeeId: empIdInput,
      date: attendanceDate,
      checkInTime: computedStatus === "Absent" || computedStatus === "On Leave" ? "" : checkIn,
      checkOutTime: computedStatus === "Absent" || computedStatus === "On Leave" ? "" : checkOut,
      status: computedStatus,
      workingHours: computedStatus === "Absent" || computedStatus === "On Leave" ? 0 : workingHrs,
      lateStatus: isLate,
      remarks,
      recordedBy: currentUser?.email || "system@ethiopianre.com",
      createdDate: new Date().toISOString().replace("T", " ").substring(0, 19),
      updatedDate: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    const ok = onAddAttendance(newRec);
    if (ok) {
      setFormSuccess("Attendance logged successfully!");
      showSuccess(`Attendance logged for ${empObj.fullName} (${attendanceDate}).`);
      onLogAction(
        "Attendance",
        "Attendance Created",
        newRec.employeeId,
        `Logged ${newRec.status} status for employee ID ${newRec.employeeId} on ${newRec.date}`
      );
      setTimeout(() => {
        setIsSubmitting(false);
        setRecordModalOpen(false);
        resetForm();
      }, 700);
    } else {
      setIsSubmitting(false);
      setFormError("An attendance record already exists for this employee on the selected date.");
      showError("Could not log attendance: duplicate employee/date record.");
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !selectedRecord) return;
    setFormError("");
    setFormSuccess("");
    setFieldErrors({});

    const workingHrs = calculateHours(checkIn, checkOut);
    const check = validateAttendanceForm(
      {
        id: selectedRecord.id,
        employeeId: empIdInput,
        date: attendanceDate,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        status,
        workingHours: status === "Absent" || status === "On Leave" ? 0 : workingHrs,
      },
      attendance,
      "edit"
    );

    if (!check.valid) {
      setFieldErrors(check.errors);
      setFormError(check.summaryMessage || "Please correct the highlighted fields.");
      focusFirstInvalidField(check.errors);
      return;
    }

    setIsSubmitting(true);

    let isLate: "Yes" | "No" = "No";
    if (status === "Present" && checkIn) {
      const [h, m] = checkIn.split(":").map(Number);
      if (h > 8 || (h === 8 && m > 30)) {
        isLate = "Yes";
      }
    }
    const computedStatus = isLate === "Yes" && status === "Present" ? "Late" : status;

    const updatedRec: AttendanceRecord = {
      ...selectedRecord,
      employeeId: empIdInput,
      date: attendanceDate,
      checkInTime: computedStatus === "Absent" || computedStatus === "On Leave" ? "" : checkIn,
      checkOutTime: computedStatus === "Absent" || computedStatus === "On Leave" ? "" : checkOut,
      status: computedStatus,
      workingHours: computedStatus === "Absent" || computedStatus === "On Leave" ? 0 : workingHrs,
      lateStatus: isLate,
      remarks,
      updatedDate: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    onUpdateAttendance(updatedRec);
    setFormSuccess("Attendance record corrected and updated!");
    showSuccess("Attendance record updated successfully.");
    onLogAction(
      "Attendance",
      "Attendance Updated",
      updatedRec.employeeId,
      `Corrected attendance log for employee ID ${updatedRec.employeeId} on ${updatedRec.date}`
    );
    setTimeout(() => {
      setIsSubmitting(false);
      setEditModalOpen(false);
    }, 700);
  };

  const executeDeleteAttendance = () => {
    if (!confirmDeleteRecord || !onDeleteAttendance) return;
    const { rec, empName } = confirmDeleteRecord;
    setConfirmDeleteRecord(null);
    const ok = onDeleteAttendance(rec.id);
    if (ok) {
      showSuccess(`Attendance log for ${empName} (${rec.date}) deleted.`);
    } else {
      showError("Unable to delete attendance log. Check your role permissions.");
    }
  };

  // Printing & exporting
  const buildAttendanceReportPayload = (): ReportExportPayload => {
    const deptName = departments.find(d => d.id === filterDept)?.name || "All Departments";
    const totalHours = filteredAttendance.reduce((sum, r) => sum + (Number(r.workingHours) || 0), 0);
    const presentCount = filteredAttendance.filter(r => r.status === "Present" || r.status === "Late").length;
    const lateCount = filteredAttendance.filter(r => r.status === "Late" || r.lateStatus === "Yes").length;
    const absentCount = filteredAttendance.filter(r => r.status === "Absent").length;

    return {
      reportTitle: "Attendance Register Report",
      filePrefix: "Attendance_Report",
      reportSubtitle: `Status: ${filterStatus || "All Statuses"}${searchTerm ? ` | Search: "${searchTerm}"` : ""}`,
      reportingPeriod: filterDate ? `Date: ${filterDate}` : "All Recorded Dates",
      departmentOrUnit: deptName,
      generatedAt: formatReportDateTime(),
      generatedBy: currentUser?.fullName || currentUser?.email,
      orientation: "landscape",
      summaryMetrics: [
        { label: "Total Records", value: `${filteredAttendance.length}` },
        { label: "Present / Late", value: `${presentCount}` },
        { label: "Late Incidents", value: `${lateCount}` },
        { label: "Absent", value: `${absentCount}` }
      ],
      columns: [
        { header: "Employee ID" },
        { header: "Employee Name" },
        { header: "Department" },
        { header: "Date" },
        { header: "Check-In", align: "center" },
        { header: "Check-Out", align: "center" },
        { header: "Working Hrs", align: "right" },
        { header: "Late", align: "center" },
        { header: "Status", align: "center" }
      ],
      rows: filteredAttendance.map(r => {
        const emp = employees.find(e => e.employeeId === r.employeeId);
        const empName = emp ? emp.fullName : r.employeeId;
        const deptNameRow = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "N/A";
        return [
          r.employeeId,
          empName,
          deptNameRow,
          r.date,
          r.checkInTime || "--:--",
          r.checkOutTime || "--:--",
          `${r.workingHours} hrs`,
          r.lateStatus,
          r.status
        ];
      }),
      totalsRow: [
        "TOTAL",
        `${filteredAttendance.length} Records`,
        "",
        "",
        "",
        "",
        `${totalHours.toFixed(1)} hrs`,
        "",
        ""
      ],
      emptyMessage: "No attendance records logged for current filters."
    };
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Attendance ID,Employee ID,Employee Name,Department,Date,Status,Check In,Check Out,Working Hours,Late,Recorded By,Remarks\r\n";
    
    filteredAttendance.forEach(r => {
      const emp = employees.find(e => e.employeeId === r.employeeId);
      const empName = emp ? emp.fullName : r.employeeId;
      const deptName = emp ? (departments.find(d => d.id === emp.departmentId)?.name || emp.departmentId) : "";
      csvContent += `"${r.id}","${r.employeeId}","${empName}","${deptName}","${r.date}","${r.status}","${r.checkInTime || "-"}","${r.checkOutTime || "-"}","${r.workingHours}","${r.lateStatus}","${r.recordedBy}","${r.remarks}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ethiore_attendance_${filterDate || "all"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Attendance Register</h2>
          <p className="text-xs text-slate-500 mt-1">Directly log or correct daily presence, lates, and absences.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canExport && (
            <>
              <ReportPrintButton
                printData={buildAttendanceReportPayload}
                companyConfig={companyConfig}
                id="btn-print-attendance"
              />
              <ReportPDFExportButton
                reportData={buildAttendanceReportPayload}
                companyConfig={companyConfig}
                id="btn-pdf-attendance"
              />
              <button
                onClick={handleExportCSV}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-all"
                id="btn-export-attendance"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            </>
          )}
          {canCreate && (
            <button
              onClick={handleOpenRecord}
              className="flex-2 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-1.5 bg-primary-custom hover:opacity-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all animate-pulse"
              id="btn-record-attendance-trigger"
            >
              <Plus className="h-4 w-4" />
              <span>Record Attendance</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Employee ID, Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-xs ring-primary-custom"
            />
          </div>
          
          {/* Department Filter */}
          <div className="w-full md:w-48">
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full md:w-40">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom"
            >
              <option value="">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="On Leave">On Leave</option>
              <option value="Half Day">Half Day</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="w-full md:w-44 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full px-3 py-1.5 border rounded-lg text-xs ring-primary-custom bg-white font-semibold"
            />
          </div>
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Department</th>
                <th className="px-6 py-3">Log Date</th>
                <th className="px-6 py-3">Check-In</th>
                <th className="px-6 py-3">Check-Out</th>
                <th className="px-6 py-3 text-center">Working Hours</th>
                <th className="px-6 py-3 text-center">Late Flag</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3">Remarks</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 font-medium">
                    No attendance records logged for current filters. Click &quot;Record Attendance&quot; above to log check-ins.
                  </td>
                </tr>
              ) : (
                filteredAttendance.map(rec => {
                  const empObj = employees.find(e => e.employeeId === rec.employeeId);
                  const empName = empObj ? empObj.fullName : rec.employeeId;
                  const deptObj = empObj ? departments.find(d => d.id === empObj.departmentId) : null;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-800">{empName}</div>
                        <div className="text-[10px] font-bold text-primary-custom">{rec.employeeId}</div>
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-500">{deptObj ? deptObj.name : "N/A"}</td>
                      <td className="px-6 py-3.5 font-semibold text-slate-600">{rec.date}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{rec.checkInTime || "--:--"}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{rec.checkOutTime || "--:--"}</td>
                      <td className="px-6 py-3.5 text-center font-bold text-slate-700">{rec.workingHours} hrs</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold ${
                          rec.lateStatus === "Yes" 
                            ? "bg-amber-100 text-amber-800" 
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {rec.lateStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          rec.status === "Present" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          rec.status === "Late" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                          rec.status === "On Leave" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                          rec.status === "Absent" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                          "bg-slate-100 text-slate-700 border"
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 font-medium max-w-[150px] truncate" title={rec.remarks}>
                        {rec.remarks || "-"}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {canEdit && (
                          <button
                            onClick={() => handleOpenEdit(rec)}
                            className="p-1 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-md transition-colors"
                            title="Correct Entry"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDeleteRecord({ rec, empName })}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete Log"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD ATTENDANCE MODAL */}
      {recordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">Log Employee Presence</h3>
              <button onClick={() => setRecordModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} noValidate className="p-5 space-y-4">
              {(formError || Object.keys(fieldErrors).length > 0) && (
                <ValidationSummary errors={fieldErrors} message={formError} />
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                  {formSuccess}
                </div>
              )}

              {/* Employee selection dropdown */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Select Employee <span className="text-rose-500">*</span></label>
                <select
                  data-field="employeeId"
                  value={empIdInput}
                  onChange={(e) => {
                    setEmpIdInput(e.target.value);
                    if (fieldErrors.employeeId) setFieldErrors(p => ({ ...p, employeeId: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.employeeId), "w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-semibold text-slate-800")}
                >
                  <option value="">Choose active employee</option>
                  {activeEmployees.map(emp => {
                    const deptObj = departments.find(d => d.id === emp.departmentId);
                    return (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} ({emp.employeeId} • {deptObj ? deptObj.name : emp.departmentId})
                      </option>
                    );
                  })}
                </select>
                <FormFieldError error={fieldErrors.employeeId} />
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Attendance Date <span className="text-rose-500">*</span></label>
                <input
                  data-field="date"
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => {
                    setAttendanceDate(e.target.value);
                    if (fieldErrors.date) setFieldErrors(p => ({ ...p, date: "" }));
                  }}
                  className={fieldInputClass(Boolean(fieldErrors.date), "w-full px-3 py-2 border rounded-lg text-xs font-bold ring-primary-custom")}
                />
                <FormFieldError error={fieldErrors.date} />
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Attendance Status <span className="text-rose-500">*</span></label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setFieldErrors(p => ({ ...p, checkInTime: "", checkOutTime: "" }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold"
                >
                  <option value="Present">Present (Checked In)</option>
                  <option value="Absent">Absent</option>
                  <option value="Late">Late Entry</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Check in / Check out timers */}
              {status !== "Absent" && status !== "On Leave" && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Check-In Time</label>
                    <input
                      data-field="checkInTime"
                      type="time"
                      value={checkIn}
                      onChange={(e) => {
                        setCheckIn(e.target.value);
                        if (fieldErrors.checkInTime || fieldErrors.checkOutTime) {
                          setFieldErrors(p => ({ ...p, checkInTime: "", checkOutTime: "" }));
                        }
                      }}
                      className={fieldInputClass(Boolean(fieldErrors.checkInTime), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom font-bold")}
                    />
                    <FormFieldError error={fieldErrors.checkInTime} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Check-Out Time</label>
                    <input
                      data-field="checkOutTime"
                      type="time"
                      value={checkOut}
                      onChange={(e) => {
                        setCheckOut(e.target.value);
                        if (fieldErrors.checkOutTime) setFieldErrors(p => ({ ...p, checkOutTime: "" }));
                      }}
                      className={fieldInputClass(Boolean(fieldErrors.checkOutTime), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom font-bold")}
                    />
                    <FormFieldError error={fieldErrors.checkOutTime} />
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Remarks / Corrections</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Late entry due to CMC road construction."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRecordModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  {isSubmitting ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CORRECT ATTENDANCE MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-primary-custom text-white px-5 py-3.5 border-b flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">Correct Attendance Entry</h3>
              <button onClick={() => setEditModalOpen(false)} className="text-white/80 hover:text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} noValidate className="p-5 space-y-4">
              {(formError || Object.keys(fieldErrors).length > 0) && (
                <ValidationSummary errors={fieldErrors} message={formError} />
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold">
                  {formSuccess}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Employee *</label>
                <select
                  value={empIdInput}
                  onChange={(e) => setEmpIdInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-slate-100 font-semibold text-slate-800 cursor-not-allowed"
                  disabled
                >
                  {employees.map(emp => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Attendance Date *</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-bold ring-primary-custom bg-slate-100 cursor-not-allowed"
                  disabled
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Status *</label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setFieldErrors(p => ({ ...p, checkInTime: "", checkOutTime: "" }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white ring-primary-custom font-bold"
                >
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Late">Late</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {status !== "Absent" && status !== "On Leave" && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Check-In Time</label>
                    <input
                      data-field="checkInTime"
                      type="time"
                      value={checkIn}
                      onChange={(e) => {
                        setCheckIn(e.target.value);
                        if (fieldErrors.checkInTime || fieldErrors.checkOutTime) {
                          setFieldErrors(p => ({ ...p, checkInTime: "", checkOutTime: "" }));
                        }
                      }}
                      className={fieldInputClass(Boolean(fieldErrors.checkInTime), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom font-bold")}
                    />
                    <FormFieldError error={fieldErrors.checkInTime} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Check-Out Time</label>
                    <input
                      data-field="checkOutTime"
                      type="time"
                      value={checkOut}
                      onChange={(e) => {
                        setCheckOut(e.target.value);
                        if (fieldErrors.checkOutTime) setFieldErrors(p => ({ ...p, checkOutTime: "" }));
                      }}
                      className={fieldInputClass(Boolean(fieldErrors.checkOutTime), "w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom font-bold")}
                    />
                    <FormFieldError error={fieldErrors.checkOutTime} />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Remarks / Corrections</label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs ring-primary-custom"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-primary-custom hover:opacity-95 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 text-accent-custom" />
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDeleteRecord)}
        title="Delete Attendance Record"
        message={
          confirmDeleteRecord ? (
            <>
              Are you sure you want to delete this attendance log for <strong>{confirmDeleteRecord.empName}</strong> on <strong>{confirmDeleteRecord.rec.date}</strong>?
            </>
          ) : null
        }
        confirmText="Delete Record"
        variant="danger"
        onConfirm={executeDeleteAttendance}
        onCancel={() => setConfirmDeleteRecord(null)}
      />
    </div>
  );
}
