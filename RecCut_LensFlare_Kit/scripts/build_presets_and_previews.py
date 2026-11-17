#!/usr/bin/env python3
"""Create editable flare JSON presets and 4K example composites using a simple reference CPU renderer.
The CPU preview is for design verification only; production should use GPU linear-light shaders.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
# distance: 1=source, 0=optical center, -1=opposite side of center.
def e(asset,distance=1,width_h=.35,intensity=.7,offset=(0,0),rotation=0,visible=True,tint=(1,1,1),blend='add_linear'):
    return dict(id=f'{asset}-{distance:+.2f}',asset_id=asset,visible=visible,
         distance=distance,offset_uv=list(offset),display_width_as_fraction_of_video_height=width_h,
         rotation_degrees=rotation,intensity=intensity,opacity=1.0,tint_linear=list(tint),blend_mode=blend)
PRESETS={
'cinematic_warm':dict(title='Cinematic Warm',category='Cinematic',source_uv=(.68,.39),elements=[
 e('glow_warm',1,.98,.90),e('glow_white',1,.37,.65),e('glint_gold_micro',1,.4,.90),
 e('starburst_8_amber',1,1.0,.68),e('streak_warm_horizontal',1,2.7,.42),
 e('ring_rainbow',-.58,.72,.25),e('ghost_round_amber',-.48,.30,.50),
 e('ghost_hex_purple',-1.18,.24,.50),e('ghost_prism_round',-1.75,.36,.32),
 e('arc_gold_bottom',-.65,.86,.37),e('lens_dirt_speckles',1,1.4,.20,visible=False,blend='lens_dirt_modulation')]),
'anamorphic_blue':dict(title='Anamorphic Blue',category='Anamorphic',source_uv=(.38,.46),elements=[
 e('glow_blue',1,.9,.78),e('glow_white',1,.31,.76),e('glint_blue_cross',1,.48,.8),
 e('streak_anamorphic_blue',1,3.1,.92),e('streak_cyan_double',1,2.5,.3),
 e('ghost_hex_blue',-.4,.28,.35),e('ghost_octagon_green',-1.1,.25,.25),
 e('ring_blue_thin',-1.5,.68,.36),e('arc_blue_right',-.8,.9,.42)]),
'sci_fi_violet':dict(title='Sci-Fi Violet',category='Creative',source_uv=(.64,.44),elements=[
 e('glow_violet',1,1.25,.8),e('glint_white_hotspot',1,.30,.90),e('diffraction_cool_12',1,.9,.55,tint=(.96,.62,1)),
 e('streak_violet',1,2.9,.78),e('ghost_hex_purple',-.43,.28,.55),
 e('ghost_oval_pink',-.95,.40,.35),e('ring_prism_offset',-1.43,.65,.30),
 e('arc_violet_left',-1.4,.75,.30)]),
'golden_sunset':dict(title='Golden Sunset',category='Cinematic',source_uv=(.78,.38),elements=[
 e('glow_warm',1,1.3,.96),e('glow_white',1,.25,.45),e('starburst_4_gold',1,.9,.75),
 e('streak_warm_horizontal',1,2.0,.24),e('ring_amber_wide',-.35,.6,.34),
 e('ghost_round_amber',-.68,.32,.42),e('ghost_prism_round',-1.5,.4,.30),
 e('arc_gold_bottom',-.83,1.0,.36)]),
'prism_rainbow':dict(title='Prism Rainbow',category='Creative',source_uv=(.29,.30),elements=[
 e('glow_white',1,.95,.80),e('starburst_12_white',1,.78,.62),
 e('streak_white_thin',1,2.5,.40),e('ring_rainbow',-.4,.92,.65),
 e('ghost_prism_round',-.8,.42,.64),e('ring_prism_offset',-1.2,.63,.62),
 e('arc_rainbow_top',-1.55,1.05,.60),e('ghost_hex_blue',-1.85,.21,.40)]),
'vintage_35mm':dict(title='Vintage 35mm',category='Optical',source_uv=(.68,.34),elements=[
 e('glow_warm',1,.73,.55),e('starburst_6_blue',1,.51,.26,tint=(1,.8,.4)),
 e('ghost_round_amber',-.33,.44,.27),e('ghost_hex_purple',-.7,.29,.34),
 e('ghost_octagon_green',-1.4,.36,.25),e('ring_rainbow',-1.0,.52,.15),
 e('lens_dirt_smudges',1,1.5,.15,visible=False,blend='lens_dirt_modulation')]),
'flashlight_white':dict(title='Flashlight White',category='Special',source_uv=(.56,.44),elements=[
 e('glow_white',1,.81,.9),e('glint_white_hotspot',1,.29,.82),
 e('starburst_12_white',1,.6,.56),e('ring_blue_thin',-.3,.47,.15),
 e('ghost_round_amber',-.85,.2,.15)]),
'concert_cyan':dict(title='Concert Cyan',category='Special',source_uv=(.4,.27),elements=[
 e('glow_blue',1,.95,.82),e('glint_blue_cross',1,.6,.82),
 e('diffraction_cool_12',1,1.0,.65),e('streak_cyan_double',1,2.4,.75),
 e('ghost_hex_blue',-.52,.27,.33),e('ring_blue_thin',-1.4,.7,.28)]),
}

def make_preset(name,data):
    return dict(schema='reccut.lensflare.preset.v1',id=name,title=data['title'],category=data['category'],
    optical_center_uv=[.5,.5],light_source_uv=list(data['source_uv']),
    flare_spread=1.0,global_intensity=1.0,global_scale=1.0,
    global_tint_linear=[1,1,1],global_opacity=1.0,
    coordinate_space='UV [0..1] frame coordinates; offscreen source can exceed',
    width_definition='display_width_as_fraction_of_video_height = sprite_width_px/video_height_px; preserve original image aspect ratio',
    animation={'enabled':False,'keyframes':[]},elements=data['elements'])

def srgb_to_linear(c):
    return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def linear_to_srgb(c):
    return np.where(c<=.0031308,12.92*c,1.055*np.maximum(c,0)**(1/2.4)-.055)

def render(preset,width=1920,height=1080):
    out=np.zeros((height,width,3),dtype=np.float32)
    cx,cy=preset['optical_center_uv']; sx,sy=preset['light_source_uv']
    cache={}
    for e0 in preset['elements']:
        if not e0.get('visible',True) or e0['blend_mode']=='lens_dirt_modulation':continue
        asset=e0['asset_id']
        if asset not in cache:
            matches=list((ROOT/'assets').glob(f'*/{asset}.png'))
            if not matches: raise FileNotFoundError(asset)
            cache[asset]=Image.open(matches[0]).convert('RGBA')
        img=cache[asset]
        targetw=max(2,int(e0['display_width_as_fraction_of_video_height']*height))
        targeth=max(2,int(targetw*img.height/img.width))
        sprite=img.resize((targetw,targeth),resample=Image.Resampling.BILINEAR)
        if e0.get('rotation_degrees',0):sprite=sprite.rotate(e0['rotation_degrees'],expand=True,resample=Image.Resampling.BICUBIC)
        d0=e0['distance']; spread=preset.get('flare_spread',1)
        # Pin d=1 to light source and d=0 to optical center. Only expand outer ghosts.
        d=(d0*spread if d0<0 else 1+(d0-1)*spread if d0>1 else d0)
        u=cx+(sx-cx)*d+e0['offset_uv'][0]
        v=cy+(sy-cy)*d+e0['offset_uv'][1]
        xx=int(round(u*width-sprite.width/2)); yy=int(round(v*height-sprite.height/2))
        left=max(xx,0);top=max(yy,0);right=min(width,xx+sprite.width);bot=min(height,yy+sprite.height)
        if right<=left or bot<=top:continue
        ar=np.asarray(sprite.crop((left-xx,top-yy,right-xx,bot-yy)),dtype=np.float32)/255
        rgb=srgb_to_linear(ar[...,:3]); alpha=ar[...,3:4]
        out[top:bot,left:right,:]+=rgb*alpha*float(e0['intensity'])*float(e0['opacity'])*np.asarray(e0['tint_linear'],dtype=np.float32)
    # Simple soft highlight rolloff. Real RecCut renderer blends with video in scene linear HDR.
    return Image.fromarray((np.clip(linear_to_srgb(1-np.exp(-out)),0,1)*255+.5).astype(np.uint8),'RGB')

def main():
    for name,data in PRESETS.items():
        path=ROOT/'presets'/f'{name}.json'
        path.write_text(json.dumps(make_preset(name,data),ensure_ascii=False,indent=2),encoding='utf8')
    # Three full UHD previews verify that this atlas can render in a 3840x2160 viewport.
    for name in ['cinematic_warm','anamorphic_blue','prism_rainbow']:
        p=make_preset(name,PRESETS[name])
        im=render(p,3840,2160)
        im.save(ROOT/'previews'/f'{name}_4k.png',compress_level=6)
        print('Rendered 4K:',name,flush=True)
    # Contact sheet with all textures on dark, not the transparent originals.
    manifest=json.loads((ROOT/'manifest.json').read_text())
    cols=6;cellw=285;cellh=205;rows=(len(manifest['assets'])+cols-1)//cols
    sheet=Image.new('RGB',(cols*cellw,rows*cellh),(15,18,26));d=ImageDraw.Draw(sheet)
    for i,item in enumerate(manifest['assets']):
        im=Image.open(ROOT/item['file']).convert('RGBA')
        im.thumbnail((cellw-20,cellh-52),Image.Resampling.LANCZOS)
        x=(i%cols)*cellw+(cellw-im.width)//2
        y=(i//cols)*cellh+(cellh-52-im.height)//2+5
        sheet.paste(im,(x,y),im)
        label=item['id'].replace('_',' ')
        d.text(((i%cols)*cellw+13,(i//cols+1)*cellh-40),label,fill=(220,227,245))
        d.text(((i%cols)*cellw+13,(i//cols+1)*cellh-22),f"{item['pixel_width']}x{item['pixel_height']}",fill=(125,154,190))
    sheet.save(ROOT/'previews'/'asset_contact_sheet.jpg',quality=92)
    pnames=list(PRESETS)
    pw,ph=580,360
    overview=Image.new('RGB',(4*pw,2*ph),(19,22,30));do=ImageDraw.Draw(overview)
    for idx,name in enumerate(pnames):
        im=render(make_preset(name,PRESETS[name]),560,315)
        x=(idx%4)*pw+10;y=(idx//4)*ph+6
        overview.paste(im,(x,y))
        do.text((x+5,y+322),PRESETS[name]['title'],fill=(238,244,250))
    overview.save(ROOT/'previews'/'presets_overview.jpg',quality=94)
    print('Presets:',len(PRESETS))
if __name__=='__main__':main()
