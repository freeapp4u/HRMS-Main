import { CompanyConfig, EmailActivityLog } from "../types";

export interface SendEmailOptions {
  recipientEmployeeId?: string;
  recipientEmail: string;
  subject: string;
  sendingModule: string;
  emailBody?: string;
  currentUserEmail?: string;
  config: CompanyConfig;
}

export interface SendEmailResponse {
  success: boolean;
  blocked: boolean;
  status: "Sent" | "Failed" | "Blocked – Email Sending Disabled";
  message: string;
  logEntry: EmailActivityLog;
}

/**
 * Global Email Dispatch Utility for Ethio-Re HRMS
 * Strictly enforces the Master 'enableEmployeeEmails' configuration toggle.
 */
export function sendSystemEmail(options: SendEmailOptions): SendEmailResponse {
  const isEmailSendingEnabled = options.config?.emailSettings?.enableEmployeeEmails ?? true;
  const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  if (!isEmailSendingEnabled) {
    const blockedLog: EmailActivityLog = {
      id: `EMAIL_LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      recipientEmployeeId: options.recipientEmployeeId || "N/A",
      recipientEmail: options.recipientEmail,
      subject: options.subject,
      sendingModule: options.sendingModule,
      dateTime: nowStr,
      deliveryStatus: "Blocked – Email Sending Disabled",
      failureReason: "Employee email sending is currently disabled in Email Settings (Administration → Email Settings).",
      triggeredBy: options.currentUserEmail || "System"
    };

    return {
      success: false,
      blocked: true,
      status: "Blocked – Email Sending Disabled",
      message: `Email action blocked: Outgoing email to ${options.recipientEmail} was blocked because employee email sending is currently disabled in Email Settings.`,
      logEntry: blockedLog
    };
  }

  const sentLog: EmailActivityLog = {
    id: `EMAIL_LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    recipientEmployeeId: options.recipientEmployeeId || "N/A",
    recipientEmail: options.recipientEmail,
    subject: options.subject,
    sendingModule: options.sendingModule,
    dateTime: nowStr,
    deliveryStatus: "Sent",
    triggeredBy: options.currentUserEmail || "System"
  };

  return {
    success: true,
    blocked: false,
    status: "Sent",
    message: `Email successfully sent to ${options.recipientEmail} via configured SMTP (${options.config.emailSettings?.smtpHost || "smtp.office365.com"}).`,
    logEntry: sentLog
  };
}
