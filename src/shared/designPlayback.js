import { formatTimecode } from './model.js';

const frameRate = fps => Number.isFinite(fps) && fps > 0 ? fps : 30;
export function lastDesignFrame(duration, fps) {
  const seconds=Number(duration);
  return Math.max(0,Math.ceil((Number.isFinite(seconds)?Math.max(0,seconds):0)*frameRate(fps)-1e-7)-1);
}
export function designFrameTime(time, duration, fps) {
  const rate=frameRate(fps),frame=Math.round((Number.isFinite(time)?time:0)*rate);
  return Math.max(0, Math.min(lastDesignFrame(duration,rate),frame))/rate;
}
export function stepDesignFrame(time, frames, duration, fps) {
  const rate=frameRate(fps),frame=Math.round(designFrameTime(time,duration,rate)*rate);
  return Math.max(0,Math.min(lastDesignFrame(duration,rate),frame+frames))/rate;
}
// Non-drop-frame labels use the actual frame index and the nominal rate. This
// keeps typed labels and one-frame steps consistent at rates such as 29.97.
export function formatDesignTimecode(time, fps) {
  const rate=frameRate(fps),nominal=Math.max(1,Math.round(rate));
  return formatTimecode(Math.round(Math.max(0,time)*rate)/nominal,nominal);
}
export function parseDesignTimecode(value, fps) {
  const text=String(value).trim(),rate=frameRate(fps),nominal=Math.max(1,Math.round(rate)),parts=text.split(':');
  if(!text||parts.length>4||parts.some(p=>!p.length))return null;
  if(parts.length===4){
    if(parts.some(p=>!/^\d+$/.test(p)))return null;
    const [h,m,s,f]=parts.map(Number),frames=((h*60+m)*60+s)*nominal+f;
    return m<60&&s<60&&f<nominal&&Number.isSafeInteger(frames)?frames/rate:null;
  }
  if(parts.slice(0,-1).some(p=>!/^\d+$/.test(p))||!/^\d+(?:[.,]\d+)?$/.test(parts.at(-1)))return null;
  const numbers=parts.map(p=>Number(p.replace(',','.')));
  if(numbers.some(n=>!Number.isFinite(n))||(parts.length>1&&numbers.at(-1)>=60)||(parts.length===3&&numbers[1]>=60))return null;
  const seconds=numbers.reduce((total,n)=>total*60+n,0),frames=Math.round(seconds*rate);
  return Number.isSafeInteger(frames)?frames/rate:null;
}
