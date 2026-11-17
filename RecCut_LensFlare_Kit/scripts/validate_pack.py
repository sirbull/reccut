#!/usr/bin/env python3
"""Verify actual PNG transparency, safe edges, dimensions and preset references."""
import json
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
m=json.loads((ROOT/'manifest.json').read_text())
assets={a['id']:a for a in m['assets']}
assert len(assets)==36, f'Expected 36 assets, found {len(assets)}'
all_good=True
for a in m['assets']:
    f=ROOT/a['file']
    assert f.exists(), f'Missing asset: {f}'
    im=Image.open(f)
    assert im.mode=='RGBA',f'Not RGBA: {f}'
    assert im.size==(a['pixel_width'],a['pixel_height']),f'Dimension mismatch: {f}'
    alpha=np.asarray(im.getchannel('A'),dtype=np.uint8)
    assert 0<int(alpha.max())<=255, f'Invisible asset: {f}'
    assert alpha.min()==0, f'No fully transparent pixels: {f}'
    edge=int(max(alpha[0,:].max(),alpha[-1,:].max(),alpha[:,0].max(),alpha[:,-1].max()))
    assert edge==0,f'Clipped nontransparent edge: {f}; alpha={edge}'
    assert alpha.max()==a['alpha_max'],f'Alpha max mismatch: {f}'
presets=list((ROOT/'presets').glob('*.json'))
assert len(presets)==8,f'Expected 8 presets, found {len(presets)}'
for f in presets:
    p=json.loads(f.read_text())
    assert p['schema']=='reccut.lensflare.preset.v1'
    ids=[e['id'] for e in p['elements']]
    assert len(ids)==len(set(ids)),f'Duplicate element id in {f.name}'
    for e in p['elements']:
        assert e['asset_id'] in assets,f"Unknown asset {e['asset_id']} in {f.name}"
        assert isinstance(e['distance'],(float,int))
for name in ('cinematic_warm_4k.png','anamorphic_blue_4k.png','prism_rainbow_4k.png'):
    f=ROOT/'previews'/name
    assert f.exists() and Image.open(f).size==(3840,2160),f'Missing/not 4K: {name}'
print(f'PASS: {len(assets)} RGBA assets; zero-alpha outer borders; {len(presets)} valid editable presets; 3 genuine 3840x2160 preview images.')
