/**
 * chat.js — Send messages to OpenAB via SSE fetch + ReadableStream.
 *
 *   sendMessage({ text, endpoint, token, onChunk, onDone, onError, signal })
 */

// SSE field-line parser: matches data:, event:, id:, retry: prefixes
const SSE_FIELD_RE = /^(data|event|id|retry):\s*(.*)$/i;

export function parseSseDataLine(line) {
  const match = line.trim().match(SSE_FIELD_RE);
  if (!match || match[1].toLowerCase() !== 'data' || match[2] === '[DONE]') return '';
  try { return JSON.parse(match[2])?.choices?.[0]?.delta?.content || ''; } catch { return ''; }
}

/**
 * Send a chat message to OpenAB and stream the response.
 *
 * @param {Object} opts
 * @param {string} opts.text           — user message
 * @param {string} opts.endpoint       — full URL, e.g. http://localhost:8080/v1/chat/completions
 * @param {string} opts.token          — Bearer token (can be '')
 * @param {(content:string)=>void} opts.onChunk — called with each delta text chunk
 * @param {(fullText:string)=>void} opts.onDone — called when stream completes
 * @param {(code:number, message:string)=>void} opts.onError
 * @param {AbortSignal} [opts.signal]  — optional AbortController signal
 */
export async function sendMessage({ text, endpoint, token, onChunk, onDone, onError, signal }) {
  if (window.__JELLII_DESKTOP__ === true && window.jelliiDesktop?.streamChat) {
    if (signal?.aborted) return;
    const requestId = crypto.randomUUID();
    let fullText = '';
    const cancel = () => window.jelliiDesktop.cancelChat?.(requestId);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await window.jelliiDesktop.streamChat({
        requestId, text, endpoint, token,
        onDelta(delta) { fullText += delta; onChunk?.(delta); },
        onDone() { onDone?.(fullText); },
        onError,
      });
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const body = JSON.stringify({
    model: 'default',
    messages: [{ role: 'user', content: text }],
    stream: true,
  });

  // ── Fetch with 60s timeout ──
  const FETCH_TIMEOUT_MS = 60000;
  const timeoutController = new AbortController();
  let timeoutId;
  let timedOut = false;

  // Propagate external abort signal to our timeout controller
  if (signal) {
    if (signal.aborted) return;
    signal.addEventListener('abort', () => timeoutController.abort(signal.reason));
  }

  let response;
  try {
    timeoutId = setTimeout(() => { timedOut = true; timeoutController.abort(); }, FETCH_TIMEOUT_MS);

    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: timeoutController.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError' && !timedOut) return;
    if (timedOut) {
      onError?.(0, 'Request timeout after 60s');
      return;
    }
    onError?.(0, err.message || 'Network error');
    return;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { /* ignore */ }
    onError?.(response.status, detail || `HTTP ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError?.(response.status, 'Response body is not readable');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let lastId = '';
  let retryMs = 0;
  // TODO: reconnect with Last-Event-Id using lastId and retryMs

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(SSE_FIELD_RE);
        if (!match) continue;

        const [, field, value] = match;

        switch (field.toLowerCase()) {
          case 'event':
            // event: done → treat as stream end (even before data: [DONE])
            if (value.trim().toLowerCase() === 'done') {
              reader.cancel();
              onDone?.(fullText);
              return;
            }
            break;

          case 'id':
            lastId = value;
            break;

          case 'retry':
            retryMs = parseInt(value, 10) || 0;
            break;

          case 'data': {
            // SSE end signal
            if (value === '[DONE]') {
              reader.cancel();
              onDone?.(fullText);
              return;
            }

            const delta = parseSseDataLine(line);
            if (delta) { fullText += delta; onChunk?.(delta); }
            break;
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' && !timedOut) return;
    if (timedOut) {
      onError?.(0, 'Request timeout after 60s');
      return;
    }
    onError?.(0, err.message);
    return;
  }

  // Stream ended without [DONE]
  onDone?.(fullText);
}
