/**
 * p2p-share-ui.js
 * -----------------------------------------------------------------------
 * Plug-and-play modal UI for P2PShare (Trystero-backed — see p2p-share.js).
 * Fully self-styled (injects its own scoped CSS once) so it works without
 * relying on the host page's classes. All text is overridable via `labels`.
 *
 * Flow is now a single short room code instead of exchanging two long SDP
 * codes back and forth:
 *   - Host tab: press start → get a room code → share it → data sends
 *     automatically the moment the other person joins.
 *   - Join tab: paste the code → press join → data arrives automatically.
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

    if (!global.P2PShare) throw new Error('p2p-share-ui.js requires p2p-share.js to be loaded first.');

    const P2PShare = global.P2PShare;

    const DEFAULT_LABELS = {
        title:            'مشاركة مباشرة',
        hostTab:          'مضيف',
        joinTab:          'انضمام',
        hostIntro:        'هيتولّد كود أوضة قصير — ابعته للشخص التاني بأي وسيلة (واتساب/سلاك). أول ما يدخل بيه، البيانات بتتبعت مباشرة بين المتصفحين تلقائي.',
        hostStart:        (n) => `ابدأ مشاركة (${n})`,
        hostNoData:       'مفيش بيانات تشاركها دلوقتي.',
        roomCodeLabel:    'كود الأوضة — ابعته للطرف التاني',
        copy:             'نسخ الكود',
        waitingPeer:      'في انتظار الطرف التاني يدخل الأوضة...',
        connectedSent:    (n) => `متصل — تم إرسال ${n} عنصر ✅`,
        disconnected:     'انقطع الاتصال',
        joinIntro:        'الصق كود الأوضة اللي بعتهولك المضيف واضغط دخول. البيانات هتظهر هنا تلقائي أول ما الاتصال يكتمل.',
        joinInputLabel:   'كود الأوضة',
        joinPlaceholder:  'مثال: k7p9m2',
        joinBtn:          'دخول',
        connectedWaiting: 'دخلت الأوضة — في انتظار البيانات...',
        receiving:        (r, n) => `جاري الاستقبال ${r}/${n}...`,
        received:         (n) => `اتستقبل ${n} عنصر ✅`,
        receiveError:     'حصل خطأ في استقبال البيانات',
        loadError:        'تعذر تحميل مكتبة الاتصال — تحقق من الإنترنت وحاول تاني.',
        timeoutHost:      'محدش دخل الأوضة خلال الوقت المحدد — جرّب كود جديد.',
        timeoutJoin:      'محدش لقى الأوضة دي — تأكد من الكود وإن المضيف لسه فاتح الصفحة.',
        sendError:        'خطأ أثناء إرسال البيانات.',
        emptyCode:        'اكتب كود الأوضة الأول.',
        close:            '×',
    };

    let cssInjected = false;

    function injectCss() {
        if (cssInjected) return;
        cssInjected = true;
        const style = document.createElement('style');
        style.textContent = `
.p2ps-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:9999;padding:20px;font-family:var(--ar,system-ui,sans-serif);}
.p2ps-overlay.open{display:flex;}
.p2ps-modal{background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);width:min(460px,94vw);max-height:88vh;overflow:auto;border-radius:10px;padding:22px;box-shadow:0 24px 72px rgba(0,0,0,.45);display:flex;flex-direction:column;}
.p2ps-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.p2ps-head h3{margin:0;font-size:15px;font-weight:600;font-family:var(--sans,sans-serif);color:var(--text,#111);}
.p2ps-close{cursor:pointer;background:none;border:none;font-size:18px;line-height:1;font-family:var(--mono,monospace);color:var(--muted,#666);padding:4px 6px;transition:color .15s;}
.p2ps-close:hover{color:var(--text,#111);}
.p2ps-tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border,#e5e7eb);}
.p2ps-tab{flex:1;text-align:center;padding:9px 6px;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;font-size:12.5px;font-weight:500;font-family:var(--sans,sans-serif);color:var(--muted,#555);transition:color .15s,border-color .15s;user-select:none;}
.p2ps-tab:hover{color:var(--text,#111);}
.p2ps-tab.active{color:var(--accent,#2563eb);border-bottom-color:var(--accent,#2563eb);}
.p2ps-hint{font-size:13px;font-family:var(--ar,sans-serif);color:var(--muted,#555);line-height:1.8;margin:0 0 14px;white-space:pre-line;}
.p2ps-step{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
.p2ps-label{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-family:var(--mono,monospace);color:var(--dim,#888);}
.p2ps-roomcode{
  font-family:var(--mono,monospace); font-size:28px; font-weight:700; letter-spacing:3px;
  text-align:center; color:var(--accent,#2563eb);
  background:var(--bg,#f9f9f9); border:1px solid var(--border,#ddd); border-radius:8px;
  padding:16px 10px; direction:ltr;
}
.p2ps-input{
  width:100%; box-sizing:border-box; font-family:var(--mono,monospace); font-size:16px;
  letter-spacing:2px; text-align:center; padding:12px; background:var(--bg,#f9f9f9);
  color:var(--text,#111); border:1px solid var(--border,#ddd); border-radius:8px;
  direction:ltr; transition:border-color .15s;
}
.p2ps-input:focus{outline:none;border-color:var(--accent,#2563eb);}
.p2ps-btn{cursor:pointer;border:none;border-radius:6px;padding:9px 16px;font-size:13px;font-weight:500;font-family:var(--sans,sans-serif);background:var(--surface-2,#eee);color:var(--text,#111);display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:filter .15s;}
.p2ps-btn:hover{filter:brightness(1.08);}
.p2ps-btn.primary{background:var(--accent,#2563eb);color:var(--on-accent,#fff);font-weight:600;}
.p2ps-btn.small{align-self:center;padding:6px 12px;font-size:12px;border:1px solid var(--border,#ddd);background:transparent;color:var(--text,#111);}
.p2ps-btn.small:hover{border-color:var(--accent,#2563eb);background:var(--accent-soft,#eef2ff);filter:none;}
.p2ps-btn:disabled{opacity:.4;cursor:not-allowed;filter:none;}
.p2ps-status{margin-top:12px;font-size:12px;font-family:var(--mono,monospace);padding:9px 12px;border-inline-start:2px solid var(--border,#ddd);background:var(--surface-2,#f4f4f4);color:var(--muted,#555);display:none;line-height:1.6;}
.p2ps-status.ok{border-inline-start-color:var(--s2xx,#16a34a);color:var(--s2xx,#16a34a);}
.p2ps-status.pending{border-inline-start-color:var(--s3xx,#ca8a04);color:var(--s3xx,#ca8a04);}
.p2ps-status.error{border-inline-start-color:var(--s5xx,#dc2626);color:var(--s5xx,#dc2626);}
.p2ps-modal::-webkit-scrollbar{width:7px;}
.p2ps-modal::-webkit-scrollbar-track{background:transparent;}
.p2ps-modal::-webkit-scrollbar-thumb{background:var(--border,#ccc);border-radius:4px;}
.p2ps-modal::-webkit-scrollbar-thumb:hover{background:var(--dim,#aaa);}
        `;
        document.head.appendChild(style);
    }

    function esc(str) {
        if (typeof str !== 'string') str = String(str ?? '');
        return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    }

    /**
     * @param {Object}   opts
     * @param {()=>any}  opts.getPayload        - returns data to send when hosting
     * @param {(d)=>void}opts.onDataReceived    - called with received data when joining
     * @param {()=>number} [opts.itemCount]     - for "share N items" label
     * @param {Partial<typeof DEFAULT_LABELS>} [opts.labels]
     * @param {Object}   [opts.shareOptions]    - forwarded to `new P2PShare(...)` (e.g. { deviceName, appId })
     */
    function createP2PShareModal(opts) {
        const {
            getPayload,
            onDataReceived,
            itemCount,
            shareOptions = {},
        } = opts;

        const L = { ...DEFAULT_LABELS, ...(opts.labels || {}) };

        injectCss();

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
      </div>
      <div class="p2ps-body"></div>
    </div>
  `;
        document.body.appendChild(overlay);

        const body     = overlay.querySelector('.p2ps-body');
        const tabs     = overlay.querySelectorAll('.p2ps-tab');
        const closeBtn = overlay.querySelector('.p2ps-close');

        let currentTab = 'host';
        let share = null;

        function teardown() { if (share) share.teardown(); share = null; }

        function open(mode = 'host') {
            currentTab = ['host', 'join'].includes(mode) ? mode : 'host';
            overlay.classList.add('open');
            paintTabs();
            render();
        }
        function close() { overlay.classList.remove('open'); teardown(); }

        function paintTabs() {
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
        }
        tabs.forEach(t => t.addEventListener('click', () => {
            if (share) return; // don't allow switching mid-connection
            currentTab = t.dataset.tab;
            paintTabs();
            render();
        }));
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(() => {});
            }
        }

        function render() { teardown(); ({ host: renderHost, join: renderJoin }[currentTab] || renderHost)(); }

        function makeSetStatus(statusEl) {
            return function setStatus(text, cls) {
                statusEl.style.display = 'block';
                statusEl.textContent = text;
                statusEl.className = 'p2ps-status' + (cls ? ' ' + cls : '');
            };
        }

        function errorMsg(code) {
            const map = {
                'load-error':       L.loadError,
                'send-error':       L.sendError,
                'reassemble-error': L.receiveError,
            };
            return map[code] || L.receiveError;
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
      <div class="p2ps-step" data-step="code" style="display:none;">
        <div class="p2ps-label">${esc(L.roomCodeLabel)}</div>
        <div class="p2ps-roomcode" data-el="roomCode"></div>
        <button class="p2ps-btn small" data-act="copyCode">${esc(L.copy)}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;
            const statusEl  = body.querySelector('[data-el="status"]');
            const setStatus = makeSetStatus(statusEl);
            const startBtn  = body.querySelector('[data-act="start"]');

            startBtn.addEventListener('click', async () => {
                startBtn.disabled = true;
                share = new P2PShare({
                    ...shareOptions,
                    onStatus: (s) => {
                        if (s === 'connected-sent')  setStatus(L.connectedSent(Array.isArray(payload) ? payload.length : 1), 'ok');
                        if (s === 'disconnected')    setStatus(L.disconnected, 'error');
                        if (s === 'timeout')         setStatus(L.timeoutHost, 'error');
                    },
                    onError: (_err, code) => setStatus(errorMsg(code), 'error'),
                });
                try {
                    const code = await share.hostRoom(payload);
                    body.querySelector('[data-step="code"]').style.display = 'flex';
                    body.querySelector('[data-el="roomCode"]').textContent = code;
                    body.querySelector('[data-act="copyCode"]').addEventListener('click', () => copyText(code));
                    setStatus(L.waitingPeer, 'pending');
                } catch (e) {
                    setStatus(e.message || L.loadError, 'error');
                    startBtn.disabled = false;
                }
            });
        }

        // ── JOIN tab ──────────────────────────────────────────────────
        function renderJoin() {
            body.innerHTML = `
      <p class="p2ps-hint">${esc(L.joinIntro)}</p>
      <div class="p2ps-step" style="display:flex;">
        <div class="p2ps-label">${esc(L.joinInputLabel)}</div>
        <input class="p2ps-input" type="text" maxlength="12" placeholder="${esc(L.joinPlaceholder)}" data-el="codeInput">
        <button class="p2ps-btn primary" data-act="join">${esc(L.joinBtn)}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;
            const statusEl  = body.querySelector('[data-el="status"]');
            const setStatus = makeSetStatus(statusEl);
            const input     = body.querySelector('[data-el="codeInput"]');
            const joinBtn   = body.querySelector('[data-act="join"]');

            async function attemptJoin() {
                const code = input.value.trim();
                if (!code) { setStatus(L.emptyCode, 'error'); return; }
                joinBtn.disabled = true;
                share = new P2PShare({
                    ...shareOptions,
                    onStatus: (s) => {
                        if (s === 'connected-waiting') setStatus(L.connectedWaiting, 'pending');
                        if (s === 'disconnected')      setStatus(L.disconnected, 'error');
                        if (s === 'timeout')           setStatus(L.timeoutJoin, 'error');
                    },
                    onProgress: (r, n) => setStatus(L.receiving(r, n), 'pending'),
                    onData: (data) => {
                        const cnt = Array.isArray(data) ? data.length : 1;
                        setStatus(L.received(cnt), 'ok');
                        if (typeof onDataReceived === 'function') onDataReceived(data);
                        setTimeout(close, 1000);
                    },
                    onError: (_err, code2) => setStatus(errorMsg(code2), 'error'),
                });
                try {
                    await share.joinRoom(code);
                    setStatus(L.connectedWaiting, 'pending');
                } catch (e) {
                    setStatus(e.message || L.loadError, 'error');
                    joinBtn.disabled = false;
                }
            }

            joinBtn.addEventListener('click', attemptJoin);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') attemptJoin(); });
        }

        return { open, close };
    }

    global.createP2PShareModal = createP2PShareModal;

})(typeof window !== 'undefined' ? window : this);