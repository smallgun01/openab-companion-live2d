const KEY = 'jellii-companion-history-v1';
const messagesEl = document.getElementById('history-messages');
const clearBtn = document.getElementById('clear-history');
let lastSerialized = '';
function loadHistory() { try { const raw = localStorage.getItem(KEY) || '[]'; return { raw, entries: JSON.parse(raw) }; } catch { return { raw: '[]', entries: [] }; } }
function render() {
  const { raw, entries } = loadHistory();
  if (raw === lastSerialized) return;
  lastSerialized = raw;
  messagesEl.replaceChildren();
  if (!entries.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No conversation yet.'; messagesEl.append(empty); return; }
  for (const entry of entries) { const message = document.createElement('div'); message.className = `message ${entry.role || 'system'}`; message.textContent = entry.content || ''; messagesEl.append(message); }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
clearBtn.addEventListener('click', () => { localStorage.removeItem(KEY); lastSerialized = ''; render(); });
render(); setInterval(render, 500);
