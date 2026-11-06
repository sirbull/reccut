import { frameSampleTimes, sampleFrameInfo, scoreFrame, pickFrameCandidates, uniqueTitles } from './thumbScore.js';

export const SUGGESTION_BUDGET_MS = 14000;
export async function analyzeDesignFrames(source, sample, { signal, now = () => performance.now(), budgetMs = SUGGESTION_BUDGET_MS, progress = () => {} } = {}) {
  const start = now(), times = frameSampleTimes(source), frames = [];
  let attempted = 0, failed = 0;
  for (const time of times) {
    if (signal?.aborted) throw new Error('Analysis canceled.');
    const remaining = budgetMs - (now() - start); if (remaining <= 10) break;
    const timeoutMs = Math.min(remaining, Math.max(100, Math.min(800, remaining / Math.min(20, times.length - attempted))));
    const sampled = await sample(time, { signal, timeoutMs });
    if (signal?.aborted) throw new Error('Analysis canceled.');
    attempted++;
    if (sampled) {
      const metrics = scoreFrame(sampled.pixels), camera = sampleFrameInfo(source, time).camera;
      frames.push({ time, ...metrics, score: Math.min(1, metrics.score + (camera ? 0.15 : 0)), camera, canvas: sampled.canvas });
    } else failed++;
    progress({ attempted, total: times.length, failed });
  }
  return { frames: pickFrameCandidates(frames, source.duration), attempted, total: times.length, failed, elapsedMs: now() - start, limited: attempted < times.length };
}

export function aiTitleProvider(config) {
  if (!config?.model?.trim()) return null;
  let host; try { host = new URL(config.endpoint).hostname; } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!config.hasKey && !local) return null;
  return ({ 'api.openai.com': 'OpenAI', 'api.anthropic.com': 'Anthropic', 'generativelanguage.googleapis.com': 'Google Gemini', 'api.mistral.ai': 'Mistral', 'openrouter.ai': 'OpenRouter', 'api.groq.com': 'Groq', 'api.x.ai': 'xAI', 'api.deepseek.com': 'DeepSeek' })[host] || (local ? 'your local model server' : host);
}

export function transcriptForTitles(project) {
  return Object.values(project.clips || {}).filter(c => c.type === 'caption' && c.enabled !== false).sort((a, b) => a.start - b.start).slice(0, 10000).map(c => c.props?.text || '').join('\n').slice(0, 12000);
}
export function parseAITitles(text) {
  return uniqueTitles(String(text || '').split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim()).filter(line => line && !/^```/.test(line)));
}
