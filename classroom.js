/* UniSkilled Classroom — live video lessons inside UniSkilled.
 *
 * The tutor's and student's browsers connect directly to each other (WebRTC). A small
 * "signalling" transport passes the connection set-up messages between them:
 *   - UsClassroom.supabaseTransport(sb, channelName, me)  — production (Supabase Realtime)
 *   - UsClassroom.localTransport(channelName, me)           — testing (two tabs, same browser)
 *
 * Usage:
 *   const room = new UsClassroom({ transport, me: {id, name, role}, iceServers, onEvent });
 *   await room.startMedia();   // camera + microphone (falls back to audio-only / none)
 *   await room.join();
 *   room.toggleMic(); room.toggleCam(); room.toggleScreen(); room.sendChat('hi'); room.leave();
 *
 * Events (onEvent(type, data)): media, local-stream, remote-stream, peer-joined, peer-left,
 *   state ('waiting'|'connecting'|'connected'|'reconnecting'|'failed'|'left'), chat, peer-media, error
 */
(function () {
  'use strict';

  const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
  const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const MAX_FILE = 25 * 1024 * 1024; // 25 MB per file
  const CHUNK = 16 * 1024;
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

  // ── Transports ──────────────────────────────────────────────────────────────
  // A transport delivers {type, from, to?, ...} objects to everyone else in the room.
  function localTransport(channelName, me) {
    const bc = new BroadcastChannel('us-classroom:' + channelName);
    let handler = () => {};
    bc.onmessage = (e) => { const m = e.data; if (m && m.from !== me.peerId) handler(m); };
    return {
      ready: Promise.resolve(),
      send: (m) => bc.postMessage({ ...m, from: me.peerId }),
      onMessage: (cb) => { handler = cb; },
      close: () => bc.close(),
    };
  }

  function supabaseTransport(sb, channelName, me) {
    let handler = () => {};
    const ch = sb.channel('classroom:' + channelName, { config: { broadcast: { self: false, ack: false }, private: true } });
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload && payload.from !== me.peerId) handler(payload);
    });
    const ready = new Promise((resolve, reject) => {
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err || new Error(status));
      });
    });
    return {
      ready,
      send: (m) => ch.send({ type: 'broadcast', event: 'signal', payload: { ...m, from: me.peerId } }),
      onMessage: (cb) => { handler = cb; },
      close: () => { try { sb.removeChannel(ch); } catch (e) {} },
    };
  }

  // ── Classroom ───────────────────────────────────────────────────────────────
  class UsClassroom {
    constructor(opts) {
      this.me = { ...opts.me, peerId: opts.me.peerId || rid() };
      this.transport = opts.transport || null;
      this.makeTransport = opts.makeTransport || null; // (me) => transport
      this.iceServers = opts.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
      this.onEvent = opts.onEvent || (() => {});
      this.local = null;          // MediaStream from camera/mic
      this.screen = null;         // MediaStream from screen share
      this.remote = null;         // MediaStream from the other person
      this.pc = null;
      this.chat = null;
      this.peer = null;           // { peerId, name, role }
      this.micOn = true;
      this.camOn = true;
      this.state = 'idle';
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.pendingCandidates = [];
      this.restartTimer = null;
      this.heartbeat = null;
      this.lastPeerSeen = 0;
      this.left = false;
    }

    emit(type, data) { try { this.onEvent(type, data); } catch (e) { console.error(e); } }
    setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } }

    // The tutor is the "impolite" side: if both start a negotiation at once, the tutor's wins.
    get polite() { return this.me.role !== 'tutor'; }

    async startMedia() {
      const md = navigator.mediaDevices;
      this.local = new MediaStream();
      this.mediaErrors = { cam: null, mic: null };
      if (!md || !md.getUserMedia) {
        this.mediaErrors.cam = this.mediaErrors.mic = { name: 'Unsupported' };
      } else {
        // Ask for both at once (one permission prompt). If that fails, try each separately so
        // one broken or busy device doesn't block the other, and keep the exact reason.
        try {
          const s = await md.getUserMedia({ video: VIDEO, audio: AUDIO });
          s.getTracks().forEach((t) => this.local.addTrack(t));
        } catch (both) {
          try { (await md.getUserMedia({ audio: AUDIO })).getTracks().forEach((t) => this.local.addTrack(t)); }
          catch (e) { this.mediaErrors.mic = e; }
          try { (await md.getUserMedia({ video: VIDEO })).getTracks().forEach((t) => this.local.addTrack(t)); }
          catch (e) { this.mediaErrors.cam = e; }
        }
      }
      this.watchTracks();
      this.camOn = this.local.getVideoTracks().length > 0;
      this.micOn = this.local.getAudioTracks().length > 0;
      if (!this.camOn || !this.micOn) {
        this.emit('error', { code: 'no-media', message: mediaErrorText(this.mediaErrors.cam || this.mediaErrors.mic, !this.camOn, !this.micOn) });
      }
      this.emit('local-stream', this.local);
      this.emit('media', { mic: this.micOn, cam: this.camOn, hasCam: this.camOn, hasMic: this.micOn });
      return this.local;
    }

    // If the phone takes the camera away (e.g. an incoming call), show it as off and let the
    // person turn it back on with the camera button.
    watchTracks() {
      this.local.getTracks().forEach((t) => {
        t.onended = () => {
          this.local.removeTrack(t);
          if (t.kind === 'video') this.camOn = false; else this.micOn = false;
          this.emit('media', { mic: this.micOn, cam: this.camOn, screen: !!this.screen });
          this.sendMediaState();
        };
      });
    }

    hasCam() { return this.local && this.local.getVideoTracks().length > 0; }
    hasMic() { return this.local && this.local.getAudioTracks().length > 0; }

    // Turn on a camera or microphone that wasn't available at the start (or was taken away).
    async enableDevice(kind) {
      const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) throw { name: 'Unsupported' };
      const s = await md.getUserMedia(kind === 'video' ? { video: VIDEO } : { audio: AUDIO });
      const track = s.getTracks()[0];
      this.local.addTrack(track);
      this.watchTracks();
      if (kind === 'video') this.camOn = true; else this.micOn = true;
      if (this.pc && !(kind === 'video' && this.screen)) await this.attachTrack(track);
      this.emit('local-stream', this.local);
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: !!this.screen });
      this.sendMediaState();
      return true;
    }

    // Put a new track on the existing connection (the other side is updated automatically).
    async attachTrack(track) {
      const cands = this.pc.getTransceivers().filter((t) => t.receiver && t.receiver.track && t.receiver.track.kind === track.kind && !t.stopped && !(t.sender.track));
      const tr = cands.find((t) => t.mid !== null) || cands[0];
      if (tr) {
        await tr.sender.replaceTrack(track);
        try { tr.sender.setStreams && tr.sender.setStreams(this.local); } catch (e) {}
        if (tr.direction === 'recvonly' || tr.direction === 'inactive') tr.direction = 'sendrecv';
      } else {
        this.pc.addTrack(track, this.local);
      }
    }

    async join() {
      this.left = false;
      if (!this.transport && this.makeTransport) this.transport = this.makeTransport(this.me);
      // Handle set-up messages strictly one at a time, in order. Otherwise a reset could
      // interrupt a half-finished step and leave the two sides out of sync.
      this.queue = Promise.resolve();
      this.transport.onMessage((m) => {
        this.queue = this.queue.then(() => this.onSignal(m)).catch((e) => console.error('signal error', e));
      });
      await this.transport.ready;
      this.newPeerConnection();
      this.setState('waiting');
      this.say({ type: 'hello', name: this.me.name, role: this.me.role });
      // Keep-alive so each side notices if the other closes the tab without saying goodbye.
      this.heartbeat = setInterval(() => {
        this.say({ type: 'ping' });
        if (this.peer && Date.now() - this.lastPeerSeen > 20000 && this.state !== 'connected') this.peerGone();
      }, 5000);
      window.addEventListener('beforeunload', this._bye = () => this.say({ type: 'bye' }));
    }

    say(m) { try { this.transport && this.transport.send(m); } catch (e) { console.warn('send failed', e); } }

    newPeerConnection() {
      if (this.pc) { try { this.pc.close(); } catch (e) {} }
      this.pendingCandidates = [];
      this.makingOffer = false;
      this.ignoreOffer = false;
      const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
      this.pc = pc;
      this.remote = new MediaStream();
      this.emit('remote-stream', this.remote);

      // Send camera + mic (or receive-only if this device has none).
      const a = this.local && this.local.getAudioTracks()[0];
      const v = this.local && this.local.getVideoTracks()[0];
      if (a) pc.addTrack(a, this.local); else pc.addTransceiver('audio', { direction: 'recvonly' });
      if (v) pc.addTrack(this.screen ? this.screen.getVideoTracks()[0] : v, this.local); else pc.addTransceiver('video', { direction: 'recvonly' });

      // Chat runs over a pre-agreed data channel, so both sides create it independently.
      this.chat = pc.createDataChannel('chat', { negotiated: true, id: 0 });
      this.chat.binaryType = 'arraybuffer';
      this.chat.bufferedAmountLowThreshold = 256 * 1024;
      this.incoming = null;
      this.chat.onmessage = (e) => {
        if (typeof e.data !== 'string') { this.onFileChunk(e.data); return; }
        try {
          const m = JSON.parse(e.data);
          if (m.t === 'chat') this.emit('chat', { from: this.peer?.name || 'Them', text: String(m.text).slice(0, 2000), at: Date.now(), mine: false });
          if (m.t === 'media') this.emit('peer-media', { mic: !!m.mic, cam: !!m.cam, screen: !!m.screen });
          if (m.t === 'file') {
            const size = Number(m.size);
            if (!(size > 0 && size <= MAX_FILE)) { this.incoming = null; return; }
            this.incoming = { id: String(m.id), name: String(m.name || 'file').slice(0, 200), size, mime: String(m.mime || ''), parts: [], got: 0, lastPct: 0 };
            this.emit('file-progress', { id: this.incoming.id, name: this.incoming.name, size, done: 0, mine: false, from: this.peer?.name || 'Them' });
          }
          if (m.t === 'file-end' && this.incoming && this.incoming.id === String(m.id)) {
            const f = this.incoming; this.incoming = null;
            if (f.got !== f.size) { this.emit('file-failed', { id: f.id, mine: false }); return; }
            this.emit('file', { id: f.id, name: f.name, size: f.size, mime: f.mime, blob: new Blob(f.parts, { type: safeMime(f.mime) }), mine: false, from: this.peer?.name || 'Them' });
          }
        } catch (err) {}
      };
      this.chat.onopen = () => this.sendMediaState();

      pc.ontrack = ({ track }) => {
        if (!this.remote.getTracks().includes(track)) this.remote.addTrack(track);
        track.onunmute = () => this.emit('remote-stream', this.remote);
        this.emit('remote-stream', this.remote);
      };
      pc.onicecandidate = ({ candidate }) => { if (candidate && this.peer) this.say({ type: 'ice', to: this.peer.peerId, candidate: candidate.toJSON() }); };
      pc.onnegotiationneeded = () => this.negotiate();
      pc.onconnectionstatechange = () => this.onConnState();
      pc.oniceconnectionstatechange = () => { if (pc.iceConnectionState === 'failed') this.restart(); };
      return pc;
    }

    async negotiate() {
      if (!this.peer || this.pc.signalingState !== 'stable') return;
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.say({ type: 'sdp', to: this.peer.peerId, description: this.pc.localDescription.toJSON() });
      } catch (e) { console.error('offer failed', e); }
      finally { this.makingOffer = false; }
    }

    onConnState() {
      const s = this.pc.connectionState;
      if (s === 'connected') { clearTimeout(this.restartTimer); this.setState('connected'); }
      else if (s === 'connecting' || s === 'new') { if (this.peer && this.state !== 'connected') this.setState('connecting'); }
      else if (s === 'disconnected') {
        this.setState('reconnecting');
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => { if (this.pc.connectionState !== 'connected') this.restart(); }, 4000);
      } else if (s === 'failed') { this.setState('reconnecting'); this.restart(); }
    }

    // Try to repair the connection; if it still doesn't work, rebuild it from scratch.
    restart() {
      if (this.left || !this.peer) return;
      if (!this.polite) { try { this.pc.restartIce(); } catch (e) {} }
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (!this.left && this.peer && this.pc.connectionState !== 'connected') {
          this.newPeerConnection();
          this.say({ type: 'hello', name: this.me.name, role: this.me.role, rebuild: true });
        }
      }, 10000);
    }

    async onSignal(m) {
      if (m.to && m.to !== this.me.peerId) return;
      if (this.left) return;
      if (this.peer && m.from === this.peer.peerId) this.lastPeerSeen = Date.now();

      switch (m.type) {
        case 'hello':
        case 'hello-ack': {
          const isNew = !this.peer || this.peer.peerId !== m.from;
          this.peer = { peerId: m.from, name: m.name || 'Guest', role: m.role || '' };
          this.lastPeerSeen = Date.now();
          if (isNew) this.emit('peer-joined', this.peer);
          if (m.type === 'hello') {
            // The other side just (re)started: start a fresh connection with them.
            this.newPeerConnection();
            this.say({ type: 'hello-ack', to: m.from, name: this.me.name, role: this.me.role });
            this.setState('connecting');
            if (!this.polite) this.negotiate();
          } else {
            this.setState('connecting');
            if (!this.polite) this.negotiate();
          }
          return;
        }
        case 'sdp': {
          if (!this.peer || m.from !== this.peer.peerId) return;
          const desc = m.description;
          const collision = desc.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
          this.ignoreOffer = !this.polite && collision;
          if (this.ignoreOffer) return;
          await this.pc.setRemoteDescription(desc);
          for (const c of this.pendingCandidates.splice(0)) { try { await this.pc.addIceCandidate(c); } catch (e) {} }
          if (desc.type === 'offer') {
            await this.pc.setLocalDescription();
            this.say({ type: 'sdp', to: m.from, description: this.pc.localDescription.toJSON() });
          }
          return;
        }
        case 'ice': {
          if (!this.peer || m.from !== this.peer.peerId) return;
          try {
            if (!this.pc.remoteDescription) this.pendingCandidates.push(m.candidate);
            else await this.pc.addIceCandidate(m.candidate);
          } catch (e) { if (!this.ignoreOffer) console.warn('ice failed', e); }
          return;
        }
        case 'bye': {
          if (this.peer && m.from === this.peer.peerId) this.peerGone();
          return;
        }
        case 'ping': {
          // A peer we don't know yet (e.g. their hello was missed) — introduce ourselves.
          if (!this.peer || this.peer.peerId !== m.from) this.say({ type: 'hello', name: this.me.name, role: this.me.role });
          return;
        }
      }
    }

    peerGone() {
      const p = this.peer;
      this.peer = null;
      this.newPeerConnection();
      this.setState('waiting');
      if (p) this.emit('peer-left', p);
    }

    sendMediaState() {
      if (this.chat && this.chat.readyState === 'open') {
        this.chat.send(JSON.stringify({ t: 'media', mic: this.micOn, cam: this.camOn, screen: !!this.screen }));
      }
    }

    toggleMic() {
      const t = this.local && this.local.getAudioTracks()[0];
      if (!t) return this.enableDevice('audio');
      this.micOn = !this.micOn; t.enabled = this.micOn;
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: !!this.screen });
      this.sendMediaState();
      return this.micOn;
    }

    toggleCam() {
      const t = this.local && this.local.getVideoTracks()[0];
      if (!t) return this.enableDevice('video');
      this.camOn = !this.camOn; t.enabled = this.camOn;
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: !!this.screen });
      this.sendMediaState();
      return this.camOn;
    }

    videoSender() { return this.pc && this.pc.getSenders().find((s) => s.track && s.track.kind === 'video'); }

    async toggleScreen() {
      if (this.screen) { this.stopScreen(); return false; }
      if (!navigator.mediaDevices.getDisplayMedia) { this.emit('error', { code: 'no-screen', message: 'Screen sharing isn\'t supported on this device.' }); return false; }
      try { this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
      catch (e) { return false; }
      const track = this.screen.getVideoTracks()[0];
      track.onended = () => this.stopScreen();
      const sender = this.videoSender();
      if (sender) await sender.replaceTrack(track);
      else if (this.pc) { this.pc.addTrack(track, this.screen); }
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: true });
      this.emit('screen', this.screen);
      this.sendMediaState();
      return true;
    }

    async stopScreen() {
      if (!this.screen) return;
      this.screen.getTracks().forEach((t) => t.stop());
      this.screen = null;
      const cam = this.local && this.local.getVideoTracks()[0];
      const sender = this.videoSender() || (this.pc && this.pc.getSenders().find((s) => s.track === null));
      if (sender) await sender.replaceTrack(cam || null);
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: false });
      this.emit('screen', null);
      this.sendMediaState();
    }

    onFileChunk(buf) {
      const f = this.incoming;
      if (!f) return;
      f.parts.push(buf); f.got += buf.byteLength;
      if (f.got > f.size) { this.incoming = null; this.emit('file-failed', { id: f.id, mine: false }); return; }
      const pct = Math.floor((f.got / f.size) * 100);
      if (pct >= f.lastPct + 5) { f.lastPct = pct; this.emit('file-progress', { id: f.id, done: f.got, size: f.size, mine: false }); }
    }

    // Send a file directly to the other person (nothing is stored on a server).
    sendFile(file) {
      if (!file) return { ok: false, error: 'No file selected.' };
      if (file.size > MAX_FILE) return { ok: false, error: 'Files can be up to 25 MB.' };
      if (file.size === 0) return { ok: false, error: 'That file is empty.' };
      if (!this.chat || this.chat.readyState !== 'open') return { ok: false, error: 'You can share files once you\'re connected.' };
      const id = rid();
      this.sendQueue = (this.sendQueue || Promise.resolve()).then(() => this._sendFile(id, file)).catch((e) => {
        console.error('file send failed', e); this.emit('file-failed', { id, mine: true });
      });
      this.emit('file-progress', { id, name: file.name, size: file.size, done: 0, mine: true, from: this.me.name });
      return { ok: true, id };
    }

    async _sendFile(id, file) {
      const ch = this.chat;
      const buf = await file.arrayBuffer();
      ch.send(JSON.stringify({ t: 'file', id, name: file.name, size: file.size, mime: file.type }));
      let lastPct = 0;
      for (let off = 0; off < buf.byteLength; off += CHUNK) {
        if (ch.readyState !== 'open') throw new Error('connection closed');
        if (ch.bufferedAmount > 1024 * 1024) {
          await new Promise((res) => { const h = () => { ch.removeEventListener('bufferedamountlow', h); res(); }; ch.addEventListener('bufferedamountlow', h); });
        }
        ch.send(buf.slice(off, off + CHUNK));
        const pct = Math.floor(((off + CHUNK) / buf.byteLength) * 100);
        if (pct >= lastPct + 5) { lastPct = pct; this.emit('file-progress', { id, done: Math.min(off + CHUNK, buf.byteLength), size: buf.byteLength, mine: true }); }
      }
      ch.send(JSON.stringify({ t: 'file-end', id }));
      this.emit('file', { id, name: file.name, size: file.size, mime: file.type, blob: file, mine: true, from: this.me.name });
    }

    sendChat(text) {
      text = String(text || '').trim().slice(0, 2000);
      if (!text) return false;
      if (!this.chat || this.chat.readyState !== 'open') return false;
      this.chat.send(JSON.stringify({ t: 'chat', text }));
      this.emit('chat', { from: this.me.name, text, at: Date.now(), mine: true });
      return true;
    }

    async stats() {
      if (!this.pc) return null;
      const report = await this.pc.getStats();
      let out = { bytesIn: 0, bytesOut: 0, route: null, rtt: null };
      report.forEach((r) => {
        if (r.type === 'inbound-rtp') out.bytesIn += r.bytesReceived || 0;
        if (r.type === 'outbound-rtp') out.bytesOut += r.bytesSent || 0;
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
          out.rtt = r.currentRoundTripTime;
          const lc = report.get(r.localCandidateId);
          out.route = lc ? lc.candidateType : null; // host / srflx (direct) or relay (TURN)
        }
      });
      return out;
    }

    leave() {
      this.left = true;
      this.say({ type: 'bye' });
      clearInterval(this.heartbeat);
      clearTimeout(this.restartTimer);
      if (this._bye) window.removeEventListener('beforeunload', this._bye);
      try { this.pc && this.pc.close(); } catch (e) {}
      [this.local, this.screen].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
      try { this.transport && this.transport.close(); } catch (e) {}
      this.setState('left');
    }
  }

  // Only common, harmless types keep their type; everything else downloads as a plain file.
  function safeMime(m) {
    m = String(m || '').toLowerCase();
    return /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(m) ? m : 'application/octet-stream';
  }

  function mediaErrorText(e, noCam, noMic) {
    const n = e && e.name;
    const what = noCam && noMic ? 'camera and microphone' : noCam ? 'camera' : 'microphone';
    if (n === 'Unsupported') return 'This browser can\'t use a camera or microphone here. Please open the lesson in Safari or Chrome (not inside another app).';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Access to your ' + what + ' is blocked. Allow it in your browser settings for uniskilled.com, then tap the ' + (noCam ? 'camera' : 'microphone') + ' button to try again.';
    if (n === 'NotReadableError' || n === 'AbortError') return 'Your ' + what + ' is busy (for example a phone call or another app is using it). End the call or close the other app, then tap the ' + (noCam ? 'camera' : 'microphone') + ' button to try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No ' + what + ' was found on this device. You can still join and see and hear the other person.';
    return 'Your ' + what + ' couldn\'t be started. Tap the ' + (noCam ? 'camera' : 'microphone') + ' button to try again. You can also join without it.';
  }

  UsClassroom.localTransport = localTransport;
  UsClassroom.supabaseTransport = supabaseTransport;
  UsClassroom.mediaErrorText = mediaErrorText;
  UsClassroom.MAX_FILE = MAX_FILE;
  window.UsClassroom = UsClassroom;
})();
