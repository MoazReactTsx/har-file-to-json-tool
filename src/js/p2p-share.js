/**
 * p2p-share.js
 * -----------------------------------------------------------------------
 * Reusable browser-to-browser data transport over WebRTC (manual/copy-paste
 * signaling — no signaling server needed). Works with ANY JSON-serializable
 * payload, in ANY project. Zero DOM dependency — pure transport logic.
 *
 * Usage (host / sender side):
 *   const share = new P2PShare({ onStatus, onData, onError });
 *   const offerCode = await share.createOffer(myPayload); // send this to the peer
 *   // ...peer sends back an answer code...
 *   await share.acceptAnswer(answerCode);
 *
 * Usage (join / receiver side):
 *   const share = new P2PShare({ onData: (data) => console.log(data) });
 *   const answerCode = await share.createAnswer(offerCode); // send this back
 *   // share.onData fires automatically once the transfer completes
 *
 * Both sides can also send after connecting via share.send(payload).
 * -----------------------------------------------------------------------
 * Includes P2PDeviceStore — AES-GCM encrypted localStorage device registry
 * with automatic in-memory fallback and integrity validation.
 * -----------------------------------------------------------------------
 * Plain vanilla JS — no bundler, no <script type="module">, no build step.
 * Just include it with a normal <script src="p2p-share.js"></script> tag
 * (before p2p-share-ui.js, if you use that too) and use `P2PShare` and
 * `P2PDeviceStore` globally.
 * -----------------------------------------------------------------------
 */

(function(global) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // P2PDeviceStore — safe encrypted device registry
    // ═══════════════════════════════════════════════════════════════════
    /**
     * Encrypted, persistent device registry backed by localStorage.
     * Falls back silently to an in-memory store if localStorage is
     * unavailable (private mode, quota exceeded, SecurityError).
     *
     * A single AES-GCM 256-bit key is auto-generated on first use and
     * stored in localStorage as a raw Base64 export. If the key is ever
     * lost (storage cleared), existing records simply cannot be decrypted
     * and are discarded — no crash.
     *
     * Device record shape:
     * {
     *   id:          string   — random 8-hex ID assigned when first saved
     *   name:        string   — human-friendly label (editable)
     *   lastSeen:    number   — Date.now() of last successful connection
     *   savedAt:     number   — Date.now() when first saved
     * }
     */
    class P2PDeviceStore {
        static STORAGE_KEY      = 'p2pds_v1';
        static CRYPTO_KEY_NAME  = 'p2pds_ck_v1';

        constructor() {
            this._memStore = [];         // in-memory fallback
            this._useMemory = false;
            this._cryptoKey = null;      // CryptoKey, loaded lazily
            this._ready = this._init();  // Promise<void>
        }

        /** Resolves when the store is initialised (key loaded/created). */
        get ready() { return this._ready; }

        // ── Lifecycle ──────────────────────────────────────────────────
        async _init() {
            this._cryptoKey = await this._loadOrCreateKey();
        }

        async _loadOrCreateKey() {
            if (!global.crypto || !global.crypto.subtle) {
                // SubtleCrypto not available — use memory store only
                this._useMemory = true;
                return null;
            }
            try {
                const raw64 = this._lsGet(P2PDeviceStore.CRYPTO_KEY_NAME);
                if (raw64) {
                    const raw = Uint8Array.from(atob(raw64), c => c.charCodeAt(0));
                    return await crypto.subtle.importKey(
                        'raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
                    );
                }
                const key = await crypto.subtle.generateKey(
                    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
                );
                const exported = await crypto.subtle.exportKey('raw', key);
                const raw64out = btoa(String.fromCharCode(...new Uint8Array(exported)));
                this._lsSet(P2PDeviceStore.CRYPTO_KEY_NAME, raw64out);
                return key;
            } catch (e) {
                this._useMemory = true;
                return null;
            }
        }

        // ── Storage helpers ────────────────────────────────────────────
        _lsGet(k) {
            try { return localStorage.getItem(k); } catch (e) { return null; }
        }
        _lsSet(k, v) {
            try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
        }
        _lsDel(k) {
            try { localStorage.removeItem(k); } catch (e) { /* noop */ }
        }

        // ── Crypto helpers ─────────────────────────────────────────────
        async _encrypt(obj) {
            if (!this._cryptoKey) return null;
            const json = JSON.stringify(obj);
            const enc  = new TextEncoder().encode(json);
            const iv   = crypto.getRandomValues(new Uint8Array(12));
            const cipher = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, this._cryptoKey, enc
            );
            // pack: iv(12) | ciphertext
            const buf = new Uint8Array(12 + cipher.byteLength);
            buf.set(iv, 0);
            buf.set(new Uint8Array(cipher), 12);
            return btoa(String.fromCharCode(...buf));
        }

        async _decrypt(b64) {
            if (!this._cryptoKey || !b64) return null;
            try {
                const buf  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                const iv   = buf.slice(0, 12);
                const data = buf.slice(12);
                const plain = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv }, this._cryptoKey, data
                );
                return JSON.parse(new TextDecoder().decode(plain));
            } catch (e) {
                return null;
            }
        }

        // ── Public API ─────────────────────────────────────────────────

        /** @returns {Promise<Array>} list of all saved device records */
        async getAll() {
            await this._ready;
            if (this._useMemory) return [...this._memStore];
            const b64 = this._lsGet(P2PDeviceStore.STORAGE_KEY);
            if (!b64) return [];
            const arr = await this._decrypt(b64);
            if (!Array.isArray(arr)) return [];
            return arr.filter(d => d && d.id && d.name); // schema check
        }

        /** @returns {Promise<string>} the new device's ID */
        async saveDevice(name) {
            await this._ready;
            const devices = await this.getAll();
            const id = Math.random().toString(16).slice(2, 10).toUpperCase();
            const record = { id, name: String(name).trim() || 'جهاز جديد', lastSeen: Date.now(), savedAt: Date.now() };
            devices.push(record);
            await this._persist(devices);
            return id;
        }

        /** Update lastSeen timestamp for an existing device by ID. */
        async touchDevice(id) {
            await this._ready;
            const devices = await this.getAll();
            const dev = devices.find(d => d.id === id);
            if (dev) {
                dev.lastSeen = Date.now();
                await this._persist(devices);
            }
        }

        /** Rename a device. */
        async renameDevice(id, newName) {
            await this._ready;
            const devices = await this.getAll();
            const dev = devices.find(d => d.id === id);
            if (dev) {
                dev.name = String(newName).trim() || dev.name;
                await this._persist(devices);
                return true;
            }
            return false;
        }

        /** Remove a device by ID. */
        async removeDevice(id) {
            await this._ready;
            const devices = (await this.getAll()).filter(d => d.id !== id);
            await this._persist(devices);
        }

        /** Remove all saved devices. */
        async clear() {
            await this._ready;
            if (this._useMemory) { this._memStore = []; return; }
            this._lsDel(P2PDeviceStore.STORAGE_KEY);
        }

        /** @returns {boolean} whether storage is encrypted (false = memory-only fallback) */
        get isEncrypted() { return !this._useMemory && !!this._cryptoKey; }

        async _persist(devices) {
            if (this._useMemory) { this._memStore = devices; return; }
            const b64 = await this._encrypt(devices);
            if (b64 === null || !this._lsSet(P2PDeviceStore.STORAGE_KEY, b64)) {
                // Fallback: quota or permission error
                this._useMemory = true;
                this._memStore = devices;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // P2PShare — WebRTC data transport
    // ═══════════════════════════════════════════════════════════════════
    class P2PShare {
        /**
         * @param {Object} opts
         * @param {Array}  [opts.iceServers]        - custom ICE servers (defaults to public STUN)
         * @param {number} [opts.chunkSize]         - bytes per data-channel message (default 15000)
         * @param {number} [opts.iceTimeoutMs]      - max wait for ICE gathering (default 4000)
         * @param {number} [opts.connectTimeoutMs]  - max wait for data-channel open (default 20000)
         * @param {string} [opts.deviceId]          - local device ID to embed in handshake codes
         * @param {string} [opts.deviceName]        - local device name to embed in handshake codes
         * @param {(status: string) => void}         [opts.onStatus]   - status events
         * @param {(received: number, total: number) => void} [opts.onProgress]
         * @param {(data: any) => void}              [opts.onData]     - fired when transfer completes
         * @param {(err: Error, code?: string) => void} [opts.onError] - error with optional code
         * @param {(peerDeviceId: string, peerDeviceName: string) => void} [opts.onPeerDevice]
         *        - fired with the remote device's id & name after handshake decode
         */
        constructor({
            iceServers,
            chunkSize        = 15000,
            iceTimeoutMs     = 4000,
            connectTimeoutMs = 20000,
            deviceId,
            deviceName,
            onStatus,
            onProgress,
            onData,
            onError,
            onPeerDevice,
        } = {}) {
            this.rtcConfig = {
                iceServers: iceServers || [{
                    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
                }],
            };
            this.chunkSize        = chunkSize;
            this.iceTimeoutMs     = iceTimeoutMs;
            this.connectTimeoutMs = connectTimeoutMs;
            this.deviceId         = deviceId   || null;
            this.deviceName       = deviceName || null;
            this.onStatus      = onStatus      || (() => {});
            this.onProgress    = onProgress    || (() => {});
            this.onData        = onData        || (() => {});
            this.onError       = onError       || (() => {});
            this.onPeerDevice  = onPeerDevice  || (() => {});

            this.pc = null;
            this.dc = null;
            this._pendingPayload   = null;
            this._incomingChunks   = [];
            this._incomingExpected = 0;
            this._connectTimer     = null;
        }

        /** Close any active connection and reset state. Safe to call anytime. */
        teardown() {
            this._clearConnectTimer();
            if (this.dc) {
                try { this.dc.close(); } catch (e) { /* noop */ }
                this.dc = null;
            }
            if (this.pc) {
                try { this.pc.close(); } catch (e) { /* noop */ }
                this.pc = null;
            }
            this._incomingChunks   = [];
            this._incomingExpected = 0;
        }

        // ── Encoding / Decoding ────────────────────────────────────────
        /**
         * Encode an SDP descriptor + optional device metadata into a
         * compact Base64 code suitable for copy-paste.
         */
        static encode(desc, deviceId, deviceName) {
            return btoa(unescape(encodeURIComponent(JSON.stringify({
                type: desc.type,
                sdp:  desc.sdp,
                ...(deviceId   ? { did: deviceId }   : {}),
                ...(deviceName ? { dn:  deviceName  } : {}),
            }))));
        }

        /** Decode a Base64 code back into { type, sdp, did?, dn? }. */
        static decode(code) {
            return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
        }

        // ── ICE gathering ──────────────────────────────────────────────
        _waitIceGatheringComplete(peer) {
            return new Promise((resolve) => {
                if (peer.iceGatheringState === 'complete') { resolve(); return; }
                const check = () => {
                    if (peer.iceGatheringState === 'complete') {
                        peer.removeEventListener('icegatheringstatechange', check);
                        resolve();
                    }
                };
                peer.addEventListener('icegatheringstatechange', check);
                setTimeout(resolve, this.iceTimeoutMs);
            });
        }

        // ── Connection timer ───────────────────────────────────────────
        _startConnectTimer() {
            this._clearConnectTimer();
            this._connectTimer = setTimeout(() => {
                if (this.dc && this.dc.readyState !== 'open') {
                    this._emitError(new Error('انتهت مهلة الاتصال'), 'timeout');
                    this.teardown();
                    this.onStatus('timeout');
                }
            }, this.connectTimeoutMs);
        }

        _clearConnectTimer() {
            if (this._connectTimer) {
                clearTimeout(this._connectTimer);
                this._connectTimer = null;
            }
        }

        // ── ICE / connection state monitoring ──────────────────────────
        _attachConnectionMonitor(peer) {
            peer.addEventListener('iceconnectionstatechange', () => {
                const s = peer.iceConnectionState;
                if (s === 'failed') {
                    this._emitError(new Error('فشل الاتصال — ICE failed'), 'ice-failed');
                    this.onStatus('error');
                    this.teardown();
                } else if (s === 'disconnected') {
                    this.onStatus('disconnected');
                }
            });
            peer.addEventListener('connectionstatechange', () => {
                if (peer.connectionState === 'failed') {
                    this._emitError(new Error('فشل الاتصال — connection failed'), 'connection-failed');
                    this.onStatus('error');
                    this.teardown();
                }
            });
        }

        _emitError(err, code) {
            try { this.onError(err, code); } catch (e) { /* noop */ }
        }

        // ── HOST ───────────────────────────────────────────────────────
        /**
         * Start hosting: creates an offer and (once the channel opens) sends `payload`.
         * @param {any} payload - anything JSON-serializable
         * @returns {Promise<string>} offer code to send to the other peer
         */
        async createOffer(payload) {
            this.teardown();
            this._pendingPayload = payload;
            this.pc = new RTCPeerConnection(this.rtcConfig);
            this._attachConnectionMonitor(this.pc);
            this.dc = this.pc.createDataChannel('data');

            this.dc.onopen = () => {
                this._clearConnectTimer();
                if (this._pendingPayload !== null) this._send(this._pendingPayload);
                this.onStatus('connected-sent');
            };
            this.dc.onclose = () => this.onStatus('closed');
            this.dc.onerror = (e) => {
                this._emitError(new Error('خطأ في قناة البيانات'), 'channel-error');
            };

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this._waitIceGatheringComplete(this.pc);
            this._startConnectTimer();
            return P2PShare.encode(this.pc.localDescription, this.deviceId, this.deviceName);
        }

        /**
         * Complete the handshake with the answer code the other peer sent back.
         * @param {string} answerCode
         */
        async acceptAnswer(answerCode) {
            if (!this.pc) throw new Error('No active offer — call createOffer() first.');
            let desc;
            try {
                desc = P2PShare.decode(answerCode);
            } catch (e) {
                throw new Error('كود الرد غير صالح — تأكد من نسخه كاملًا');
            }
            if (desc.did || desc.dn) {
                this.onPeerDevice(desc.did || '', desc.dn || '');
            }
            await this.pc.setRemoteDescription({ type: desc.type, sdp: desc.sdp });
            this.onStatus('connecting');
        }

        // ── JOIN ───────────────────────────────────────────────────────
        /**
         * Join a host using the offer code they sent you.
         * @param {string} offerCode
         * @returns {Promise<string>} answer code to send back to the host
         */
        async createAnswer(offerCode) {
            this.teardown();
            let desc;
            try {
                desc = P2PShare.decode(offerCode);
            } catch (e) {
                throw new Error('كود المضيف غير صالح — تأكد من نسخه كاملًا');
            }
            if (desc.did || desc.dn) {
                this.onPeerDevice(desc.did || '', desc.dn || '');
            }

            this.pc = new RTCPeerConnection(this.rtcConfig);
            this._attachConnectionMonitor(this.pc);
            this.pc.ondatachannel = (e) => {
                this.dc = e.channel;
                this.dc.onmessage = (ev) => this._handleIncoming(ev.data);
                this.dc.onopen    = () => {
                    this._clearConnectTimer();
                    this.onStatus('connected-waiting');
                };
                this.dc.onclose = () => this.onStatus('closed');
                this.dc.onerror = () => {
                    this._emitError(new Error('خطأ في قناة البيانات'), 'channel-error');
                };
            };

            await this.pc.setRemoteDescription({ type: desc.type, sdp: desc.sdp });
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this._waitIceGatheringComplete(this.pc);
            this._startConnectTimer();
            return P2PShare.encode(this.pc.localDescription, this.deviceId, this.deviceName);
        }

        // ── TRANSFER ───────────────────────────────────────────────────
        /** Send (or queue) a payload over an already-open channel. */
        send(payload) {
            if (!this.dc || this.dc.readyState !== 'open') {
                this._pendingPayload = payload;
                return;
            }
            this._send(payload);
        }

        _send(payload) {
            const json  = JSON.stringify(payload);
            const total = Math.max(1, Math.ceil(json.length / this.chunkSize));
            try {
                this.dc.send(JSON.stringify({ t: 'start', n: total }));
                for (let i = 0; i < total; i++) {
                    this.dc.send(JSON.stringify({
                        t: 'chunk', i,
                        d: json.slice(i * this.chunkSize, (i + 1) * this.chunkSize)
                    }));
                }
                this.dc.send(JSON.stringify({ t: 'end' }));
            } catch (e) {
                this._emitError(e, 'send-error');
            }
        }

        _handleIncoming(raw) {
            let msg;
            try { msg = JSON.parse(raw); }
            catch (e) { this._emitError(e, 'parse-error'); return; }

            if (msg.t === 'start') {
                this._incomingChunks   = new Array(msg.n);
                this._incomingExpected = msg.n;
                this.onProgress(0, msg.n);
            } else if (msg.t === 'chunk') {
                this._incomingChunks[msg.i] = msg.d;
                const received = this._incomingChunks.filter(c => c !== undefined).length;
                this.onProgress(received, this._incomingExpected);
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

    global.P2PShare       = P2PShare;
    global.P2PDeviceStore = P2PDeviceStore;

})(typeof window !== 'undefined' ? window : this);