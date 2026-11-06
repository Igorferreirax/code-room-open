# Baixa imagens da grade do projeto aberto no Flow (Chrome com CDP em localhost:9333), sem confiar no arquivo que o MCP devolve (bug conhecido).
# Uso: python -I scripts/flow-baixar-grade.py <pasta de saída> <prefixo> [media_id]   (com media_id baixa só essa; sem, baixa as 2 mais novas como <prefixo>_a/_b)
import sys, os, asyncio, subprocess
from playwright.async_api import async_playwright
dest, cena = sys.argv[1], sys.argv[2]
alvo = sys.argv[3] if len(sys.argv) > 3 else None
n = 2
os.makedirs(dest, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9333")
        pg = next(pa for c in b.contexts for pa in c.pages if "flow.google.com/project" in pa.url)
        g = await pg.eval_on_selector_all("img[data-media-id]", "els=>els.map(e=>[e.dataset.mediaId,e.src])")
        print("na grade:", len(g))
        if alvo: g = [x for x in g if x[0] == alvo][:1]
        if not g: print("id nao encontrado na grade"); return
        for i, (m, s) in enumerate(g[:n]):
            rr = await pg.context.request.get(s.replace("=s512-rw", "=s2048-rw"))
            arq = os.path.join(dest, f"{cena}.png" if alvo else f"{cena}_{'abcdef'[i]}.png"); open(arq, "wb").write(await rr.body()); print(arq, os.path.getsize(arq), m)
asyncio.run(main())
a, b2 = os.path.join(dest, f"{cena}_a.png"), os.path.join(dest, f"{cena}_b.png")
if os.path.exists(a) and os.path.exists(b2):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a, "-i", b2, "-filter_complex", "[0]scale=540:-1[x];[1]scale=540:-1[y];[x][y]hstack", os.path.join(dest, f"{cena}_folha.jpg")])
