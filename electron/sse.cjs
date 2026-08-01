const SSE_FIELD_RE = /^(data|event|id|retry):\s*(.*)$/i;

function parseSseFieldLine(rawLine) {
  const match = String(rawLine).trim().match(SSE_FIELD_RE);
  if (!match) return null;
  return { field: match[1].toLowerCase(), value: match[2] };
}

function isStreamDone(field) {
  return (field?.field === 'data' && field.value === '[DONE]') ||
    (field?.field === 'event' && field.value.trim().toLowerCase() === 'done');
}

module.exports = { parseSseFieldLine, isStreamDone };
