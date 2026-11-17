# Бесшовная плитка из фото GPT (art/env/*.png): газон, гравий, листва изгороди, камень. Тот же приём, что в clay-texture.py.
#   python3 tools/ground-tex.py art/env/grass.png public/tex/grass.webp 1024
# Нужны opencv-python-headless и numpy.
import sys
import cv2, numpy as np

src, dst, n = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024
img = cv2.resize(cv2.imread(src, cv2.IMREAD_COLOR).astype(np.float32), (n, n), interpolation=cv2.INTER_AREA)
rolled = np.roll(img, (n // 2, n // 2), axis=(0, 1))
ramp = np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n / 2)
m = np.clip(np.minimum.outer(ramp, ramp) * 2.2, 0, 1)[..., None]  # середина исходника, по краям сдвинутая копия
tile = img * m + rolled * (1 - m)
p = 181  # крупные пятна яркости выравниваем: неоднородность даёт шейдер, плитка должна быть ровной
low = cv2.GaussianBlur(np.pad(tile, ((p, p), (p, p), (0, 0)), mode='wrap'), (0, 0), 60)[p:-p, p:-p]
tile = np.clip(tile - low + low.mean(axis=(0, 1)), 0, 255)
cv2.imwrite(dst, tile.astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 82])
print(dst, n)
