# Connection Workflow — P2P Share (WebRTC, Manual Signaling)

This document describes how the "Share" feature establishes a direct browser-to-browser connection and transfers HAR data — no server, no database.

## How it works (high level)

Two browsers connect directly using a **WebRTC DataChannel**. Since there is no signaling server, the two peers exchange **connection offers** manually by copy-pasting Base64 codes over any channel (WhatsApp, Slack, email...). A public STUN server is used only to discover network addresses for NAT traversal.

```
┌──────────────┐                                  ┌──────────────┐
│    HOST      │                                  │    JOINER    │
│ (has HAR)    │                                  │ (wants HAR)  │
└──────┬───────┘                                  └──────┬───────┘
       │  1. Click "Start sharing"                       │
       │     → creates RTCPeerConnection                 │
       │     → creates DataChannel 'har'                 │
       │     → generates Offer (+ICE candidates          │
       │       via STUN)                                 │
       │                                                 │
       │  2. ─── OFFER code (Base64 SDP) ─────────────►  │
       │        (WhatsApp / Slack / any channel)         │
       │                                                 │
       │                                    3. Paste offer
       │                                       → setRemoteDescription
       │                                       → generates Answer
       │                                       → gathers ICE
       │
       │  4. ◄─────────── ANSWER code (Base64 SDP) ─────│
       │
       │  5. Paste answer                                │
       │     → setRemoteDescription                      │
       │
       ║  ═══════════ WEBRTC DATACHANNEL OPEN ══════════ ║   ← direct P2P from here
       ║                                                 ║
       ║  6. ── { t:'start', n:chunks } ──────────────►  ║
       ║  7. ── { t:'chunk', i, d } × n ──────────────►  ║
       ║  8. ── { t:'end' } ──────────────────────────►  ║
       ║                                                 ║
       │                                    9. Reassemble chunks
       │                                       → JSON.parse
       │                                       → render list
```

## Step-by-step (mapped to code)

All logic lives in `src/main.js`.

| # | Step | Who | Code |
|---|------|-----|------|
| 0 | Open share modal | Host / Joiner | `openShareModal()` → `renderShareBody()` |
| 1 | Create peer + offer | Host | `hostStart()`: `new RTCPeerConnection(rtcConfig)` → `pc.createDataChannel('har')` → `pc.createOffer()` → `setLocalDescription()` |
| 2 | Wait for ICE gathering | Host | `waitIceGatheringComplete(pc)` (STUN: `stun.l.google.com:19302`, 4s timeout fallback) |
| 3 | Produce offer code | Host | `encodeDesc(pc.localDescription)` — JSON `{type, sdp}` → Base64, shown in textarea to copy |
| 4 | Consume offer | Joiner | `joinGenerate()`: `decodeDesc(code)` → `pc.setRemoteDescription(desc)` |
| 5 | Produce answer code | Joiner | `pc.createAnswer()` → `setLocalDescription()` → wait ICE → `encodeDesc(pc.localDescription)` |
| 6 | Consume answer | Host | "اتصال" button handler: `decodeDesc(code)` → `pc.setRemoteDescription(desc)` |
| 7 | Channel opens | Both | Host: `dc.onopen` fires; Joiner: `pc.ondatachannel` → `dc.onopen` |
| 8 | Send data | Host | `sendPayload(dc, payload)` — selected entries or all of `simplified[]` |

## Data transfer protocol

Payloads are serialized once and streamed as fixed-size chunks (**15,000 chars each**) so the DataChannel never chokes on large HAR files:

```jsonc
// 1. header — announces chunk count
{ "t": "start", "n": 12 }

// 2. × n chunks — ordered slices of the full JSON string
{ "t": "chunk", "i": 0, "d": "[{\"method\":\"GET\",..." }
{ "t": "chunk", "i": 1, "d": "...rest..." }

// 3. footer — signals completion
{ "t": "end" }
```

Receiver side (`handleIncomingMessage()`):
- `start` → pre-allocate `incomingChunks = new Array(n)`
- `chunk` → store slice at index `i`, update progress (`received/n`)
- `end` → `incomingChunks.join('')` → `JSON.parse` → replace `simplified[]` → re-render UI

## Key properties

- **No signaling server** — offer/answer codes are exchanged out-of-band by humans.
- **STUN only, no TURN** — works when both peers are not behind symmetric NATs; otherwise connection fails.
- **Ephemeral** — nothing is stored anywhere; data exists only while both tabs are open.
- **Encrypted in transit** — all WebRTC DataChannel traffic is DTLS-encrypted by spec.
- **Host sends immediately on open** — `dc.onopen` triggers `sendPayload()` with no further user action.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Stuck on "بيتصل..." | ICE can't find a path (symmetric NAT / strict firewall) | Need TURN server or different network — STUN alone isn't enough |
| "كود مش صحيح" alert | Code truncated/altered during copy-paste | Re-copy the full code |
| "حصل خطأ في استقبال البيانات" | Chunks reassembled into invalid JSON | Retry the transfer; check console |
