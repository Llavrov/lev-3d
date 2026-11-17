# Отчёт о весах скиннинга в GLB от Meshy: где стоят кости и какие кости держат туловище.
# Запуск (нужен numpy, он есть в Python Блендера):
#   /Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13 -I tools/skin-report.py ref/meshy/lev-rigged.glb
# Цифры до правки весов — в docs/human-mesh-research.md, после правки сравнить с ними.
import json, struct, sys
import numpy as np

b = open(sys.argv[1], 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
bin0 = 20 + n + 8
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = np.dtype(CT[a['componentType']]); k = NC[a['type']]; st = bv.get('byteStride', dt.itemsize * k)
    raw = np.frombuffer(b, np.uint8, st * (a['count'] - 1) + dt.itemsize * k, off)
    arr = np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * k), (st, 1)).copy().view(dt).reshape(a['count'], k)
    return arr / np.iinfo(dt).max if a.get('normalized') else arr


pr = j['meshes'][0]['primitives'][0]; at = pr['attributes']  # shortcut: только первая сетка, у Meshy она одна
P = acc(at['POSITION']).astype(float); J = acc(at['JOINTS_0']).astype(int); W = acc(at['WEIGHTS_0']).astype(float)
sk = j['skins'][0]
names = [j['nodes'][i]['name'].replace('mixamorig:', '') for i in sk['joints']]
IB = acc(sk['inverseBindMatrices']).reshape(-1, 4, 4).astype(float)
pos = {nm: np.linalg.inv(IB[k].T)[:3, 3] for k, nm in enumerate(names)}
w_of = lambda nm: (W * (J == names.index(nm))).sum(1) if nm in names else np.zeros(len(W))

print('Кости (x, y, z в метрах):')
for nm in ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand']:
    print(f'  {nm:13s}', pos[nm].round(3))
dom = J[np.arange(len(J)), W.argmax(1)]
print('Вершин, где кость главная:', ', '.join(f'{nm} {(dom == names.index(nm)).sum()}' for nm in ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder']))

print('Середина туловища |x|<11 см, доли весов по высоте:')
for y0 in np.arange(0.95, 1.50, 0.05):
    m = (np.abs(P[:, 0]) < 0.11) & (P[:, 1] >= y0) & (P[:, 1] < y0 + 0.05)
    if not m.any(): continue
    tot = {}
    for k in range(4):
        for jj, ww in zip(J[m, k], W[m, k]): tot[names[jj]] = tot.get(names[jj], 0) + ww
    s = sum(tot.values())
    print(f'  y {y0:.2f}', ' '.join(f'{nm}:{v / s:.2f}' for nm, v in sorted(tot.items(), key=lambda x: -x[1])[:4]))

arm = sum(w_of(s + p) for s in ['Left', 'Right'] for p in ['Arm', 'ArmTwist', 'ForeArm', 'ForeArmTwist', 'Hand'])  # со скрутками, если есть
m = (np.abs(P[:, 0]) < 0.12) & (P[:, 1] > 1.0) & (P[:, 1] < 1.45)
back = m & (P[:, 2] < -0.08)
print(f'Руки тянут туловище: {(m & (arm > 0.05)).sum()} из {m.sum()} вершин с весом руки > 5 % (спина: {(back & (arm > 0.05)).sum()} из {back.sum()}), максимум {arm[m].max():.2f}')
assert np.allclose(W.sum(1), 1, atol=0.02), 'веса не нормированы'
