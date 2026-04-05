export type PendingClientMessage = {
  type: string;
  payload: Record<string, unknown>;
};

export function pendingMessageCoalescingKey(message: PendingClientMessage): string | null;
export function appendPendingClientMessage(queue: PendingClientMessage[], message: PendingClientMessage): PendingClientMessage[];
