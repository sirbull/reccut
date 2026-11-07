# CorridorKey for Reccut. Reccut copies this script into the add-on folder and runs it with the
# add-on's own Python. CorridorKey (Corridor Digital, CorridorKey Licence) is downloaded from its
# official source when the user installs the add-on; it is not part of Reccut.
#
# One clip in, one ProRes 4444 .mov with alpha out, same frame rate and length, audio copied.
# Progress goes to stdout as "PROGRESS <done> <total>".
import argparse
import os
import re
import subprocess
import sys

import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--root', required=True, help='CorridorKey folder')
p.add_argument('--weights', required=True, help='Folder with the checked model files')
p.add_argument('--size', type=int, choices=[1024, 2048], default=2048, help='Model resolution. 2048 is what it was trained on.')
p.add_argument('--ffmpeg', required=True)
p.add_argument('--input', required=True)
p.add_argument('--output', required=True)
p.add_argument('--screen', choices=['auto', 'green', 'blue'], default='auto')
p.add_argument('--despill', type=float, default=1.0)
p.add_argument('--hint-erode', type=float, default=1.0, help='Shrink the rough key by this % of the frame height')
p.add_argument('--despeckle', type=int, default=400)
p.add_argument('--hint-out', help='Also write the alpha hint as a video (for testing)')
a = p.parse_args()

sys.path.insert(0, a.root)
import cv2  # noqa: E402

# What FFmpeg will send: size and rate after rotation, from its own output header.
probe = subprocess.run([a.ffmpeg, '-hide_banner', '-i', a.input, '-map', '0:v:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'],
                       capture_output=True)
log = probe.stderr.decode('utf8', 'replace')
out_stream = log.split('Output #0', 1)[-1]
size = re.search(r'rgb48le.*?(\d{2,5})x(\d{2,5})', out_stream)
rate = re.search(r'(\d+(?:\.\d+)?) fps', log) or re.search(r'(\d+(?:\.\d+)?) tbr', log)
if probe.returncode or not size or not rate:
    sys.exit(f'Could not read the video: {log[-800:]}')
w, h = int(size[1]), int(size[2])
fps = rate[1]
dur = re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', log)
total = round((int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])) * float(fps)) if dur else 0

decode = subprocess.Popen([a.ffmpeg, '-v', 'error', '-i', a.input, '-map', '0:v:0', '-fps_mode', 'cfr', '-r', fps,
                           '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'], stdout=subprocess.PIPE)
frame_bytes = w * h * 3 * 2


def read_frame():
    buf = decode.stdout.read(frame_bytes)
    if len(buf) < frame_bytes:
        return None
    return np.frombuffer(buf, np.uint16).reshape(h, w, 3).astype(np.float32) / 65535.0


first = read_frame()
if first is None:
    sys.exit('The video has no frames.')

screen = a.screen
if screen == 'auto':  # The edges of the frame are almost always screen.
    edge = np.concatenate([first[:h // 20].reshape(-1, 3), first[-h // 20:].reshape(-1, 3), first[:, :w // 20].reshape(-1, 3), first[:, -w // 20:].reshape(-1, 3)])
    r, g, b = np.median(edge, axis=0)
    screen = 'blue' if b > g else 'green'
ch = 2 if screen == 'blue' else 1
others = [0, 2] if ch == 1 else [0, 1]
erode_px = max(1, round(h * a.hint_erode / 100))
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * erode_px + 1, 2 * erode_px + 1))
blur = (erode_px * 4) | 1


# ponytail: plain difference key as the hint. CorridorKey was trained on coarse, eroded, blurry
# masks, so this is enough for even screens; an AI matte (BiRefNet) is the upgrade for messy ones.
def hint(img):
    spill = img[..., ch] - np.maximum(img[..., others[0]], img[..., others[1]])
    fg = np.clip(1.0 - (spill - 0.05) / 0.10, 0.0, 1.0)
    fg = cv2.erode(fg, kernel)
    return cv2.GaussianBlur(fg, (blur, blur), 0)


import torch  # noqa: E402
from CorridorKeyModule.core import color_utils as cu  # noqa: E402
from CorridorKeyModule.inference_engine import CorridorKeyEngine  # noqa: E402

# The Torch engine on the whole frame everywhere. MLX tiles lose context and tint some tiles.
# The checkpoint is passed directly, so CorridorKey never downloads anything by itself.
ckpt = os.path.join(a.weights, 'CorridorKeyBlue_1.0.safetensors' if screen == 'blue' else 'CorridorKey_v1.0.safetensors')
if not os.path.exists(ckpt):
    sys.exit(f'The {screen} screen model is not installed.')
device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
engine = CorridorKeyEngine(checkpoint_path=ckpt, device=device, img_size=a.size, model_precision=torch.float32 if device == 'cpu' else torch.float16)
print(f'DEVICE {device} {a.size} {screen}', flush=True)

encode = subprocess.Popen([a.ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                           '-i', a.input, '-map', '0:v', '-map', '1:a?', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
                           '-alpha_bits', '16', '-c:a', 'pcm_s16le', '-shortest', a.output], stdin=subprocess.PIPE)
hint_enc = a.hint_out and subprocess.Popen([a.ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', a.hint_out], stdin=subprocess.PIPE)

done = 0
img = first
while img is not None:
    mask = hint(img)
    res = engine.process_frame(img, mask, despill_strength=a.despill, auto_despeckle=a.despeckle > 0,
                               despeckle_size=max(a.despeckle, 1), screen_channel=ch)
    rgba = res['processed']
    alpha = rgba[..., 3:4]
    rgb = cu.linear_to_srgb(np.where(alpha > 1e-4, rgba[..., :3] / np.maximum(alpha, 1e-4), 0.0))
    out = np.concatenate([rgb, alpha], axis=-1)
    encode.stdin.write((np.clip(out, 0, 1) * 65535 + 0.5).astype('<u2').tobytes())
    if hint_enc:
        hint_enc.stdin.write((mask * 255).astype(np.uint8).tobytes())
    done += 1
    print(f'PROGRESS {done} {max(total, done)}', flush=True)
    img = read_frame()

for proc in [encode, hint_enc]:
    if proc:
        proc.stdin.close()
        proc.wait()
decode.wait()
if encode.returncode:
    sys.exit('FFmpeg could not write the result.')
