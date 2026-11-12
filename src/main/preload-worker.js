const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('worker', {
  onJob: (cb) => ipcRenderer.on('worker:job', (_e, job) => cb(job)),
  onCancel: (cb) => ipcRenderer.on('worker:cancel', (_e, jobId) => cb(jobId)),
  progress: (jobId, progress, stage, detail) => ipcRenderer.send('worker:progress', { jobId, progress, stage, detail }),
  done: (jobId, result) => ipcRenderer.send('worker:done', { jobId, result }),
  error: (jobId, error) => ipcRenderer.send('worker:error', { jobId, error }),
  cacheMatch: (key) => ipcRenderer.invoke('modelcache:get', key),
  cachePut: (key, data) => ipcRenderer.invoke('modelcache:put', key, data),
});
