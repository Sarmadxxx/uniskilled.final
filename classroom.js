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
      const tries = [
        { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        { video: false, audio: { echoCancellation: true, noiseSuppression: true } },
      ];
      let lastErr = null;
      for (const c of tries) {
        try { this.local = await navigator.mediaDevices.getUserMedia(c); break; }
        catch (e) { lastErr = e; }
      }
      if (!this.local) {
        this.local = new MediaStream();
        this.emit('error', { code: 'no-media', message: mediaErrorText(lastErr) });
      }
      this.camOn = this.local.getVideoTracks().length > 0;
      this.micOn = this.local.getAudioTracks().length > 0;
      this.emit('local-stream', this.local);
      this.emit('media', { mic: this.micOn, cam: this.camOn, hasCam: this.camOn, hasMic: this.micOn });
      return this.local;
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
      this.chat.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.t === 'chat') this.emit('chat', { from: this.peer?.name || 'Them', text: String(m.text).slice(0, 2000), at: Date.now(), mine: false });
          if (m.t === 'media') this.emit('peer-media', { mic: !!m.mic, cam: !!m.cam, screen: !!m.screen });
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
      if (!t) return false;
      this.micOn = !this.micOn; t.enabled = this.micOn;
      this.emit('media', { mic: this.micOn, cam: this.camOn, screen: !!this.screen });
      this.sendMediaState();
      return this.micOn;
    }

    toggleCam() {
      const t = this.local && this.local.getVideoTracks()[0];
      if (!t) return false;
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

  function mediaErrorText(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera and microphone access is blocked. Allow access in your browser\'s address bar, then reload.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera or microphone was found on this device.';
    if (n === 'NotReadableError') return 'Your camera or microphone is being used by another app. Close it and reload.';
    return 'Camera and microphone are not available. You can still join and see and hear the other person.';
  }

  UsClassroom.localTransport = localTransport;
  UsClassroom.supabaseTransport = supabaseTransport;
  UsClassroom.mediaErrorText = mediaErrorText;
  window.UsClassroom = UsClassroom;
})();
