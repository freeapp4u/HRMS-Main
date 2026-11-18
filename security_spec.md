# ETRHRMS ESS & RBAC Firestore Security Specification

## 1. Data & Access Invariants
1. **Identity & Email Verification**: All workspace reads and writes require `request.auth != null` and `request.auth.token.email_verified == true` (except initial registration `users/{uid}` create for self with `role == "Employee"`).
2. **Anti-Privilege Escalation**: A non-Admin user can never modify `role`, `status`, `employeeId`, or `permissionOverrides` on their own `/users/{uid}` document.
3. **Employee Self-Service Ownership**: An `Employee` can only read `employees`, `attendance`, `leaves`, `payslips`, `payroll_records`, `employee_salary_structures`, `family_members`, `medical_expenses`, `hr_requests`, and `drive_associations` matching their own server-verified `employeeId` (`getUserData().employeeId`). Cross-employee queries return `PERMISSION_DENIED`.
4. **Read-Only Employee Payroll & Employment Master**: Employees cannot create, update, or delete `employees`, `attendance`, `payslips`, `payroll_records`, `employee_salary_structures`, `departments`, `roles`, `role_permissions`, `config`, or `drive_associations`.
5. **Bounded ESS State Transitions**:
   - Employees may create `leaves` only for themselves with `status == "Active"`, and update only their own `Active` leave to `Cancelled` (`affectedKeys().hasOnly(['status', 'updatedDate'])`).
   - Employees may create `hr_requests` only for themselves with `status == "Pending"`, and update only their own `Pending` request to `Cancelled` (`affectedKeys().hasOnly(['status', 'updatedDate'])`).
   - Employees may update `notifications` only on `['isRead', 'readByUserIds']` for announcements or notifications addressed to them.
6. **Admin/Audit Separation**: Employees cannot read `logs`, `email_logs`, `payroll_approvals`, `payroll_import_logs`, or `payslip_distribution_logs`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Employee (`EMP001`) updating own `/users/{uid}` with `{ "role": "Administrator" }`.
2. Employee (`EMP001`) updating own `/users/{uid}` with `{ "employeeId": "EMP002" }`.
3. Employee (`EMP001`) updating own `/users/{uid}` with `{ "permissionOverrides": { "settings": { "enabled": true } } }`.
4. Employee (`EMP001`) reading `/employees/EMP002` or `/payslips/PS_EMP002`.
5. Employee (`EMP001`) creating `/hr_requests/REQ999` with `{ "employeeId": "EMP002", "status": "Approved" }`.
6. Employee (`EMP001`) approving own `/hr_requests/REQ100` (`{ "status": "Approved", "reviewedBy": "emp1@ethiopianre.com" }`).
7. Employee (`EMP001`) reading `/logs/LOG001` or `/users` collection list.
8. Employee (`EMP001`) modifying `/attendance/ATT_001` directly instead of submitting an HR correction request.
9. Employee (`EMP001`) creating `/notifications/N1` with `{ "category": "announcement" }`.
10. Employee (`EMP001`) reading `/drive_associations/DOC_DEPT_01` where `targetType == "Department"` or `targetId == "EMP002"`.
11. Employee (`EMP001`) submitting shadow field `{ "isRead": true, "title": "Tampered" }` on `/notifications/N1`.
12. Unverified account (`email_verified: false`) reading `/employees`, `/leaves`, or `/hr_requests`.
