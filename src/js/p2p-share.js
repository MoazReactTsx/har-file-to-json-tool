/**
 * p2p-share.js
 * -----------------------------------------------------------------------
 * Browser-to-browser data transport using Trystero (serverless WebRTC
 * signaling over public BitTorrent trackers) instead of manual SDP
 * copy-paste. No signaling server of our own, no backend — but also no
 * "send me a huge code, now send me a huge code back" dance. Both sides
 * just need the same short room code.
 *
 * Loaded as a plain <script> tag (NOT type="module") — Trystero itself is
 * ESM-only, so it's pulled in lazily via a dynamic import() from a CDN the
 * first time it's actually needed. That keeps this file loadable the same
 * way as every other script in the project (no build step, no bundler).
 *
 * Usage (host / sender side):
 *   const share = new P2PShare({ onStatus, onData, onError });
 *   const roomCode = await share.hostRoom(myPayload); // give this code to the peer
 *   // ...once they join, `myPayload` is sent automatically...
 *
 * Usage (join / receiver side):
 *   const share = new P2PShare({ onData: (data) => console.log(data) });
 *   await share.joinRoom(roomCode);
 *   // share.onData fires automatically once the transfer completes
 * -----------------------------------------------------------------------
 * Plain vanilla JS — no bundler, no <script type="module"> needed on this
 * file itself. Just include it with a normal
 * <script src="p2p-share.js"></script> tag (before p2p-share-ui.js, if you
 * use that too) and use `P2PShare` globally.
 * -----------------------------------------------------------------------
 */

(function(global) {
    'use strict';

    // Trystero is ESM-only, so it's fetched from a CDN with a dynamic
    // import() the first time it's needed, then cached. The 'torrent'
    // build uses public BitTorrent trackers for the initial handshake
    // (who's in this room) — no server of ours, no account, no API key.
    const TRYSTERO_CDN = 'https://esm.run/trystero/torrent';
    let trysteroModulePromise = null;

    function loadTrystero() {
        if (!trysteroModulePromise) {
            trysteroModulePromise = import(TRYSTERO_CDN);
        }
        return trysteroModulePromise;
    }

    // Room codes avoid visually-ambiguous characters (0/O, 1/l/I) since
    // they're meant to be read aloud or typed by hand.
    const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
    function randomRoomCode(len = 6) {
        let out = '';
        for (let i = 0; i < len; i++) {
            out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
        }
        return out;
    }

    class P2PShare {
        /**
         * @param {Object} opts
         * @param {string} [opts.appId]             - namespaces rooms so this app's room
         *        codes don't collide with other sites also using Trystero. Keep this
         *        constant across your whole app; change it only if you want old/new
         *        versions to never share a room by accident.
         * @param {number} [opts.chunkSize]         - characters per message (default 15000)
         * @param {number} [opts.connectTimeoutMs]  - max wait for a peer to join the room
         *        before giving up (default 120000 / 2 minutes). Counted from when the
         *        room is actually created/joined, not from any earlier step.
         * @param {string} [opts.deviceName]        - local device name, informational only
         * @param {(status: string) => void}         [opts.onStatus]   - status events:
         *        'connected-sent' | 'connected-waiting' | 'received' | 'disconnected' |
         *        'timeout' | 'error'
         * @param {(received: number, total: number) => void} [opts.onProgress]
         * @param {(data: any) => void}              [opts.onData]     - fired when transfer completes
         * @param {(err: Error, code?: string) => void} [opts.onError] - error with optional code:
         *        'load-error' | 'send-error' | 'reassemble-error' | 'timeout'
         */
        constructor({
            appId            = 'har-inspector-v1',
            chunkSize        = 15000,
            connectTimeoutMs = 120000,
            deviceName,
            onStatus,
            onProgress,
            onData,
            onError,
        } = {}) {
            this.appId            = appId;
            this.chunkSize        = chunkSize;
            this.connectTimeoutMs = connectTimeoutMs;
            this.deviceName       = deviceName || null;
            this.onStatus   = onStatus   || (() => {});
            this.onProgress = onProgress || (() => {});
            this.onData     = onData     || (() => {});
            this.onError    = onError    || (() => {});

            this.room          = null;
            this._sendData      = null;
            this._pendingPayload   = null;
            this._incomingChunks   = [];
            this._incomingExpected = 0;
            this._receivedCount    = 0;
            this._connectTimer     = null;
            this.roomCode       = null;
        }

        /** Leave the room (if any) and reset all state. Safe to call anytime. */
        teardown() {
            this._clearConnectTimer();
            if (this.room) {
                try { this.room.leave(); } catch (e) { /* noop */ }
                this.room = null;
            }
            this._sendData          = null;
            this._pendingPayload    = null;
            this._incomingChunks    = [];
            this._incomingExpected  = 0;
            this.roomCode           = null;
        }

        _clearConnectTimer() {
            if (this._connectTimer) {
                clearTimeout(this._connectTimer);
                this._connectTimer = null;
            }
        }

        _startConnectTimer(onTimeoutMessage) {
            this._clearConnectTimer();
            this._connectTimer = setTimeout(() => {
                this._emitError(new Error(onTimeoutMessage), 'timeout');
                this.onStatus('timeout');
                this.teardown();
            }, this.connectTimeoutMs);
        }

        _emitError(err, code) {
            try { this.onError(err, code); } catch (e) { /* noop */ }
        }

        // ── HOST ───────────────────────────────────────────────────────
        /**
         * Create a room and wait for a peer to join. `payload` is sent
         * automatically the moment someone joins.
         * @param {any} payload - anything JSON-serializable
         * @returns {Promise<string>} the room code to share with the other person
         */
        async hostRoom(payload) {
            this.teardown();
            this._pendingPayload = payload;

            let trystero;
            try {
                trystero = await loadTrystero();
            } catch (e) {
                this._emitError(new Error('تعذر تحميل مكتبة الاتصال — تحقق من الإنترنت وحاول تاني'), 'load-error');
                throw e;
            }

            this.roomCode = randomRoomCode();
            this.room = trystero.joinRoom({ appId: this.appId }, this.roomCode);
            const [sendData, getData] = this.room.makeAction('har-data');
            this._sendData = sendData;
            void getData; // host doesn't expect incoming data in this simple protocol

            this.room.onPeerJoin(() => {
                this._clearConnectTimer();
                this._send(this._pendingPayload);
                this.onStatus('connected-sent');
            });
            this.room.onPeerLeave(() => this.onStatus('disconnected'));

            this._startConnectTimer('محدش دخل الأوضة خلال الوقت المحدد — جرّب كود جديد.');
            return this.roomCode;
        }

        // ── JOIN ───────────────────────────────────────────────────────
        /**
         * Join a room by its code and wait for the host's data to arrive.
         * @param {string} code
         */
        async joinRoom(code) {
            this.teardown();
            const trimmed = String(code || '').trim().toLowerCase();
            if (!trimmed) throw new Error('كود الأوضة فاضي.');

            let trystero;
            try {
                trystero = await loadTrystero();
            } catch (e) {
                this._emitError(new Error('تعذر تحميل مكتبة الاتصال — تحقق من الإنترنت وحاول تاني'), 'load-error');
                throw e;
            }

            this.roomCode = trimmed;
            this.room = trystero.joinRoom({ appId: this.appId }, this.roomCode);
            const [sendData, getData] = this.room.makeAction('har-data');
            this._sendData = sendData;
            void sendData; // joiner doesn't send anything in this simple protocol

            getData((msg) => this._handleIncoming(msg));

            this.room.onPeerJoin(() => {
                this._clearConnectTimer();
                this.onStatus('connected-waiting');
            });
            this.room.onPeerLeave(() => this.onStatus('disconnected'));

            this._startConnectTimer('محدش لقى الأوضة دي — تأكد من الكود وإن المضيف لسه فاتح الصفحة.');
        }

        // ── TRANSFER ───────────────────────────────────────────────────
        _send(payload) {
            const json  = JSON.stringify(payload);
            const total = Math.max(1, Math.ceil(json.length / this.chunkSize));
            try {
                this._sendData({ t: 'start', n: total });
                for (let i = 0; i < total; i++) {
                    this._sendData({
                        t: 'chunk', i,
                        d: json.slice(i * this.chunkSize, (i + 1) * this.chunkSize),
                    });
                }
                this._sendData({ t: 'end' });
            } catch (e) {
                this._emitError(e, 'send-error');
            }
        }

        _handleIncoming(msg) {
            if (!msg || typeof msg !== 'object') return;
            if (msg.t === 'start') {
                this._incomingChunks   = new Array(msg.n);
                this._incomingExpected = msg.n;
                this._receivedCount    = 0;
                this.onProgress(0, msg.n);
            } else if (msg.t === 'chunk') {
                this._incomingChunks[msg.i] = msg.d;
                this._receivedCount++;
                this.onProgress(this._receivedCount, this._incomingExpected);
            } else if (msg.t === 'end') {
                try {
                    const data = JSON.parse(this._incomingChunks.join(''));
                    this.onData(data);
                    this.onStatus('received');
                } catch (e) {
                    this._emitError(e, 'reassemble-error');
                }
            }
        }
    }

    global.P2PShare = P2PShare;

})(typeof window !== 'undefined' ? window : this);