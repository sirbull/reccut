#!/usr/bin/env python3
"""Original procedural lens-flare sprite generator for RecCut.
Dependencies: numpy, Pillow, scipy. Run: python scripts/generate_assets.py --scale 1
Produces 36 true-RGBA PNGs + an asset manifest with dimensions and trim bounding boxes.
Re-run with --scale 2 to regenerate at 2x resolution (careful: large files).
"""
import argparse
import json
import math
from pathlib import Path
import hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
COL = {
    'warm': (1.00,.44,.13), 'amber': (1.00,.62,.20), 'gold': (1.00,.78,.40),
    'blue': (.20,.53,1.00), 'cyan': (.16,.86,1.00), 'purple': (.64,.26,1.00),
    'pink': (1.00,.30,.72), 'white': (1.00,.98,.92), 'green': (.24,.94,.54),
}
# Asset formats chosen for projected screen size; whole-screen soft light should use a shader.
ASSETS = [
 ('glows','glow_warm',1024,1024,'glow','warm',0),
 ('glows','glow_blue',1024,1024,'glow','blue',1),
 ('glows','glow_white',1024,1024,'glow','white',2),
 ('glows','glow_violet',1024,1024,'glow','purple',3),
 ('starbursts','starburst_4_gold',1536,1536,'starburst','gold',4),
 ('starbursts','starburst_6_blue',1536,1536,'starburst','blue',6),
 ('starbursts','starburst_8_amber',1536,1536,'starburst','amber',8),
 ('starbursts','starburst_12_white',1536,1536,'starburst','white',12),
 ('streaks','streak_anamorphic_blue',3072,512,'streak','blue',0),
 ('streaks','streak_warm_horizontal',3072,512,'streak','amber',1),
 ('streaks','streak_violet',3072,512,'streak','purple',2),
 ('streaks','streak_cyan_double',3072,512,'streak','cyan',3),
 ('streaks','streak_white_thin',3072,512,'streak','white',4),
 ('ghosts','ghost_round_amber',1024,1024,'ghost','amber',0),
 ('ghosts','ghost_hex_blue',1024,1024,'ghost','blue',1),
 ('ghosts','ghost_hex_purple',1024,1024,'ghost','purple',2),
 ('ghosts','ghost_octagon_green',1024,1024,'ghost','green',3),
 ('ghosts','ghost_prism_round',1024,1024,'ghost','white',4),
 ('ghosts','ghost_oval_pink',1024,1024,'ghost','pink',5),
 ('rings','ring_rainbow',1024,1024,'ring','white',0),
 ('rings','ring_blue_thin',1024,1024,'ring','blue',1),
 ('rings','ring_amber_wide',1024,1024,'ring','amber',2),
 ('rings','ring_prism_offset',1024,1024,'ring','white',3),
 ('arcs','arc_rainbow_top',1024,1024,'arc','white',0),
 ('arcs','arc_blue_right',1024,1024,'arc','blue',1),
 ('arcs','arc_gold_bottom',1024,1024,'arc','gold',2),
 ('arcs','arc_violet_left',1024,1024,'arc','purple',3),
 ('glints','glint_gold_micro',1024,1024,'glint','gold',0),
 ('glints','glint_white_hotspot',1024,1024,'glint','white',1),
 ('glints','glint_blue_cross',1024,1024,'glint','blue',2),
 ('diffraction','diffraction_warm_8',1536,1536,'diffraction','warm',0),
 ('diffraction','diffraction_cool_12',1536,1536,'diffraction','blue',1),
 ('dirt','lens_dirt_speckles',2048,2048,'dirt','white',0),
 ('dirt','lens_dirt_fine_scratches',2048,2048,'dirt','white',1),
 ('dirt','lens_dirt_smudges',2048,2048,'dirt','white',2),
 ('dirt','lens_dirt_dust_bokeh',2048,2048,'dirt','white',3),
]

def makegrid(w,h):
    return np.linspace(-1,1,w,dtype=np.float32)[None,:], np.linspace(-1,1,h,dtype=np.float32)[:,None]

def gaussian(x, sigma):
    return np.exp(-.5*(x / sigma)**2)

def colorify(mask, base, x,y, core=None, chroma=None):
    # RGB holds source chroma, alpha holds emission pattern; no black matte is composited.
    base=np.asarray(COL[base],dtype=np.float32)
    core = np.zeros_like(mask) if core is None else np.clip(core,0,1)
    if chroma is None:
        rgb = base[None,None,:] * (1-core[...,None]*.52) + core[...,None]*.52
    else:
        rgb = chroma
        rgb = rgb*(1-core[...,None]*.35)+core[...,None]*.35
    return np.clip(rgb,0,1), mask

def hsv_np(h,s,v):
    # h may be an array, s and v scalar. rgb outputs arrays.
    h=np.mod(h,1)*6
    i=np.floor(h).astype(np.int8)
    f=h-i
    p=v*(1-s);q=v*(1-f*s);t=v*(1-(1-f)*s)
    r=np.select([i==0,i==1,i==2,i==3,i==4],[v,q,p,p,t],default=v)
    g=np.select([i==0,i==1,i==2,i==3,i==4],[t,v,v,q,p],default=p)
    b=np.select([i==0,i==1,i==2,i==3,i==4],[p,p,t,v,v],default=q)
    return np.stack([r,g,b],axis=-1).astype(np.float32)

def generator(w,h,kind,color,variant,seed):
    x,y=makegrid(w,h)
    radius=np.sqrt(x*x+y*y)
    theta=np.arctan2(y,x)
    mask=None; core=None; chroma=None
    if kind=='glow':
        r=radius * (1.1 if variant==1 else .95)
        core=gaussian(r,.08)
        mask=.65*gaussian(r,.26) + .28*gaussian(r,.48)+.4*gaussian(r,.052)
        mask *= np.clip(1-radius/.95,0,1)**.5
    elif kind in ('starburst','diffraction','glint'):
        rays = variant if kind=='starburst' else (8 if kind=='diffraction' and variant==0 else 12 if kind=='diffraction' else 4 if variant in (0,2) else 8)
        core=gaussian(radius,.075 if kind != 'glint' else .06)
        mask=.30*gaussian(radius,.25)+.66*gaussian(radius,.055)
        rot=.02 if kind=='starburst' else .12
        for k in range(rays // 2):
            a=np.pi*k/(rays // 2)+rot
            perp=(-np.sin(a)*x+np.cos(a)*y)
            along=np.cos(a)*x+np.sin(a)*y
            width=(.007 if kind=='starburst' else .009) + .008*np.abs(along)
            length=(.52 if kind=='glint' else .78) * (1.25 if k==0 else .72 if k%2 else 1.)
            beam=gaussian(perp,width)*np.exp(-(np.abs(along)/length)**1.35)
            mask += beam*(.43 if kind=='starburst' else .33 if kind=='diffraction' else .28)
        if kind=='diffraction':
            # Airy-like concentric interference rings
            mask+=.22*gaussian(radius-.22,.012)+.07*gaussian(radius-.34,.014)
        mask *= np.clip((.96-radius)/.14,0,1)**2
    elif kind=='streak':
        core=gaussian(x,.085)*gaussian(y,.065)
        spread = .020 if variant==4 else .043 if variant==3 else .035
        beams = (.64*gaussian(y,spread)+.18*gaussian(y,spread*3.6)+.11*gaussian(y,spread*.35)) * np.exp(-(np.abs(x)/.55)**1.45)
        if variant==3: beams+=.34*gaussian(y-.11,.018)*gaussian(x,.55)
        if variant==2: beams+=.18*gaussian(y+.06,.02)*gaussian(x,.38)
        mask=beams+.32*core
        mask*=np.clip((1-np.abs(x))/.12,0,1)**2
        mask*=np.clip((1-np.abs(y))/.16,0,1)**2
    elif kind=='ghost':
        # Different aperture geometries and asymmetrical caustic highlight.
        xx=x*(1.17 if variant==5 else 1.0); yy=y
        r=np.sqrt(xx*xx+yy*yy)
        ang=np.arctan2(yy,xx)
        n=6 if variant in (1,2) else 8 if variant==3 else 0
        if n:
            tt=np.mod(ang+np.pi/n,2*np.pi/n)-np.pi/n
            poly=r*np.cos(tt)/np.cos(np.pi/n)
        else: poly=r
        boundary=.68 if variant in (1,3) else .65
        inside=np.clip((boundary-poly)/.045,0,1)
        edge=gaussian(poly-boundary*.92,.025)
        caustic=gaussian((xx+.21)**2+(yy-.17)**2,.20)
        fluct=.85+.15*np.cos(ang*2.7+variant)
        mask=(.11+(.1+.10*caustic)*fluct)*inside + .28*edge
        if variant==4:
            chroma=hsv_np((ang/(2*np.pi)+.58).astype(np.float32),.72,.95)
        else:
            # An intentional mild chromatic fringe on outer edge.
            mask+=.10*gaussian(poly-boundary*1.02,.026)
        core=gaussian(np.sqrt((xx+.22)**2+(yy-.12)**2),.18)*.5
        mask*=np.clip((.97-radius)/.14,0,1)**2
    elif kind=='ring':
        r=radius
        th=.022 if variant==1 else .035 if variant!=2 else .064
        ringrad=.59 if variant in (0,3) else .56
        ring=gaussian(r-ringrad,th)
        asym=.58+.42*np.cos(theta-.65)**2
        mask=(.52*ring+.14*gaussian(r-ringrad,th*2.6))*asym
        if variant in (0,3):
            chroma=hsv_np((theta/(2*np.pi)+(.59 if variant==0 else .42) +.10*(r-ringrad)).astype(np.float32),.87,.98)
        mask*=np.clip((.97-radius)/.1,0,1)**2
    elif kind=='arc':
        r=radius
        centers=(np.pi*.5,0,-np.pi*.5,np.pi)
        c=centers[variant]
        ang=np.arctan2(np.sin(theta-c),np.cos(theta-c))
        sector=gaussian(ang,.85 if variant==0 else .6)
        ring=gaussian(r-.66,.030 if variant!=2 else .018)
        mask=.79*sector*ring+.10*sector*gaussian(r-.66,.08)
        if variant==0:
            chroma=hsv_np((theta/(2*np.pi)+.45).astype(np.float32),.86,1)
        mask*=np.clip((.96-radius)/.1,0,1)**2
    elif kind=='dirt':
        rng=np.random.default_rng(seed)
        im=Image.new('L',(w,h),0)
        draw=ImageDraw.Draw(im)
        if variant==0:
            for _ in range(1100):
                px=int(rng.uniform(.08,.92)*w);py=int(rng.uniform(.08,.92)*h)
                rad=int(rng.choice([1,1,1,2,3,4,5])); v=int(rng.uniform(35,160))
                draw.ellipse((px-rad,py-rad,px+rad,py+rad),fill=v)
        elif variant==1:
            for _ in range(95):
                px=int(rng.uniform(.1,.9)*w);py=int(rng.uniform(.08,.92)*h)
                length=int(rng.uniform(12,250)); ang=rng.uniform(-.18,.18)
                dx=int(length*np.cos(ang));dy=int(length*np.sin(ang))
                draw.line((px,py,px+dx,py+dy),fill=int(rng.uniform(15,80)),width=int(rng.choice([1,1,2,3])))
        elif variant==2:
            for _ in range(35):
                px=int(rng.uniform(.1,.9)*w);py=int(rng.uniform(.1,.9)*h)
                rx=int(rng.uniform(18,95));ry=int(rng.uniform(9,65))
                draw.ellipse((px-rx,py-ry,px+rx,py+ry),fill=int(rng.uniform(20,85)))
            im=im.filter(ImageFilter.GaussianBlur(radius=24*min(w,h)/2048))
        else:
            for _ in range(130):
                px=int(rng.uniform(.08,.92)*w);py=int(rng.uniform(.08,.92)*h)
                rr=int(rng.uniform(2,24)*min(w,h)/2048)
                v=int(rng.uniform(12,110))
                draw.ellipse((px-rr,py-rr,px+rr,py+rr),outline=v,width=max(1,rr//6))
            im=im.filter(ImageFilter.GaussianBlur(radius=1.4*min(w,h)/2048))
        mask=np.asarray(im,dtype=np.float32)/255
        core=np.zeros_like(mask)
        # Dirt is used as a lens-dirt modulation, not a permanently opaque video overlay.
        mask*=.75
    else: raise ValueError(kind)
    # Analytic edge envelope guarantees alpha=0 at borders, even for broad glows.
    envelope=(np.clip((1-np.abs(x))/.055,0,1)**2)*(np.clip((1-np.abs(y))/.055,0,1)**2)
    mask=np.clip(mask*envelope,0,1).astype(np.float32)
    rgb, mask=colorify(mask,color,x,y,core,chroma)
    return rgb,mask

def save_asset(filepath,rgb,mask):
    # Straight-alpha sRGB PNG, no composited background. Make alpha=0 on image edges.
    h,w=mask.shape
    if rgb.shape[:2]!=(h,w):
        rgb=np.broadcast_to(rgb,(h,w,3))
    rgba=np.empty((h,w,4),dtype=np.uint8)
    rgba[:,:,:3]=(np.clip(rgb,0,1)*255+.5).astype('uint8')
    rgba[:,:,3]=(np.clip(mask,0,1)*255+.5).astype('uint8')
    Image.fromarray(rgba,'RGBA').save(filepath,optimize=True)
    a=rgba[:,:,3]
    assert a[0,:].max()==0 and a[-1,:].max()==0 and a[:,0].max()==0 and a[:,-1].max()==0, filepath
    nonzero=np.argwhere(a>1)
    bbox=[int(nonzero[:,1].min()), int(nonzero[:,0].min()), int(nonzero[:,1].max()+1),int(nonzero[:,0].max()+1)] if len(nonzero) else [0,0,0,0]
    return {'pixel_width':w,'pixel_height':h,'alpha_bbox_xyxy':bbox,'alpha_min':int(a.min()),'alpha_max':int(a.max()),'edge_alpha_max':int(max(a[0,:].max(),a[-1,:].max(),a[:,0].max(),a[:,-1].max()))}

def run(scale):
    items=[]
    for i,(folder,name,w,h,kind,col,v) in enumerate(ASSETS):
        w=int(w*scale);h=int(h*scale)
        dest=ROOT/'assets'/folder/f'{name}.png'; dest.parent.mkdir(exist_ok=True,parents=True)
        seed=int(hashlib.sha256(name.encode()).hexdigest()[:8],16)
        rgb,mask=generator(w,h,kind,col,v,seed)
        info=save_asset(dest,rgb,mask)
        item={'id':name,'group':folder,'type':kind,'file':str(dest.relative_to(ROOT)).replace('\\','/'),
              'format':'PNG RGBA8','alpha_encoding':'straight','rgb_transfer':'sRGB','source':'original_procedural',
              'recommended_blend_mode':'add_linear' if kind not in ('dirt',) else 'lens_dirt_modulation',
              'anchor_uv':[.5,.5],**info}
        items.append(item)
        print(f'{i+1:02}/{len(ASSETS)} {name} {w}x{h}',flush=True)
    manifest={'schema':'reccut.lensflare.assets.v1','generator':'scripts/generate_assets.py',
              'texture_semantics':'RGB is emissive hue, alpha is energy mask. Decode sRGB RGB to linear, multiply by alpha and element intensity. Add in scene linear, tone map once. PNG alpha is straight, not premultiplied.',
              'assets':items}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scale',type=float,default=1.0);a=p.parse_args()
    run(a.scale)
