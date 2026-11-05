// Original palettes and vector artwork bundled with Reccut; no network required.
export const EXTRA_PALETTES=[
 ['Electric Lime','#101615','#f5ffee','#c8ff00','#43d9ae','#020504'],['Coral Studio','#241c26','#fff6ed','#ff745c','#ffd2a8','#120e13'],['Cobalt Paper','#eeeae2','#122b58','#2155ff','#e4ae30','#102047'],['Candy Pop','#341c50','#fff4fb','#ff78bc','#81e5ff','#190b2a'],['Warm Clay','#f0dfcf','#422b25','#c76840','#7d8a64','#2b1c17'],['Arctic','#102536','#f4fbff','#8be6ff','#b7c6ff','#06131e'],['Tangerine','#201a18','#fff6e3','#ff8b28','#ffc965','#100d0b'],['Mint Lab','#e6f6eb','#113e37','#32b893','#a5d66d','#062a24'],['Crimson Ink','#21151b','#fff1f1','#ff3e58','#eaaec6','#10080d'],['Deep Space','#100d28','#f4eeff','#9d7cff','#43defa','#04030d'],['Mustard Press','#eee7cc','#2b302d','#d5aa26','#6b8f80','#121715'],['Rose Quartz','#fae8ec','#5a2440','#d85884','#b49ad1','#321326'],['Teal Copper','#0d3034','#e4f7ef','#df9d69','#40c5b8','#041c1f'],['Royal','#21183f','#fff5db','#e7bd50','#9975d4','#100b24'],['Lavender Milk','#f3ecff','#3d2c5d','#b475e6','#edb2d6','#201431'],['Coffee','#201915','#f3dfc5','#caa069','#8fbaa3','#100c09'],['Sky Peach','#dceeff','#152d51','#ffb08e','#659ddd','#0b1a30'],['Sport Neon','#121922','#ffffff','#f5f500','#3cd5ff','#03080f'],['Forest Dawn','#12332b','#fff4dc','#f3b967','#88b896','#061b15'],['Berry Cream','#431d39','#fff1dd','#ff8baf','#c9b0f2','#230d1d'],['Indigo Ice','#1c2c54','#f2fbff','#6eddf7','#a5b4f4','#0b1430'],['Desert','#ead4ad','#3c2e28','#c8633d','#87946e','#241b15'],['Red Cream','#f7eedc','#412c2c','#df373b','#e7b56d','#241718'],['Cyber Violet','#161126','#f5eeff','#e34dff','#5de6d3','#070411'],['Ocean Sand','#0b3643','#fff2d5','#efb877','#6ed0ca','#03222b'],['Charcoal Pink','#202126','#faf7fa','#f593bd','#a8b3d3','#0b0d11'],['Sunflower','#e9f0eb','#1e3c33','#e8bf32','#6f9c8b','#0a251c'],['Marine','#0d2240','#f0f6ff','#ef5e45','#699ee5','#020e21'],['Grape Soda','#361a58','#fff2fd','#d58bff','#ffb5cb','#19082d'],['Monochrome','#181818','#ffffff','#b5b5b5','#e1e1e1','#000000'],['Apricot','#fff1df','#603526','#f9995c','#bd917d','#321b13'],['Glacier','#e8f6f9','#16313d','#3fabc4','#a9c2d8','#071c26']
].map(([name,...colors],i)=>({id:`studio-${i}`,name,colors}));
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${body}</svg>`;
const graphics=[
 ['speech-bubble','Speech Bubble','<path d="M90 45h460v215H285l-95 70v-70H90z" fill="#ffd60a"/>'],
 ['ribbon','Ribbon Banner','<path d="M40 90h560l-75 90 75 90H40l75-90z" fill="#ffd60a"/>'],
 ['chevron','Chevron','<path d="M200 40h100l150 140-150 140H200l150-140z" fill="#ffd60a"/>'],
 ['blob','Organic Blob','<path transform="translate(32 30) scale(.9)" d="M560 120C630 290 390 350 190 305S20 120 180 65 490-50 560 120" fill="#ffd60a"/>'],
 ['wave','Wave Divider','<path d="M20 230Q95 60 170 230T320 230T470 230T620 230" fill="none" stroke="#ffd60a" stroke-width="30"/>'],
 ['brackets','Focus Brackets','<path d="M160 70H60v220h100M480 70h100v220H480" fill="none" stroke="#ffd60a" stroke-width="20"/>'],
 ['cross','Plus Mark','<path d="M285 45h70v100h100v70H355v100h-70V215H185v-70h100z" fill="#ffd60a"/>'],
 ['check','Check Mark','<path d="M150 180l110 100L500 60" fill="none" stroke="#ffd60a" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>'],
 ['crossout','Cross Mark','<path d="M210 60l220 240M430 60L210 300" stroke="#ff453a" stroke-width="45" stroke-linecap="round"/>'],
 ['heart','Heart Sticker','<path d="M320 315C40 145 140-40 320 95 500-40 600 145 320 315" fill="#ff453a"/>'],
 ['play','Play Sticker','<path d="M210 40l260 140-260 140z" fill="#ffd60a"/>'],
 ['frame','Rounded Frame','<rect x="45" y="35" width="550" height="290" rx="55" fill="none" stroke="#ffd60a" stroke-width="24"/>'],
 ['arrow-block','Block Arrow','<path d="M60 140h340V60l180 120-180 120v-80H60z" fill="#ff453a"/>'],
 ['price-tag','Price Tag','<path d="M180 60h330l90 120-90 120H180q-40 0-40-40V100q0-40 40-40z" fill="#30d158"/><circle cx="530" cy="180" r="22" fill="#0b1a10"/>'],
 ['thought','Thought Bubble','<path d="M190 250c-60 0-90-60-50-100-20-60 50-110 110-80 30-50 120-50 150 0 60-30 130 20 110 80 40 40 10 100-50 100z" fill="#ffffff" stroke="#111111" stroke-width="10"/><circle cx="170" cy="292" r="22" fill="#ffffff" stroke="#111111" stroke-width="8"/><circle cx="128" cy="330" r="12" fill="#ffffff" stroke="#111111" stroke-width="6"/>'],
 ['highlight','Marker Highlight','<path d="M70 200L570 165" stroke="#ffd60a" stroke-opacity=".75" stroke-width="80" stroke-linecap="round"/>'],
 ['pill','Pill Label','<rect x="60" y="110" width="520" height="140" rx="70" fill="#0a84ff"/>'],
 ['zigzag','Zigzag Line','<path d="M40 210l60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60" fill="none" stroke="#bf5af2" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'],
 ['accent-lines','Accent Lines','<path d="M230 170L130 90M290 130L280 30M180 220L70 200" stroke="#ffd60a" stroke-width="24" stroke-linecap="round"/>'],
 ['target','Target Rings','<circle cx="320" cy="180" r="150" fill="none" stroke="#ff453a" stroke-width="24"/><circle cx="320" cy="180" r="90" fill="none" stroke="#ff453a" stroke-width="24"/><circle cx="320" cy="180" r="32" fill="#ff453a"/>'],
 ['viewfinder','Viewfinder','<path d="M80 110V50h90M560 110V50h-90M80 250v60h90M560 250v60h-90" fill="none" stroke="#ffffff" stroke-width="14"/><circle cx="320" cy="180" r="20" fill="#ff453a"/>'],
 ['pin','Location Pin','<path d="M320 340C230 230 200 180 200 140a120 120 0 0 1 240 0c0 40-30 90-120 200z" fill="#ff453a"/><circle cx="320" cy="140" r="45" fill="#ffffff"/>'],
 ['cursor','Mouse Pointer','<path d="M260 30v260l65-58 42 92 46-21-42-91h89z" fill="#ffffff" stroke="#111111" stroke-width="12" stroke-linejoin="round"/>'],
 ['alert','Alert Badge','<circle cx="320" cy="180" r="150" fill="#ff9f0a"/><path d="M320 95v100" stroke="#111111" stroke-width="38" stroke-linecap="round"/><circle cx="320" cy="262" r="22" fill="#111111"/>'],
 ['paper','Torn Paper Strip',`<path d="M30 100${[...Array(15)].map((_,i)=>`L${70+i*40} ${i%2?100:118}`).join('')}L610 260${[...Array(15)].map((_,i)=>`L${570-i*40} ${i%2?260:242}`).join('')}z" fill="#f4ecd8"/>`],
 ['dotted-arrow','Dotted Path Arrow','<path d="M70 280C200 300 300 80 520 110" fill="none" stroke="#ffffff" stroke-width="12" stroke-dasharray="2 26" stroke-linecap="round"/><path d="M470 70l60 40-55 50" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'],
 ['orb','Gradient Orb','<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#bf5af2"/><stop offset="1" stop-color="#0a84ff"/></linearGradient></defs><circle cx="320" cy="180" r="160" fill="url(#g)"/>'],
 ['slant','Slanted Banner','<path d="M130 110h470l-40 140H90z" fill="#0a84ff"/><path d="M80 110h30l-40 140H40z" fill="#ffd60a"/>'],
];
export const EXTRA_ELEMENTS=[
 ...[3,4,5,7,8,10,12].map(sides=>({id:`polygon-${sides}`,name:`${sides}-Sided Polygon`,kind:'shape',section:'shapes',shape:'polygon',props:{sides},tags:['shape','polygon']})),
 ...[4,5,6,8,12,16].map(points=>({id:`star-${points}`,name:`${points}-Point Star`,kind:'shape',section:'shapes',shape:'star',props:{points},tags:['shape','star','burst']})),
 ...graphics.map(([id,name,body])=>({id:`graphic-${id}`,name,kind:'drawing',section:'pointers',svg:svg(body),tags:['graphic','sticker',id]})),
 ...EXTRA_PALETTES.flatMap(p=>[{id:`solid-${p.id}`,name:`${p.name} Background`,kind:'background',section:'backgrounds',fill:{type:'solid',color:p.colors[0],alpha:1},tags:['background','solid',p.name]},...['linear','radial'].map(mode=>({id:`${mode}-${p.id}`,name:`${p.name} ${mode==='radial'?'Radial':'Gradient'}`,kind:'background',section:'backgrounds',fill:{type:'gradient',alpha:1,gradient:{mode,stops:[{position:0,color:p.colors[0]},{position:1,color:p.colors[2]}]}},tags:['background','gradient',mode,p.name]}))]),
 ...['dots','grid'].flatMap(kind=>[16,32,64,96].map(spacing=>({id:`pattern-${kind}-${spacing}`,name:`${kind==='dots'?'Dots':'Grid'} ${spacing}`,kind:'texture',section:'backgrounds',pattern:{kind,color:'#52607a',size:kind==='dots'?3:1,spacingX:spacing,spacingY:spacing},tags:['background','pattern',kind]})))
];
