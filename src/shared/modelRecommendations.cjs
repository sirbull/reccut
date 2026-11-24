// Conservative starting points, not measured performance. No model is loaded here.
function hardwareSummary(hardware = {}) {
  const ram = Number(hardware.ramGB), threads = Number(hardware.cpuThreads);
  return [Number.isFinite(ram) && ram > 0 ? `${ram} GB RAM` : 'RAM unknown',
    Number.isFinite(threads) && threads > 0 ? `${threads} logical CPUs` : 'CPU count unknown'].join(' · ');
}

function subtitleRecommendation(models, hardware = {}) {
  const ram = Number(hardware.ramGB) || 0, threads = Number(hardware.cpuThreads) || 0;
  // Whisper currently uses single-threaded WASM for new downloads. Extra cores
  // indicate editing headroom, not parallel inference speed or CPU quality.
  let ids, reason;
  if (ram && ram < 7.5 || threads && threads <= 2) {
    ids = ['whisper-tiny', 'whisper-base'];
    reason = 'A lightweight starting point that leaves more memory and processing capacity for editing. Lower recognition accuracy.';
  } else if (ram >= 30 && threads >= 12) {
    ids = ['whisper-medium', 'whisper-small', 'whisper-base', 'whisper-tiny'];
    reason = 'More room for a larger multilingual model. Medium can improve difficult speech, but CPU transcription may still be slow.';
  } else if (ram >= 15 && threads >= 8) {
    ids = ['whisper-small', 'whisper-base', 'whisper-tiny'];
    reason = 'A balance of multilingual accuracy and model size, with memory left for editing. CPU transcription may still be slow.';
  } else {
    ids = ['whisper-base', 'whisper-tiny'];
    reason = 'A lighter balance of accuracy and CPU work. Try Small for difficult speech if you can wait longer.';
  }
  const model = ids.map(id => models.find(m => m.id === id)).find(m => m && m.status !== 'unsupported' &&
    (!ram || ram >= (m.minimumRequirements?.ramGB || 0)) &&
    (!hardware.platform || !m.compatiblePlatforms || m.compatiblePlatforms.includes(hardware.platform)) &&
    (!hardware.arch || !m.minimumRequirements?.arch || m.minimumRequirements.arch.includes(hardware.arch)));
  return model ? { id: model.id, reason } : null;
}

function backgroundRecommendation(models, gpuOk) {
  if (gpuOk == null) return null;
  const model = models.find(m => Boolean(m.gpu) === gpuOk);
  return model ? { id: model.id, reason: gpuOk
    ? 'WebGPU is available for the sharper GPU model. This checks compatibility, not graphics-card speed or memory.'
    : 'Uses the processor without requiring WebGPU. A safer starting point when a compatible GPU is unavailable.' } : null;
}

function voiceRecommendations(rows, hardware = {}) {
  const languages = [...new Set(rows.filter(r => r.key !== 'voxcpm:model').flatMap(r => r.languages))];
  const roomy = Number(hardware.ramGB) >= 15 && Number(hardware.cpuThreads) >= 8;
  const limited = Number(hardware.ramGB) > 0 && Number(hardware.ramGB) < 7.5 || Number(hardware.cpuThreads) > 0 && Number(hardware.cpuThreads) <= 2;
  const recommended = new Map();
  for (const lang of languages) {
    const available = rows.filter(r => r.key !== 'voxcpm:model' && !r.unavailable && r.languages.includes(lang));
    const order = roomy ? ['voxcpm', 'kokoro', 'piper'] : limited ? ['piper', 'kokoro'] : ['kokoro', 'piper'];
    const row = order.map(engine => available.find(r => r.engine === engine)).find(Boolean);
    if (!row) continue;
    recommended.set(row.key, { key: row.key, reason: row.engine === 'voxcpm'
      ? 'Expressive local speech on supported hardware with more memory headroom. Uses a shared 3.55 GB model and can be slower.'
      : row.engine === 'piper' ? 'A smaller native-language voice package with lower resource demands.'
      : 'A compact local speech model for its supported languages, without the larger VoxCPM2 download.' });
  }
  return [...recommended.values()];
}

function rotoRecommendation(models, hardware = {}) {
  const id = Number(hardware.ramGB) >= 15 && Number(hardware.cpuThreads) >= 4 ? 'base' : 'small';
  return models.some(m => m.id === id) ? { id, reason: id === 'small'
    ? 'The lighter starting point for less memory or limited CPU capacity. Larger models can track difficult subjects better.'
    : 'Balances model size and tracking quality. GPU memory and actual tracking speed have not been measured.' } : null;
}

module.exports = { hardwareSummary, subtitleRecommendation, backgroundRecommendation, voiceRecommendations, rotoRecommendation };
