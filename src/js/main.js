(function () {
    // ── DOM refs ─────────────────────────────────────────────────────────
    const fileInput  = document.getElementById('fileInput');
    const loadBtn    = document.getElementById('loadBtn');
    const downloadBtn= document.getElementById('downloadBtn');
    const zone       = document.getElementById('zone');
    const dropzone   = document.getElementById('dropzone');
    const main       = document.getElementById('main');
    const statsEl    = document.getElementById('stats');
    const statTotal  = document.getElementById('statTotal');
    const statStrip  = document.getElementById('statStrip');
    const statLabel  = document.getElementById('statLabel');
    const shareBtn   = document.getElementById('shareBtn');
    const langBtn    = document.getElementById('langBtn');

    // ── App state ─────────────────────────────────────────────────────────
    let simplified  = [];
    let activeIndex = null;
    let selected    = new Set();
    let currentPage = 1;
    let pageSize    = (() => { try { return parseInt(localStorage.getItem('harPageSize')) || 50; } catch(e) { return 50; } })();

    // ── Translations ──────────────────────────────────────────────────────
    const STRINGS = {
        ar: {
            loadBtn:         'فتح ملف HAR',
            shareBtn:        'مشاركة مباشرة',
            downloadBtn:     'تنزيل JSON',
            howBtn:          'كيف تعمل؟',
            howTitle:        'شرح مرئي لعملية المشاركة المباشرة',
            statLabel:       'الطلبات',
            dropTitle:       'حوّل ملف HAR إلى JSON مبسّط',
            dropDesc:        'ارفع ملف HAR وهيتم استخراج الأساسيات بس لكل طلب: الرابط، status code، بيانات الـ request (params/body)، وبيانات الـ response — من غير أي تفاصيل زيادة.',
            dropZoneLabel:   'اسحب ملف HAR هنا',
            dropZoneSub:     'أو اضغط للاختيار من جهازك — .har',
            filterPh:        'فلترة بالرابط أو method...',
            selectAll:       'تحديد الكل',
            selected:        (n) => `${n} محدد`,
            downloadSel:     'تنزيل المحدد',
            detailEmpty:     'اختر طلب من القائمة لعرض تفاصيله',
            noQueryParams:   'لا يوجد query params',
            noBody:          'لا يوجد body',
            noContent:       'لا يوجد محتوى',
            badFile:         'الملف ده مفيهوش entries — تأكد إنه ملف HAR صحيح.',
            badJson:         'تعذر قراءة الملف. تأكد إنه JSON/HAR صحيح.\n',
            perPage:         'لكل صفحة',
            allPages:        'الكل',
            prev:            '‹',
            next:            '›',
            pageOf:          (c, t) => `${c} / ${t}`,
            tabRequest:      'Request Params',
            tabResponse:     'Response',
            tabRaw:          'Raw JSON',
            sectionQuery:    'Query Params',
            sectionBody:     'Body / Post Data',
            sectionResponse: 'Response Body',
        },
        en: {
            loadBtn:         'Open HAR File',
            shareBtn:        'Live Share',
            downloadBtn:     'Download JSON',
            howBtn:          'How it works?',
            howTitle:        'Visual walkthrough of the Live Share flow',
            statLabel:       'Requests',
            dropTitle:       'Convert HAR file to simplified JSON',
            dropDesc:        'Upload a HAR file and only the essentials are extracted per request: URL, status code, request data (params/body), and response data — no extra noise.',
            dropZoneLabel:   'Drag a HAR file here',
            dropZoneSub:     'or click to pick from your device — .har',
            filterPh:        'Filter by URL or method...',
            selectAll:       'Select all',
            selected:        (n) => `${n} selected`,
            downloadSel:     'Download selected',
            detailEmpty:     'Select a request from the list to view its details',
            noQueryParams:   'No query params',
            noBody:          'No body',
            noContent:       'No content',
            badFile:         "This file has no entries — make sure it's a valid HAR file.",
            badJson:         'Could not read the file. Make sure it is a valid JSON/HAR.\n',
            perPage:         'per page',
            allPages:        'All',
            prev:            '‹',
            next:            '›',
            pageOf:          (c, t) => `${c} / ${t}`,
            tabRequest:      'Request Params',
            tabResponse:     'Response',
            tabRaw:          'Raw JSON',
            sectionQuery:    'Query Params',
            sectionBody:     'Body / Post Data',
            sectionResponse: 'Response Body',
        },
    };

    // ── Language management ────────────────────────────────────────────────
    let currentLang = (() => { try { return localStorage.getItem('harLang') || 'ar'; } catch(e) { return 'ar'; } })();

    function t(key, ...args) {
        const val = STRINGS[currentLang][key];
        return typeof val === 'function' ? val(...args) : (val ?? key);
    }

    /** Apply translations to all [data-i18n] elements in the document. */
    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (STRINGS[currentLang][key] !== undefined) el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            if (STRINGS[currentLang][key] !== undefined) el.title = t(key);
        });
    }

    function setLang(lang) {
        currentLang = lang;
        try { localStorage.setItem('harLang', lang); } catch(e) {}
        const isEn = lang === 'en';
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', isEn ? 'ltr' : 'rtl');
        langBtn.textContent = isEn ? 'عر' : 'EN';
        applyI18n();
        // Update stats label
        if (statLabel) statLabel.textContent = t('statLabel');
        // Re-render list if data is loaded
        if (simplified.length) {
            renderList();
            if (activeIndex !== null) showDetail(activeIndex);
        }
    }

    // Init lang button label
    langBtn.textContent = currentLang === 'en' ? 'عر' : 'EN';
    applyI18n();

    langBtn.addEventListener('click', () => setLang(currentLang === 'ar' ? 'en' : 'ar'));

    // ── Share modal ────────────────────────────────────────────────────────
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

    const P2P_EN_LABELS = {
        title:            'Live Share',
        hostTab:          'Host',
        joinTab:          'Join',
        devicesTab:       'Devices',
        hostIntro:        'An offer code will be generated — send it to the other person. They\'ll send back an answer code; paste it below and press Connect. Data flows directly between browsers.',
        hostStart:        (n) => `Start sharing (${n})`,
        hostNoData:       'No data to share right now.',
        step1Host:        'Step 1 — Send this code to the other party',
        step2Host:        'Step 2 — Paste the code they send back',
        copy:             'Copy code',
        connect:          'Connect',
        answerPlaceholder:'Paste answer code here...',
        waitingAnswer:    'Waiting for answer code...',
        connecting:       'Connecting...',
        connectedSent:    (n) => `Connected — sent ${n} item(s) ✅`,
        closed:           'Connection closed',
        disconnected:     'Connection dropped',
        badAnswer:        'Answer code is invalid — make sure you copied it in full.',
        iceFailed:        'Connection failed — could not reach the other device. Check your network.',
        timeout:          'Connection timed out — DataChannel did not open within 20 seconds.',
        channelError:     'Data channel error.',
        sendError:        'Error while sending data.',
        joinIntro:        'Paste the code the host sent you, an answer code will be generated — send it back. Data will appear once the connection opens.',
        step1Join:        'Step 1 — Paste the host code',
        generateAnswer:   'Generate answer code',
        step2Join:        'Step 2 — Send this code back to the host',
        connectedWaiting: 'Connected — waiting for data...',
        receiving:        (r, n) => `Receiving ${r}/${n}...`,
        received:         (n) => `Received ${n} item(s) ✅`,
        receiveError:     'An error occurred while receiving data',
        badOffer:         'Host code is invalid — make sure you copied it in full.',
        saveDeviceCheck:  'Save this device for future connections',
        saveDeviceName:   'Device name',
        saveDeviceBtn:    'Save',
        devicesTitle:     'Saved Devices',
        devicesEmpty:     'No saved devices yet.\nAfter any successful connection you can save the device.',
        deviceLastSeen:   'Last seen:',
        directConnect:    'Direct Connect',
        renameDevice:     'Rename',
        deleteDevice:     'Delete',
        confirmDelete:    'Delete this device?',
        encryptedBadge:   '🔒 Encrypted',
        memoryBadge:      '⚠ Session only',
        storageError:     'Could not save data — will be kept in memory for this session only.',
        close:            '×',
    };

    let shareModal = buildShareModal();

    function buildShareModal() {
        return createP2PShareModal({
            getPayload:     () => (selected.size
                ? Array.from(selected).sort((a, b) => a - b).map(i => simplified[i])
                : simplified),
            itemCount:      () => (selected.size || simplified.length),
            onDataReceived: (data) => {
                simplified  = data;
                selected    = new Set();
                activeIndex = null;
                currentPage = 1;
                renderList();
                buildStats();
                downloadBtn.disabled = false;
            },
            shareOptions: { deviceName: guessDeviceName() },
            labels: currentLang === 'en' ? P2P_EN_LABELS : undefined,
        });
    }

    shareBtn.addEventListener('click', () => shareModal.open('host'));

    // ── Theme ──────────────────────────────────────────────────────────────
    function applyTheme(name) {
        document.documentElement.setAttribute('data-theme', name);
        document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === name));
    }
    applyTheme((() => { try { return localStorage.getItem('harTheme') || 'paper'; } catch (e) { return 'paper'; } })());
    document.getElementById('themeSwitch').addEventListener('click', e => {
        const btn = e.target.closest('.theme-swatch');
        if (!btn) return;
        applyTheme(btn.dataset.theme);
        try { localStorage.setItem('harTheme', btn.dataset.theme); } catch (e2) {}
    });

    // ── File handling ──────────────────────────────────────────────────────
    loadBtn.addEventListener('click', () => fileInput.click());
    zone.addEventListener('click',   () => fileInput.click());

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag'); });
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
                const har     = JSON.parse(evt.target.result);
                const entries = (har.log && har.log.entries) ? har.log.entries : [];
                if (!entries.length) { alert(t('badFile')); return; }
                simplified  = entries.map(simplifyEntry);
                selected    = new Set();
                activeIndex = null;
                currentPage = 1;
                renderList();
                buildStats();
                downloadBtn.disabled = false;
            } catch (err) {
                alert(t('badJson') + err.message);
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
            requestParams: { query: queryParams, body: postParams },
            response: responseBody,
        };
    }

    // ── Status helpers ─────────────────────────────────────────────────────
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

    // ── List rendering ─────────────────────────────────────────────────────
    function renderList() {
        main.innerHTML = `
      <div class="list" id="listPane">
        <div class="filterbar"><input id="filterInput" placeholder="${escapeHtml(t('filterPh'))}"></div>
        <div class="selectbar">
          <label class="selall"><input type="checkbox" id="selectAllChk"> ${escapeHtml(t('selectAll'))}</label>
          <span class="sel-spacer"></span>
          <span class="sel-count" id="selCount"></span>
          <button class="btn small" id="downloadSelectedBtn" style="display:none;">${escapeHtml(t('downloadSel'))}</button>
        </div>
        <div class="paginationbar" id="paginationBar"></div>
        <div class="rows" id="rows"></div>
      </div>
      <div class="detail" id="detailPane">
        <div class="detail-empty">${escapeHtml(t('detailEmpty'))}</div>
      </div>
    `;
        document.getElementById('filterInput').addEventListener('input', e => {
            currentPage = 1;
            paintRows(e.target.value);
        });
        document.getElementById('selectAllChk').addEventListener('change', e => {
            const filter = document.getElementById('filterInput').value;
            const idxs   = getFilteredIndices(filter);
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

    const PAGE_SIZES = [25, 50, 100, 0]; // 0 = All

    function renderPaginationBar(totalFiltered) {
        const bar = document.getElementById('paginationBar');
        if (!bar) return;

        const effectiveSize  = pageSize === 0 ? totalFiltered : pageSize;
        const totalPages     = effectiveSize > 0 ? Math.max(1, Math.ceil(totalFiltered / effectiveSize)) : 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        // page size pills
        const sizePills = PAGE_SIZES.map(s => {
            const label  = s === 0 ? t('allPages') : s;
            const active = s === pageSize;
            return `<button class="page-size-btn${active ? ' active' : ''}" data-size="${s}">${label}</button>`;
        }).join('');

        // nav (only show when pagination is active)
        const showNav = pageSize !== 0 && totalPages > 1;
        const navHtml = showNav ? `
          <span class="page-nav">
            <button class="page-btn" id="prevPageBtn" ${currentPage <= 1 ? 'disabled' : ''}>${t('prev')}</button>
            <span class="page-info">${t('pageOf', currentPage, totalPages)}</span>
            <button class="page-btn" id="nextPageBtn" ${currentPage >= totalPages ? 'disabled' : ''}>${t('next')}</button>
          </span>` : '';

        bar.innerHTML = `
        <div class="page-size-group">${sizePills}</div>
        <span class="page-size-label">${escapeHtml(t('perPage'))}</span>
        ${navHtml}
      `;

        bar.querySelectorAll('.page-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                pageSize    = parseInt(btn.dataset.size);
                currentPage = 1;
                try { localStorage.setItem('harPageSize', pageSize); } catch(e) {}
                const filter = document.getElementById('filterInput')?.value || '';
                paintRows(filter);
            });
        });
        if (showNav) {
            document.getElementById('prevPageBtn')?.addEventListener('click', () => {
                currentPage--;
                const filter = document.getElementById('filterInput')?.value || '';
                paintRows(filter);
            });
            document.getElementById('nextPageBtn')?.addEventListener('click', () => {
                currentPage++;
                const filter = document.getElementById('filterInput')?.value || '';
                paintRows(filter);
            });
        }
    }

    function paintRows(filter) {
        const rows = document.getElementById('rows');
        if (!rows) return;
        rows.innerHTML = '';

        const allIdxs = getFilteredIndices(filter);
        const total   = allIdxs.length;

        // Paginate
        let pageIdxs;
        if (pageSize === 0) {
            pageIdxs = allIdxs;
        } else {
            const start = (currentPage - 1) * pageSize;
            pageIdxs = allIdxs.slice(start, start + pageSize);
        }

        pageIdxs.forEach(i => {
            const item = simplified[i];
            const sc   = statusClass(item.status);
            const row  = document.createElement('div');
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

        updateSelectionUI(allIdxs);
        renderPaginationBar(total);
    }

    function updateSelectionUI(idxs) {
        const selCountEl  = document.getElementById('selCount');
        const dlSelBtn    = document.getElementById('downloadSelectedBtn');
        const selectAllChk= document.getElementById('selectAllChk');
        const count = selected.size;
        if (selCountEl) selCountEl.textContent = count ? t('selected', count) : '';
        if (dlSelBtn)   dlSelBtn.style.display  = count ? 'inline-flex' : 'none';
        if (selectAllChk) {
            const allChecked = idxs.length > 0 && idxs.every(i => selected.has(i));
            const anyChecked = idxs.some(i => selected.has(i));
            selectAllChk.checked       = allChecked;
            selectAllChk.indeterminate = anyChecked && !allChecked;
        }
    }

    // ── Detail panel ───────────────────────────────────────────────────────
    function showDetail(i) {
        const item     = simplified[i];
        const pane     = document.getElementById('detailPane');
        const queryStr = JSON.stringify(item.requestParams.query, null, 2);
        const bodyStr  = typeof item.requestParams.body === 'object'
            ? JSON.stringify(item.requestParams.body, null, 2)
            : (item.requestParams.body || t('noBody'));
        const responseStr = typeof item.response === 'object'
            ? JSON.stringify(item.response, null, 2)
            : (item.response || t('noContent'));

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
        <div class="tab active" data-tab="request">${t('tabRequest')}</div>
        <div class="tab" data-tab="response">${t('tabResponse')}</div>
        <div class="tab" data-tab="raw">${t('tabRaw')}</div>
      </div>
      <div class="tab-body" id="tabBody"></div>
    `;

        const tabBody = document.getElementById('tabBody');
        function paintTab(tab) {
            if (tab === 'request') {
                tabBody.innerHTML = `
          <div class="section-title">${t('sectionQuery')}</div>
          ${item.requestParams.query.length ? `<pre>${escapeHtml(queryStr)}</pre>` : `<p class="empty-note">${t('noQueryParams')}</p>`}
          <div class="section-title" style="margin-top:20px;">${t('sectionBody')}</div>
          <pre>${escapeHtml(bodyStr)}</pre>
        `;
            } else if (tab === 'response') {
                tabBody.innerHTML = `
          <div class="section-title">${t('sectionResponse')}</div>
          <pre>${escapeHtml(responseStr)}</pre>
        `;
            } else {
                tabBody.innerHTML = `<pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>`;
            }
        }
        paintTab('request');
        pane.querySelectorAll('.tab').forEach(tb => {
            tb.addEventListener('click', () => {
                pane.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                tb.classList.add('active');
                paintTab(tb.dataset.tab);
            });
        });
    }

    // ── Stats bar ──────────────────────────────────────────────────────────
    function buildStats() {
        statsEl.style.display = 'flex';
        statTotal.textContent = simplified.length;
        if (statLabel) statLabel.textContent = t('statLabel');
        const counts = { s2: 0, s3: 0, s4: 0, s5: 0, s0: 0 };
        simplified.forEach(i => counts[statusClass(i.status)]++);
        const colors = { s2: 'var(--s2xx)', s3: 'var(--s3xx)', s4: 'var(--s4xx)', s5: 'var(--s5xx)', s0: 'var(--s0)' };
        statStrip.innerHTML = '';
        Object.keys(counts).forEach(k => {
            if (!counts[k]) return;
            const seg = document.createElement('div');
            seg.style.width      = (counts[k] / simplified.length * 100) + '%';
            seg.style.background = colors[k];
            statStrip.appendChild(seg);
        });
    }

    // ── Download ───────────────────────────────────────────────────────────
    downloadBtn.addEventListener('click', () => {
        if (!simplified.length) return;
        downloadJSON(simplified, 'har-simplified.json');
    });

    function downloadJSON(data, filename) {
        if (!data.length) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Utilities ──────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
})();