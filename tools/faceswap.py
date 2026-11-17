# Вклеивает настоящее лицо Лёвы (брови, глаза, нос, рот, подбородок) в кадр для Meshy.
# Точки лица даёт Vision (tools/landmarks.swift), совмещение по подобию, свет и цвет подгоняет Пуассон (seamlessClone).
# Запуск: python faceswap.py src.jpg src.json dst.png dst.json out.png [scale]
import json, sys
import cv2, numpy as np

src_img, src_pts, dst_img, dst_pts, out = sys.argv[1:6]
scale = float(sys.argv[6]) if len(sys.argv) > 6 else 2.0
S, D = cv2.imread(src_img), cv2.imread(dst_img)
s, d = json.load(open(src_pts)), json.load(open(dst_pts))
D = cv2.resize(D, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)  # больше пикселей под лицо

def keys(p, k=1.0):
    c = lambda n: np.mean(np.array(p[n]), axis=0) * k
    chin = max(p['contour'], key=lambda q: q[1])
    return np.float32([c('leftPupil'), c('rightPupil'), c('nose'), c('lips'), np.array(chin) * k])

M, _ = cv2.estimateAffinePartial2D(keys(s), keys(d, scale), method=cv2.LMEDS)
warped = cv2.warpAffine(S, M, (D.shape[1], D.shape[0]), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

# Маска: овал по контуру скул и подбородка, сверху по бровям; лоб и волосы остаются с кадра.
def face_poly(p, k):
    brows = np.array(p['leftBrow'] + p['rightBrow']) * k
    up = brows.copy(); up[:, 1] -= 0.04 * (np.ptp(np.array(p['contour'])[:, 1]) * k)
    return np.vstack([np.array(p['contour']) * k, up]).astype(np.int32)
mask = np.zeros(D.shape[:2], np.uint8)
cv2.fillConvexPoly(mask, cv2.convexHull(face_poly(d, scale)), 255)
# Только там, где лицо есть и на фото, и в кадре: иначе в маску попадает фон фото (лицо на нём чуть повёрнуто).
src_poly = cv2.transform(face_poly(s, 1.0).reshape(-1, 1, 2).astype(np.float32), M).reshape(-1, 2).astype(np.int32)
m2 = np.zeros_like(mask); cv2.fillConvexPoly(m2, cv2.convexHull(src_poly), 255)
mask = cv2.erode(cv2.bitwise_and(mask, m2), np.ones((5, 5), np.uint8), iterations=3)
# Цвет фото под кадр: среднее и разброс в Lab по маске (фото тёплое, кадр студийный).
lab_w, lab_d = (cv2.cvtColor(i, cv2.COLOR_BGR2LAB).astype(np.float32) for i in (warped, D))
sel = mask > 0
for c in range(3):
    mw, sw, md, sd = lab_w[..., c][sel].mean(), lab_w[..., c][sel].std() + 1e-3, lab_d[..., c][sel].mean(), lab_d[..., c][sel].std()
    lab_w[..., c] = (lab_w[..., c] - mw) * (sd / sw if c else min(sd / sw, 1.2)) + md
warped = cv2.cvtColor(np.clip(lab_w, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
x, y, w, h = cv2.boundingRect(mask)
res = cv2.seamlessClone(warped, D, mask, (x + w // 2, y + h // 2), cv2.NORMAL_CLONE)
cv2.imwrite(out, res)
print('ok', out, D.shape[1], 'x', D.shape[0], 'face', w, 'x', h)
