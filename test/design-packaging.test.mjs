import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),hook=require('../scripts/before-pack.cjs');
test('packaging classifies only bundled ONNX model resources as data, preserving executable signing',()=>{
  assert.equal(hook.modelResource('/tmp/Reccut.app/Contents/Resources/models/namespace/model/onnx/model_fp16.onnx'),true);
  for(const file of['/tmp/model.onnx','/tmp/Reccut.app/Contents/Resources/uiohook.node','/tmp/Reccut.app/Contents/MacOS/Reccut','/tmp/Reccut.app/Contents/Frameworks/Electron Framework.framework/Electron Framework','/tmp/Reccut.app/Contents/Resources/models/model.dylib'])assert.equal(hook.modelResource(file),false);
});
