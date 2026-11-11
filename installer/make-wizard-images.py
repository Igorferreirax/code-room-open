"""Gera as imagens do assistente de instalação (mesma identidade do app): painel lateral e selo pequeno, em 3 tamanhos cada.
Uso: python installer/make-wizard-images.py   (grava em installer/wizard/*.bmp)"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'wizard'); os.makedirs(OUT, exist_ok=True)
ROOT = os.path.dirname(HERE); LOGO = Image.open(os.path.join(HERE, 'code-room.png')).convert('RGBA'); SCENE = Image.open(os.path.join(ROOT, 'public', 'assets', 'scene.jpg')).convert('RGB')
BG1, BG2, ACC, TXT, MUTED = (8, 16, 31), (14, 26, 49), (43, 123, 255), (232, 238, 252), (143, 163, 199)
FONT = lambda s, bold=True: ImageFont.truetype('C:/Windows/Fonts/' + ('consolab.ttf' if bold else 'consola.ttf'), s)

def panel(w, h):
    k = w / 164; im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h): t = y / h; d.line([(0, y), (w, y)], fill=tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3)))
    sc = SCENE.resize((int(SCENE.width * (h * .42) / SCENE.height), int(h * .42)), Image.LANCZOS); sc = sc.crop(((sc.width - w) // 2, 0, (sc.width - w) // 2 + w, sc.height)).convert('RGB')
    fade = Image.new('L', sc.size); fd = ImageDraw.Draw(fade)
    for y in range(sc.height): fd.line([(0, y), (w, y)], fill=int(255 * (y / sc.height) ** 1.6 * .75))
    base = im.crop((0, h - sc.height, w, h)); im.paste(Image.composite(sc, base, fade), (0, h - sc.height))
    d = ImageDraw.Draw(im); ls = int(96 * k); logo = LOGO.resize((ls, ls), Image.LANCZOS); im.paste(logo, ((w - ls) // 2, int(34 * k)), logo)
    f1 = FONT(int(21 * k)); y = int(144 * k)
    a, b = 'Code ', 'Room'; wa, wb = d.textlength(a, font=f1), d.textlength(b, font=f1); x = (w - wa - wb) / 2
    d.text((x, y), a, font=f1, fill=TXT); d.text((x + wa, y), b, font=f1, fill=ACC)
    f2 = FONT(int(9.5 * k), False); t = 'sua sala de IAs'; d.text(((w - d.textlength(t, font=f2)) / 2, y + int(30 * k)), t, font=f2, fill=MUTED)
    d.rectangle([int(30 * k), y + int(54 * k), w - int(30 * k), y + int(54 * k) + max(1, int(2 * k))], fill=ACC)
    return im

def small(s):
    im = Image.new('RGB', (s, s), BG1); lg = LOGO.resize((s, s), Image.LANCZOS); im.paste(lg, (0, 0), lg); return im

for w, h in ((164, 314), (246, 459), (328, 628)): panel(w, h).save(os.path.join(OUT, f'lateral-{w}.bmp'))
for s in (55, 64, 110): small(s).save(os.path.join(OUT, f'selo-{s}.bmp'))
print('imagens gravadas em', OUT)
