const path=require('path');

// ONNX weights are data, not executable code. The signer's protobuf detector
// can allocate an invalid array while examining these large, valid models.
function modelResource(file){return typeof file==='string'&&/[\\/]Contents[\\/]Resources[\\/](?:models|subtitle-models)[\\/].*\.onnx$/i.test(file);}
module.exports=async(context)=>{
  if(context.electronPlatformName!=='darwin')return;
  const signer=path.dirname(require.resolve('@electron/osx-sign'));
  const detector=require(require.resolve('isbinaryfile',{paths:[signer]}));
  if(detector.isBinaryFile.reccutModelData)return;
  const original=detector.isBinaryFile;
  const classify=async(file,...args)=>modelResource(file)?false:original(file,...args);
  classify.reccutModelData=true;
  detector.isBinaryFile=classify;
};
module.exports.modelResource=modelResource;
