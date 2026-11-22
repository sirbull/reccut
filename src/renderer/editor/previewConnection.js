// Both endpoints are local Reccut windows. Signalling stays in Electron IPC;
// no discovery/signalling servers and no second player or audio output.
export function createPreviewConnection({ send, stream, onStream, onConnected, onError, Peer = RTCPeerConnection }) {
  const peer = new Peer({ iceServers: [] });
  let closed = false;
  let gatheringDone;
  const timer = setTimeout(() => fail(new Error('The preview display did not connect.')), 15000);
  function fail(error) { if (!closed) onError(error); }
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'connected') { clearTimeout(timer); onConnected?.(); }
    if (peer.connectionState === 'failed') fail(new Error('The preview display disconnected.'));
  };
  peer.ontrack = (event) => onStream?.(event.streams[0]);
  peer.onicegatheringstatechange = () => {
    if (peer.iceGatheringState === 'complete') gatheringDone?.();
  };
  async function publish(description) {
    if (closed) return;
    await peer.setLocalDescription(description);
    if (peer.iceGatheringState !== 'complete' && !closed) await new Promise((resolve) => { gatheringDone = resolve; });
    if (!closed) send({ type: peer.localDescription.type, sdp: peer.localDescription.sdp });
  }
  if (stream) for (const track of stream.getTracks()) peer.addTrack(track, stream);
  return {
    async offer() {
      try { await publish(await peer.createOffer()); } catch (error) { fail(error); }
    },
    async receive(description) {
      try {
        if (closed) return;
        await peer.setRemoteDescription(description);
        if (description.type === 'offer' && !closed) await publish(await peer.createAnswer());
      } catch (error) { fail(error); }
    },
    close() {
      closed = true;
      clearTimeout(timer);
      gatheringDone?.();
      peer.close();
      stream?.getTracks().forEach((track) => track.stop());
    },
  };
}
