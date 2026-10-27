export type NotificationDelivery = {
  executionId: string;
  stepId: string;
  recipient: string;
  message: string;
};

export interface NotificationAdapter {
  deliver(notification: NotificationDelivery): Promise<void>;
}

export class NotificationProviderNotConfiguredError extends Error {
  public readonly code = "NOTIFICATION_PROVIDER_NOT_CONFIGURED";

  public constructor() {
    super("No notification provider is configured");
    this.name = "NotificationProviderNotConfiguredError";
  }
}

export function createUnconfiguredNotificationAdapter(): NotificationAdapter {
  return {
    async deliver() {
      throw new NotificationProviderNotConfiguredError();
    },
  };
}