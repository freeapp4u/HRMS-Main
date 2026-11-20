import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  Payslip,
  PayrollRecord,
  EmployeeSalaryStructure,
  TaxConfiguration,
  CompanyConfig,
  ModulePermission,
} from "../../types";
import { DollarSign, FileText, TrendingUp, Percent, Download, Lock, AlertCircle, Eye } from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";
import ReportPrintButton from "../reports/ReportPrintButton";
import ReportPDFExportButton from "../reports/ReportPDFExportButton";
import { formatReportDateTime, getCompanyLogoUrl, ReportExportPayload } from "../../utils/reportBranding";

interface MyPayrollViewProps {
  currentUser: User | null;
  employees: Employee[];
  payslips: Payslip[];
  payrollRecords: PayrollRecord[];
  salaryStructures: EmployeeSalaryStructure[];
  taxConfig: TaxConfiguration;
  companyConfig: CompanyConfig;
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
}

const SUBTABS = [
  { id: "payslips", label: "My Payslips", icon: FileText },
  { id: "salary_history", label: "Salary History", icon: TrendingUp },
  { id: "tax_deductions", label: "Tax and Deductions", icon: Percent },
  { id: "download_payslip", label: "Download Payslip", icon: Download },
];

export default function MyPayrollView({
  currentUser,
  employees,
  payslips,
  payrollRecords,
  salaryStructures,
  taxConfig,
  companyConfig,
  permissions,
  initialSubTab,
  requestedEmployeeId,
}: MyPayrollViewProps) {
  const canExport = permissions ? permissions.actions.export : true;

  const myEmployee = useMemo(
    () => resolveOwnEmployeeRecord(currentUser, employees),
    [currentUser, employees]
  );

  const isUnauthorizedTarget = Boolean(
    requestedEmployeeId && (!myEmployee || requestedEmployeeId !== myEmployee.employeeId)
  );

  const visibleTabs = SUBTABS.filter((t) => !permissions || permissions.submenus[t.id] !== false);
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) return initialSubTab;
    return visibleTabs[0]?.id || "payslips";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const myPayslips = useMemo(() => {
    if (!myEmployee) return [];
    return payslips
      .filter((p) => p.employeeId === myEmployee.employeeId)
      .sort((a, b) => (b.paymentDate || b.generatedDate).localeCompare(a.paymentDate || a.generatedDate));
  }, [payslips, myEmployee]);

  const myPayrollRecords = useMemo(() => {
    if (!myEmployee) return [];
    return payrollRecords
      .filter((r) => !r.isDeleted && r.employeeId === myEmployee.employeeId)
      .sort((a, b) => (b.calculatedDate || "").localeCompare(a.calculatedDate || ""));
  }, [payrollRecords, myEmployee]);

  const myStructure = useMemo(
    () => (myEmployee ? salaryStructures.find((s) => s.employeeId === myEmployee.employeeId) : undefined),
    [salaryStructures, myEmployee]
  );

  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(myPayslips[0] || null);

  useEffect(() => {
    if (!selectedPayslip && myPayslips.length > 0) {
      setSelectedPayslip(myPayslips[0]);
    }
  }, [myPayslips, selectedPayslip]);

  if (isUnauthorizedTarget) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 flex items-start gap-3 text-rose-800">
        <Lock className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-black">Access Restricted</h2>
          <p className="text-xs font-semibold mt-1">{UNAUTHORIZED_EMPLOYEE_RECORD_MSG}</p>
        </div>
      </div>
    );
  }

  if (!myEmployee) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
        <h2 className="text-sm font-bold text-slate-800">Payroll Self-Service Unavailable</h2>
        <p className="text-xs text-slate-500">Your account is not linked to an active Employee Master record.</p>
      </div>
    );
  }

  const fmt = (n: number) => `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

  const buildPayslipPayload = (ps: Payslip): ReportExportPayload => ({
    reportTitle: `Official Employee Payslip — ${ps.payrollPeriodName}`,
    reportSubtitle: `Ref: ${ps.payslipRefNo} • Employee ID: ${ps.employeeId}`,
    reportingPeriod: ps.payrollPeriodName,
    departmentOrUnit: ps.department,
    filePrefix: `Payslip_${ps.employeeId}_${ps.payrollPeriodName.replace(/\s+/g, "_")}`,
    generatedAt: formatReportDateTime(),
    generatedBy: currentUser?.fullName || ps.employeeName,
    orientation: "portrait",
    columns: [
      { header: "Component", align: "left" },
      { header: "Amount (ETB)", align: "right" },
    ],
    rows: [
      ...ps.earningsBreakdown.map((e) => [`Earning: ${e.name}`, fmt(e.amount)]),
      ...ps.deductionsBreakdown.map((d) => [`Deduction: ${d.name}`, `(${fmt(d.amount)})`]),
    ],
    payslipData: {
      employeeName: ps.employeeName,
      employeeId: ps.employeeId,
      position: ps.position,
      department: ps.department,
      periodName: ps.payrollPeriodName,
      paymentDate: ps.paymentDate,
      refNo: ps.payslipRefNo,
      earnings: ps.earningsBreakdown,
      deductions: ps.deductionsBreakdown,
      grossSalary: ps.grossSalary,
      totalDeductions: ps.totalDeductions,
      netSalary: ps.netSalary,
      employerPension: ps.employerPension,
      currency: "ETB",
    },
  });

  const latestPayroll = myPayrollRecords[0];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">My Payroll</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Strictly read-only access to your personal payslips, salary progression, and statutory tax &amp; pension deductions.
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-primary-custom" />
          Read-Only Personal Payroll
        </span>
      </div>

      {/* Submenu Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                active ? "bg-primary-custom text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. My Payslips */}
      {activeSubTab === "payslips" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Issued Payslips ({myPayslips.length})
            </h2>
            {myPayslips.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No payslips have been issued for your Employee ID yet.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {myPayslips.map((ps) => {
                  const active = selectedPayslip?.id === ps.id;
                  return (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => setSelectedPayslip(ps)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        active ? "bg-primary-custom text-white border-primary-custom shadow-sm" : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-extrabold">{ps.payrollPeriodName}</p>
                        <p className={`text-[10px] ${active ? "text-white/80" : "text-slate-500"}`}>
                          Pay Date: {ps.paymentDate} • Ref: {ps.payslipRefNo}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black">{fmt(ps.netSalary)}</p>
                        <span className={`text-[10px] font-semibold inline-flex items-center gap-1 ${active ? "text-accent-custom" : "text-primary-custom"}`}>
                          <Eye className="h-3 w-3" /> View
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
            {selectedPayslip ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={getCompanyLogoUrl(companyConfig)}
                      alt="Ethiopian Reinsurance S.C. Logo"
                      className="h-11 w-auto max-w-[90px] object-contain rounded shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800">
                        Payslip Detail — {selectedPayslip.payrollPeriodName}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {selectedPayslip.employeeName} ({selectedPayslip.employeeId}) • {selectedPayslip.position}
                      </p>
                    </div>
                  </div>
                  {canExport && (
                    <div className="flex items-center gap-2">
                      <ReportPrintButton
                        printData={() => buildPayslipPayload(selectedPayslip)}
                        companyConfig={companyConfig}
                        orientation="portrait"
                        label="Print"
                      />
                      <ReportPDFExportButton
                        reportData={() => buildPayslipPayload(selectedPayslip)}
                        companyConfig={companyConfig}
                        orientation="portrait"
                        label="Export PDF"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200 space-y-2">
                    <h4 className="font-black uppercase text-[10px] text-emerald-700">Earnings Breakdown</h4>
                    {selectedPayslip.earningsBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-slate-600">{item.name}</span>
                        <span className="font-bold text-slate-800">{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-emerald-200 flex justify-between font-black text-emerald-800">
                      <span>Gross Salary</span>
                      <span>{fmt(selectedPayslip.grossSalary)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-50/40 border border-rose-200 space-y-2">
                    <h4 className="font-black uppercase text-[10px] text-rose-700">Deductions Breakdown</h4>
                    {selectedPayslip.deductionsBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-slate-600">{item.name}</span>
                        <span className="font-bold text-slate-800">{fmt(item.amount)}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-rose-200 flex justify-between font-black text-rose-800">
                      <span>Total Deductions</span>
                      <span>{fmt(selectedPayslip.totalDeductions)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-primary-custom text-white flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/75">Net Take-Home Pay</span>
                    <p className="text-xs text-white/80">Employer Pension Contribution (11%): {fmt(selectedPayslip.employerPension)}</p>
                  </div>
                  <span className="text-xl font-black text-accent-custom">{fmt(selectedPayslip.netSalary)}</span>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">Select a payslip from the list to preview earnings and deductions.</div>
            )}
          </div>
        </div>
      )}

      {/* 2. Salary History */}
      {activeSubTab === "salary_history" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Salary History &amp; Compensation Structure</h2>
          {myStructure ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400">Basic Salary</span>
                <p className="font-black text-slate-800 mt-1">{fmt(myStructure.basicSalary)}</p>
              </div>
              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400">Position Allowance</span>
                <p className="font-bold text-slate-800 mt-1">{fmt(myStructure.positionAllowance)}</p>
              </div>
              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400">Transport Allowance</span>
                <p className="font-bold text-slate-800 mt-1">{fmt(myStructure.transportAllowance)}</p>
              </div>
              <div className="p-3 bg-slate-50 border rounded-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400">Effective Date</span>
                <p className="font-bold text-primary-custom mt-1">{myStructure.effectiveDate}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No active salary structure record found.</p>
          )}

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500">
                  <th className="px-4 py-2.5">Payroll Period</th>
                  <th className="px-4 py-2.5 text-right">Basic Salary</th>
                  <th className="px-4 py-2.5 text-right">Gross Salary</th>
                  <th className="px-4 py-2.5 text-right">Total Deductions</th>
                  <th className="px-4 py-2.5 text-right">Net Pay</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myPayrollRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">No historical payroll runs found.</td>
                  </tr>
                ) : (
                  myPayrollRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-800">{rec.payrollPeriodName}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(rec.basicSalary)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmt(rec.grossSalary)}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{fmt(rec.totalDeductions)}</td>
                      <td className="px-4 py-2.5 text-right font-black text-emerald-700">{fmt(rec.netSalary)}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{rec.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Tax and Deductions */}
      {activeSubTab === "tax_deductions" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Tax and Statutory Deductions</h2>
          {latestPayroll ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border">
                <span className="text-[10px] font-bold uppercase text-slate-400">Taxable Earnings</span>
                <p className="text-base font-black text-slate-800 mt-1">{fmt(latestPayroll.taxableEarnings)}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border">
                <span className="text-[10px] font-bold uppercase text-slate-400">Income Tax (PAYE)</span>
                <p className="text-base font-black text-rose-700 mt-1">{fmt(latestPayroll.incomeTax)}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border">
                <span className="text-[10px] font-bold uppercase text-slate-400">Employee Pension ({Math.round(taxConfig.employeePensionRate * 100)}%)</span>
                <p className="text-base font-black text-rose-700 mt-1">{fmt(latestPayroll.employeePension)}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border">
                <span className="text-[10px] font-bold uppercase text-slate-400">Employer Pension ({Math.round(taxConfig.employerPensionRate * 100)}%)</span>
                <p className="text-base font-black text-emerald-700 mt-1">{fmt(latestPayroll.employerPension)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No processed payroll tax data available yet.</p>
          )}
        </div>
      )}

      {/* 4. Download Payslip */}
      {activeSubTab === "download_payslip" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-800">Download Official Payslips</h2>
          {myPayslips.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No payslips available for download.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {myPayslips.map((ps) => (
                <div key={ps.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">{ps.payrollPeriodName} — Net: {fmt(ps.netSalary)}</p>
                    <p className="text-[11px] text-slate-500">Ref: {ps.payslipRefNo} • Payment Date: {ps.paymentDate}</p>
                  </div>
                  {canExport && (
                    <div className="flex items-center gap-2">
                      <ReportPrintButton
                        printData={() => buildPayslipPayload(ps)}
                        companyConfig={companyConfig}
                        orientation="portrait"
                        label="Print"
                      />
                      <ReportPDFExportButton
                        reportData={() => buildPayslipPayload(ps)}
                        companyConfig={companyConfig}
                        orientation="portrait"
                        label="Download PDF"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
