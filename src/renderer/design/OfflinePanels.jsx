import { useEffect, useRef, useState } from 'preact/hooks';
import { RefreshCw } from 'lucide-preact';
import { prefs } from '../prefs.js';
import { project } from '../editor/store.js';
import { IconButton, Segmented, Select, toast } from '../ui.jsx';
import { DESIGN_PALETTES, DESIGN_FONT_PAIRS, BUILTIN_DESIGN_TEMPLATES, BUILTIN_DESIGN_STYLES } from '../../shared/designTemplates.js';
import { DESIGN_ELEMENTS, DESIGN_EMOJIS, ELEMENT_SECTIONS, elementLayers, availableFontPairs, brandPalette } from '../../shared/designContent.js';
import { rankLibraryItems, filterLibraryItems } from '../../shared/designLibrary.js';
import { newDesign, solidFill } from '../../shared/design.js';
import { LibraryCard, LibraryPreview, TemplateCard, StyleCard } from './LibraryPanel.jsx';
import { LibrarySections } from './LibrarySection.jsx';
import { ImageCard, ColorCard } from './ContentPanel.jsx';
import { fontAvailable, fontVersion } from './fonts.js';
import { applyElement, previewElement, applyAppearance, previewAppearance, savedContent, saveContent, removeContent } from './content.js';
import { savedStyles, userTemplates, clearLibraryPreview } from './library.js';
import { brandColors, brandLogo } from './brand.js';
import { framePalette, sampleCurrentPalette, canSampleFrame } from './videoLibrary.js';
import { useVideoLibrary, videoSection } from './VideoCards.jsx';

const savedMenu=(kind,item,user)=>user?[{id:'delete',label:'Delete Saved Item',run:()=>removeContent(kind,item.id)}]:[{id:'save',label:`Save to My ${kind.replace('FontPairs','Font Pairs')}`,run:()=>saveContent(kind,item)}];
export function fontPairs(){fontVersion.value;prefs.value;const brand=prefs.value.designBrandFonts||{},pair=brand.title&&brand.body?[{id:'brand-fonts',name:'Brand Fonts',title:brand.title,body:brand.body}]:[];return availableFontPairs([...DESIGN_FONT_PAIRS,...pair,...savedContent('FontPairs')],fontAvailable);}
export function AppearanceCard({palette,pair,user=false}){
  const item=palette||pair,kind=palette?'Palettes':'FontPairs',appearance={palette,pair};
  return <LibraryCard id={`appearance:${palette?.id||''}:${pair?.id||''}`} apply={hit=>applyAppearance(appearance,hit)} preview={()=>previewAppearance(appearance)} menuItems={savedMenu(kind,item,user)} title="Hover to preview. Click or press Enter to apply.">{palette&&<span class="dz-palette-colors">{palette.colors.map((color,i)=><i key={i} style={{background:color}}/>)}</span>}{pair&&<span class="dz-font-pair"><strong style={{fontFamily:fontCSS(pair.title)}}>Title</strong><span style={{fontFamily:fontCSS(pair.body)}}>Subtitle</span><small>{fontLabel(pair.title)} + {fontLabel(pair.body)}</small></span>}<b>{pair&&palette?`${palette.name} + ${pair.name}`:item.name}</b></LibraryCard>;
}
function fontLabel(font){return({sans:'System Sans',serif:'Serif',mono:'Monospace',rounded:'Rounded'})[font]||font;}
function fontCSS(font){return({sans:'system-ui',mono:'monospace',serif:'serif',rounded:'ui-rounded, system-ui'})[font]||JSON.stringify(font);}
export function ElementCard({element,user=false}){
  if(element.kind==='emoji')return <LibraryCard id={`element:${element.id}`} apply={(_,point)=>applyElement(element,point)} preview={()=>previewElement(element)} menuItems={savedMenu('Elements',element,user)} title={element.name}><span class="dz-emoji-symbol" aria-label={element.name}>{element.text}</span></LibraryCard>;
  const d=newDesign({width:640,height:360}),layers=elementLayers(element,d,{duration:'2:34'});d.background=element.kind==='background'?element.fill:solidFill('#292d3b');d.layers=layers;
  return <LibraryCard id={`element:${element.id}`} apply={(_,point)=>applyElement(element,point)} preview={()=>previewElement(element)} menuItems={savedMenu('Elements',element,user)} title={`${element.name}. Click or drag to add.`}>{element.svg?<img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}`} alt="" draggable={false}/>:<LibraryPreview design={d}/>}<b>{element.name}</b></LibraryCard>;
}
export function ElementsPanel({query=''}){
  const [emojiQuery,setEmojiQuery]=useState(''),[group,setGroup]=useState('all');prefs.value;const sections=ELEMENT_SECTIONS.filter(([id])=>id!=='emoji').map(([id,title])=>({id,title,items:filterLibraryItems(DESIGN_ELEMENTS.filter(e=>e.section===id),query),render:element=><ElementCard key={element.id} element={element}/>}));
  const emojis=filterLibraryItems(DESIGN_EMOJIS.filter(e=>group==='all'||e.group===group),`${query} ${emojiQuery}`);sections.splice(3,0,{id:'emoji',title:`Emoji (${emojis.length})`,layout:'emoji',items:emojis,controls:<div class="dz-emoji-search"><input type="search" class="text-input" aria-label="Search emoji in English" placeholder="Search emoji in English" value={emojiQuery} onInput={e=>setEmojiQuery(e.currentTarget.value)}/><Select value={group} options={[{value:'all',label:'All categories'},...[...new Set(DESIGN_EMOJIS.map(e=>e.group))].map(value=>({value,label:value}))]} onChange={setGroup}/></div>,render:element=><ElementCard key={element.id} element={element}/>});sections.push({id:'stickers',title:'Stickers',items:filterLibraryItems(DESIGN_ELEMENTS.filter(e=>e.kind==='sticker'),query),render:element=><ElementCard key={element.id} element={element}/>});
  sections.push({id:'my-elements',title:'My Elements',items:filterLibraryItems(savedContent('Elements'),query),render:element=><ElementCard key={element.id} element={element} user/>,empty:'Right click an element to save it here.'});
  return <LibrarySections query={query} sections={sections}/>;
}
export function DesignStylesPanel({query=''}){
  const [tab,setTab]=useState('recommended'),[sampling,setSampling]=useState(false),controller=useRef(null);prefs.value;fontVersion.value;
  useEffect(()=>()=>controller.current?.abort(),[]);
  const pairs=fontPairs(),palettes=[...DESIGN_PALETTES,...savedContent('Palettes')],brand=brandPalette(brandColors());if(brand)palettes.push(brand);
  const sample=async()=>{const c=new AbortController();controller.current?.abort();controller.current=c;setSampling(true);try{const result=await sampleCurrentPalette(c.signal);if(!result&&!c.signal.aborted)toast('No video frame is available. Choose a frame in Video first.');}catch(e){if(!c.signal.aborted)toast(e.message,{kind:'error'});}finally{if(!c.signal.aborted)setSampling(false);}};
  const sections=tab==='fonts'?[{id:'fonts',title:'Font Pairs',items:filterLibraryItems(pairs,query),render:pair=><AppearanceCard key={pair.id} pair={pair} user={savedContent('FontPairs').some(p=>p.id===pair.id)}/>}]:tab==='colors'?[{id:'frame',title:'From This Frame',actions:<IconButton icon={RefreshCw} title={sampling?'Sampling Frame…':'Sample Frame Colors'} disabled={sampling||!canSampleFrame()} onClick={sample}/>,items:framePalette.value?filterLibraryItems([framePalette.value],query):[],render:palette=><AppearanceCard key={palette.id} palette={palette}/>,empty:sampling?'Sampling locally…':'Choose Sample Frame Colors to make a palette from the selected video frame.'},{id:'palettes',title:'Color Palettes',items:filterLibraryItems(palettes,query),render:palette=><AppearanceCard key={palette.id} palette={palette} user={!DESIGN_PALETTES.some(p=>p.id===palette.id)&&palette.id!=='brand'}/>}]:[{id:'recommended',title:'Recommended',items:filterLibraryItems(palettes.map((palette,i)=>({id:palette.id,name:`${palette.name} ${pairs[i%pairs.length]?.name||''}`,palette,pair:pairs[i%pairs.length]})),query),render:item=><AppearanceCard key={item.id} palette={item.palette} pair={item.pair}/>}];
  return <><Segmented value={tab} options={[{value:'recommended',label:'Recommended'},{value:'colors',label:'Colors'},{value:'fonts',label:'Fonts'}]} onChange={value=>{clearLibraryPreview();setTab(value)}}/><LibrarySections key={tab} query={query} sections={sections}/></>;
}
export function SearchPanel({query=''}){
  prefs.value;fontVersion.value;const p=project.value,users=userTemplates.value,styles=savedStyles(),pairs=fontPairs(),savedElements=savedContent('Elements'),palettes=[...DESIGN_PALETTES,...savedContent('Palettes')],brand=brandPalette(brandColors());if(brand)palettes.push(brand);if(framePalette.value)palettes.push(framePalette.value);
  if(!query.trim())return <p class="hint">Search templates, text styles, elements, palettes, fonts and project images.</p>;
  const groups=[
    {id:'templates',title:'Templates',items:[...BUILTIN_DESIGN_TEMPLATES,...users],render:template=><TemplateCard key={template.id} template={template} user={users.includes(template)}/>},
    {id:'text',title:'Text Styles',items:[...BUILTIN_DESIGN_STYLES,...styles],render:style=><StyleCard key={style.id} style={style} user={styles.includes(style)}/>},
    {id:'elements',title:'Elements',items:[...DESIGN_ELEMENTS,...savedElements],render:element=><ElementCard key={element.id} element={element} user={savedElements.includes(element)}/>},
    {id:'palettes',title:'Palettes',items:palettes,render:palette=><AppearanceCard key={palette.id} palette={palette} user={savedContent('Palettes').some(p=>p.id===palette.id)}/>},
    {id:'fonts',title:'Font Pairs',items:pairs,render:pair=><AppearanceCard key={pair.id} pair={pair} user={savedContent('FontPairs').some(p=>p.id===pair.id)}/>},
    {id:'images',title:'Project Images',items:[...Object.values(p.designAssets||{}).filter(a=>a.origin==='placed').map(a=>({...a,source:{asset:a}})),...Object.values(p.media).filter(m=>m.kind==='image').map(m=>({...m,source:{media:m}}))],render:item=><ImageCard key={item.id} item={item} source={item.source} prefix="search-image"/>},
    {id:'brand-colors',title:'Brand Colors',items:brandColors().map(color=>({id:color,name:color,tags:['brand','color']})),render:item=><ColorCard key={item.id} color={item.id}/>},
    {id:'brand',title:'Brand',items:brandLogo.value?[{id:'logo',name:brandLogo.value.name,tags:['logo','brand'],path:brandLogo.value.path}]:[],render:item=><ImageCard key={item.id} item={item} source={item} prefix="search-brand"/>},
  ].map(g=>({...g,items:rankLibraryItems(g.items,query)})).filter(g=>g.items.length);
  return groups.length?<LibrarySections query={query} sections={groups}/>:<p class="hint">No matching items.</p>;
}
export function VideoPanel({children}){useVideoLibrary();const section=videoSection();return <>{children}{section&&<LibrarySections sections={[section]}/>}</>;}
