import { textStyleAt } from './designRichText.js';
import { fontFamily } from './render.js';

export function designFont(layer, size = layer.size) {
  return `${layer.weight} ${size}px ${fontFamily(layer.font)}`;
}
// Single paired asterisks mark highlights. Consecutive stars and unmatched
// delimiters stay literal; escaping never starts or ends a highlight.
function designCharacters(text = '') {
  const chars = [], delimiters = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && ['*', '\\'].includes(text[i + 1])) { chars.push({ text: text[i + 1], highlight: false, start:i, end:i+2 }); i += 2; continue; }
    if (text[i] === '*') {
      let end = i + 1; while (text[end] === '*') end++;
      if (end === i + 1) delimiters.push(chars.length);
      for (; i < end; i++) chars.push({ text: '*', highlight: false, start:i, end:i+1 });
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)); chars.push({ text: char, highlight: false, start:i,end:i+char.length }); i += char.length;
  }
  const removed = new Set();
  for (let i = 0; i + 1 < delimiters.length; i += 2) {
    const a = delimiters[i], b = delimiters[i + 1]; removed.add(a); removed.add(b);
    for (let j = a + 1; j < b; j++) chars[j].highlight = true;
  }
  return chars.filter((c,i)=>!removed.has(i));
}
export function parseDesignText(text=''){
 const runs=[];for(const c of designCharacters(text)){if(runs.at(-1)?.highlight===c.highlight)runs.at(-1).text+=c.text;else runs.push({text:c.text,highlight:c.highlight});}return runs;
}

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (text) => segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
// Return raw UTF-16 offsets for character styling, counting visible graphemes.
// Equal-length words use the first occurrence so preview and apply are deterministic.
export function longestDesignWord(text = '') {
  let best = null, length = 0;
  for (const word of words.segment(text)) {
    if (!word.isWordLike) continue;
    const count = graphemes(word.segment).length;
    if (count > length) { best = { start: word.index, end: word.index + word.segment.length }; length = count; }
  }
  return best;
}

// Text measurement is supplied by the caller, keeping layout deterministic and
// usable in tests, thumbnails and export without a document or a canvas global.
export function layoutDesignText(layer, measure) {
  if(layer.textStyles?.length)return layoutStyledText(layer,measure);
  const runs = parseDesignText(layer.text).map((r) => ({ ...r, text: layer.uppercase ? r.text.toLocaleUpperCase() : r.text }));
  const chars = runs.flatMap((r) => graphemes(r.text).map((text) => ({ text, highlight: r.highlight })));
  const layout = (size) => {
    const font = designFont(layer, size), tracking = layer.tracking || 0;
    const width = (s) => measure(s, font) + Math.max(0, graphemes(s).length - 1) * tracking;
    const lines = [], rich = []; let line = [];
    const push = () => { rich.push(line); lines.push(line.map((c) => c.text).join('')); line = []; };
    // Keep words intact until a single word itself exceeds the box width.
    const tokens = []; let token = [];
    for (const c of chars) {
      if (c.text === '\n') { if (token.length) tokens.push(token); tokens.push([c]); token = []; }
      else if (token.length && /\s/u.test(token[0].text) !== /\s/u.test(c.text)) { tokens.push(token); token = [c]; }
      else token.push(c);
    }
    if (token.length) tokens.push(token);
    let pending = [];
    for (const word of tokens) {
      if (word[0].text === '\n') { push(); pending = []; continue; }
      if (/\s/u.test(word[0].text)) { pending = line.length ? [{ text: ' ', highlight: word[0].highlight }] : []; continue; }
      const combined = [...line, ...pending, ...word];
      if (line.length && width(combined.map((c) => c.text).join('')) > layer.w) { push(); pending = []; }
      if (line.length) line.push(...pending);
      pending = [];
      for (const c of word) {
        if (line.length && width([...line, c].map((c) => c.text).join('')) > layer.w) push();
        line.push(c);
      }
    }
    push();
    const lineHeight = size * layer.lineHeight, height = lines.length * lineHeight;
    const widths = lines.map(width);
    const overflow = height > layer.h + 0.01 || widths.some((w) => w > layer.w + 0.01);
    const lineRuns = rich.map((cs) => {
      const out = [];
      for (const c of cs) {
        if (out.at(-1)?.highlight === c.highlight) out.at(-1).text += c.text;
        else out.push({ ...c });
      }
      return out;
    });
    return { size, font, lines, lineRuns, widths, lineHeight, height, overflow };
  };
  let result = layout(layer.size);
  if (!layer.autofit || !result.overflow || layer.size <= 6) return result;
  let lo = 6, hi = layer.size; result = layout(lo);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2, next = layout(mid);
    if (next.overflow) hi = mid;
    else { lo = mid; result = next; }
  }
  return result;
}

function layoutStyledText(layer,measure){
 const raw=designCharacters(layer.text),visible=raw.map(c=>c.text).join('');let at=0,index=0,rawAt=0;
 const chars=graphemes(visible).flatMap(text=>{while(index<raw.length-1&&rawAt+raw[index].text.length<=at){rawAt+=raw[index++].text.length;}const source=raw[index];at+=text.length;const style=textStyleAt(layer,source.end-1),value=(style.uppercase??layer.uppercase)?text.toLocaleUpperCase():text;return graphemes(value).map(text=>({text,highlight:source.highlight,style}));});
 const layout=size=>{const scale=size/layer.size,fontFor=c=>designFont({...layer,...c.style},(c.style.size??layer.size)*scale),tracking=c=>c.style.tracking??layer.tracking??0;
 const runs=cs=>{const out=[];for(const c of cs){const last=out.at(-1);if(last&&last.highlight===c.highlight&&JSON.stringify(last.style)===JSON.stringify(c.style))last.text+=c.text;else out.push({...c});}return out;};
 const width=cs=>{const rs=runs(cs);return rs.reduce((sum,r)=>sum+measure(r.text,fontFor(r))+Math.max(0,graphemes(r.text).length-1)*tracking(r),0)+rs.slice(0,-1).reduce((sum,r)=>sum+tracking(r),0);};
 const rich=[];let line=[],pending=[];const push=()=>{rich.push(line);line=[]};let word=[];const tokens=[];for(const c of chars){if(c.text==='\n'){if(word.length)tokens.push(word);tokens.push([c]);word=[];}else if(word.length&&/\s/u.test(word[0].text)!==/\s/u.test(c.text)){tokens.push(word);word=[c]}else word.push(c);}if(word.length)tokens.push(word);
 for(const word of tokens){if(word[0].text==='\n'){push();pending=[];continue;}if(/\s/u.test(word[0].text)){pending=line.length?[{...word[0],text:' '}]:[];continue;}if(line.length&&width([...line,...pending,...word])>layer.w){push();pending=[];}if(line.length)line.push(...pending);pending=[];for(const c of word){if(line.length&&width([...line,c])>layer.w)push();line.push(c);}}push();
 const lineRuns=rich.map(runs),lineHeights=rich.map(cs=>Math.max(size,...cs.map(c=>(c.style.size??layer.size)*scale))*layer.lineHeight),height=lineHeights.reduce((a,b)=>a+b,0),widths=rich.map(width);
 return{styled:true,size,font:designFont(layer,size),lines:rich.map(cs=>cs.map(c=>c.text).join('')),lineRuns,lineHeights,lineHeight:size*layer.lineHeight,height,widths,overflow:height>layer.h+.01||widths.some(w=>w>layer.w+.01)};};
 let result=layout(layer.size);if(!layer.autofit||!result.overflow||layer.size<=6)return result;let lo=6,hi=layer.size;result=layout(lo);for(let i=0;i<14;i++){const mid=(lo+hi)/2,next=layout(mid);if(next.overflow)hi=mid;else{lo=mid;result=next;}}return result;
}
