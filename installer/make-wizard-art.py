"""Gera as imagens do assistente de instalação a partir das referências em "Tela de Instalação/" (arte pixel do Igor).
Grava em installer/wizard/: painel lateral (boas-vindas e conclusão) em 3 tamanhos, selo pequeno em 3 tamanhos e a arte da tela de progresso.
Os BMP gerados são versionados; as referências grandes (PNG de 1,5 MB) não precisam ir para o repositório.
Uso: python installer/make-wizard-art.py"""
import glob, os, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); OUT = os.path.join(HERE, 'wizard'); os.makedirs(OUT, exist_ok=True)
REF = os.path.join(ROOT, 'Tela de Instalação')
def ref(prefix):
    f = [p for p in glob.glob(os.path.join(REF, '*.png')) if os.path.basename(p).startswith(prefix)]
    if not f: raise SystemExit(f'referência não encontrada: {prefix}* em {REF}')
    return Image.open(f[0]).convert('RGB')
welcome, progress = ref('Tela de boas-vindas'), ref('Progresso da instalação')
BG = welcome.getpixel((640, 300))   # fundo escuro da referência (para o selo)

# Painel lateral: recorte vertical da ilustração da tela de boas-vindas (mesa, monitor, cadeira e o gato).
art = welcome.crop((200, 146, 583, 881))
for w, h in ((164, 314), (246, 459), (328, 628)):
    im = art.resize((w, int(art.height * w / art.width)), Image.LANCZOS); top = max(0, (im.height - h) // 2)
    im.crop((0, top, w, top + h)).save(os.path.join(OUT, f'lateral-{w}.bmp'))
# Selo pequeno (cantos das páginas internas): o "R" com a porta, sobre o fundo escuro.
logo = welcome.crop((646, 200, 740, 276))
for s in (55, 64, 110):
    box = Image.new('RGB', (s, s), BG); k = (s * 0.9) / max(logo.width, logo.height); l = logo.resize((max(1, int(logo.width * k)), max(1, int(logo.height * k))), Image.LANCZOS)
    box.paste(l, ((s - l.width) // 2, (s - l.height) // 2)); box.save(os.path.join(OUT, f'selo-{s}.bmp'))
# Arte da tela de progresso (a pessoa abrindo a caixa), mostrada ao lado da barra.
prog = progress.crop((132, 262, 702, 612)); prog.resize((340, int(prog.height * 340 / prog.width)), Image.LANCZOS).save(os.path.join(OUT, 'progresso.bmp'))
print('imagens gravadas em', OUT, [os.path.basename(p) for p in sorted(glob.glob(os.path.join(OUT, '*.bmp')))])
