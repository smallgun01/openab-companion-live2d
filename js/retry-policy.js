export function retryExhaustedMessage(retryCount) {
  return `⚠️ Server busy — retried ${retryCount} times and still failed. Please try again later.`;
}
