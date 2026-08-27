/**
 * p2p-share-ui.js
 * -----------------------------------------------------------------------
 * Plug-and-play modal UI for P2PShare (see p2p-share.js). Fully self-styled
 * (injects its own scoped CSS once) so it works in any project without
 * relying on the host page's classes. All text is overridable via `labels`.
 *
 * Features:
 *   - Saved Devices tab: AES-GCM encrypted device registry (via P2PDeviceStore)
 *   - Direct reconnect: one click to generate a new offer for a saved device
 *   - Rename & Delete saved devices
 *   - "Save this device" opt-in checkbox after a successful connection
 *   - Full Arabic error messages for all failure modes
 *
 * Usage:
 *   const modal = createP2PShareModal({
 *     getPayload:      () => myItems,
 *     itemCount:       () => myItems.length,
 *     onDataReceived:  (data) => { myItems = data; render(); },
 *     labels:          { ... },  // optional
 *   });
 *   openBtn.addEventListener('click', () => modal.open('host'));
 *
 * Plain vanilla JS — load AFTER p2p-share.js. No bundler, no modules.
 * Exposes a single global: `createP2PShareModal`.
 * -----------------------------------------------------------------------
 */

(function(global) {
    'use strict';

    if (!global.P2PShare)       throw new Error('p2p-share-ui.js requires p2p-share.js to be loaded first.');
    if (!global.P2PDeviceStore) throw new Error('p2p-share-ui.js requires p2p-share.js (with P2PDeviceStore) to be loaded first.');

    const P2PShare       = global.P2PShare;
    const P2PDeviceStore = global.P2PDeviceStore;

    const DEFAULT_LABELS = {
        title:            'مشاركة مباشرة',
        hostTab:          'مضيف',
        joinTab:          'انضمام',
        devicesTab:       'الأجهزة',
        hostIntro:        'هيتم إنشاء كود اتصال، ابعته للشخص التاني. بعدها هو هيبعتلك كود رد، تحطه تحت وتضغط اتصال. البيانات بتتبعت مباشرة بين المتصفحين.',
        hostStart:        (n) => `ابدأ مشاركة (${n})`,
        hostNoData:       'مفيش بيانات تشاركها دلوقتي.',
        step1Host:        'الخطوة ١ — ابعت الكود ده للطرف التاني',
        step2Host:        'الخطوة ٢ — الصق الكود اللي هيبعتهولك',
        copy:             'نسخ الكود',
        connect:          'اتصال',
        answerPlaceholder:'الصق كود الرد هنا...',
        waitingAnswer:    'في انتظار كود الرد...',
        connecting:       'بيتصل...',
        connectedSent:    (n) => `متصل — تم إرسال ${n} عنصر ✅`,
        closed:           'الاتصال اتقفل',
        disconnected:     'انقطع الاتصال',
        badAnswer:        'كود الرد غير صالح — تأكد من نسخه كاملًا.',
        iceFailed:        'فشل الاتصال — تعذّر الوصول بين الجهازين. تحقق من الشبكة.',
        timeout:          'انتهت مهلة الاتصال — لم يفتح DataChannel خلال 20 ثانية.',
        channelError:     'خطأ في قناة البيانات.',
        sendError:        'خطأ أثناء إرسال البيانات.',
        joinIntro:        'الصق الكود اللي بعتهولك المضيف، وهيتولّد كود رد — ابعته له. البيانات هتظهر أول ما يوصل الاتصال.',
        step1Join:        'الخطوة ١ — الصق كود المضيف',
        generateAnswer:   'توليد كود الرد',
        step2Join:        'الخطوة ٢ — ابعت الكود ده للمضيف',
        connectedWaiting: 'متصل — في انتظار البيانات...',
        receiving:        (r, n) => `جاري الاستقبال ${r}/${n}...`,
        received:         (n) => `اتستقبل ${n} عنصر ✅`,
        receiveError:     'حصل خطأ في استقبال البيانات',
        badOffer:         'كود المضيف غير صالح — تأكد من نسخه كاملًا.',
        saveDeviceCheck:  'حفظ هذا الجهاز للاتصال مستقبلًا',
        saveDeviceName:   'اسم الجهاز',
        saveDeviceBtn:    'حفظ',
        devicesTitle:     'الأجهزة المحفوظة',
        devicesEmpty:     'لا توجد أجهزة محفوظة بعد.\nبعد أي اتصال ناجح يمكنك حفظ الجهاز.',
        deviceLastSeen:   'آخر اتصال:',
        directConnect:    'اتصال مباشر',
        renameDevice:     'تعديل الاسم',
        deleteDevice:     'حذف',
        confirmDelete:    'تأكيد حذف الجهاز؟',
        encryptedBadge:   '🔒 مشفّر',
        memoryBadge:      '⚠ مؤقت (جلسة فقط)',
        storageError:     'تعذّر حفظ البيانات — سيتم الاحتفاظ بها في الذاكرة فقط لهذه الجلسة.',
        close:            '×',
    };

    let cssInjected = false;

    function injectCss() {
        if (cssInjected) return;
        cssInjected = true;
        const style = document.createElement('style');
        style.textContent = `
/* ── overlay ── */
.p2ps-overlay{position:fixed;inset:0;background:rgba(0,0,0,.52);display:none;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,-apple-system,Segoe UI,Tahoma,Arial,sans-serif}
.p2ps-overlay.open{display:flex}
/* ── modal ── */
.p2ps-modal{background:#fff;color:#1a1a1a;width:min(500px,94vw);max-height:88vh;overflow:auto;border-radius:14px;padding:22px;box-shadow:0 24px 72px rgba(0,0,0,.32);display:flex;flex-direction:column;gap:0}
/* ── header ── */
.p2ps-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.p2ps-head h3{margin:0;font-size:16px;font-weight:700}
.p2ps-close{cursor:pointer;background:none;border:none;font-size:22px;line-height:1;color:#666;padding:0 4px;transition:color .15s}
.p2ps-close:hover{color:#111}
/* ── tabs ── */
.p2ps-tabs{display:flex;gap:5px;margin-bottom:16px}
.p2ps-tab{flex:1;text-align:center;padding:8px 6px;border-radius:8px;cursor:pointer;background:#f0f0f0;font-size:12.5px;font-weight:500;transition:background .15s,color .15s;user-select:none}
.p2ps-tab.active{background:#2563eb;color:#fff}
/* ── hints ── */
.p2ps-hint{font-size:13px;color:#555;line-height:1.7;margin:0 0 14px;white-space:pre-line}
/* ── steps ── */
.p2ps-step{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.p2ps-label{font-size:11.5px;font-weight:700;color:#333;letter-spacing:.2px}
.p2ps-code{width:100%;box-sizing:border-box;min-height:72px;font-family:monospace;font-size:11px;padding:9px;border:1.5px solid #ddd;border-radius:8px;resize:vertical;transition:border-color .15s}
.p2ps-code:focus{border-color:#2563eb;outline:none}
/* ── buttons ── */
.p2ps-btn{cursor:pointer;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;background:#eee;color:#222;transition:background .15s,opacity .15s;display:inline-flex;align-items:center;gap:6px}
.p2ps-btn:hover{background:#ddd}
.p2ps-btn.primary{background:#2563eb;color:#fff}
.p2ps-btn.primary:hover{background:#1d4ed8}
.p2ps-btn.small{align-self:flex-start;padding:6px 12px;font-size:12px}
.p2ps-btn.danger{background:#fee2e2;color:#b91c1c}
.p2ps-btn.danger:hover{background:#fecaca}
.p2ps-btn:disabled{opacity:.45;cursor:not-allowed}
/* ── status ── */
.p2ps-status{margin-top:12px;font-size:13px;padding:9px 11px;border-radius:8px;background:#f4f4f4;display:none;line-height:1.5}
.p2ps-status.ok{background:#dcfce7;color:#166534}
.p2ps-status.pending{background:#fef9c3;color:#854d0e}
.p2ps-status.error{background:#fee2e2;color:#b91c1c}
/* ── save device row ── */
.p2ps-save-row{display:flex;align-items:center;gap:10px;margin-top:14px;padding:10px 12px;background:#f8faff;border:1.5px dashed #93c5fd;border-radius:10px;flex-wrap:wrap}
.p2ps-save-row label{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;cursor:pointer}
.p2ps-save-row input[type=checkbox]{width:16px;height:16px;cursor:pointer;accent-color:#2563eb}
.p2ps-save-input{flex:1;min-width:120px;padding:7px 10px;border:1.5px solid #ddd;border-radius:7px;font-size:12.5px;background:#fff;transition:border-color .15s}
.p2ps-save-input:focus{border-color:#2563eb;outline:none}
/* ── saved devices list ── */
.p2ps-devices-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.p2ps-devices-title{font-size:13px;font-weight:700;color:#111}
.p2ps-storage-badge{font-size:10.5px;padding:3px 8px;border-radius:999px;font-weight:600}
.p2ps-storage-badge.enc{background:#dcfce7;color:#166534}
.p2ps-storage-badge.mem{background:#fef9c3;color:#854d0e}
.p2ps-devices-empty{text-align:center;padding:28px 16px;color:#888;font-size:13px;line-height:1.8;white-space:pre-line}
.p2ps-device-card{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:10px;margin-bottom:8px;transition:border-color .15s,box-shadow .15s}
.p2ps-device-card:hover{border-color:#93c5fd;box-shadow:0 2px 12px rgba(37,99,235,.08)}
.p2ps-device-info{flex:1;min-width:0}
.p2ps-device-name{font-size:13.5px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p2ps-device-meta{display:flex;align-items:center;gap:8px;margin-top:3px}
.p2ps-device-id{font-size:10px;font-family:monospace;background:#f3f4f6;color:#555;padding:2px 6px;border-radius:4px;letter-spacing:.5px}
.p2ps-device-date{font-size:10.5px;color:#888}
.p2ps-device-actions{display:flex;gap:5px;flex-shrink:0}
.p2ps-icon-btn{cursor:pointer;background:none;border:1.5px solid transparent;border-radius:7px;padding:5px 8px;font-size:12px;transition:background .15s,border-color .15s;color:#555}
.p2ps-icon-btn:hover{background:#f3f4f6;border-color:#e5e7eb}
.p2ps-icon-btn.del:hover{background:#fee2e2;border-color:#fecaca;color:#b91c1c}
.p2ps-icon-btn.connect-dev{background:#eff6ff;border-color:#bfdbfe;color:#2563eb}
.p2ps-icon-btn.connect-dev:hover{background:#dbeafe}
/* ── divider ── */
.p2ps-divider{height:1px;background:#e5e7eb;margin:14px 0}
        `;
        document.head.appendChild(style);
    }

    // ── helpers ──────────────────────────────────────────────────────────
    function esc(str) {
        if (typeof str !== 'string') str = String(str ?? '');
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    }

    function fmtDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // ── main factory ─────────────────────────────────────────────────────
    /**
     * @param {Object}   opts
     * @param {()=>any}  opts.getPayload        - returns data to send when hosting
     * @param {(d)=>void}opts.onDataReceived    - called with received data when joining
     * @param {()=>number} [opts.itemCount]     - for "share N items" label
     * @param {Partial<typeof DEFAULT_LABELS>} [opts.labels]
     * @param {Object}   [opts.shareOptions]    - forwarded to `new P2PShare(...)`
     * @param {string}   [opts.deviceId]        - this device's stored ID (if any)
     * @param {string}   [opts.deviceName]      - this device's name
     */
    function createP2PShareModal(opts) {
        const {
            getPayload,
            onDataReceived,
            itemCount,
            shareOptions = {},
        } = opts;

        const L = { ...DEFAULT_LABELS, ...(opts.labels || {}) };

        // Shared device store
        const store = new P2PDeviceStore();

        injectCss();

        // ── DOM skeleton ──────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'p2ps-overlay';
        overlay.innerHTML = `
    <div class="p2ps-modal">
      <div class="p2ps-head">
        <h3>${esc(L.title)}</h3>
        <button class="p2ps-close" type="button" aria-label="إغلاق">${esc(L.close)}</button>
      </div>
      <div class="p2ps-tabs">
        <div class="p2ps-tab" data-tab="host">${esc(L.hostTab)}</div>
        <div class="p2ps-tab" data-tab="join">${esc(L.joinTab)}</div>
        <div class="p2ps-tab" data-tab="devices">${esc(L.devicesTab)}</div>
      </div>
      <div class="p2ps-body"></div>
    </div>
  `;
        document.body.appendChild(overlay);

        const body    = overlay.querySelector('.p2ps-body');
        const tabs    = overlay.querySelectorAll('.p2ps-tab');
        const closeBtn= overlay.querySelector('.p2ps-close');

        let currentTab = 'host';
        let share = null;

        // ── core lifecycle ────────────────────────────────────────────
        function teardown() { if (share) share.teardown(); share = null; }

        function open(mode = 'host') {
            currentTab = ['host','join','devices'].includes(mode) ? mode : 'host';
            overlay.classList.add('open');
            paintTabs();
            render();
        }

        function close() { overlay.classList.remove('open'); teardown(); }

        function paintTabs() {
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
        }

        tabs.forEach(t => t.addEventListener('click', () => {
            currentTab = t.dataset.tab;
            paintTabs();
            render();
        }));
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText)
                navigator.clipboard.writeText(text).catch(() => {});
        }

        function render() { teardown(); ({ host: renderHost, join: renderJoin, devices: renderDevices }[currentTab] || renderHost)(); }

        // ── status helper ─────────────────────────────────────────────
        function makeSetStatus(statusEl) {
            return function setStatus(text, cls) {
                statusEl.style.display = 'block';
                statusEl.textContent = text;
                statusEl.className = 'p2ps-status' + (cls ? ' ' + cls : '');
            };
        }

        // ── error code → Arabic message ───────────────────────────────
        function errorMsg(code) {
            const map = {
                'timeout':          L.timeout,
                'ice-failed':       L.iceFailed,
                'connection-failed':L.iceFailed,
                'channel-error':    L.channelError,
                'send-error':       L.sendError,
                'parse-error':      L.receiveError,
                'reassemble-error': L.receiveError,
            };
            return map[code] || L.receiveError;
        }

        // ── "Save this device" widget ─────────────────────────────────
        function makeSaveWidget(statusEl, setStatus, onSaved) {
            const row = document.createElement('div');
            row.className = 'p2ps-save-row';
            row.innerHTML = `
        <label>
          <input type="checkbox" id="p2ps-save-chk">
          <span>${esc(L.saveDeviceCheck)}</span>
        </label>
        <input class="p2ps-save-input" id="p2ps-save-name" placeholder="${esc(L.saveDeviceName)}" style="display:none;">
        <button class="p2ps-btn small primary" id="p2ps-save-do" style="display:none;">${esc(L.saveDeviceBtn)}</button>
      `;
            const chk  = row.querySelector('#p2ps-save-chk');
            const inp  = row.querySelector('#p2ps-save-name');
            const btn  = row.querySelector('#p2ps-save-do');

            chk.addEventListener('change', () => {
                inp.style.display = chk.checked ? '' : 'none';
                btn.style.display = chk.checked ? '' : 'none';
            });

            btn.addEventListener('click', async () => {
                const name = inp.value.trim() || 'جهاز جديد';
                btn.disabled = true;
                const id = await store.saveDevice(name);
                btn.disabled = false;
                row.innerHTML = `<span style="font-size:12.5px;color:#166534;font-weight:600">✅ تم حفظ الجهاز "${esc(name)}"</span>`;
                if (!store.isEncrypted) {
                    statusEl.style.display = 'block';
                    setStatus(L.storageError, 'error');
                }
                if (typeof onSaved === 'function') onSaved(id, name);
            });

            return row;
        }

        // ── HOST tab ──────────────────────────────────────────────────
        function renderHost() {
            const payload = typeof getPayload === 'function' ? getPayload() : [];
            const n = typeof itemCount === 'function' ? itemCount() : (Array.isArray(payload) ? payload.length : 1);

            if (!n) {
                body.innerHTML = `<p class="p2ps-hint">${esc(L.hostNoData)}</p>`;
                return;
            }

            body.innerHTML = `
      <p class="p2ps-hint">${esc(L.hostIntro)}</p>
      <button class="p2ps-btn primary" data-act="start">${esc(L.hostStart(n))}</button>
      <div class="p2ps-step" data-step="offer" style="display:none;">
        <div class="p2ps-label">${esc(L.step1Host)}</div>
        <textarea class="p2ps-code" readonly data-el="offerCode"></textarea>
        <button class="p2ps-btn small" data-act="copyOffer">${esc(L.copy)}</button>
      </div>
      <div class="p2ps-step" data-step="answer" style="display:none;">
        <div class="p2ps-label">${esc(L.step2Host)}</div>
        <textarea class="p2ps-code" placeholder="${esc(L.answerPlaceholder)}" data-el="answerInput"></textarea>
        <button class="p2ps-btn primary" data-act="connect">${esc(L.connect)}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;
            const statusEl  = body.querySelector('[data-el="status"]');
            const setStatus = makeSetStatus(statusEl);

            body.querySelector('[data-act="start"]').addEventListener('click', async () => {
                share = new P2PShare({
                    ...shareOptions,
                    onStatus: (s) => {
                        if (s === 'connected-sent') {
                            setStatus(L.connectedSent(Array.isArray(payload) ? payload.length : 1), 'ok');
                            // show save widget after successful send
                            if (!body.querySelector('.p2ps-save-row')) {
                                body.appendChild(makeSaveWidget(statusEl, setStatus, null));
                            }
                        }
                        if (s === 'closed')        setStatus(L.closed, '');
                        if (s === 'disconnected')  setStatus(L.disconnected, 'error');
                        if (s === 'timeout')       setStatus(L.timeout, 'error');
                        if (s === 'error')         setStatus(L.iceFailed, 'error');
                    },
                    onError: (_err, code) => setStatus(errorMsg(code), 'error'),
                });
                const offerCode = await share.createOffer(payload);
                body.querySelector('[data-step="offer"]').style.display  = 'flex';
                body.querySelector('[data-step="answer"]').style.display = 'flex';
                body.querySelector('[data-el="offerCode"]').value        = offerCode;
                setStatus(L.waitingAnswer, 'pending');

                body.querySelector('[data-act="copyOffer"]').addEventListener('click', () => copyText(offerCode));
                body.querySelector('[data-act="connect"]').addEventListener('click', async () => {
                    const code = body.querySelector('[data-el="answerInput"]').value;
                    if (!code.trim()) return;
                    try {
                        await share.acceptAnswer(code);
                        setStatus(L.connecting, 'pending');
                    } catch (e) {
                        setStatus(e.message || L.badAnswer, 'error');
                    }
                });
            });
        }

        // ── JOIN tab ──────────────────────────────────────────────────
        function renderJoin(prefillCode) {
            body.innerHTML = `
      <p class="p2ps-hint">${esc(L.joinIntro)}</p>
      <div class="p2ps-step" style="display:flex;">
        <div class="p2ps-label">${esc(L.step1Join)}</div>
        <textarea class="p2ps-code" placeholder="" data-el="offerInput">${prefillCode ? esc(prefillCode) : ''}</textarea>
        <button class="p2ps-btn primary" data-act="generate">${esc(L.generateAnswer)}</button>
      </div>
      <div class="p2ps-step" data-step="answer" style="display:none;">
        <div class="p2ps-label">${esc(L.step2Join)}</div>
        <textarea class="p2ps-code" readonly data-el="answerCode"></textarea>
        <button class="p2ps-btn small" data-act="copyAnswer">${esc(L.copy)}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;
            const statusEl  = body.querySelector('[data-el="status"]');
            const setStatus = makeSetStatus(statusEl);

            body.querySelector('[data-act="generate"]').addEventListener('click', async () => {
                const code = body.querySelector('[data-el="offerInput"]').value;
                if (!code.trim()) return;
                try {
                    share = new P2PShare({
                        ...shareOptions,
                        onPeerDevice: (did, dn) => {
                            // Auto-surface name from peer's handshake
                            const nameInput = body.querySelector('#p2ps-save-name');
                            if (nameInput && !nameInput.value && dn) nameInput.value = dn;
                        },
                        onStatus: (s) => {
                            if (s === 'connected-waiting') setStatus(L.connectedWaiting, 'pending');
                            if (s === 'closed')       setStatus(L.closed, '');
                            if (s === 'disconnected') setStatus(L.disconnected, 'error');
                            if (s === 'timeout')      setStatus(L.timeout, 'error');
                            if (s === 'error')        setStatus(L.iceFailed, 'error');
                        },
                        onProgress: (r, n) => setStatus(L.receiving(r, n), 'pending'),
                        onData: (data) => {
                            const cnt = Array.isArray(data) ? data.length : 1;
                            setStatus(L.received(cnt), 'ok');
                            if (typeof onDataReceived === 'function') onDataReceived(data);
                            // show save widget after successful receive
                            if (!body.querySelector('.p2ps-save-row')) {
                                body.appendChild(makeSaveWidget(statusEl, setStatus, null));
                            }
                            setTimeout(close, 1200);
                        },
                        onError: (_err, code) => setStatus(errorMsg(code), 'error'),
                    });
                    const answerCode = await share.createAnswer(code);
                    body.querySelector('[data-step="answer"]').style.display = 'flex';
                    body.querySelector('[data-el="answerCode"]').value       = answerCode;
                    setStatus(L.waitingAnswer, 'pending');
                    body.querySelector('[data-act="copyAnswer"]').addEventListener('click', () => copyText(answerCode));
                } catch (e) {
                    setStatus(e.message || L.badOffer, 'error');
                }
            });
        }

        // ── DEVICES tab ───────────────────────────────────────────────
        async function renderDevices() {
            body.innerHTML = '<p class="p2ps-hint" style="margin:0;color:#888;font-size:12px">جاري تحميل الأجهزة...</p>';

            const devices = await store.getAll();

            const badgeClass = store.isEncrypted ? 'enc' : 'mem';
            const badgeText  = store.isEncrypted ? L.encryptedBadge : L.memoryBadge;

            if (!devices.length) {
                body.innerHTML = `
        <div class="p2ps-devices-header">
          <span class="p2ps-devices-title">${esc(L.devicesTitle)}</span>
          <span class="p2ps-storage-badge ${badgeClass}">${esc(badgeText)}</span>
        </div>
        <div class="p2ps-devices-empty">${esc(L.devicesEmpty)}</div>`;
                return;
            }

            body.innerHTML = `
      <div class="p2ps-devices-header">
        <span class="p2ps-devices-title">${esc(L.devicesTitle)}</span>
        <span class="p2ps-storage-badge ${badgeClass}">${esc(badgeText)}</span>
      </div>
      <div id="p2ps-device-list"></div>`;

            const list = body.querySelector('#p2ps-device-list');

            function paintList(devArr) {
                list.innerHTML = '';
                devArr.forEach(dev => {
                    const card = document.createElement('div');
                    card.className = 'p2ps-device-card';
                    card.innerHTML = `
          <div class="p2ps-device-info">
            <div class="p2ps-device-name" id="p2ps-dn-${esc(dev.id)}">${esc(dev.name)}</div>
            <div class="p2ps-device-meta">
              <span class="p2ps-device-id">#${esc(dev.id)}</span>
              <span class="p2ps-device-date">${esc(L.deviceLastSeen)} ${fmtDate(dev.lastSeen)}</span>
            </div>
          </div>
          <div class="p2ps-device-actions">
            <button class="p2ps-icon-btn connect-dev" data-id="${esc(dev.id)}" title="${esc(L.directConnect)}">⚡ ${esc(L.directConnect)}</button>
            <button class="p2ps-icon-btn rename"       data-id="${esc(dev.id)}" title="${esc(L.renameDevice)}">✏️</button>
            <button class="p2ps-icon-btn del"          data-id="${esc(dev.id)}" title="${esc(L.deleteDevice)}">🗑</button>
          </div>`;

                    // Direct Connect → switch to host tab and kick off an offer
                    card.querySelector('.connect-dev').addEventListener('click', async () => {
                        currentTab = 'host';
                        paintTabs();
                        render();
                        // Brief delay to let renderHost paint first
                        await new Promise(r => setTimeout(r, 50));
                        const startBtn = body.querySelector('[data-act="start"]');
                        if (startBtn) startBtn.click();
                        // After a successful connection, auto-touch lastSeen
                        await store.touchDevice(dev.id);
                    });

                    // Rename
                    card.querySelector('.rename').addEventListener('click', async () => {
                        const newName = window.prompt(`${L.renameDevice} — ${dev.name}`, dev.name);
                        if (newName === null) return;
                        await store.renameDevice(dev.id, newName);
                        renderDevices();
                    });

                    // Delete
                    card.querySelector('.del').addEventListener('click', async () => {
                        if (!window.confirm(L.confirmDelete)) return;
                        await store.removeDevice(dev.id);
                        renderDevices();
                    });

                    list.appendChild(card);
                });
            }

            paintList(devices);
        }

        return { open, close, store };
    }

    global.createP2PShareModal = createP2PShareModal;

})(typeof window !== 'undefined' ? window : this);