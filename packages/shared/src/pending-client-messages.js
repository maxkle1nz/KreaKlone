export function pendingMessageCoalescingKey(message) {
  switch (message?.type) {
    case 'preview.request':
      return 'preview.request';
    case 'canvas.event':
      return message.payload?.event && typeof message.payload.event === 'object' && message.payload.event.type === 'prompt.update'
        ? 'canvas.event:prompt.update'
        : null;
    case 'timeline.seek':
      return 'timeline.seek';
    case 'timeline.play':
    case 'timeline.pause':
      return 'timeline.playback';
    case 'timeline.loop.set':
    case 'timeline.loop.clear':
      return 'timeline.loop';
    case 'timeline.capacity.set':
      return 'timeline.capacity.set';
    default:
      return null;
  }
}

export function appendPendingClientMessage(queue, message) {
  const coalescingKey = pendingMessageCoalescingKey(message);
  if (!coalescingKey) {
    return [...queue, message];
  }

  return [
    ...queue.filter((entry) => pendingMessageCoalescingKey(entry) !== coalescingKey),
    message
  ];
}

export function replacePendingClientMessages(message) {
  return [message];
}
