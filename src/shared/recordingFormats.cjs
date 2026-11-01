// Shared by the recorder UI and the main process that finalizes recording files.
const RECORDING_VIDEO_FORMATS = [
  { value: 'mp4', label: 'MP4 (H.264)', ext: 'mp4', codec: 'h264', audio: ['aac', 'opus'] },
  { value: 'mov', label: 'MOV (H.264)', ext: 'mov', codec: 'h264', audio: ['aac', 'pcm'] },
  { value: 'mkv', label: 'MKV (H.264)', ext: 'mkv', codec: 'h264', audio: ['opus', 'aac', 'pcm', 'flac', 'mp3'] },
  { value: 'webm-vp9', label: 'WebM (VP9)', ext: 'webm', codec: 'vp9', audio: ['opus'] },
  { value: 'webm-vp8', label: 'WebM (VP8)', ext: 'webm', codec: 'vp8', audio: ['opus'] },
];
const RECORDING_AUDIO_FORMATS = [
  { value: 'aac', label: 'AAC', fileLabel: 'M4A (AAC)', ext: 'm4a', codec: 'aac' },
  { value: 'opus', label: 'Opus', fileLabel: 'Ogg (Opus)', ext: 'ogg', codec: 'opus' },
  { value: 'pcm', label: 'PCM (uncompressed, 16-bit)', fileLabel: 'WAV (PCM, 16-bit)', ext: 'wav', codec: 'pcm_s16le' },
  { value: 'flac', label: 'FLAC (lossless)', fileLabel: 'FLAC (lossless)', ext: 'flac', codec: 'flac' },
  { value: 'mp3', label: 'MP3', fileLabel: 'MP3', ext: 'mp3', codec: 'mp3' },
];

function recordingVideoFormat(value) {
  return RECORDING_VIDEO_FORMATS.find((f) => f.value === value) || RECORDING_VIDEO_FORMATS[0];
}

function recordingAudioOptions(videoFormat, hasVideo = true) {
  const video = recordingVideoFormat(videoFormat);
  return [
    { value: 'auto', label: `Automatic (${hasVideo ? RECORDING_AUDIO_FORMATS.find((f) => f.value === video.audio[0]).label : 'M4A / AAC'})` },
    ...RECORDING_AUDIO_FORMATS.filter((f) => !hasVideo || video.audio.includes(f.value)).map((f) => ({ value: f.value, label: hasVideo ? f.label : f.fileLabel })),
  ];
}

function recordingAudioChoice(videoFormat, audioFormat, hasVideo = true) {
  return recordingAudioOptions(videoFormat, hasVideo).some((f) => f.value === audioFormat) ? audioFormat : 'auto';
}

// Capture WebM in chunks so the recording is recoverable after a crash. The
// selected container/codecs are applied once recording stops. Capture PCM for
// other audio formats to avoid an intermediate lossy audio encode.
function recordingPlan({ videoFormat, audioFormat, hasVideo, hasAudio }, isSupported) {
  const video = recordingVideoFormat(videoFormat);
  const choice = recordingAudioChoice(video.value, audioFormat, hasVideo);
  const audioId = choice === 'auto' ? (hasVideo ? video.audio[0] : 'aac') : choice;
  const audio = RECORDING_AUDIO_FORMATS.find((f) => f.value === audioId);
  const captureAudio = audioId === 'opus' ? 'opus' : 'pcm';
  const candidates = hasVideo
    ? [...new Set([video.codec, 'h264', 'vp9', 'vp8'])].map((codec) => `video/webm;codecs=${codec}${hasAudio ? `,${captureAudio}` : ''}`)
    : [`audio/webm;codecs=${captureAudio}`];
  const mimeType = candidates.find(isSupported);
  if (!mimeType) throw new Error(`This device cannot capture ${hasAudio ? captureAudio.toUpperCase() + ' audio in the selected format' : 'video'}. Choose another recording format.`);
  return { mimeType, rawExt: 'webm', ext: hasVideo ? video.ext : audio.ext, videoFormat: hasVideo ? video.value : null, audioFormat: hasAudio ? audioId : null };
}

module.exports = { RECORDING_VIDEO_FORMATS, RECORDING_AUDIO_FORMATS, recordingVideoFormat, recordingAudioOptions, recordingAudioChoice, recordingPlan };
