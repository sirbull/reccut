import { clipMatrix, maskList, paintMask } from './shapes.js';

// Unscoped masks in existing projects retain their clip-visibility behaviour.
export const visibilityMaskClip = clip => maskList(clip).some(m => m.effect)
  ? { ...clip, props: { ...clip.props, masks: maskList(clip).filter(m => !m.effect) } } : clip;

const surfaces=new Map();

export function sourceEffectMask(clip, effect, T, project, w, h, sourceToProject) {
  const masks = maskList(clip).filter(m => m.effect === effect.id);
  if (!masks.length || !sourceToProject) return null;
  const id=`${clip.id}:${effect.id}`;
  let c=surfaces.get(id);
  if(!c){
    c=typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w,h) : Object.assign(document.createElement('canvas'),{width:w,height:h});
    if(surfaces.size>=8)surfaces.delete(surfaces.keys().next().value);
    surfaces.set(id,c);
  }
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const base = sourceToProject.inverse().multiply(clipMatrix(clip,T,project.width,project.height,project).inverse());
  paintMask(c.getContext('2d'),{...clip,props:{...clip.props,masks}},T,project.width,project.height,base,w,h,project);
  return c;
}
