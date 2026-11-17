# Текстура грунта для корта из картинки GPT (art/clay.png): делаем бесшовной, снимаем карту рельефа зерна и шероховатость.
# Запуск (нужны opencv-python-headless и numpy): python3 tools/clay-texture.py art/clay.png public/tex
# Бесшовность: картинку сдвигаем на половину и смешиваем с исходной маской «центр — исходник, края — сдвинутая»;
# у сдвинутой по краям оказывается середина исходника, поэтому стык при повторе пропадает. На зерне смесь не видна.
import sys, os
import cv2, numpy as np

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
img = cv2.imread(src, cv2.IMREAD_COLOR).astype(np.float32)
n = 1024
img = cv2.resize(img, (n, n), interpolation=cv2.INTER_AREA)
rolled = np.roll(img, (n // 2, n // 2), axis=(0, 1))


def wrap_blur(a, sigma):  # размытие «по кругу»: картинку окружаем её же краями, чтобы плитка оставалась бесшовной
    p = int(sigma * 3) + 1
    pad = ((p, p), (p, p)) + ((0, 0),) * (a.ndim - 2)
    return cv2.GaussianBlur(np.pad(a, pad, mode='wrap'), (0, 0), sigma)[p:-p, p:-p]


ramp = np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n / 2)       # 0 у края, 1 в центре
m = np.clip(np.minimum.outer(ramp, ramp) * 2.2, 0, 1)[..., None]       # широкая середина исходника
tile = img * m + rolled * (1 - m)
# Выравниваем крупные пятна яркости: крупную неоднородность даст отдельная макро-карта, тут нужна ровная плитка.
low = wrap_blur(tile, 60)
tile = np.clip(tile - low + low.mean(axis=(0, 1)), 0, 255)
cv2.imwrite(os.path.join(out, 'clay.webp'), tile.astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

# Рельеф зерна: светлые крупинки выше. Нормали из перепадов высоты (Собель по кругу, чтобы края тоже были бесшовными).
h = cv2.cvtColor(tile.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
h = wrap_blur(h, 0.8)
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5  # перепады по кругу — края тоже бесшовные
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
k = 9.0
nx, ny, nz = -dx * k, dy * k, np.ones_like(h)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
nrm = np.stack([nz / ln, ny / ln, nx / ln], axis=-1)  # BGR для cv2: B=z, G=y, R=x
cv2.imwrite(os.path.join(out, 'clay-normal.webp'), ((nrm * 0.5 + 0.5) * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 92])

# Шероховатость: грунт матовый, светлая пыль ещё матовее, плотные тёмные пятна чуть глаже.
rough = np.clip(0.82 + (h - h.mean()) * 0.5, 0.6, 1.0)
cv2.imwrite(os.path.join(out, 'clay-rough.webp'), (rough * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])
print('ok', n)
