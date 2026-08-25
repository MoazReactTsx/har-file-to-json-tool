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
 * Plain vanilla JS — no bundler, no <script type="module">, no build step.
 * Just include it with a normal <script src="p2p-share.js"></script> tag
 * (before p2p-share-ui.js, if you use that too) and use `P2PShare` globally.
 * -----------------------------------------------------------------------
 */

(function(global) {
    'use strict';

    class P2PShare {
        /**
         * @param {Object} opts
         * @param {Array}  [opts.iceServers] - custom ICE servers (defaults to public STUN)
         * @param {number} [opts.chunkSize]  - bytes per data-channel message (default 15000)
         * @param {number} [opts.iceTimeoutMs] - max wait for ICE gathering (default 4000)
         * @param {(status: string) => void} [opts.onStatus] - 'connecting'|'connected-sent'|'connected-waiting'|'received'|'closed'
         * @param {(received: number, total: number) => void} [opts.onProgress] - chunk progress on the receiving side
         * @param {(data: any) => void} [opts.onData] - fired with the parsed payload once fully received
         * @param {(err: Error) => void} [opts.onError]
         */
        constructor({
            iceServers,
            chunkSize = 15000,
            iceTimeoutMs = 4000,
            onStatus,
            onProgress,
            onData,
            onError
        } = {}) {
            this.rtcConfig = {
                iceServers: iceServers || [{
                    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
                }, ],
            };
            this.chunkSize = chunkSize;
            this.iceTimeoutMs = iceTimeoutMs;
            this.onStatus = onStatus || (() => {});
            this.onProgress = onProgress || (() => {});
            this.onData = onData || (() => {});
            this.onError = onError || (() => {});

            this.pc = null;
            this.dc = null;
            this._pendingPayload = null;
            this._incomingChunks = [];
            this._incomingExpected = 0;
        }

        /** Close any active connection and reset state. Safe to call anytime. */
        teardown() {
            if (this.dc) {
                try {
                    this.dc.close();
                } catch (e) {
                    /* noop */ }
                this.dc = null;
            }
            if (this.pc) {
                try {
                    this.pc.close();
                } catch (e) {
                    /* noop */ }
                this.pc = null;
            }
            this._incomingChunks = [];
            this._incomingExpected = 0;
        }

        static encode(desc) {
            return btoa(unescape(encodeURIComponent(JSON.stringify({
                type: desc.type,
                sdp: desc.sdp
            }))));
        }

        static decode(code) {
            return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
        }

        _waitIceGatheringComplete(peer) {
            return new Promise((resolve) => {
                if (peer.iceGatheringState === 'complete') {
                    resolve();
                    return;
                }
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

        // ---------------------------------------------------------------- HOST --
        /**
         * Start hosting: creates an offer and (once the channel opens) sends `payload`.
         * @param {any} payload - anything JSON-serializable
         * @returns {Promise<string>} offer code to send to the other peer
         */
        async createOffer(payload) {
            this.teardown();
            this._pendingPayload = payload;
            this.pc = new RTCPeerConnection(this.rtcConfig);
            this.dc = this.pc.createDataChannel('data');
            this.dc.onopen = () => {
                if (this._pendingPayload !== null) this._send(this._pendingPayload);
                this.onStatus('connected-sent');
            };
            this.dc.onclose = () => this.onStatus('closed');

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this._waitIceGatheringComplete(this.pc);
            return P2PShare.encode(this.pc.localDescription);
        }

        /**
         * Complete the handshake with the answer code the other peer sent back.
         * @param {string} answerCode
         */
        async acceptAnswer(answerCode) {
            if (!this.pc) throw new Error('No active offer — call createOffer() first.');
            const desc = P2PShare.decode(answerCode);
            await this.pc.setRemoteDescription(desc);
            this.onStatus('connecting');
        }

        // ---------------------------------------------------------------- JOIN --
        /**
         * Join a host using the offer code they sent you.
         * @param {string} offerCode
         * @returns {Promise<string>} answer code to send back to the host
         */
        async createAnswer(offerCode) {
            this.teardown();
            this.pc = new RTCPeerConnection(this.rtcConfig);
            this.pc.ondatachannel = (e) => {
                this.dc = e.channel;
                this.dc.onmessage = (ev) => this._handleIncoming(ev.data);
                this.dc.onopen = () => this.onStatus('connected-waiting');
                this.dc.onclose = () => this.onStatus('closed');
            };

            const desc = P2PShare.decode(offerCode);
            await this.pc.setRemoteDescription(desc);
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this._waitIceGatheringComplete(this.pc);
            return P2PShare.encode(this.pc.localDescription);
        }

        // ------------------------------------------------------------- TRANSFER --
        /** Send (or re-send) a payload over an already-open channel. */
        send(payload) {
            if (!this.dc || this.dc.readyState !== 'open') {
                this._pendingPayload = payload; // will flush once the channel opens
                return;
            }
            this._send(payload);
        }

        _send(payload) {
            const json = JSON.stringify(payload);
            const total = Math.max(1, Math.ceil(json.length / this.chunkSize));
            this.dc.send(JSON.stringify({
                t: 'start',
                n: total
            }));
            for (let i = 0; i < total; i++) {
                this.dc.send(JSON.stringify({
                    t: 'chunk',
                    i,
                    d: json.slice(i * this.chunkSize, (i + 1) * this.chunkSize)
                }));
            }
            this.dc.send(JSON.stringify({
                t: 'end'
            }));
        }

        _handleIncoming(raw) {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (e) {
                this.onError(e);
                return;
            }

            if (msg.t === 'start') {
                this._incomingChunks = new Array(msg.n);
                this._incomingExpected = msg.n;
                this.onProgress(0, msg.n);
            } else if (msg.t === 'chunk') {
                this._incomingChunks[msg.i] = msg.d;
                const received = this._incomingChunks.filter((c) => c !== undefined).length;
                this.onProgress(received, this._incomingExpected);
            } else if (msg.t === 'end') {
                try {
                    const data = JSON.parse(this._incomingChunks.join(''));
                    this.onData(data);
                    this.onStatus('received');
                } catch (e) {
                    this.onError(e);
                }
            }
        }
    }

    global.P2PShare = P2PShare;
})(typeof window !== 'undefined' ? window : this);