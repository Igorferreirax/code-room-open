"""Ícones do Code Room (marca 0.3.4: o personagem pixel com notebook). A fonte é public/assets/icon-512.png, recortada da
logo oficial; daqui saem o favicon do app e da landing, o ícone do instalador e dos atalhos (.ico) e os tamanhos do app.
As imagens do assistente de instalação saem de installer/make-wizard-images.py. Uso: python installer/make-brand-icons.py"""
import os, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); A = os.path.join(ROOT, 'public', 'assets')
src = Image.open(os.path.join(A, 'icon-512.png')).convert('RGBA')
icon = lambda s: src.resize((s, s), Image.LANCZOS)

icon(256).save(os.path.join(HERE, 'code-room.png'), optimize=True)
src.save(os.path.join(HERE, 'code-room.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon(64).save(os.path.join(A, 'favicon.png'), optimize=True); icon(256).save(os.path.join(A, 'icon-256.png'), optimize=True)
land = os.path.normpath(os.path.join(ROOT, '..', 'Code Room Landing', 'assets', 'marca'))
if os.path.isdir(land):
    icon(64).save(os.path.join(land, 'favicon.png'), optimize=True); icon(180).save(os.path.join(land, 'apple-touch-icon.png'), optimize=True); icon(96).save(os.path.join(land, 'logo.png'), optimize=True)
print('ícones gerados')
