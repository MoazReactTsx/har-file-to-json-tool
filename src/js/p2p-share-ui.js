/**
 * p2p-share-ui.js
 * -----------------------------------------------------------------------
 * Plug-and-play modal UI for P2PShare (see p2p-share.js). Fully self-styled
 * (injects its own scoped CSS once) so it works in any project without
 * relying on the host page's classes. All text is overridable via `labels`.
 *
 * Usage:
 *   import { P2PShare } from './p2p-share.js';
 *   import { createP2PShareModal } from './p2p-share-ui.js';
 *
 *   const modal = createP2PShareModal({
 *     getPayload: () => mySelectedItems,       // called when hosting
 *     itemCount: () => mySelectedItems.length, // shown as "share N items"
 *     onDataReceived: (data) => { myItems = data; renderMyList(); },
 *     labels: { ... }, // optional overrides, see DEFAULT_LABELS below
 *   });
 *
 *   openShareButton.addEventListener('click', () => modal.open('host'));
 *
 * Plain vanilla JS — load AFTER p2p-share.js with a normal
 * <script src="p2p-share-ui.js"></script> tag. No bundler, no modules.
 * Exposes a single global: `createP2PShareModal`.
 * -----------------------------------------------------------------------
 */

(function(global) {
    'use strict';

    if (!global.P2PShare) {
        throw new Error('p2p-share-ui.js requires p2p-share.js to be loaded first.');
    }
    const P2PShare = global.P2PShare;

    const DEFAULT_LABELS = {
        title: 'مشاركة مباشرة',
        hostTab: 'مضيف',
        joinTab: 'انضمام',
        hostIntro: 'هيتم إنشاء كود اتصال، ابعته للشخص التاني. بعدها هو هيبعتلك كود رد، تحطه تحت وتضغط اتصال. البيانات بتتبعت مباشرة بين المتصفحين.',
        hostStart: (n) => `ابدأ مشاركة (${n})`,
        hostNoData: 'مفيش بيانات تشاركها دلوقتي.',
        step1Host: 'الخطوة ١ — ابعت الكود ده للطرف التاني',
        step2Host: 'الخطوة ٢ — الصق الكود اللي هيبعتهولك',
        copy: 'نسخ الكود',
        connect: 'اتصال',
        answerPlaceholder: 'الصق كود الرد هنا...',
        waitingAnswer: 'في انتظار كود الرد...',
        connecting: 'بيتصل...',
        connectedSent: (n) => `متصل — تم إرسال ${n} عنصر ✅`,
        closed: 'الاتصال اتقفل',
        badAnswer: 'كود الرد مش صحيح.',
        joinIntro: 'الصق الكود اللي بعتهولك المضيف، وهيتولّد كود رد — ابعته له. البيانات هتظهر أول ما يوصل الاتصال.',
        step1Join: 'الخطوة ١ — الصق كود المضيف',
        generateAnswer: 'توليد كود الرد',
        step2Join: 'الخطوة ٢ — ابعت الكود ده للمضيف',
        connectedWaiting: 'متصل — في انتظار البيانات...',
        receiving: (r, n) => `جاري الاستقبال ${r}/${n}...`,
        received: (n) => `اتستقبل ${n} عنصر ✅`,
        receiveError: 'حصل خطأ في استقبال البيانات',
        badOffer: 'كود المضيف مش صحيح.',
        close: '×',
    };

    let cssInjected = false;

    function injectCss() {
        if (cssInjected) return;
        cssInjected = true;
        const style = document.createElement('style');
        style.textContent = `
  .p2ps-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,-apple-system,Segoe UI,Tahoma,Arial,sans-serif}
  .p2ps-overlay.open{display:flex}
  .p2ps-modal{background:#fff;color:#1a1a1a;width:min(480px,92vw);max-height:85vh;overflow:auto;border-radius:12px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .p2ps-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .p2ps-head h3{margin:0;font-size:16px}
  .p2ps-close{cursor:pointer;background:none;border:none;font-size:20px;line-height:1;color:#666}
  .p2ps-tabs{display:flex;gap:6px;margin-bottom:14px}
  .p2ps-tab{flex:1;text-align:center;padding:8px;border-radius:8px;cursor:pointer;background:#f0f0f0;font-size:13px}
  .p2ps-tab.active{background:#2563eb;color:#fff}
  .p2ps-hint{font-size:13px;color:#555;line-height:1.6;margin:0 0 14px}
  .p2ps-step{display:flex;flex-direction:column;gap:6px;margin-top:14px}
  .p2ps-label{font-size:12px;font-weight:600;color:#333}
  .p2ps-code{width:100%;box-sizing:border-box;min-height:70px;font-family:monospace;font-size:11px;padding:8px;border:1px solid #ddd;border-radius:8px;resize:vertical}
  .p2ps-btn{cursor:pointer;border:none;border-radius:8px;padding:9px 14px;font-size:13px;background:#eee;color:#222}
  .p2ps-btn.primary{background:#2563eb;color:#fff}
  .p2ps-btn.small{align-self:flex-start;padding:6px 12px;font-size:12px}
  .p2ps-status{margin-top:12px;font-size:13px;padding:8px 10px;border-radius:8px;background:#f4f4f4;display:none}
  .p2ps-status.ok{background:#dcfce7;color:#166534}
  .p2ps-status.pending{background:#fef9c3;color:#854d0e}
  `;
        document.head.appendChild(style);
    }

    /**
     * @param {Object} opts
     * @param {() => any} opts.getPayload - returns the data to send when hosting
     * @param {(data: any) => void} opts.onDataReceived - called with the received data when joining
     * @param {() => number} [opts.itemCount] - for the "share N items" button label
     * @param {Partial<typeof DEFAULT_LABELS>} [opts.labels] - text overrides
     * @param {Object} [opts.shareOptions] - passed through to `new P2PShare(...)`
     */
    function createP2PShareModal(opts) {
        const {
            getPayload,
            onDataReceived,
            itemCount,
            shareOptions = {}
        } = opts;
        const L = {
            ...DEFAULT_LABELS,
            ...(opts.labels || {})
        };

        injectCss();

        const overlay = document.createElement('div');
        overlay.className = 'p2ps-overlay';
        overlay.innerHTML = `
    <div class="p2ps-modal">
      <div class="p2ps-head"><h3>${L.title}</h3><button class="p2ps-close" type="button">${L.close}</button></div>
      <div class="p2ps-tabs">
        <div class="p2ps-tab" data-tab="host">${L.hostTab}</div>
        <div class="p2ps-tab" data-tab="join">${L.joinTab}</div>
      </div>
      <div class="p2ps-body"></div>
    </div>
  `;
        document.body.appendChild(overlay);

        const body = overlay.querySelector('.p2ps-body');
        const tabs = overlay.querySelectorAll('.p2ps-tab');
        const closeBtn = overlay.querySelector('.p2ps-close');

        let currentTab = 'host';
        let share = null;

        function teardown() {
            if (share) share.teardown();
            share = null;
        }

        function open(mode = 'host') {
            currentTab = mode === 'join' ? 'join' : 'host';
            overlay.classList.add('open');
            paintTabs();
            render();
        }

        function close() {
            overlay.classList.remove('open');
            teardown();
        }

        function paintTabs() {
            tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === currentTab));
        }

        tabs.forEach((t) => t.addEventListener('click', () => {
            currentTab = t.dataset.tab;
            paintTabs();
            render();
        }));
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
        }

        function render() {
            teardown();
            currentTab === 'host' ? renderHost() : renderJoin();
        }

        function renderHost() {
            const payload = typeof getPayload === 'function' ? getPayload() : [];
            const n = typeof itemCount === 'function' ? itemCount() : (Array.isArray(payload) ? payload.length : 1);

            if (!n) {
                body.innerHTML = `<p class="p2ps-hint">${L.hostNoData}</p>`;
                return;
            }

            body.innerHTML = `
      <p class="p2ps-hint">${L.hostIntro}</p>
      <button class="p2ps-btn primary" data-act="start">${L.hostStart(n)}</button>
      <div class="p2ps-step" data-step="offer" style="display:none;">
        <div class="p2ps-label">${L.step1Host}</div>
        <textarea class="p2ps-code" readonly data-el="offerCode"></textarea>
        <button class="p2ps-btn small" data-act="copyOffer">${L.copy}</button>
      </div>
      <div class="p2ps-step" data-step="answer" style="display:none;">
        <div class="p2ps-label">${L.step2Host}</div>
        <textarea class="p2ps-code" placeholder="${L.answerPlaceholder}" data-el="answerInput"></textarea>
        <button class="p2ps-btn primary" data-act="connect">${L.connect}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;

            const statusEl = body.querySelector('[data-el="status"]');

            function setStatus(text, cls) {
                statusEl.style.display = 'block';
                statusEl.textContent = text;
                statusEl.className = 'p2ps-status' + (cls ? ' ' + cls : '');
            }

            body.querySelector('[data-act="start"]').addEventListener('click', async () => {
                share = new P2PShare({
                    ...shareOptions,
                    onStatus: (s) => {
                        if (s === 'connected-sent') setStatus(L.connectedSent(Array.isArray(payload) ? payload.length : 1), 'ok');
                        if (s === 'closed') setStatus(L.closed, '');
                    },
                });
                const offerCode = await share.createOffer(payload);
                body.querySelector('[data-step="offer"]').style.display = 'flex';
                body.querySelector('[data-step="answer"]').style.display = 'flex';
                body.querySelector('[data-el="offerCode"]').value = offerCode;
                setStatus(L.waitingAnswer, 'pending');

                body.querySelector('[data-act="copyOffer"]').addEventListener('click', () => copyText(offerCode));
                body.querySelector('[data-act="connect"]').addEventListener('click', async () => {
                    const code = body.querySelector('[data-el="answerInput"]').value;
                    if (!code.trim()) return;
                    try {
                        await share.acceptAnswer(code);
                        setStatus(L.connecting, 'pending');
                    } catch (e) {
                        alert(L.badAnswer);
                    }
                });
            });
        }

        function renderJoin() {
            body.innerHTML = `
      <p class="p2ps-hint">${L.joinIntro}</p>
      <div class="p2ps-step" style="display:flex;">
        <div class="p2ps-label">${L.step1Join}</div>
        <textarea class="p2ps-code" placeholder="" data-el="offerInput"></textarea>
        <button class="p2ps-btn primary" data-act="generate">${L.generateAnswer}</button>
      </div>
      <div class="p2ps-step" data-step="answer" style="display:none;">
        <div class="p2ps-label">${L.step2Join}</div>
        <textarea class="p2ps-code" readonly data-el="answerCode"></textarea>
        <button class="p2ps-btn small" data-act="copyAnswer">${L.copy}</button>
      </div>
      <div class="p2ps-status" data-el="status"></div>
    `;

            const statusEl = body.querySelector('[data-el="status"]');

            function setStatus(text, cls) {
                statusEl.style.display = 'block';
                statusEl.textContent = text;
                statusEl.className = 'p2ps-status' + (cls ? ' ' + cls : '');
            }

            body.querySelector('[data-act="generate"]').addEventListener('click', async () => {
                const code = body.querySelector('[data-el="offerInput"]').value;
                if (!code.trim()) return;
                try {
                    share = new P2PShare({
                        ...shareOptions,
                        onStatus: (s) => {
                            if (s === 'connected-waiting') setStatus(L.connectedWaiting, 'pending');
                        },
                        onProgress: (r, n) => setStatus(L.receiving(r, n), 'pending'),
                        onData: (data) => {
                            setStatus(L.received(Array.isArray(data) ? data.length : 1), 'ok');
                            if (typeof onDataReceived === 'function') onDataReceived(data);
                            setTimeout(close, 900);
                        },
                        onError: () => setStatus(L.receiveError, ''),
                    });
                    const answerCode = await share.createAnswer(code);
                    body.querySelector('[data-step="answer"]').style.display = 'flex';
                    body.querySelector('[data-el="answerCode"]').value = answerCode;
                    setStatus(L.waitingAnswer, 'pending');
                    body.querySelector('[data-act="copyAnswer"]').addEventListener('click', () => copyText(answerCode));
                } catch (e) {
                    alert(L.badOffer);
                }
            });
        }

        return {
            open,
            close
        };
    }

    global.createP2PShareModal = createP2PShareModal;
})(typeof window !== 'undefined' ? window : this);