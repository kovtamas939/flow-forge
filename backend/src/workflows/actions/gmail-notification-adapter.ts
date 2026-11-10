import nodemailer from "nodemailer";
import {
  NotificationDeliveryError,
  type NotificationAdapter,
} from "./notification-adapter.js";

const NOTIFICATION_SUBJECT = "FlowForge notification";
const SMTP_TIMEOUT_MILLISECONDS = 10_000;

type GmailNotificationConfig = {
  user: string;
  appPassword: string;
};

type SmtpErrorShape = {
  responseCode?: unknown;
};

function isTemporarySmtpRejection(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const responseCode = (error as SmtpErrorShape).responseCode;

  return (
    typeof responseCode === "number" &&
    responseCode >= 400 &&
    responseCode < 500
  );
}

export function createGmailNotificationAdapter(
  config: GmailNotificationConfig,
): NotificationAdapter {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.user,
      pass: config.appPassword,
    },
    connectionTimeout: SMTP_TIMEOUT_MILLISECONDS,
    greetingTimeout: SMTP_TIMEOUT_MILLISECONDS,
    socketTimeout: SMTP_TIMEOUT_MILLISECONDS,
  });

  return {
    async deliver(notification) {
      try {
        await transporter.sendMail({
          from: config.user,
          to: notification.recipient,
          subject: NOTIFICATION_SUBJECT,
          text: notification.message,
        });
      } catch (error: unknown) {
        throw new NotificationDeliveryError(
          isTemporarySmtpRejection(error),
        );
      }
    },
  };
}