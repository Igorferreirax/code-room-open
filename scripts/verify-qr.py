"""Verifica o gerador de QR (public/qr.js) decodificando as imagens com o OpenCV. Uso: python scripts/verify-qr.py"""
import json, os, subprocess, sys
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cases = ['http://192.168.15.11:4780/#pair=ABCDEFGH', 'http://100.101.102.103:4780/#pair=ZK7Q2M9T', 'x', 'olá mundo — acentuação ÇÃO',
         'http://meu-notebook.tail1234.ts.net:4780/#pair=ABCDEFGH', 'a' * 80, 'b' * 150, 'c' * 210]
js = "import { qrMatrix } from './public/qr.js'; const cases = %s; console.log(JSON.stringify(cases.map(t => qrMatrix(t))));" % json.dumps(cases)
out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
if out.returncode: print(out.stderr); sys.exit(1)
mats = json.loads(out.stdout); det = cv2.QRCodeDetector(); bad = 0
for text, g in zip(cases, mats):
    n = len(g); img = np.full((n + 8, n + 8), 255, np.uint8)
    for y in range(n):
        for x in range(n):
            if g[y][x]: img[y + 4, x + 4] = 0
    img = cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    got, pts, _ = det.detectAndDecode(img); ok = got == text; bad += not ok
    print(('OK    ' if ok else 'FALHA ') + f'v{(n - 17) // 4} {len(text)} chars', '' if ok else repr(got))
print('falhas:', bad); sys.exit(1 if bad else 0)
