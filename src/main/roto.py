# Roto Brush for Reccut. Reccut copies this script into the add-on folder and runs it with the
# add-on's own Python. SAM 2.1 (Meta, Apache 2.0) is installed from its official source when the
# user installs the add-on; it is not part of Reccut.
#
# One session per clip. Commands come as JSON lines on stdin, answers go to stdout:
#   {"id": 1, "cmd": "open", ...}  ->  {"reply": 1, ...} or {"reply": 1, "error": "..."}
#   progress while working          ->  {"progress": 0.4, "stage": "Tracking"}
# Frames are numbered from the start of the range. Points are 0..1 of the frame.
import base64
import json
import os
import queue
import re
import subprocess
import sys
import threading
from collections import OrderedDict

import cv2
import numpy as np

out_lock = threading.Lock()


def send(obj):
    with out_lock:
        sys.stdout.write(json.dumps(obj) + '\n')
        sys.stdout.flush()


def progress(p, stage):
    send({'progress': round(min(1, max(0, p)), 4), 'stage': stage})


class Canceled(Exception):
    pass


cancel = threading.Event()
commands = queue.Queue()


def read_stdin():
    for line in sys.stdin:
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if msg.get('cmd') == 'cancel':
            cancel.set()
        else:
            commands.put(msg)
    commands.put(None)  # Reccut closed the pipe.


MODELS = {'small': ('sam2.1_hiera_small.pt', 'configs/sam2.1/sam2.1_hiera_s.yaml'),
          'base': ('sam2.1_hiera_base_plus.pt', 'configs/sam2.1/sam2.1_hiera_b+.yaml'),
          'large': ('sam2.1_hiera_large.pt', 'configs/sam2.1/sam2.1_hiera_l.yaml')}
WORK_SIDE = 1280  # Frames SAM sees and the preview shows. SAM itself works at 1024.

S = {}  # The open session.


class LazyFrames:
    """SAM's frame list, read from disk when needed. SAM 2 normally keeps every frame in memory,
    about 12 MB each, which runs out quickly on long clips."""

    def __init__(self, folder, count, size, device):
        self.folder, self.count, self.size, self.device = folder, count, size, device
        self.cache = OrderedDict()
        self.mean = np.array([0.485, 0.456, 0.406], np.float32)
        self.std = np.array([0.229, 0.224, 0.225], np.float32)

    def __len__(self):
        return self.count

    def __getitem__(self, i):
        import torch
        if i in self.cache:
            self.cache.move_to_end(i)
            return self.cache[i]
        img = cv2.imread(frame_path(i))[:, :, ::-1]
        img = cv2.resize(img, (self.size, self.size), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        t = torch.from_numpy(((img - self.mean) / self.std).transpose(2, 0, 1).copy())
        self.cache[i] = t
        if len(self.cache) > 24:  # ponytail: small LRU, SAM reads frames in order.
            self.cache.popitem(last=False)
        return t


def frame_path(i):
    return os.path.join(S['work'], 'frames', f'{i:06d}.jpg')


def mask_path(i):
    return os.path.join(S['work'], 'masks', f'{i:06d}.png')


def run_ffmpeg(args, total, stage, base=0, span=1):
    """Runs FFmpeg with -progress on stdout and reports frames done."""
    p = subprocess.Popen([S['ffmpeg'], '-hide_banner', '-v', 'error', '-nostdin', '-progress', 'pipe:1', *args],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in p.stdout:
        if cancel.is_set():
            p.kill()
            raise Canceled()
        if line.startswith('frame='):
            progress(base + span * int(line[6:] or 0) / max(1, total), stage)
    err = p.stderr.read()
    if p.wait():
        raise RuntimeError(f'FFmpeg failed: {err[-600:]}')


def cmd_open(m):
    import torch
    from hydra import initialize_config_module
    from hydra.core.global_hydra import GlobalHydra
    import sam2.sam2_video_predictor as svp
    from sam2.build_sam import build_sam2_video_predictor

    S.clear()
    S.update(ffmpeg=m['ffmpeg'], work=m['work'], input=m['input'], fps=float(m['fps']))
    S['first'] = int(m['first'])
    count = int(m['count'])
    for sub in ('frames', 'masks'):
        os.makedirs(os.path.join(S['work'], sub), exist_ok=True)
    # The same decode as the final render (fps filter, frame numbers), so frame i is always the same picture.
    existing = len(os.listdir(os.path.join(S['work'], 'frames')))
    if existing < count:
        run_ffmpeg(['-i', S['input'], '-map', '0:v:0',
                    '-vf', f"fps={m['fps']},trim=start_frame={S['first']}:end_frame={S['first'] + count},"
                           f"scale='min({WORK_SIDE},iw)':'min({WORK_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
                    '-start_number', '0', '-q:v', '2', '-y', os.path.join(S['work'], 'frames', '%06d.jpg')],
                   count, 'Reading frames', 0, 0.8)
    count = len([f for f in os.listdir(os.path.join(S['work'], 'frames')) if f.endswith('.jpg')])
    if not count:
        raise RuntimeError('The video has no frames in this range.')
    h, w = cv2.imread(frame_path(0)).shape[:2]
    S.update(count=count, w=w, h=h, points={})
    progress(0.85, 'Loading SAM 2.1')
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu')
    if device.type == 'mps':
        half_attention()
    ckpt, config = MODELS[m.get('model', 'large')]
    if not GlobalHydra.instance().is_initialized():
        initialize_config_module('sam2', version_base='1.2')
    predictor = build_sam2_video_predictor(config, os.path.join(m['models'], ckpt), device=device)

    def load(video_path, image_size, offload_video_to_cpu, compute_device=None, **_):
        return LazyFrames(video_path, count, image_size, compute_device), h, w

    svp.load_video_frames = load
    with torch.inference_mode():
        state = predictor.init_state(video_path=os.path.join(S['work'], 'frames'), offload_video_to_cpu=True, offload_state_to_cpu=device.type == 'cuda')
    S.update(predictor=predictor, state=state, device=device.type)
    # Clicks and masks from an earlier session for the same range are still on disk.
    try:
        with open(points_file()) as f:
            saved = {int(k): v for k, v in json.load(f).items()}
    except (OSError, ValueError):
        saved = {}
    with torch.inference_mode():
        for i, pts in saved.items():
            if 0 <= i < count:
                add_points(i, pts)
    tracked = sum(os.path.exists(mask_path(i)) for i in range(count))
    return {'count': count, 'width': w, 'height': h, 'device': device.type, 'tracked': tracked, 'keys': sorted(S['points'])}


def half_attention():
    """Apple GPUs: the large memory attention in half precision. Measured on an M1 Pro: tracking
    0.68 instead of 1.12 s per frame (small model), with identical masks. Other attention stays float32."""
    import torch
    F = torch.nn.functional
    full = F.scaled_dot_product_attention

    def sdpa(q, k, v, *args, **kwargs):
        if q.dtype == torch.float32 and q.shape[-2] * k.shape[-2] > 1 << 22:
            return full(q.half(), k.half(), v.half(), *args, **kwargs).float()
        return full(q, k, v, *args, **kwargs)

    F.scaled_dot_product_attention = sdpa


def points_file():
    return os.path.join(S['work'], 'points.json')


def add_points(i, pts):
    xy = np.array([[p[0] * S['w'], p[1] * S['h']] for p in pts], np.float32)
    labels = np.array([1 if p[2] else 0 for p in pts], np.int32)
    _, _, logits = S['predictor'].add_new_points_or_box(S['state'], frame_idx=i, obj_id=1, points=xy, labels=labels, clear_old_points=True)
    S['points'][i] = pts
    return logits


def encode(img, ext, quality=90):
    ok, buf = cv2.imencode(ext, img, [cv2.IMWRITE_JPEG_QUALITY, quality] if ext == '.jpg' else [])
    return f"data:image/{'jpeg' if ext == '.jpg' else 'png'};base64,{base64.b64encode(buf).decode()}"


def save_mask(i, logits):
    # Soft edges: SAM's logits as a probability, not just in or out.
    prob = 1 / (1 + np.exp(-np.clip(logits, -20, 20)))
    cv2.imwrite(mask_path(i), (prob * 255).astype(np.uint8))


def cmd_frame(m):
    i = int(m['index'])
    with open(frame_path(i), 'rb') as f:
        image = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()
    mask = cv2.imread(mask_path(i), cv2.IMREAD_GRAYSCALE) if os.path.exists(mask_path(i)) else None
    return {'index': i, 'image': image, 'mask': encode(mask, '.png') if mask is not None else None, 'points': S['points'].get(i, [])}


def cmd_points(m):
    import torch
    i = int(m['index'])
    pts = [p for p in m.get('points', []) if 0 <= p[0] <= 1 and 0 <= p[1] <= 1][:64]
    pred, state = S['predictor'], S['state']
    with torch.inference_mode():
        if not pts:
            S['points'].pop(i, None)
            if os.path.exists(mask_path(i)):
                os.remove(mask_path(i))
            if 1 in state['obj_id_to_idx']:
                pred.clear_all_prompts_in_frame(state, i, 1)
            mask = None
        else:
            save_mask(i, add_points(i, pts)[0, 0].float().cpu().numpy())
            mask = encode(cv2.imread(mask_path(i), cv2.IMREAD_GRAYSCALE), '.png')
    with open(points_file(), 'w') as f:
        json.dump(S['points'], f)
    return {'index': i, 'mask': mask, 'points': pts, 'keys': sorted(S['points'])}


def cmd_track(m):
    import torch
    if not S['points']:
        raise RuntimeError('Click on the subject first.')
    pred, state, n = S['predictor'], S['state'], S['count']
    keys = sorted(S['points'])
    # Forward from the first marked frame to the end, then backward from the last one to the start.
    # Between marked frames the backward pass runs last, so each frame follows its nearest correction.
    passes = [(False, n - keys[0]), (True, keys[-1] + 1)]
    total, done = sum(c for _, c in passes), 0
    with torch.inference_mode():
        for reverse, _ in passes:
            for i, _, logits in pred.propagate_in_video(state, reverse=reverse):
                if cancel.is_set():
                    raise Canceled()
                save_mask(i, logits[0, 0].float().cpu().numpy())
                done += 1
                progress(done / total, 'Tracking')
    return {'tracked': n}


def guided(guide, src, r, eps):
    """He et al.'s guided filter: pulls the mask edge to the edges in the picture."""
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mi, mp = box(guide), box(src)
    a = (box(guide * src) - mi * mp) / (box(guide * guide) - mi * mi + eps)
    b = mp - a * mi
    return box(a) * guide + box(b)


def matte(prob, rgb, grow, feather, refine):
    """prob and rgb at the same size; grow and feather in pixels of that size."""
    if grow:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * abs(grow) + 1,) * 2)
        prob = cv2.dilate(prob, k) if grow > 0 else cv2.erode(prob, k)
    if refine:
        g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        r = max(2, round(max(prob.shape) / 320))
        # Only the edge band changes, so a solid inside stays solid.
        band = cv2.dilate((prob > 0.02).astype(np.uint8), None, iterations=r) & cv2.dilate((prob < 0.98).astype(np.uint8), None, iterations=r)
        prob = np.where(band > 0, guided(g, prob, r, 1e-4), prob)
    if feather > 0:
        prob = cv2.GaussianBlur(prob, (0, 0), feather)
    return np.clip(prob, 0, 1)


def cmd_preview(m):
    i = int(m['index'])
    if not os.path.exists(mask_path(i)):
        return {'index': i, 'mask': None}
    rgb = cv2.imread(frame_path(i))[:, :, ::-1]
    prob = cv2.imread(mask_path(i), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    scale = S['w'] / max(1, float(m.get('sourceWidth') or S['w']))  # Settings are in source pixels.
    a = matte(prob, rgb, round(float(m.get('grow', 0)) * scale), float(m.get('feather', 0)) * scale, bool(m.get('refine', True)))
    return {'index': i, 'mask': encode((a * 255).astype(np.uint8), '.png')}


def cmd_render(m):
    """The whole source with the matte as alpha, as ProRes 4444. Outside the range the picture is unchanged."""
    fps = m['fps']
    total = max(1, int(m['frames']))
    first, n = S['first'], S['count']
    # The size FFmpeg delivers after rotation, from its own output header (as in corridorkey.py).
    probe = subprocess.run([S['ffmpeg'], '-hide_banner', '-nostdin', '-i', S['input'], '-map', '0:v:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'],
                           capture_output=True)
    size_ = re.search(r'rgb48le.*?(\d{2,5})x(\d{2,5})', probe.stderr.decode('utf8', 'replace').split('Output #0', 1)[-1])
    if not size_:
        raise RuntimeError('Could not read the video size.')
    w, h = int(size_[1]), int(size_[2])
    # 16 bits per channel, so 10-bit sources keep their gradients.
    decode = subprocess.Popen([S['ffmpeg'], '-v', 'error', '-nostdin', '-i', S['input'], '-map', '0:v:0',
                               '-vf', f'fps={fps}', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    encode_ = subprocess.Popen([S['ffmpeg'], '-v', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-s', f'{w}x{h}', '-r', str(fps),
                                '-i', '-', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', m['output']],
                               stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    size = w * h * 6
    scale = w / float(m.get('sourceWidth') or w)  # Settings are in source pixels.
    grow, feather, refine = round(float(m.get('grow', 0)) * scale), float(m.get('feather', 0)) * scale, bool(m.get('refine', True))
    k = 0
    try:
        while True:
            buf = decode.stdout.read(size)
            if len(buf) < size:
                break
            if cancel.is_set():
                raise Canceled()
            rgb = np.frombuffer(buf, np.uint16).reshape(h, w, 3)
            i = k - first
            if 0 <= i < n:
                if os.path.exists(mask_path(i)):
                    prob = cv2.imread(mask_path(i), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
                    a = matte(cv2.resize(prob, (w, h), interpolation=cv2.INTER_LINEAR), (rgb >> 8).astype(np.uint8), grow, feather, refine)
                else:
                    a = np.zeros((h, w), np.float32)
                alpha = (a * 65535 + 0.5).astype(np.uint16)
            else:
                alpha = np.full((h, w), 65535, np.uint16)
            encode_.stdin.write(np.dstack([rgb, alpha]).tobytes())
            k += 1
            if k % 5 == 0:
                progress(k / total, 'Rendering')
    finally:
        decode.kill()
        try:
            encode_.stdin.close()
        except OSError:
            pass
    err = encode_.stderr.read().decode('utf8', 'replace')
    if encode_.wait() or not k:
        raise RuntimeError(f'Encoding failed: {err[-600:]}')
    return {'output': m['output'], 'frames': k}


HANDLERS = {'open': cmd_open, 'frame': cmd_frame, 'points': cmd_points, 'track': cmd_track, 'preview': cmd_preview, 'render': cmd_render}

if __name__ == '__main__':
    if '--check' in sys.argv:  # The installer's test: everything imports.
        import torch  # noqa: F401
        import sam2  # noqa: F401
        print('ok')
        sys.exit(0)
    threading.Thread(target=read_stdin, daemon=True).start()
    send({'ready': True})
    while (msg := commands.get()) is not None:
        cancel.clear()
        try:
            handler = HANDLERS.get(msg.get('cmd'))
            if not handler:
                raise RuntimeError(f"Unknown command {msg.get('cmd')}")
            if msg['cmd'] != 'open' and 'state' not in S:
                raise RuntimeError('No clip is open.')
            send({'reply': msg.get('id'), **handler(msg)})
        except Canceled:
            send({'reply': msg.get('id'), 'error': 'Canceled'})
        except Exception as e:  # noqa: BLE001
            send({'reply': msg.get('id'), 'error': str(e)[:2000]})
