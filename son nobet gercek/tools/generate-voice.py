import io
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path


CLIPS = {
    'quarantine': 'Karantina sürüyor. Personel, lütfen koridorları boşaltın.',
    'reserve': 'Yedek güç etkin. Laboratuvar erişimi, kart onayına tabidir.',
    'clinical': 'Klinik kayıt. Bazı hastalar anonslardan kelimeler tekrarlıyor. Işığa düşük, metalik seslere belirgin tepki veriyorlar. Protokol durduruldu.',
    'transfer': 'Nakil tutanağı. Kuzgun yedi uçuş modülü, su hasarı incelemesi için bodrum test odasına alındı. Giriş için laboratuvar kartı ve yedek güç gerekir.',
    'rescue': 'Acil yayın alındı. Kuzgun Adası kayıtlarının bir kopyası ana karaya ulaştı.',
}


def radio(phrase):
    raw = subprocess.check_output(['espeak-ng', '-v', 'tr', '-s', '142', '-p', '39', '-a', '140', '--stdout', phrase])
    with wave.open(io.BytesIO(raw)) as wav:
        rate = wav.getframerate()
        pcm = [sample[0] for sample in struct.iter_unpack('<h', wav.readframes(wav.getnframes()))]
    rng, last, low, pre = random.Random(710), 0, 0, 0
    out = []
    cushion = int(rate * .19)
    samples = [0] * cushion + pcm + [0] * (cushion + int(rate * .17))
    delay = int(rate * .086)
    for i, x in enumerate(samples):
        pre += (x - pre) * .064
        low += (x - pre - low) * .48
        h = low * .69 + last * .18
        last = low
        h += (rng.random() - .5) * (410 if i < cushion or i > len(samples) - cushion else 85)
        if i < cushion:
            h += math.sin(i * math.tau * 591 / rate) * 380 * (1 - i / cushion)
        if i > delay:
            h += out[i - delay] * .17
        out.append(int(16100 * math.tanh(h / 16100)))
    return rate, struct.pack(f'<{len(out)}h', *out)


if __name__ == '__main__':
    target = Path(__file__).resolve().parents[1] / 'public' / 'audio'
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        for key, phrase in CLIPS.items():
            rate, pcm = radio(phrase)
            source = Path(directory) / f'{key}.wav'
            with wave.open(str(source), 'wb') as wav:
                wav.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
                wav.writeframes(pcm)
            subprocess.run(['lame', '--silent', '-m', 'm', '-b', '48', str(source), str(target / f'{key}.mp3')], check=True)