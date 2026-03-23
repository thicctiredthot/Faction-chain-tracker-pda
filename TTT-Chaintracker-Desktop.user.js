// ==UserScript==
// @name         ThiccTiredthots Faction Chain Tracker (Desktop)
// @namespace    thicctiredthot
// @version      2.5
// @description  Desktop faction chain tracker with built-in license validation
// @match        https://www.torn.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ttt_chain_tracker_desktop_settings';

    const LICENSES = {
        'TTT-IC-112233': '54379',
        'TTT-LA-778899': '54573'
    };

    let lastCopiedText = '';
    let panelVisible = true;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {
                apiKey: '',
                factionId: '',
                licenseKey: ''
            };
        } catch {
            return {
                apiKey: '',
                factionId: '',
                licenseKey: ''
            };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function normalizeLicenseKey(key) {
        return String(key || '').replace(/\s+/g, '').toUpperCase();
    }

    function gmGetJson(url, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: timeoutMs,
                onload: (res) => {
                    try {
                        if (res.status < 200 || res.status >= 300) {
                            reject(new Error(`HTTP ${res.status}`));
                            return;
                        }
                        const data = JSON.parse(res.responseText);
                        resolve(data);
                    } catch {
                        reject(new Error('Response was not valid JSON'));
                    }
                },
                onerror: () => reject(new Error('Network request failed')),
                ontimeout: () => reject(new Error('Request timed out'))
            });
        });
    }

    async function validateLicense(licenseKey, factionId) {
        const cleanKey = normalizeLicenseKey(licenseKey);
        const cleanFaction = String(factionId || '').trim();
        return String(LICENSES[cleanKey] || '') === cleanFaction;
    }

    async function fetchChains(apiKey, factionId) {
        try {
            const v2Url = `https://api.torn.com/v2/faction/${encodeURIComponent(factionId)}/chains?key=${encodeURIComponent(apiKey)}`;
            const data = await gmGetJson(v2Url, 15000);

            if (data?.error) {
                throw new Error(data.error.error || 'Unknown v2 API error');
            }

            return data;
        } catch (err) {
            const v1Url = `https://api.torn.com/faction/${encodeURIComponent(factionId)}?selections=chains&key=${encodeURIComponent(apiKey)}`;
            const data = await gmGetJson(v1Url, 15000);

            if (data?.error) {
                throw new Error(data.error.error || 'Unknown API error');
            }

            return data;
        }
    }

    async function fetchInternalReport(chainId) {
        try {
            const res = await fetch(`/war.php?step=getChainReport&chainID=${chainId}`, {
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                }
            });

            let data;
            try {
                data = await res.json();
            } catch {
                throw new Error('Report response was not valid JSON');
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            return data;
        } catch (err) {
            throw new Error(`Chain report fetch failed for ${chainId}: ${err.message}`);
        }
    }

    function normalizeChains(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.chains)) return data.chains;
        if (data.chains && typeof data.chains === 'object') return Object.values(data.chains);
        return [];
    }

    function getChainTimestamp(chain) {
        return (
            chain.timestamp ??
            chain.started ??
            chain.start ??
            chain.start_time ??
            chain.ended ??
            chain.end ??
            chain.end_time ??
            0
        );
    }

    function getChainId(chain) {
        return (
            chain.ID ??
            chain.id ??
            chain.chain_id ??
            chain.chain ??
            null
        );
    }

    function unwrapReport(report) {
        return report?.result?.chainreport
            ?? report?.chainreport
            ?? report?.result
            ?? report
            ?? {};
    }

    function getRows(report) {
        const unwrapped = unwrapReport(report);

        if (Array.isArray(unwrapped.members)) return unwrapped.members;
        if (unwrapped.members && typeof unwrapped.members === 'object') return Object.values(unwrapped.members);

        if (Array.isArray(unwrapped.attackers)) return unwrapped.attackers;
        if (unwrapped.attackers && typeof unwrapped.attackers === 'object') return Object.values(unwrapped.attackers);

        return [];
    }

    function buildCopiedText(sorted, startRaw, endRaw) {
        let text = `ThiccTiredthots Faction Chain Tracker\n`;
        text += `${startRaw || 'start'} → ${endRaw || 'now'}\n\n`;

        for (const [name, d] of sorted) {
            text += `${name} - Hits: ${d.hits} | Chains: ${d.chains}\n`;
        }

        return text.trim();
    }

    function formatResults(sorted, startRaw, endRaw) {
        let html = `
            <div class="ttt-results-title">Results</div>
            <div class="ttt-results-sub">${startRaw || 'start'} → ${endRaw || 'now'}</div>
        `;

        if (!sorted.length) {
            html += `<div class="ttt-empty">No usable report data found.</div>`;
            return html;
        }

        for (const [name, d] of sorted) {
            html += `
                <div class="ttt-item">
                    <div class="ttt-name">${name}</div>
                    <div class="ttt-stats">Hits: ${d.hits} | Chains: ${d.chains}</div>
                </div>
            `;
        }

        return html;
    }

    function createUI() {
        if (document.getElementById('ttt-desktop-wrapper')) return;

        const settings = loadSettings();

        const wrapper = document.createElement('div');
        wrapper.id = 'ttt-desktop-wrapper';
        wrapper.innerHTML = `
            <div id="ttt-desktop-panel">
                <div id="ttt-desktop-header">💖 ThiccTiredthots Faction Chain Tracker</div>

                <div class="ttt-label">API Key</div>
                <input id="ttt-api" type="password" value="${escapeHtml(settings.apiKey)}">

                <div class="ttt-label">Faction ID</div>
                <input id="ttt-faction" type="text" value="${escapeHtml(settings.factionId)}">

                <div class="ttt-label">License Key</div>
                <input id="ttt-license" type="text" value="${escapeHtml(settings.licenseKey)}">

                <div class="ttt-row">
                    <button id="ttt-save">Save</button>
                    <button id="ttt-copy">Copy</button>
                </div>

                <div class="ttt-label">Start Date</div>
                <input id="ttt-start" type="date">

                <div class="ttt-label">End Date</div>
                <input id="ttt-end" type="date">

                <div class="ttt-row">
                    <button id="ttt-run">Load</button>
                    <button id="ttt-hide">Hide</button>
                </div>

                <div id="ttt-status">Ready</div>
                <div id="ttt-results"></div>
            </div>

            <button id="ttt-desktop-toggle">Chains</button>
        `;

        document.body.appendChild(wrapper);

        document.getElementById('ttt-save').onclick = async () => {
            const apiKey = document.getElementById('ttt-api').value.trim();
            const factionId = document.getElementById('ttt-faction').value.trim();
            const licenseKey = normalizeLicenseKey(document.getElementById('ttt-license').value);
            const status = document.getElementById('ttt-status');

            if (!apiKey || !factionId || !licenseKey) {
                status.textContent = 'Fill all fields first.';
                return;
            }

            const valid = await validateLicense(licenseKey, factionId);

            if (!valid) {
                status.textContent = `Invalid license. Key="${licenseKey}" Faction="${factionId}"`;
                return;
            }

            saveSettings({ apiKey, factionId, licenseKey });
            document.getElementById('ttt-license').value = licenseKey;
            status.textContent = 'Saved.';
        };

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

        document.getElementById('ttt-run').onclick = runTracker;

        document.getElementById('ttt-hide').onclick = () => {
            panelVisible = false;
            document.getElementById('ttt-desktop-panel').style.display = 'none';
        };

        document.getElementById('ttt-desktop-toggle').onclick = () => {
            panelVisible = !panelVisible;
            document.getElementById('ttt-desktop-panel').style.display = panelVisible ? 'block' : 'none';
        };

        makeDraggable(
            document.getElementById('ttt-desktop-panel'),
            document.getElementById('ttt-desktop-header')
        );
    }

    async function runTracker() {
        const status = document.getElementById('ttt-status');
        const results = document.getElementById('ttt-results');

        const apiKey = document.getElementById('ttt-api').value.trim();
        const factionId = document.getElementById('ttt-faction').value.trim();
        const licenseKey = normalizeLicenseKey(document.getElementById('ttt-license').value);
        const startRaw = document.getElementById('ttt-start').value;
        const endRaw = document.getElementById('ttt-end').value;

        const start = startRaw ? new Date(`${startRaw}T00:00:00Z`) : new Date('2000-01-01T00:00:00Z');
        const end = endRaw ? new Date(`${endRaw}T23:59:59Z`) : new Date('2100-01-01T23:59:59Z');

        if (!apiKey || !factionId || !licenseKey) {
            status.textContent = 'Missing API key, faction ID, or license key.';
            return;
        }

        try {
            const valid = await validateLicense(licenseKey, factionId);
            if (!valid) {
                status.textContent = `Invalid license. Key="${licenseKey}" Faction="${factionId}"`;
                return;
            }

            saveSettings({ apiKey, factionId, licenseKey });
            document.getElementById('ttt-license').value = licenseKey;

            status.textContent = 'Loading chains list...';
            results.innerHTML = '';
            lastCopiedText = '';

            const chainData = await fetchChains(apiKey, factionId);
            const chains = normalizeChains(chainData);

            const filtered = chains.filter(c => {
                const ts = getChainTimestamp(c);
                if (!ts) return false;
                const d = new Date(ts * 1000);
                return d >= start && d <= end;
            });

            if (!filtered.length) {
                status.textContent = `No chains found. Total pulled before date filter: ${chains.length}`;
                results.innerHTML = '<div class="ttt-empty">No chains matched that date range.</div>';
                return;
            }

            const master = {};

            for (let i = 0; i < filtered.length; i++) {
                const chainId = getChainId(filtered[i]);
                if (!chainId) continue;

                status.textContent = `Loading report ${i + 1}/${filtered.length}`;
                const report = await fetchInternalReport(chainId);
                const rows = getRows(report);

                for (const row of rows) {
                    const rowFaction = String(row.factionID ?? row.factionId ?? '');
                    const name = row.playername ?? row.name ?? row.username ?? `ID ${row.userID ?? 'unknown'}`;
                    const hits = Number(row.attacks ?? row.hits ?? 0);

                    if (rowFaction && rowFaction !== String(factionId)) continue;

                    if (!master[name]) {
                        master[name] = { hits: 0, chains: 0 };
                    }

                    master[name].hits += hits;
                    if (hits > 0) master[name].chains += 1;
                }

                await sleep(80);
            }

            const sorted = Object.entries(master).sort((a, b) => b[1].hits - a[1].hits);

            lastCopiedText = buildCopiedText(sorted, startRaw, endRaw);
            results.innerHTML = formatResults(sorted, startRaw, endRaw);
            status.textContent = 'Done';
        } catch (err) {
            console.error(err);
            status.textContent = err.message;
        }
    }

    function makeDraggable(panel, handle) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = `${startLeft + (e.clientX - startX)}px`;
            panel.style.top = `${startTop + (e.clientY - startY)}px`;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
        });
    }

    GM_addStyle(`
        #ttt-desktop-panel {
            position: fixed;
            top: 90px;
            right: 20px;
            width: 460px;
            background: #fff7fb;
            color: #4a2340;
            border: 2px solid #f3a6d6;
            border-radius: 12px;
            padding: 12px;
            z-index: 999999;
            box-shadow: 0 10px 28px rgba(0,0,0,0.25);
        }

        #ttt-desktop-toggle {
            position: fixed;
            top: 90px;
            right: 492px;
            z-index: 999999;
            background: #f08ac0;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 8px 10px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        }

        #ttt-desktop-header {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 10px;
            color: #c94f9d;
            cursor: move;
        }

        .ttt-label {
            font-size: 12px;
            margin-bottom: 4px;
            color: #8a4a73;
        }

        #ttt-desktop-panel input {
            width: 100%;
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 8px;
            border: 1px solid #f3c3de;
            box-sizing: border-box;
            background: #fff;
            color: #4a2340;
        }

        .ttt-row {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }

        #ttt-desktop-panel button {
            flex: 1;
            background: #f08ac0;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 10px 8px;
            font-weight: 700;
            cursor: pointer;
        }

        #ttt-hide, #ttt-copy {
            background: #fff;
            color: #c94f9d;
            border: 1px solid #f3a6d6;
        }

        #ttt-status {
            margin-top: 8px;
            font-size: 12px;
            color: #8a4a73;
        }

        #ttt-results {
            margin-top: 10px;
            max-height: 380px;
            overflow: auto;
        }

        .ttt-results-title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #c94f9d;
        }

        .ttt-results-sub {
            font-size: 11px;
            color: #8a4a73;
            margin-bottom: 8px;
        }

        .ttt-item {
            padding: 8px 0;
            border-bottom: 1px solid #f3c3de;
        }

        .ttt-name {
            font-weight: 700;
            color: #4a2340;
        }

        .ttt-stats {
            color: #d45b87;
            font-size: 12px;
        }

        .ttt-empty {
            color: #d45b87;
            font-size: 12px;
            padding: 8px 0;
        }
    `);

    createUI();
})();
