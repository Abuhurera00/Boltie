# Original 120 BPM track for the Boltie launch film, synthesized from scratch.
# 12 bars x 2 s = 24 s. Key: F minor. Progression per bar: Fm Db Ab Eb.
# Sections: bar0 intro, bar1 drop/logo, bars2-7 groove, bar8 half-time break,
# bar9 build (snare roll), bar10 full drop, bar11 end hit + tail.
import numpy as np, json, sys
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = 24.0
N = int(SR * (DUR + 0.0))
rng = np.random.default_rng(7)

def buf(): return np.zeros(N)
def t_(n): return np.arange(n) / SR
def midi(m): return 440 * 2 ** ((m - 69) / 12)
def put(dst, sig, at, gain=1.0):
    i = int(round(at * SR))
    if i >= N: return
    j = min(N, i + len(sig))
    if i < 0:
        sig = sig[-i:]; i = 0
    dst[i:j] += sig[: j - i] * gain
def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)
def env(n, a, d, s=0.0, r=0.0, sus=None):
    t = t_(n); e = np.ones(n)
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) / max(d, 1e-6)) * (1 - s) + s)
    return e

# ---------- instruments ----------
def kick(big=False):
    n = int(SR * (0.9 if big else 0.45)); t = t_(n)
    f = 45 + 140 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (3.2 if big else 7.5))
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.35
    return np.tanh((s + lp(click, 6000)) * 1.6)

def snare():
    n = int(SR * 0.32); t = t_(n)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    nz = hp(rng.standard_normal(n), 1500) * np.exp(-t * 16)
    return (body + nz * 0.7) * 0.9

def clap():
    n = int(SR * 0.3); t = t_(n); s = np.zeros(n)
    for k, off in enumerate([0, 0.008, 0.017, 0.026]):
        i = int(off * SR)
        nz = rng.standard_normal(n - i) * np.exp(-t_(n - i) * (60 if k < 3 else 14))
        s[i:] += nz
    return hp(lp(s, 7000), 900) * 0.6

def hat(open_=False):
    n = int(SR * (0.22 if open_ else 0.05)); t = t_(n)
    s = hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 90))
    return s * 0.35

def saw(f, n, detune=0.0, voices=1):
    t = t_(n); out = np.zeros(n)
    for v in range(voices):
        d = (v - (voices - 1) / 2) * detune
        ff = f * 2 ** (d / 1200)
        ph = (t * ff + rng.random()) % 1.0
        out += 2 * ph - 1
    return out / voices

def bass_note(m, dur):
    n = int(SR * dur); t = t_(n)
    f = midi(m)
    sub = np.sin(2 * np.pi * f * t)
    grit = lp(saw(f, n, 8, 2), 900)
    e = np.minimum(1, t / 0.004) * np.exp(-t * 1.2)
    rel = np.clip((dur - t) / 0.03, 0, 1)
    return np.tanh((sub * 0.9 + grit * 0.45) * 1.4) * e * rel

def pluck(m, dur=0.35, bright=3500):
    n = int(SR * dur); t = t_(n)
    s = saw(midi(m), n, 14, 3)
    s = lp(s, bright)
    return s * np.minimum(1, t / 0.003) * np.exp(-t * 9)

def bell(m, dur=0.6):
    n = int(SR * dur); t = t_(n); f = midi(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * f * t + mod)
    return s * np.minimum(1, t / 0.002) * np.exp(-t * 5)

def pad(ms, dur, cutoff=1800):
    n = int(SR * dur); t = t_(n); s = np.zeros(n)
    for m in ms:
        s += saw(midi(m), n, 18, 5)
    s = lp(s / len(ms), cutoff, 2)
    a = np.minimum(1, t / 0.25); r = np.clip((dur - t) / 0.3, 0, 1)
    return s * a * r

def riser(dur):
    n = int(SR * dur); t = t_(n)
    nz = rng.standard_normal(n)
    out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):
        p = i / n
        fc = 300 + 9000 * p ** 2
        out[i:i + seg] = hp(lp(nz[i:i + seg], fc), 150)
    return out * (t / dur) ** 2

def impact():
    n = int(SR * 2.5); t = t_(n)
    boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t * 12)) * t) * np.exp(-t * 1.6)
    crash = hp(rng.standard_normal(n), 4000) * np.exp(-t * 2.2) * 0.35
    return boom * 0.9 + crash

# ---------- arrangement ----------
CHORDS = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]]  # Fm Db Ab Eb (around F3)
ROOTS = [29, 25, 32, 27]  # F1 Db1 Ab1 Eb1
drums = buf(); bass = buf(); synth = buf(); lead = buf(); fx = buf(); padb = buf()
kicks = []

def bar_t(b, beat=0.0): return b * BAR + beat * BEAT

for b in range(12):
    ch = CHORDS[b % 4]; root = ROOTS[b % 4]
    if b == 0:
        put(padb, pad([c + 12 for c in CHORDS[0]], BAR, 900), 0, 0.5)
        put(fx, riser(BAR), 0, 0.6)
        for i in range(8):  # ticking bell intro, quiet
            put(lead, bell(ch[i % 3] + 24, 0.4), bar_t(0, i * 0.5), 0.12 + 0.02 * i)
        continue
    if b == 11:
        put(drums, kick(big=True), bar_t(11), 1.0); kicks.append(bar_t(11))
        put(fx, impact(), bar_t(11), 0.9)
        put(padb, pad([53, 56, 60, 65], BAR, 2200), bar_t(11), 0.6)
        put(bass, bass_note(29, 1.8), bar_t(11), 0.9)
        for i, m in enumerate([72, 75, 77, 80, 84]):  # closing arpeggio
            put(lead, bell(m, 1.2), bar_t(11, 1.0 + i * 0.5), 0.32)
        continue
    half = (b == 8)
    build = (b == 9)
    # kicks
    if half:
        for bt in [0, 2.5]:
            put(drums, kick(), bar_t(b, bt), 0.95); kicks.append(bar_t(b, bt))
    elif build:
        for bt in [0, 1, 2, 3]:
            put(drums, kick(), bar_t(b, bt), 0.8); kicks.append(bar_t(b, bt))
    else:
        big = b in (1, 10)
        for bt in range(4):
            put(drums, kick(big and bt == 0), bar_t(b, bt), 1.0); kicks.append(bar_t(b, bt))
    if b in (1, 10):
        put(fx, impact(), bar_t(b), 0.7)
    # snare / clap
    if half:
        put(drums, clap(), bar_t(b, 2), 0.9)
    elif build:
        steps = 32
        for i in range(steps):
            bt = i * 4 / steps
            put(drums, snare(), bar_t(b, bt), 0.25 + 0.6 * (i / steps))
        put(fx, riser(BAR), bar_t(b), 0.7)
    else:
        for bt in (1, 3):
            put(drums, snare(), bar_t(b, bt), 0.7); put(drums, clap(), bar_t(b, bt), 0.6)
    # hats
    if not build:
        for i in range(16 if not half else 8):
            st = i * (0.25 if not half else 0.5)
            put(drums, hat(open_=(not half and i % 4 == 2)), bar_t(b, st), 0.9 if i % 2 else 0.6)
    # bass: offbeat-driven pattern
    if half:
        put(bass, bass_note(root, 1.9), bar_t(b), 0.9)
        put(fx, riser(BEAT*1.5)[::-1][::-1], bar_t(b, 2.5), 0.5)
        for i in range(4):
            put(lead, bell(CHORDS[0][i%3]+24, 0.5), bar_t(b, 2+i*0.5), 0.15)
    elif build:
        for i in range(8):
            put(bass, bass_note(root + (12 if i % 2 else 0), 0.22), bar_t(b, i * 0.5), 0.6)
    else:
        pat = [(0, 0.45, 0), (0.75, 0.2, 0), (1.5, 0.45, 12), (2, 0.4, 0), (2.75, 0.2, 0), (3.25, 0.2, 12), (3.5, 0.45, 0)]
        for st, d, o in pat:
            put(bass, bass_note(root + o, d * BEAT * 2), bar_t(b, st), 0.85)
    # pluck arp 16ths
    if not half:
        seq = [0, 1, 2, 1, 0, 2, 1, 2]
        for i in range(16):
            m = ch[seq[i % 8]] + (12 if i % 4 == 3 else 0) + 12
            put(synth, pluck(m, 0.3, 2500 if b < 4 else 4200), bar_t(b, i * 0.25), 0.22 if not build else 0.12 + 0.2 * i / 16)
    else:
        put(padb, pad([c + 12 for c in ch], BAR, 700), bar_t(b), 0.55)
    # lead bell motif (bars 2-7 and 10), cute 'robot' melody
    if b in (2, 3, 4, 5, 6, 7, 10):
        motifs = [
            [(0, 72), (0.5, 75), (1.0, 77), (1.5, 75), (2.5, 72), (3.0, 70)],
            [(0, 73), (0.5, 72), (1.0, 68), (2.0, 65), (2.5, 68), (3.0, 72)],
            [(0, 72), (0.5, 75), (1.0, 80), (1.5, 79), (2.0, 75), (3.0, 77)],
            [(0, 75), (0.75, 74), (1.5, 70), (2.0, 67), (3.0, 70), (3.5, 74)],
        ]
        for st, m in motifs[b % 4]:
            put(lead, bell(m, 0.55), bar_t(b, st), 0.28)
    # pads under groove
    if b >= 1 and not half:
        put(padb, pad([c + 12 for c in ch], BAR, 1400), bar_t(b), 0.18)

# ---------- sidechain ----------
side = np.ones(N)
for k in kicks:
    i = int(k * SR); n = int(0.28 * SR); tt = t_(n)
    j = min(N, i + n)
    side[i:j] = np.minimum(side[i:j], (1 - 0.75 * np.exp(-tt * 14))[: j - i])

# ---------- SFX from Boltie's own sound set ----------
def load(name):
    sr, x = wavfile.read(f'sfx/{name}.wav')
    x = x.astype(np.float64) / 32768.0
    if x.ndim > 1: x = x.mean(1)
    idx = np.arange(0, len(x), sr / SR)
    return np.interp(idx, np.arange(len(x)), x)
sfx = buf()
events = json.load(open('sfx_events.json'))
for e in events:
    put(sfx, load(e['s']), e['t'], e.get('g', 1.0))

# ---------- reverb ----------
irn = int(SR * 1.8)
ir = rng.standard_normal(irn) * np.exp(-t_(irn) * 3.2)
ir = lp(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))
def verb(x, wet):
    return x + fftconvolve(x, ir)[:N] * wet

mix = (drums * 0.9
       + bass * side * 0.75
       + verb(synth, 0.35) * side * 0.9
       + verb(lead, 0.55) * 0.9
       + verb(padb, 0.6) * side * 0.6
       + verb(fx, 0.3) * 0.7)
mix = hp(mix, 25)
# stereo: widen synth/lead/pad with small delays
d = int(0.012 * SR)
widen = verb(synth, 0.35) * side * 0.25 + verb(lead, 0.5) * 0.2 + verb(padb, 0.6) * side * 0.2
L = mix + np.roll(widen, d) * 0.6 + sfx * 0.55
R = mix - widen * 0.4 + np.roll(widen, d * 2) * 0.4 + sfx * 0.55
st = np.stack([L, R], 1)
# master: soft clip + normalize, fade the very end
st = np.tanh(st * 0.7)
st /= np.max(np.abs(st)) / 0.93
fade = np.ones(N); fn = int(0.6 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 2
st *= fade[:, None]
wavfile.write('track.wav', SR, (st * 32767).astype(np.int16))
print('ok', st.shape[0] / SR)
