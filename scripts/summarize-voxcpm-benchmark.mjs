// Prints a phase 9 benchmark report as a GitHub Actions notice and job summary,
// so the result can be read without downloading the artifact.
// Usage: node scripts/summarize-voxcpm-benchmark.mjs <report.json> <label>
import fs from 'node:fs';
const [file, label = 'VoxCPM2 benchmark'] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const brief = {
  kind: report.kind, status: report.status, error: report.error, wallSeconds: report.wallSeconds,
  environment: report.environment, engineSha256: report.inputs?.engineSha256, engineArgs: report.engineArgs, devices: report.devices,
  summary: report.summary, proposedCriteria: report.proposedCriteria, cancel: report.cancel,
  switchBackIdentical: report.switchBackIdentical, firstJobMatchesWarm: report.firstJobMatchesWarm,
};
// Workflow commands need %, CR and LF escaped.
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::notice title=${label}::${escape(JSON.stringify(brief))}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(report.proposedCriteria || {}).map(([k, v]) => `| ${k} | ${v.goal} | ${v.pass === true ? 'pass' : v.pass === false ? 'FAIL' : 'n/a'} |`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## ${label}: ${report.status}`, report.error ? `\n${report.error}\n` : '',
    '| Criterion | Goal | Result |', '|---|---|---|', ...rows, '', '```json', JSON.stringify(brief.summary, null, 2), '```', ''].join('\n'));
}
