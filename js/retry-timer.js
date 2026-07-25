export function clearRetryTimer(timer, clear = clearTimeout) {
  if (timer !== null) clear(timer);
  return null;
}
