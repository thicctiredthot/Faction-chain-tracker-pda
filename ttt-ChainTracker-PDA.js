// ==UserScript==
// @name ThiccTiredthots Faction Chain Tracker (PDA)
// @namespace https://torn.com/
// @version 15.0
// @description PDA-friendly chain tracker with floating bubble, saved UI state, and compact mode
// @match https://www.torn.com/*
// @grant none
// ==/UserScript==

(function () {
'use strict';

const SETTINGS_KEY = 'thicctiredthot_chain_tracker_settings';
const UI_STATE_KEY = 'thicctiredthot_chain_tracker_ui_state';

let lastCopiedText = '';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function loadSettings() {
try {
const raw = localStorage.getItem(SETTINGS_KEY);
return raw ? JSON.parse(raw) : { apiKey: '', factionId: '' };
} catch {
return { apiKey: '', factionId: '' };
}
}

function saveSettings(settings) {
localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function clearSettings() {
localStorage.removeItem(SETTINGS_KEY);
}

function defaultUIState() {
return {
visible: false,
compact: false,
top: 90,
left: Math.max(10, window.innerWidth - 370),
bubbleTop: 90,
bubbleLeft: Math.max(10, window.innerWidth - 70)
};
}

function loadUIState() {
try {
const raw = localStorage.getItem(UI_STATE_KEY);
return raw ? { ...defaultUIState(), ...JSON.parse(raw) } : defaultUIState();
} catch {
return defaultUIState();
}
}

function saveUIState(state) {
localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
}

function clamp(value, min, max) {
return Math.max(min, Math.min(max, value));
}

function escapeHtml(str) {
return String(str || '')
.replace(/&/g, '&amp;')
.replace(/"/g, '&quot;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;');
}

function inputStyle() {
return `
width:100%;
margin-bottom:10px;
padding:8px;
border-radius:8px;
border:1px solid #f3c3de;
background:#ffffff;
color:#4a2340;
box-sizing:border-box;
`;
}

function pinkButtonStyle() {
return `
background:#f08ac0;
color:#ffffff;
border:none;
padding:10px 8px;
border-radius:8px;
font-weight:700;
cursor:pointer;
`;
}

function whiteButtonStyle() {
return `
background:#ffffff;
color:#c94f9d;
border:1px solid #f3a6d6;
padding:10px 8px;
border-radius:8px;
font-weight:700;
cursor:pointer;
`;
}

function createUI() {
if (document.getElementById('ttt-chain-bubble')) return;

const settings = loadSettings();
const hasSetup = !!(settings.apiKey && settings.factionId);

const uiState = loadUIState();
if (hasSetup && uiState.compact === false) {
uiState.compact = true;
saveUIState(uiState);
}

const bubble = document.createElement('button');
bubble.id = 'ttt-chain-bubble';
bubble.textContent = '💗';
bubble.style.position = 'fixed';
bubble.style.top = `${uiState.bubbleTop}px`;
bubble.style.left = `${uiState.bubbleLeft}px`;
bubble.style.width = '52px';
bubble.style.height = '52px';
bubble.style.borderRadius = '50%';
bubble.style.border = '2px solid #f3a6d6';
bubble.style.background = '#f08ac0';
bubble.style.color = '#ffffff';
bubble.style.fontSize = '22px';
bubble.style.fontWeight = '700';
bubble.style.zIndex = '999999';
bubble.style.boxShadow = '0 8px 18px rgba(0,0,0,0.22)';
bubble.style.cursor = 'pointer';
bubble.style.touchAction = 'none';

const panel = document.createElement('div');
panel.id = 'ttt-chain-panel';
panel.style.position = 'fixed';
panel.style.top = `${uiState.top}px`;
panel.style.left = `${uiState.left}px`;
panel.style.width = `${Math.min(window.innerWidth - 20, 360)}px`;
panel.style.maxWidth = 'calc(100vw - 20px)';
panel.style.maxHeight = '70vh';
panel.style.overflow = 'hidden';
panel.style.background = '#fff7fb';
panel.style.color = '#4a2340';
panel.style.border = '2px solid #f3a6d6';
panel.style.borderRadius = '12px';
panel.style.padding = '12px';
panel.style.zIndex = '999998';
panel.style.boxShadow = '0 10px 28px rgba(0,0,0,0.25)';
panel.style.display = uiState.visible ? 'block' : 'none';

panel.innerHTML = `
<div id="ttt-header" style="
font-size:18px;
font-weight:700;
margin-bottom:10px;
cursor:move;
user-select:none;
color:#c94f9d;
touch-action:none;
">
ThiccTiredthots Faction Chain Tracker
</div>

<details style="margin-bottom:10px;">
<summary style="cursor:pointer;color:#c94f9d;font-weight:700;">
How to use
</summary>
<div style="font-size:12px;margin-top:6px;line-height:1.4;color:#6a3558;">
1. Paste your Torn API key<br>
2. Enter your faction ID<br>
3. Tap "Save"<br>
4. Pick your date range<br>
5. Tap "Load"<br><br>
Hits = total attacks across all selected chains<br>
Chains = how many of those chains each member participated in<br><br>
Your API key is stored locally on your device only.
</div>
</details>

<div id="ttt-setup-section">
<div style="font-size:12px;">API Key</div>
<input id="ttt-api" type="password" value="${escapeHtml(settings.apiKey)}" style="${inputStyle()}">

<div style="font-size:12px;">Faction ID</div>
<input id="ttt-faction" type="text" value="${escapeHtml(settings.factionId)}" style="${inputStyle()}">

<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
<button id="ttt-save" style="${pinkButtonStyle()} flex:1;min-width:100px;">Save</button>
<button id="ttt-clear" style="${whiteButtonStyle()} flex:1;min-width:100px;">Clear</button>
</div>
</div>

<button id="ttt-toggle-setup" style="
width:100%;
margin-bottom:10px;
background:#ffffff;
color:#c94f9d;
border:1px solid #f3a6d6;
padding:8px;
border-radius:8px;
font-weight:700;
cursor:pointer;
">
⚙️ Edit Setup
</button>

<div style="font-size:12px;">Start Date</div>
<input id="ttt-start" type="date" style="${inputStyle()}">

<div style="font-size:12px;">End Date</div>
<input id="ttt-end" type="date" style="${inputStyle()}">

<div style="display:flex;gap:8px;flex-wrap:wrap;">
<button id="ttt-run" style="${pinkButtonStyle()} flex:1;min-width:100px;">Load</button>
<button id="ttt-copy" style="${whiteButtonStyle()} flex:1;min-width:100px;">Copy</button>
</div>

<div id="ttt-status" style="margin-top:10px;font-size:12px;color:#8a4a73;"></div>
<div id="ttt-results" style="margin-top:10px;max-height:32vh;overflow:auto;-webkit-overflow-scrolling:touch;"></div>
`;

document.body.appendChild(bubble);
document.body.appendChild(panel);

function applyCompactMode() {
const state = loadUIState();
const setupSection = document.getElementById('ttt-setup-section');
const toggleSetupButton = document.getElementById('ttt-toggle-setup');

if (!setupSection || !toggleSetupButton) return;

if (state.compact) {
setupSection.style.display = 'none';
toggleSetupButton.textContent = '⚙️ Edit Setup';
} else {
setupSection.style.display = 'block';
toggleSetupButton.textContent = '✅ Hide Setup';
}
}

bubble.onclick = () => {
const visible = panel.style.display !== 'none';
panel.style.display = visible ? 'none' : 'block';

const state = loadUIState();
state.visible = !visible;
saveUIState(state);
};

document.getElementById('ttt-toggle-setup').onclick = () => {
const state = loadUIState();
state.compact = !state.compact;
saveUIState(state);
applyCompactMode();
};

document.getElementById('ttt-save').onclick = () => {
saveSettings({
apiKey: document.getElementById('ttt-api').value.trim(),
factionId: document.getElementById('ttt-faction').value.trim()
});

const state = loadUIState();
state.compact = true;
saveUIState(state);
applyCompactMode();

document.getElementById('ttt-status').textContent = 'Saved locally.';
};

document.getElementById('ttt-clear').onclick = () => {
clearSettings();
document.getElementById('ttt-api').value = '';
document.getElementById('ttt-faction').value = '';

const state = loadUIState();
state.compact = false;
saveUIState(state);
applyCompactMode();

document.getElementById('ttt-status').textContent = 'Cleared.';
};

document.getElementById('ttt-run').onclick = run;
document.getElementById('ttt-copy').onclick = async () => {
const status = document.getElementById('ttt-status');
if (!lastCopiedText) {
status.textContent = 'Nothing to copy yet.';
return;
}
try {
await navigator.clipboard.writeText(lastCopiedText);
status.textContent = 'Copied!';
} catch {
status.textContent = 'Clipboard copy failed.';
}
};

applyCompactMode();

makeDraggable(panel, document.getElementById('ttt-header'), 'panel');
makeDraggable(bubble, bubble, 'bubble');

window.addEventListener('resize', () => {
const maxPanelLeft = Math.max(10, window.innerWidth - panel.offsetWidth - 10);
const maxPanelTop = Math.max(10, window.innerHeight - panel.offsetHeight - 10);
const maxBubbleLeft = Math.max(10, window.innerWidth - bubble.offsetWidth - 10);
const maxBubbleTop = Math.max(10, window.innerHeight - bubble.offsetHeight - 10);

panel.style.left = `${clamp(parseInt(panel.style.left, 10) || 10, 10, maxPanelLeft)}px`;
panel.style.top = `${clamp(parseInt(panel.style.top, 10) || 10, 10, maxPanelTop)}px`;
bubble.style.left = `${clamp(parseInt(bubble.style.left, 10) || 10, 10, maxBubbleLeft)}px`;
bubble.style.top = `${clamp(parseInt(bubble.style.top, 10) || 10, 10, maxBubbleTop)}px`;

const state = loadUIState();
state.left = parseInt(panel.style.left, 10) || state.left;
state.top = parseInt(panel.style.top, 10) || state.top;
state.bubbleLeft = parseInt(bubble.style.left, 10) || state.bubbleLeft;
state.bubbleTop = parseInt(bubble.style.top, 10) || state.bubbleTop;
saveUIState(state);
});
}

function makeDraggable(element, handle, type) {
let dragging = false;
let startX = 0;
let startY = 0;
let startLeft = 0;
let startTop = 0;
let moved = false;

function start(clientX, clientY) {
dragging = true;
moved = false;

const rect = element.getBoundingClientRect();
element.style.left = `${rect.left}px`;
element.style.top = `${rect.top}px`;
if (element.id === 'ttt-chain-panel') {
element.style.right = 'auto';
}

startX = clientX;
startY = clientY;
startLeft = rect.left;
startTop = rect.top;
document.body.style.userSelect = 'none';
}

function move(clientX, clientY) {
if (!dragging) return;

const dx = clientX - startX;
const dy = clientY - startY;

if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
moved = true;
}

const maxLeft = Math.max(10, window.innerWidth - element.offsetWidth - 10);
const maxTop = Math.max(10, window.innerHeight - element.offsetHeight - 10);

const nextLeft = clamp(startLeft + dx, 10, maxLeft);
const nextTop = clamp(startTop + dy, 10, maxTop);

element.style.left = `${nextLeft}px`;
element.style.top = `${nextTop}px`;
}

function end() {
if (!dragging) return;
dragging = false;
document.body.style.userSelect = '';

const state = loadUIState();
if (type === 'panel') {
state.left = parseInt(element.style.left, 10) || state.left;
state.top = parseInt(element.style.top, 10) || state.top;
} else {
state.bubbleLeft = parseInt(element.style.left, 10) || state.bubbleLeft;
state.bubbleTop = parseInt(element.style.top, 10) || state.bubbleTop;
}
saveUIState(state);
}

handle.addEventListener('mousedown', (e) => {
e.preventDefault();
start(e.clientX, e.clientY);
});

document.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
document.addEventListener('mouseup', end);

handle.addEventListener('touchstart', (e) => {
const t = e.touches[0];
if (!t) return;
start(t.clientX, t.clientY);
}, { passive: true });

document.addEventListener('touchmove', (e) => {
const t = e.touches[0];
if (!t) return;
move(t.clientX, t.clientY);
}, { passive: true });

document.addEventListener('touchend', end, { passive: true });

if (type === 'bubble') {
handle.addEventListener('click', (e) => {
if (moved) {
e.preventDefault();
e.stopPropagation();
moved = false;
}
}, true);
}
}

async function fetchApi(url, key) {
const res = await fetch(url, {
headers: {
Authorization: `ApiKey ${key}`,
Accept: 'application/json'
}
});
const data = await res.json();
if (!res.ok) throw new Error(`HTTP ${res.status}`);
if (data?.error) throw new Error(data.error.error || 'API error');
return data;
}

async function fetchInternal(url) {
const res = await fetch(url, {
credentials: 'same-origin',
headers: {
'X-Requested-With': 'XMLHttpRequest',
'Accept': 'application/json'
}
});
return await res.json();
}

function normalizeChains(data) {
if (Array.isArray(data)) return data;
return Object.values(data.chains || {});
}

function unwrapReport(report) {
return report?.result?.chainreport ?? report?.chainreport ?? report?.result ?? report ?? {};
}

function getRows(report) {
return Object.values(unwrapReport(report).members || {});
}

function buildCopiedText(sorted, startRaw, endRaw) {
let text = `ThiccTiredthots Faction Chain Tracker\n`;
text += `${startRaw || 'start'} → ${endRaw || 'now'}\n\n`;

for (const [name, d] of sorted) {
text += `${name} - Hits: ${d.hits} | Chains: ${d.chains}\n`;
}

return text.trim();
}

async function run() {
const status = document.getElementById('ttt-status');
const results = document.getElementById('ttt-results');

const api = document.getElementById('ttt-api').value.trim();
const faction = document.getElementById('ttt-faction').value.trim();
const startRaw = document.getElementById('ttt-start').value;
const endRaw = document.getElementById('ttt-end').value;

const start = startRaw ? new Date(`${startRaw}T00:00:00`) : new Date('2000-01-01T00:00:00');
const end = endRaw ? new Date(`${endRaw}T23:59:59`) : new Date('2100-01-01T23:59:59');

if (!api || !faction) {
status.textContent = 'Missing API key or faction ID.';
return;
}

try {
status.textContent = 'Loading chains...';
results.innerHTML = '';
lastCopiedText = '';

const chainData = await fetchApi(`https://api.torn.com/v2/faction/${faction}/chains`, api);
const chains = normalizeChains(chainData);

const filtered = chains.filter(c => {
const ts = c.timestamp ?? c.started ?? c.start ?? c.start_time ?? 0;
if (!ts) return false;
const d = new Date(ts * 1000);
return d >= start && d <= end;
});

if (!filtered.length) {
status.textContent = 'No chains found in that date range.';
return;
}

const master = {};

for (let i = 0; i < filtered.length; i++) {
const chainId = filtered[i].id ?? filtered[i].chain_id ?? filtered[i].chain;
if (!chainId) continue;

status.textContent = `Loading ${i + 1}/${filtered.length}`;

const report = await fetchInternal(`/war.php?step=getChainReport&chainID=${chainId}`);
const rows = getRows(report);

for (const r of rows) {
if (String(r.factionID) !== String(faction)) continue;

const name = r.playername ?? r.name ?? `ID ${r.userID ?? 'unknown'}`;
const hits = Number(r.attacks ?? 0);

if (!master[name]) {
master[name] = { hits: 0, chains: 0 };
}

master[name].hits += hits;
if (hits > 0) master[name].chains++;
}

await sleep(80);
}

const sorted = Object.entries(master).sort((a, b) => b[1].hits - a[1].hits);

let html = `
<div style="font-size:14px;font-weight:700;margin-bottom:8px;color:#c94f9d;">Results</div>
<div style="font-size:11px;color:#8a4a73;margin-bottom:8px;">${startRaw || 'start'} → ${endRaw || 'now'}</div>
`;

for (const [name, d] of sorted) {
html += `
<div style="padding:8px 0;border-bottom:1px solid #f3c3de;">
<div style="font-weight:700;color:#4a2340;">${name}</div>
<div>
<span style="color:#d45b87;">Hits: ${d.hits}</span>
&nbsp;|&nbsp;
<span style="color:#c94f9d;">Chains: ${d.chains}</span>
</div>
</div>
`;
}

lastCopiedText = buildCopiedText(sorted, startRaw, endRaw);
results.innerHTML = html;
status.textContent = 'Done';
} catch (err) {
console.error(err);
status.textContent = `Error: ${err.message}`;
}
}

function init() {
if (document.body) createUI();
else setTimeout(init, 500);
}

init();
})();
