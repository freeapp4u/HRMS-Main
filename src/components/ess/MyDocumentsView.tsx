import React, { useState, useMemo, useEffect } from "react";
import {
  User,
  Employee,
  DriveAssociation,
  ESSDocumentCategory,
  ModulePermission,
} from "../../types";
import { FileText, Award, ArrowRightLeft, FolderOpen, ExternalLink, Lock, AlertCircle, Download } from "lucide-react";
import { resolveOwnEmployeeRecord, UNAUTHORIZED_EMPLOYEE_RECORD_MSG } from "../../utils/rbacUtils";

interface MyDocumentsViewProps {
  currentUser: User | null;
  employees: Employee[];
  driveAssociations: DriveAssociation[];
  permissions?: ModulePermission;
  initialSubTab?: string;
  requestedEmployeeId?: string | null;
}

const SUBTABS: { id: string; label: string; category: ESSDocumentCategory; icon: any }[] = [
  { id: "employment_contract", label: "Employment Contract", category: "Employment Contract", icon: FileText },
  { id: "appointment_letter", label: "Appointment Letter", category: "Appointment Letter", icon: Award },
  { id: "promotion_transfer", label: "Promotion and Transfer Letters", category: "Promotion & Transfer Letter", icon: ArrowRightLeft },
  { id: "other_hr", label: "Other Personal HR Documents", category: "Other Personal HR Document", icon: FolderOpen },
];

export default function MyDocumentsView({
  currentUser,
  employees,
  driveAssociations,
  permissions,
  initialSubTab,
  requestedEmployeeId,
}: MyDocumentsViewProps) {
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
    return visibleTabs[0]?.id || "employment_contract";
  });

  useEffect(() => {
    if (initialSubTab && visibleTabs.some((t) => t.id === initialSubTab)) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const myDocuments = useMemo(() => {
    if (!myEmployee) return [];
    return driveAssociations.filter(
      (d) => d.targetType === "Employee" && d.targetId === myEmployee.employeeId
    );
  }, [driveAssociations, myEmployee]);

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
        <h2 className="text-sm font-bold text-slate-800">Personal Documents Unavailable</h2>
        <p className="text-xs text-slate-500">Your account is not linked to an active Employee Master record.</p>
      </div>
    );
  }

  const activeCategory = SUBTABS.find((t) => t.id === activeSubTab)?.category || "Employment Contract";
  const categoryDocs = myDocuments.filter((doc) => {
    const cat = doc.documentCategory || "Other Personal HR Document";
    return cat === activeCategory;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">My Documents</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Securely access personal HR documents assigned to {myEmployee.fullName} ({myEmployee.employeeId}).
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-primary-custom" />
          Personal Vault ({myDocuments.length} Total)
        </span>
      </div>

      {/* Submenu Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          const count = myDocuments.filter(
            (d) => (d.documentCategory || "Other Personal HR Document") === tab.category
          ).length;
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
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                  active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
        <h2 className="text-sm font-extrabold text-slate-800">{activeCategory}</h2>

        {categoryDocs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-1">
            <FileText className="h-10 w-10 mx-auto text-slate-300 stroke-1" />
            <p className="font-semibold">No documents found under "{activeCategory}".</p>
            <p className="text-[11px]">Documents uploaded and linked to your Employee ID by Human Resources will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categoryDocs.map((docItem) => (
              <div key={docItem.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-primary-custom shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{docItem.fileName}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Category: {docItem.documentCategory || "Other Personal HR Document"} • Issued Date: {docItem.associatedDate}
                    </p>
                  </div>
                </div>
                {canExport && docItem.webViewLink && (
                  <a
                    href={docItem.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-primary-custom rounded-lg text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-center"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Open / Download
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
