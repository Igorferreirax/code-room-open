"""Ícones do Code Room no padrão "só o nome": um quadrado escuro com as letras CR (C branco, R azul). Gera o favicon do app e da landing,
o ícone do instalador/atalhos (.ico) e o selo pequeno do assistente de instalação. Uso: python installer/make-brand-icons.py"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
BG, LINE, ACC, TXT = (11, 21, 39), (29, 48, 85), (74, 143, 255), (232, 238, 252)
FONT = 'C:/Windows/Fonts/segoeuib.ttf'

def icon(size):
    s = size * 4; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    r = int(s * 0.22); d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG + (255,), outline=LINE + (255,), width=max(2, s // 40))
    f = ImageFont.truetype(FONT, int(s * 0.54)); wc, wr = d.textlength('C', font=f), d.textlength('R', font=f); gap = s * 0.01; x = (s - (wc + wr + gap)) / 2
    y = s * 0.5 - (f.getbbox('CR')[3] + f.getbbox('CR')[1]) / 2
    d.text((x, y), 'C', font=f, fill=TXT); d.text((x + wc + gap, y), 'R', font=f, fill=ACC)
    return im.resize((size, size), Image.LANCZOS)

big = icon(256)
big.save(os.path.join(HERE, 'code-room.png'))
big.save(os.path.join(HERE, 'code-room.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon(64).save(os.path.join(ROOT, 'public', 'assets', 'favicon.png'))
land = os.path.normpath(os.path.join(ROOT, '..', 'Code Room Landing', 'assets', 'marca'))
if os.path.isdir(land): icon(64).save(os.path.join(land, 'favicon.png'))
wiz = os.path.join(HERE, 'wizard')
for s in (55, 64, 110):
    base = Image.new('RGB', (s, s), BG); ic = icon(s).convert('RGBA'); base.paste(ic, (0, 0), ic); base.save(os.path.join(wiz, f'selo-{s}.bmp'))
print('ícones gerados')
