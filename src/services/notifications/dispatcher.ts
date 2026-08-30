export interface NewDealNotification {
  monitorId: string;
  monitorName: string;
  itemId: string;
  title: string;
  price: number;
  currency: string;
  buyingFormat: string;
  itemUrl: string;
  endsAt?: Date | null;
}

export interface NotificationDispatcher {
  notifyNewDeal(payload: NewDealNotification): Promise<void>;
}

export const consoleNotificationDispatcher: NotificationDispatcher = {
  async notifyNewDeal(payload) {
    const end = payload.endsAt ? ` ends=${payload.endsAt.toISOString()}` : "";
    console.log(
      `[notify] ${payload.monitorName}: ${payload.title} — ${payload.price} ${payload.currency} (${payload.buyingFormat})${end} ${payload.itemUrl}`,
    );
  },
};

let dispatcher: NotificationDispatcher = consoleNotificationDispatcher;

export function setNotificationDispatcher(next: NotificationDispatcher): void {
  dispatcher = next;
}

export async function dispatchNewDeal(payload: NewDealNotification): Promise<void> {
  await dispatcher.notifyNewDeal(payload);
}
