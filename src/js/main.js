(function () {
    const fileInput = document.getElementById('fileInput');
    const loadBtn = document.getElementById('loadBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const zone = document.getElementById('zone');
    const dropzone = document.getElementById('dropzone');
    const main = document.getElementById('main');
    const statsEl = document.getElementById('stats');
    const statTotal = document.getElementById('statTotal');
    const statStrip = document.getElementById('statStrip');
    const shareBtn = document.getElementById('shareBtn');
    const devicesBtn = document.getElementById('devicesBtn');

    let simplified = [];
    let activeIndex = null;
    let selected = new Set();

    /* ---------- live share (WebRTC) ----------
       All the signaling/transport/UI logic now lives in p2p-share.js and
       p2p-share-ui.js. Load both BEFORE this file:
         <script src="p2p-share.js"></script>
         <script src="p2p-share-ui.js"></script>
       The old #shareOverlay / #shareBody / [data-share-tab] markup in the
       HTML is no longer needed — the modal builds and styles itself. You
       only need to keep the #shareBtn and #devicesBtn buttons. */

    // Derive a friendly local device name from the user-agent so the remote
    // peer sees something meaningful in the handshake code.
    function guessDeviceName() {
        const ua = navigator.userAgent || '';
        if (/iPhone/.test(ua))  return 'iPhone';
        if (/iPad/.test(ua))    return 'iPad';
        if (/Android/.test(ua)) return 'Android';
        if (/Mac/.test(ua))     return 'Mac';
        if (/Windows/.test(ua)) return 'Windows PC';
        if (/Linux/.test(ua))   return 'Linux';
        return 'Browser';
    }

    const shareModal = createP2PShareModal({
        getPayload: () => (selected.size
            ? Array.from(selected).sort((a, b) => a - b).map(i => simplified[i])
            : simplified),
        itemCount: () => (selected.size || simplified.length),
        onDataReceived: (data) => {
            simplified = data;
            selected = new Set();
            activeIndex = null;
            renderList();
            buildStats();
            downloadBtn.disabled = false;
        },
        shareOptions: {
            deviceName: guessDeviceName(),
        },
    });
    shareBtn.addEventListener('click', () => shareModal.open('host'));
    if (devicesBtn) devicesBtn.addEventListener('click', () => shareModal.open('devices'));

    function applyTheme(name) {
        document.documentElement.setAttribute('data-theme', name);
        document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === name));
    }
    applyTheme((() => { try { return localStorage.getItem('harTheme') || 'paper'; } catch (e) { return 'paper'; } })());
    document.getElementById('themeSwitch').addEventListener('click', e => {
        const btn = e.target.closest('.theme-swatch');
        if (!btn) return;
        applyTheme(btn.dataset.theme);
        try { localStorage.setItem('harTheme', btn.dataset.theme); } catch (e2) { }
    });

    loadBtn.addEventListener('click', () => fileInput.click());
    zone.addEventListener('click', () => fileInput.click());

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const har = JSON.parse(evt.target.result);
                const entries = (har.log && har.log.entries) ? har.log.entries : [];
                if (!entries.length) {
                    alert('الملف ده مفيهوش entries — تأكد إنه ملف HAR صحيح.');
                    return;
                }
                simplified = entries.map(simplifyEntry);
                selected = new Set();
                activeIndex = null;
                renderList();
                buildStats();
                downloadBtn.disabled = false;
            } catch (err) {
                alert('تعذر قراءة الملف. تأكد إنه JSON/HAR صحيح.\n' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function simplifyEntry(entry) {
        const req = entry.request || {};
        const res = entry.response || {};
        const queryParams = (req.queryString || []).map(q => ({ name: q.name, value: q.value }));
        let postParams = null;
        if (req.postData) {
            if (req.postData.params && req.postData.params.length) {
                postParams = req.postData.params.map(p => ({ name: p.name, value: p.value }));
            } else if (req.postData.text) {
                postParams = req.postData.text;
            }
        }
        let responseBody = null;
        if (res.content && typeof res.content.text !== 'undefined') {
            responseBody = res.content.text;
            if (res.content.encoding === 'base64' && responseBody) {
                try { responseBody = decodeURIComponent(escape(atob(responseBody))); } catch (e) { /* leave as-is */ }
            }
            if (responseBody && res.content.mimeType && res.content.mimeType.includes('json')) {
                try { responseBody = JSON.parse(responseBody); } catch (e) { /* keep string */ }
            }
        }
        return {
            method: req.method || 'GET',
            url: req.url || '',
            status: res.status || 0,
            statusText: res.statusText || '',
            mimeType: (res.content && res.content.mimeType) || '',
            time: entry.time || 0,
            sentAt: entry.startedDateTime || null,
            requestParams: {
                query: queryParams,
                body: postParams
            },
            response: responseBody
        };
    }

    function formatSentTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function statusClass(status) {
        if (status >= 200 && status < 300) return 's2';
        if (status >= 300 && status < 400) return 's3';
        if (status >= 400 && status < 500) return 's4';
        if (status >= 500) return 's5';
        return 's0';
    }
    function statusColorVar(status) {
        if (status >= 200 && status < 300) return 'var(--s2xx)';
        if (status >= 300 && status < 400) return 'var(--s3xx)';
        if (status >= 400 && status < 500) return 'var(--s4xx)';
        if (status >= 500) return 'var(--s5xx)';
        return 'var(--s0)';
    }

    function renderList() {
        main.innerHTML = `
      <div class="list" id="listPane">
        <div class="filterbar"><input id="filterInput" placeholder="فلترة بالرابط أو method..."></div>
        <div class="selectbar">
          <label class="selall"><input type="checkbox" id="selectAllChk"> تحديد الكل</label>
          <span class="sel-spacer"></span>
          <span class="sel-count" id="selCount"></span>
          <button class="btn small" id="downloadSelectedBtn" style="display:none;">تنزيل المحدد</button>
        </div>
        <div class="rows" id="rows"></div>
      </div>
      <div class="detail" id="detailPane">
        <div class="detail-empty">اختر طلب من القائمة لعرض تفاصيله</div>
      </div>
    `;
        document.getElementById('filterInput').addEventListener('input', e => paintRows(e.target.value));
        document.getElementById('selectAllChk').addEventListener('change', e => {
            const filter = document.getElementById('filterInput').value;
            const idxs = getFilteredIndices(filter);
            if (e.target.checked) idxs.forEach(i => selected.add(i));
            else idxs.forEach(i => selected.delete(i));
            paintRows(filter);
        });
        document.getElementById('downloadSelectedBtn').addEventListener('click', () => {
            const items = Array.from(selected).sort((a, b) => a - b).map(i => simplified[i]);
            downloadJSON(items, 'har-selected.json');
        });
        paintRows('');
    }

    function getFilteredIndices(filter) {
        const f = (filter || '').toLowerCase();
        const idxs = [];
        simplified.forEach((item, i) => {
            if (f && !(item.url.toLowerCase().includes(f) || item.method.toLowerCase().includes(f))) return;
            idxs.push(i);
        });
        return idxs;
    }

    function paintRows(filter) {
        const rows = document.getElementById('rows');
        rows.innerHTML = '';
        const idxs = getFilteredIndices(filter);
        idxs.forEach(i => {
            const item = simplified[i];
            const sc = statusClass(item.status);
            const row = document.createElement('div');
            row.className = 'row ' + sc + (i === activeIndex ? ' active' : '');
            row.innerHTML = `
        <div class="row-top">
          <input type="checkbox" class="row-chk" ${selected.has(i) ? 'checked' : ''}>
          <span class="method ${item.method}">${item.method}</span>
          <span class="status ${sc}">${item.status || '—'}</span>
          <span class="row-time">${Math.round(item.time)}ms</span>
        </div>
        <div class="row-url">${escapeHtml(item.url)}</div>
      `;
            const chk = row.querySelector('.row-chk');
            chk.addEventListener('click', e => e.stopPropagation());
            chk.addEventListener('change', () => {
                if (chk.checked) selected.add(i); else selected.delete(i);
                paintRows(filter);
            });
            row.addEventListener('click', () => { activeIndex = i; paintRows(filter); showDetail(i); });
            rows.appendChild(row);
        });
        updateSelectionUI(idxs);
    }

    function updateSelectionUI(idxs) {
        const selCountEl = document.getElementById('selCount');
        const dlSelBtn = document.getElementById('downloadSelectedBtn');
        const selectAllChk = document.getElementById('selectAllChk');
        const count = selected.size;
        if (selCountEl) selCountEl.textContent = count ? `${count} محدد` : '';
        if (dlSelBtn) dlSelBtn.style.display = count ? 'inline-flex' : 'none';
        if (selectAllChk) {
            const allChecked = idxs.length > 0 && idxs.every(i => selected.has(i));
            const anyChecked = idxs.some(i => selected.has(i));
            selectAllChk.checked = allChecked;
            selectAllChk.indeterminate = anyChecked && !allChecked;
        }
    }

    function showDetail(i) {
        const item = simplified[i];
        const pane = document.getElementById('detailPane');
        const queryStr = JSON.stringify(item.requestParams.query, null, 2);
        const bodyStr = typeof item.requestParams.body === 'object'
            ? JSON.stringify(item.requestParams.body, null, 2)
            : (item.requestParams.body || 'لا يوجد body');
        const responseStr = typeof item.response === 'object'
            ? JSON.stringify(item.response, null, 2)
            : (item.response || 'لا يوجد محتوى');

        pane.innerHTML = `
      <div class="detail-head">
        <div class="u">${escapeHtml(item.url)}</div>
        <div class="meta">
          <span class="meta-item">${item.method}</span>
          <span class="meta-item" style="color:${statusColorVar(item.status)}">${item.status} ${escapeHtml(item.statusText)}</span>
          <span class="meta-item">${escapeHtml(item.mimeType || 'unknown type')}</span>
          <span class="meta-item">${Math.round(item.time)} ms</span>
        </div>
      </div>
      <div class="tabs">
        <div class="tab active" data-tab="request">Request Params</div>
        <div class="tab" data-tab="response">Response</div>
        <div class="tab" data-tab="raw">Raw JSON</div>
      </div>
      <div class="tab-body" id="tabBody"></div>
    `;

        const tabBody = document.getElementById('tabBody');
        function paintTab(tab) {
            if (tab === 'request') {
                tabBody.innerHTML = `
          <div class="section-title">Query Params</div>
          ${item.requestParams.query.length ? `<pre>${escapeHtml(queryStr)}</pre>` : `<p class="empty-note">لا يوجد query params</p>`}
          <div class="section-title" style="margin-top:20px;">Body / Post Data</div>
          <pre>${escapeHtml(bodyStr)}</pre>
        `;
            } else if (tab === 'response') {
                tabBody.innerHTML = `
          <div class="section-title">Response Body</div>
          <pre>${escapeHtml(responseStr)}</pre>
        `;
            } else {
                tabBody.innerHTML = `<pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>`;
            }
        }
        paintTab('request');
        pane.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => {
                pane.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                paintTab(t.dataset.tab);
            });
        });
    }

    function buildStats() {
        statsEl.style.display = 'flex';
        statTotal.textContent = simplified.length;
        const counts = { s2: 0, s3: 0, s4: 0, s5: 0, s0: 0 };
        simplified.forEach(i => counts[statusClass(i.status)]++);
        const colors = { s2: 'var(--s2xx)', s3: 'var(--s3xx)', s4: 'var(--s4xx)', s5: 'var(--s5xx)', s0: 'var(--s0)' };
        statStrip.innerHTML = '';
        Object.keys(counts).forEach(k => {
            if (!counts[k]) return;
            const seg = document.createElement('div');
            seg.style.width = (counts[k] / simplified.length * 100) + '%';
            seg.style.background = colors[k];
            statStrip.appendChild(seg);
        });
    }

    downloadBtn.addEventListener('click', () => {
        if (!simplified.length) return;
        downloadJSON(simplified, 'har-simplified.json');
    });

    function downloadJSON(data, filename) {
        if (!data.length) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
})();