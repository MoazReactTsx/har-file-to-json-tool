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

    let simplified = [];
    let activeIndex = null;
    let selected = new Set();

    /* ---------- live share (WebRTC, manual signaling) ---------- */
    const rtcConfig = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
    const shareOverlay = document.getElementById('shareOverlay');
    const shareBody = document.getElementById('shareBody');
    const shareBtn = document.getElementById('shareBtn');
    let shareTab = 'host';
    let pc = null, dc = null;
    let incomingChunks = [], incomingExpected = 0;

    shareBtn.addEventListener('click', () => { shareTab = 'host'; openShareModal(); });
    document.getElementById('shareClose').addEventListener('click', closeShareModal);
    shareOverlay.addEventListener('click', e => { if (e.target === shareOverlay) closeShareModal(); });
    document.querySelectorAll('[data-share-tab]').forEach(t => {
        t.addEventListener('click', () => {
            shareTab = t.dataset.shareTab;
            document.querySelectorAll('[data-share-tab]').forEach(x => x.classList.toggle('active', x === t));
            renderShareBody();
        });
    });

    function openShareModal() {
        teardownConnection();
        shareOverlay.classList.add('open');
        document.querySelectorAll('[data-share-tab]').forEach(x => x.classList.toggle('active', x.dataset.shareTab === shareTab));
        renderShareBody();
    }
    function closeShareModal() {
        shareOverlay.classList.remove('open');
        teardownConnection();
    }
    function teardownConnection() {
        if (dc) { try { dc.close(); } catch (e) { } dc = null; }
        if (pc) { try { pc.close(); } catch (e) { } pc = null; }
        incomingChunks = []; incomingExpected = 0;
    }

    function encodeDesc(desc) { return btoa(unescape(encodeURIComponent(JSON.stringify({ type: desc.type, sdp: desc.sdp })))); }
    function decodeDesc(code) { return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }

    function waitIceGatheringComplete(peer) {
        return new Promise(resolve => {
            if (peer.iceGatheringState === 'complete') { resolve(); return; }
            const check = () => {
                if (peer.iceGatheringState === 'complete') {
                    peer.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            peer.addEventListener('icegatheringstatechange', check);
            setTimeout(resolve, 4000);
        });
    }

    function renderShareBody() {
        teardownConnection();
        if (shareTab === 'host') renderHostPanel();
        else renderJoinPanel();
    }

    function renderHostPanel() {
        const count = simplified.length;
        const selCount = selected.size;
        if (!count) {
            shareBody.innerHTML = `<p class="hint">لازم تفتح ملف HAR الأول عشان يكون فيه بيانات تشاركها.</p>`;
            return;
        }
        shareBody.innerHTML = `
      <p class="hint">هيتم إنشاء كود اتصال، ابعته للشخص التاني (واتساب/سلاك/أي حاجة). بعدها هو هيبعتلك كود رد، تحطه تحت وتضغط اتصال. البيانات بتتبعت مباشرة بين المتصفحين، ومتفضلش موجودة إلا لما الصفحة دي فاتحة عندك.</p>
      <button class="btn primary" id="hostStart">${selCount ? `ابدأ مشاركة المحدد (${selCount})` : `ابدأ مشاركة الكل (${count})`}</button>
      <div class="share-step" id="hostOfferStep" style="display:none;">
        <div class="label">الخطوة ١ — ابعت الكود ده للطرف التاني</div>
        <textarea class="code-box" id="hostOfferCode" readonly></textarea>
        <button class="btn small" id="hostCopyOffer">نسخ الكود</button>
      </div>
      <div class="share-step" id="hostAnswerStep" style="display:none;">
        <div class="label">الخطوة ٢ — الصق الكود اللي هيبعتهولك</div>
        <textarea class="code-box" id="hostAnswerInput" placeholder="الصق كود الرد هنا..."></textarea>
        <button class="btn primary" id="hostConnect">اتصال</button>
      </div>
      <div class="share-status" id="hostStatus" style="display:none;"></div>
    `;
        document.getElementById('hostStart').addEventListener('click', hostStart);
    }

    async function hostStart() {
        teardownConnection();
        const payload = selected.size ? Array.from(selected).sort((a, b) => a - b).map(i => simplified[i]) : simplified;
        pc = new RTCPeerConnection(rtcConfig);
        dc = pc.createDataChannel('har');
        dc.onopen = () => {
            sendPayload(dc, payload);
            setHostStatus(`متصل — تم إرسال ${payload.length} طلب ✅`, 'ok');
        };
        dc.onclose = () => setHostStatus('الاتصال اتقفل', '');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceGatheringComplete(pc);
        document.getElementById('hostOfferStep').style.display = 'flex';
        document.getElementById('hostAnswerStep').style.display = 'flex';
        document.getElementById('hostOfferCode').value = encodeDesc(pc.localDescription);
        document.getElementById('hostCopyOffer').addEventListener('click', () => copyText(document.getElementById('hostOfferCode').value));
        document.getElementById('hostConnect').addEventListener('click', async () => {
            const code = document.getElementById('hostAnswerInput').value;
            if (!code.trim()) return;
            try {
                const desc = decodeDesc(code);
                await pc.setRemoteDescription(desc);
                setHostStatus('بيتصل...', 'pending');
            } catch (e) { alert('كود الرد مش صحيح.'); }
        });
        setHostStatus('في انتظار كود الرد...', 'pending');
    }

    function setHostStatus(text, cls) {
        const el = document.getElementById('hostStatus');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = text;
        el.className = 'share-status' + (cls ? ' ' + cls : '');
    }

    function renderJoinPanel() {
        shareBody.innerHTML = `
      <p class="hint">الصق الكود اللي بعتهولك المضيف، وهيتولّد كود رد — ابعته له. البيانات هتظهر هنا أول ما يوصل الاتصال.</p>
      <div class="share-step">
        <div class="label">الخطوة ١ — الصق كود المضيف</div>
        <textarea class="code-box" id="joinOfferInput" placeholder="الصق الكود هنا..."></textarea>
        <button class="btn primary" id="joinGenerate">توليد كود الرد</button>
      </div>
      <div class="share-step" id="joinAnswerStep" style="display:none;">
        <div class="label">الخطوة ٢ — ابعت الكود ده للمضيف</div>
        <textarea class="code-box" id="joinAnswerCode" readonly></textarea>
        <button class="btn small" id="joinCopyAnswer">نسخ الكود</button>
      </div>
      <div class="share-status" id="joinStatus" style="display:none;"></div>
    `;
        document.getElementById('joinGenerate').addEventListener('click', joinGenerate);
    }

    async function joinGenerate() {
        const code = document.getElementById('joinOfferInput').value;
        if (!code.trim()) return;
        teardownConnection();
        try {
            pc = new RTCPeerConnection(rtcConfig);
            pc.ondatachannel = e => {
                dc = e.channel;
                dc.onmessage = ev => handleIncomingMessage(ev.data);
                dc.onopen = () => setJoinStatus('متصل — في انتظار البيانات...', 'pending');
            };
            const desc = decodeDesc(code);
            await pc.setRemoteDescription(desc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await waitIceGatheringComplete(pc);
            document.getElementById('joinAnswerStep').style.display = 'flex';
            document.getElementById('joinAnswerCode').value = encodeDesc(pc.localDescription);
            document.getElementById('joinCopyAnswer').addEventListener('click', () => copyText(document.getElementById('joinAnswerCode').value));
            setJoinStatus('ابعت الكود للمضيف وانتظر الاتصال...', 'pending');
        } catch (e) { alert('كود المضيف مش صحيح.'); }
    }

    function setJoinStatus(text, cls) {
        const el = document.getElementById('joinStatus');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = text;
        el.className = 'share-status' + (cls ? ' ' + cls : '');
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => { });
    }

    function sendPayload(channel, arr) {
        const json = JSON.stringify(arr);
        const CHUNK = 15000;
        const total = Math.max(1, Math.ceil(json.length / CHUNK));
        channel.send(JSON.stringify({ t: 'start', n: total }));
        for (let i = 0; i < total; i++) {
            channel.send(JSON.stringify({ t: 'chunk', i, d: json.slice(i * CHUNK, (i + 1) * CHUNK) }));
        }
        channel.send(JSON.stringify({ t: 'end' }));
    }

    function handleIncomingMessage(raw) {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        if (msg.t === 'start') {
            incomingChunks = new Array(msg.n);
            incomingExpected = msg.n;
            setJoinStatus(`جاري الاستقبال 0/${msg.n}...`, 'pending');
        } else if (msg.t === 'chunk') {
            incomingChunks[msg.i] = msg.d;
            const received = incomingChunks.filter(c => c !== undefined).length;
            setJoinStatus(`جاري الاستقبال ${received}/${incomingExpected}...`, 'pending');
        } else if (msg.t === 'end') {
            try {
                const data = JSON.parse(incomingChunks.join(''));
                simplified = data;
                selected = new Set();
                activeIndex = null;
                renderList();
                buildStats();
                downloadBtn.disabled = false;
                setJoinStatus(`اتستقبل ${data.length} طلب ✅`, 'ok');
                setTimeout(closeShareModal, 900);
            } catch (e) { setJoinStatus('حصل خطأ في استقبال البيانات', ''); }
        }
    }

    document.getElementById('themeSwitch').addEventListener('click', e => {
        const btn = e.target.closest('.theme-swatch');
        if (!btn) return;
        document.documentElement.setAttribute('data-theme', btn.dataset.theme);
        document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s === btn));
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