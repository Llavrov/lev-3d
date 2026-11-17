# Корректирующие морфы плеча для «Лёвы на корте». Скрипт Блендера, без окна:
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/rig-correctives.py -- in-raw.glb poses.json out.glb
# in-raw.glb — модель после tools/rig-weights.py, poses.json — позы из игры (tools/rig-poses.mjs).
# Для каждой позы: линейный скиннинг как в игре (матрицы костей из игры × обратные матрицы привязки из файла), цель —
# дельта-маш (сглаженная деформация плюс детали покоя в локальных осях), разница переводится в позу покоя через
# (Σ wᵢMᵢ)⁻¹ и пишется ключом формы на сторону: только плечо, подмышка и грудь этой стороны. Имя ключа «cRight|x|y|z»
# несёт направление плеча в осях груди — по нему src/correctives.js включает морф.
import sys, json, struct, re
import bpy
import numpy as np

ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, POSES, DST = ARGS[:3]
PRE = 'mixamorig:'
SIDES = (('Left', 1), ('Right', -1))
MAX_KEYS, MIN_MM, SAME_DEG = 4, 3.0, 22  # ключей на сторону; меньше 3 мм — не нужен; ближе 22° к уже взятому — дубль


def ss(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# Обратные матрицы привязки из самого файла: в них оси узлов glTF, с которыми считала игра.
raw = open(SRC, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]; gj = json.loads(raw[20:20 + n]); bin0 = 20 + n + 8
skin = gj['skins'][0]; acc = gj['accessors'][skin['inverseBindMatrices']]; bv = gj['bufferViews'][acc['bufferView']]
IB = np.frombuffer(raw, np.float32, acc['count'] * 16, bin0 + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)).reshape(-1, 4, 4).transpose(0, 2, 1)
base = lambda nm: re.sub(r'^mixamorig:?', '', nm)  # three.js выкидывает «:» из имён узлов
IB = {base(gj['nodes'][j]['name']): IB[k].astype(float) for k, j in enumerate(skin['joints'])}
D = json.load(open(POSES))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True, disable_bone_shape=True)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
me = body.data; NV = len(me.vertices)
co = np.empty(NV * 3); me.vertices.foreach_get('co', co); Pv = co.reshape(-1, 3)[:, [0, 2, 1]] * [1, 1, -1]
names = [vg.name for vg in body.vertex_groups]
Wv = np.zeros((NV, len(names)))
for v in me.vertices:
    for e in v.groups: Wv[v.index, e.group] = e.weight
# Сшиваем швы развёртки (как в rig-weights.py), иначе сглаживание разорвёт шов.
_, wid = np.unique(np.round(Pv * 1e5).astype(np.int64), axis=0, return_inverse=True); wid = wid.ravel(); N = wid.max() + 1
cnt = np.bincount(wid, minlength=N)
P = np.stack([np.bincount(wid, Pv[:, k], N) for k in range(3)], 1) / cnt[:, None]
W = np.stack([np.bincount(wid, Wv[:, c], N) for c in range(len(names))], 1) / cnt[:, None]
ed = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', ed)
ed = wid[ed.reshape(-1, 2)]; ed = np.unique(np.sort(ed[ed[:, 0] != ed[:, 1]], 1), axis=0)
deg = np.maximum(np.bincount(ed[:, 0], minlength=N) + np.bincount(ed[:, 1], minlength=N), 1)
me.calc_loop_triangles()
tri = np.empty(len(me.loop_triangles) * 3, np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = wid[tri.reshape(-1, 3)]
nb0 = np.arange(N); nb0[ed[:, 0]] = ed[:, 1]; nb0[ed[:, 1]] = ed[:, 0]  # сосед для касательной оси
col = {base(nm): c for c, nm in enumerate(names)}
J = {base(b.name): np.array([b.head_local[0], b.head_local[2], -b.head_local[1]]) for b in arm.data.bones}


def smooth(X, iters=25, lam=0.5):
    X = X.copy()
    for _ in range(iters):
        nb = np.stack([np.bincount(ed[:, 0], X[ed[:, 1], k], N) + np.bincount(ed[:, 1], X[ed[:, 0], k], N) for k in range(3)], 1)
        X += lam * (nb / deg[:, None] - X)
    return X


def frames(X):
    fn = np.cross(X[tri[:, 1]] - X[tri[:, 0]], X[tri[:, 2]] - X[tri[:, 0]])
    nrm = np.stack([np.bincount(tri[:, k % 3], fn[:, k // 3], N) for k in range(9)], 1).reshape(N, 3, 3).sum(2)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    t = X[nb0] - X; t -= (t * nrm).sum(1, keepdims=True) * nrm
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-12)
    return np.stack([t, np.cross(nrm, t), nrm], 1)  # строки — оси t, b, n


# Детали покоя в локальных осях сглаженной сетки (дельта-маш, Mancewicz 2014).
S0 = smooth(P, 40); F0 = frames(S0); d0 = np.einsum('nij,nj->ni', F0, P - S0)
w_of = lambda *ks: sum(W[:, col[k]] for k in ks if k in col)

keys = []
for pose in D['poses']:
    E = {}
    for nm, g in zip(D['names'], pose['G']):
        if base(nm) in IB: E[base(nm)] = np.array(g).reshape(4, 4).T @ IB[base(nm)]
    L = np.zeros((N, 3)); A = np.zeros((N, 3, 3))
    for k, c in col.items():
        if k not in E or not W[:, c].any(): continue
        L += W[:, c, None] * (P @ E[k][:3, :3].T + E[k][:3, 3]); A += W[:, c, None, None] * E[k][:3, :3]
    S1 = smooth(L, 40); T = S1 + np.einsum('nij,ni->nj', frames(S1), d0)
    # Оси дельта-маша по одному соседу шумят на неровной сетке Meshy: поправку сглаживаем, иначе футболка рябит.
    rest = np.linalg.solve(A, smooth(T - L, iters=10)[:, :, None])[:, :, 0]
    for side, s in SIDES:
        dist = np.linalg.norm(P - J[side + 'Arm'], axis=1)
        m = (1 - ss(dist, 0.16, 0.30)) * ss(s * P[:, 0], -0.06, 0.04)  # плечо, подмышка и грудь этой стороны
        m *= 1 - np.clip(w_of('Head', side + 'ForeArm', side + 'ForeArmTwist', side + 'Hand') + sum(W[:, c] for k, c in col.items() if k.startswith(side + 'Hand')), 0, 1)
        dk = rest * m[:, None]
        keys.append(dict(side=side, u=np.array(pose['u'][side]), d=dk, mm=np.linalg.norm(dk, axis=1).max() * 1000, pose=pose['name']))

kept = []
for k in sorted(keys, key=lambda k: -k['mm']):
    same = [q for q in kept if q['side'] == k['side'] and np.degrees(np.arccos(np.clip(q['u'] @ k['u'], -1, 1))) < SAME_DEG]
    if k['mm'] >= MIN_MM and not same and sum(q['side'] == k['side'] for q in kept) < MAX_KEYS: kept.append(k)
for k in keys: print(f"{k['pose']:7s} {k['side']:5s} макс {k['mm']:5.1f} мм {'взят' if any(k is q for q in kept) else ''}")

body.shape_key_add(name='Basis', from_mix=False)
for k in kept:
    sk = body.shape_key_add(name=f"c{k['side']}|" + '|'.join(f'{v:.3f}' for v in k['u']), from_mix=False)
    dv = k['d'][wid]
    sk.data.foreach_set('co', (Pv + dv)[:, [0, 2, 1]].__mul__([1, -1, 1]).ravel())  # обратно в оси Блендера
print('ключей формы:', len(kept), 'вершин с поправкой:', int((np.abs(np.array([k['d'] for k in kept])).max(axis=(0, 2)) > 1e-4).sum()) if kept else 0)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_animations=False, export_influence_nb=4, export_yup=True,
                          export_def_bones=False, export_leaf_bone=False, export_morph=True, export_morph_normal=True)
