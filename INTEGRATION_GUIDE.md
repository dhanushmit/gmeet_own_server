# Live Caption Fix — Integration Guide

## What was actually broken

In the original setup, Speech-to-Text was almost certainly only being started
inside the **host's** component (or gated by a `role === 'host'` check), and/or
the server was only broadcasting captions from the host's socket. That's why:

- Host laptop → captions worked (STT ran locally on host device, broadcast worked)
- Candidates (mobile or laptop) → STT never started on their device at all,
  so there was no text to broadcast, no matter who spoke.

**Key architecture rule:** Live captioning in Zoom/Meet works because
*every single device* runs its own local speech recognizer on its own mic
input and sends the resulting text to the server. The server does not do STT
on host's audio and then guess who else is speaking — that's not how it works
at all. Each participant transcribes themselves.

## Files in this package

| File | Where it goes | Purpose |
|---|---|---|
| `caption-server.js` | Your backend (Node/Express) | Broadcasts captions to all participants, tracks attendees, generates PDF |
| `CaptionEngine.js` | Frontend `src/` folder | Runs STT locally on EVERY participant's browser |
| `CaptionBox.jsx` | Frontend `src/components/` | UI: caption box + attendee list + "End Meeting" PDF button |

## Backend setup

```bash
npm install express socket.io pdfkit cors
node caption-server.js
```

This starts an independent caption/log server on port 4000. You can either:
- Run it as a separate microservice next to your existing signaling server, or
- Merge the socket.io logic into your existing server.js if you already have
  a socket.io instance running for WebRTC signaling (recommended — one
  socket connection is simpler than two).

If merging: just copy the `io.on("connection", ...)` block's caption-related
listeners (`join-room`, `caption`, `mic-state`, `end-meeting`, `disconnect`)
into your existing server.js if you already have
a socket.io instance running for WebRTC signaling (recommended — one
socket connection is simpler than two).

## Frontend setup

In your existing meeting room screen (the one with video tiles), import and
render `CaptionBox`, passing it the **same socket instance** your app already
uses for WebRTC signaling:

```jsx
import CaptionBox from "./components/CaptionBox";

<CaptionBox
  socket={socket}                 // your existing socket.io client instance
  roomId={currentRoomId}
  participantName={currentUser.name}
  isMicMuted={isMicMuted}          // your existing mic mute state
/>
```

That's it — no changes needed to your WebRTC audio/video pipeline. The
caption engine listens to the mic through a completely separate browser API
call, so it never freezes, delays, or interrupts the live call.

## Why this won't be "100% accurate" — and what actually gets you close

No STT system (Zoom's, Google Meet's, Whisper, or this one) hits 100%,
because accuracy depends on network quality, accent, background noise, and
mic hardware — not the code. To get the **best realistic accuracy**:

1. Keep `recognition.lang` matched to the speaker's actual language
   (`en-IN`, `ta-IN`, etc.) — you can let users pick this in a settings dropdown.
2. For candidates on older iPhones / unsupported browsers, the code
   automatically falls back to short 4-second audio chunks sent to
   `/api/transcribe` — wire this endpoint to Whisper API or Google
   Cloud Speech-to-Text for much better accuracy than on-device fallback.
3. Skip "emotion recognition" — it doesn't improve caption accuracy and
   only adds latency/complexity for a feature you didn't actually need here.

## Testing checklist

- [ ] Host on laptop speaks → caption shows for host + all candidates
- [ ] Candidate on laptop speaks → caption shows for everyone
- [ ] Candidate on mobile (Chrome/Android) speaks → caption shows for everyone
- [ ] Candidate on mobile Safari (iOS) speaks → caption shows (native or fallback)
- [ ] Muting mic stops that person's captions; unmuting resumes them
- [ ] "End Meeting" button downloads a PDF with full transcript + attendee list
- [ ] Video/audio call itself never freezes or drops when captions are running
