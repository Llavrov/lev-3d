# Чистка весов авто-рига Meshy и кости-скрутки рук. Скрипт Блендера, без окна:
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/rig-weights.py -- in.glb out.glb [флаги]
# Флаги: --auto — веса туловища и рук «теплом» Блендера с герметичной копии (Voxel Remesh) вместо весов Meshy
#        (проверено 17.11: хуже — туловище течёт как у Meshy, кисть склеивается с бедром);
#        --no-clean — без чистки; --keep-joints — не двигать плечо и шею; --no-twist — без скруток.
# Что делает (почему — docs/human-mesh-research.md):
#   1. поднимает сустав плеча к центру головки плечевой кости и шею к основанию шеи;
#   2. снимает вес рук с туловища (граница — плоскость через подмышку), середину груди и спины отдаёт позвоночнику
#      (Spine2 держал ноль вершин), шею — кости Neck вместо Head, сглаживает границы;
#   3. добавляет скрутки LeftArmTwist/LeftForeArmTwist (и правые), веса раздаёт градиентом вдоль кости;
#   4. оставляет 4 влияния на вершину и нормирует.
# Имена костей не меняются (код ищет mixamorig:...). Оси координат в расчётах — как в glTF: y вверх, z вперёд, +x — левая рука.
import sys
import bpy
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, FLAGS = ARGS[0], ARGS[1], set(ARGS[2:])
PRE = 'mixamorig:'
SIDES = (('Left', 1), ('Right', -1))
BODY = {'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'} | {s + p for s, _ in SIDES for p in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')}


def ss(x, a, b):  # smoothstep как в GLSL
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gl(v):  # Блендер (z вверх) → оси glTF
    return np.array([v[0], v[2], -v[1]])


def bl(p):
    return Vector((p[0], -p[2], p[1]))


def base(n):
    return n.replace(PRE, '')


def activate(*objs):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True, disable_bone_shape=True)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
for o in (arm, body): assert o.matrix_world.is_identity, 'ждали модель без поворота и масштаба объектов'
me = body.data
NV = len(me.vertices)
co = np.empty(NV * 3); me.vertices.foreach_get('co', co)
Pv = co.reshape(-1, 3)[:, [0, 2, 1]] * [1, 1, -1]
names = [base(vg.name) for vg in body.vertex_groups]
for b in arm.data.bones:  # группы для всех костей, даже пустых (Spine2 бывает без вершин)
    if base(b.name) not in names: body.vertex_groups.new(name=b.name); names.append(base(b.name))
Wv = np.zeros((NV, len(names)))
for v in me.vertices:
    for e in v.groups: Wv[v.index, e.group] = e.weight

# Вершины Meshy разрезаны по швам развёртки: сшиваем по положению, иначе шов разъедется при сглаживании.
_, wid = np.unique(np.round(Pv * 1e5).astype(np.int64), axis=0, return_inverse=True)
wid = wid.ravel(); N = wid.max() + 1
cnt = np.bincount(wid, minlength=N)
P = np.stack([np.bincount(wid, Pv[:, k], N) for k in range(3)], 1) / cnt[:, None]
W = np.stack([np.bincount(wid, Wv[:, c], N) for c in range(len(names))], 1) / cnt[:, None]
ed = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', ed)
ed = wid[ed.reshape(-1, 2)]; ed = np.unique(np.sort(ed[ed[:, 0] != ed[:, 1]], 1), axis=0)
deg = np.bincount(ed[:, 0], minlength=N) + np.bincount(ed[:, 1], minlength=N)
elen = np.linalg.norm(P[ed[:, 0]] - P[ed[:, 1]], axis=1)
me.calc_loop_triangles()
tri = np.empty(len(me.loop_triangles) * 3, np.int64); me.loop_triangles.foreach_get('vertices', tri)
TRI = P[wid[tri.reshape(-1, 3)]]
BARY = np.array([(i, j, 8 - i - j) for i in range(9) for j in range(9 - i)]) / 8  # точки на треугольнике для силуэта
C = {n: i for i, n in enumerate(names)}
x, y, z = P[:, 0], P[:, 1], P[:, 2]


def joints():
    return {base(b.name): gl(b.head_local) for b in arm.data.bones}


J = joints()
print('было:', {k: J[k].round(3).tolist() for k in ('LeftArm', 'RightArm', 'Neck', 'Head')})


# 1. Суставы. Плечо: живой сустав сидит на 5–6 см ниже верха плеча, у Meshy — на ~10 см. Сдвигаем вверх
#    (не больше 5 см) и вперёд к оси руки по срезам ниже подмышки. Шея — на 2 см ниже места, где плечи переходят в шею.
def move_joints():
    new = {}
    for side, s in SIDES:
        S, E = J[side + 'Arm'], J[side + 'ForeArm']
        m = (np.abs(x - S[0]) < 0.012) & (y > S[1]) & (y < S[1] + 0.2) & (np.abs(z - S[2]) < 0.08)
        lift = float(np.clip(y[m].max() - 0.055 - S[1], 0, 0.05))
        a = (E - S) / np.linalg.norm(E - S); rel = P - S; t = rel @ a; r = rel - np.outer(t, a)
        dz = []
        for tt in np.linspace(0.18, 0.32, 8) * np.linalg.norm(E - S) / 0.256:
            mm = (np.abs(t - tt) < 0.006) & (np.linalg.norm(r, axis=1) < 0.07) & (s * x > s * S[0])
            if mm.sum() > 10: dz.append(z[mm].mean() - (S + a * tt)[2])
        new[side + 'Arm'] = S + [0, lift, float(np.clip(np.median(dz) if dz else 0, -0.015, 0.015))]
    Nk, H = J['Neck'], J['Head']
    base_y = next((yy for yy in np.arange(new['LeftArm'][1] + 0.03, H[1], 0.005)
                   if not ((np.abs(y - yy) < 0.004) & (np.abs(x) > 0.10) & (np.abs(x) < 0.16) & (np.abs(z - Nk[2]) < 0.12)).any()), Nk[1])
    new['Neck'] = Nk + [0, float(np.clip(base_y - 0.02 - Nk[1], 0, H[1] - 0.04 - Nk[1])), 0]
    activate(arm); bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for n, p in new.items():
        b = eb[PRE + n]; old = b.head.copy(); b.head = bl(p)
        if (b.parent.tail - old).length < 1e-3: b.parent.tail = bl(p)  # родитель смотрел в этот сустав — пусть смотрит и дальше
    for side, _ in SIDES: eb[PRE + side + 'Shoulder'].tail = bl(new[side + 'Arm'])
    bpy.ops.object.mode_set(mode='OBJECT')


if '--keep-joints' not in FLAGS: move_joints()
J = joints()
print('стало:', {k: J[k].round(3).tolist() for k in ('LeftArm', 'RightArm', 'Neck', 'Head')})


# Веса «теплом» Блендера: на сетке Meshy оно падает (тонкие и вырожденные треугольники), поэтому считаем на
# герметичной копии (Voxel Remesh) и переносим на исходную сетку. Пальцы и кости лица оставляем от Meshy:
# воксели склеивают пальцы.
def auto_weights():
    global W
    cp = body.copy(); cp.data = body.data.copy(); bpy.context.collection.objects.link(cp)
    cp.modifiers.clear(); cp.vertex_groups.clear(); cp.parent = None
    r = cp.modifiers.new('vox', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.005; r.adaptivity = 0
    activate(cp); bpy.ops.object.modifier_apply(modifier='vox')
    print('копия:', len(cp.data.vertices), 'вершин')
    deform = {b.name: b.use_deform for b in arm.data.bones}
    for b in arm.data.bones: b.use_deform = base(b.name) in BODY
    # Воксели оставляют мелкие острова и внутренние оболочки; кость их «не видит», и решатель падает сразу для всех
    # костей («failed to find solution»). Оставляем самый большой кусок.
    activate(cp); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    cp = max(parts, key=lambda o: len(o.data.vertices))
    for o in parts:
        if o is not cp: bpy.data.objects.remove(o)
    print('кусков', len(parts), 'оставили', len(cp.data.vertices))
    activate(arm, cp); cp.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm.data.bones: b.use_deform = deform[b.name]
    got = {base(vg.name): 0 for vg in cp.vertex_groups}
    for v in cp.data.vertices:
        for e in v.groups:
            if e.weight > 0.01: got[base(cp.vertex_groups[e.group].name)] += 1
    print('тепло, вершин на кость:', {k: n for k, n in got.items() if k in BODY})
    probe = body.copy(); probe.data = body.data.copy(); bpy.context.collection.objects.link(probe)
    probe.modifiers.clear(); probe.vertex_groups.clear(); probe.parent = None
    dt = probe.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = cp; dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    activate(probe); bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
    A = np.zeros((NV, len(names)))
    gi = {i: C[base(vg.name)] for i, vg in enumerate(probe.vertex_groups)}
    for v in probe.data.vertices:
        for e in v.groups: A[v.index, gi[e.group]] = e.weight
    Aw = np.stack([np.bincount(wid, A[:, c], N) for c in range(len(names))], 1) / cnt[:, None]
    body_cols = [C[n] for n in names if n in BODY]
    keep = W.copy(); keep[:, body_cols] = 0  # пальцы, лицо, концевые кости — от Meshy
    Aw = Aw / np.maximum(Aw.sum(1, keepdims=True), 1e-9)
    W = keep + Aw * (1 - keep.sum(1, keepdims=True))
    for o in (cp, probe): bpy.data.objects.remove(o)


if '--auto' in FLAGS: auto_weights()

# Позвоночник по высоте: куда отдавать вес, снятый с рук, ключиц и головы. Доли между серединами костей.
SPN = ['Spine', 'Spine1', 'Spine2', 'Neck']
centers = np.array([(J['Spine'][1] + J['Spine1'][1]) / 2, (J['Spine1'][1] + J['Spine2'][1]) / 2,
                    (J['Spine2'][1] + J['Neck'][1]) / 2, (J['Neck'][1] + J['Head'][1]) / 2])


def give_spine(amount):
    for k, n in enumerate(SPN):
        lo = centers[k - 1] if k else -np.inf; hi = centers[k + 1] if k < 3 else np.inf
        up = np.clip((y - lo) / (centers[k] - lo), 0, 1) if k else (y <= centers[k]) * 1.0
        dn = np.clip((hi - y) / (hi - centers[k]), 0, 1) if k < 3 else (y >= centers[k]) * 1.0
        W[:, C[n]] += amount * np.where(y <= centers[k], up, dn)


def smooth(mask, iters=8, lam=0.6):
    cols = np.where((W * (mask[:, None] > 0)).sum(0) > 0)[0]
    cols = [c for c in cols if names[c] in BODY]
    for _ in range(iters):
        for c in cols:
            nb = np.bincount(ed[:, 0], W[ed[:, 1], c], N) + np.bincount(ed[:, 1], W[ed[:, 0], c], N)
            W[:, c] += lam * mask * (nb / np.maximum(deg, 1) - W[:, c])


def clean():
    # Граница рука/туловище: плоскость через вершину подмышки (выше всех срезов, где между рукой и боком есть зазор)
    # и точку над плечом на 2 см ближе к шее. С той стороны, где туловище, вес руки снимаем (плавно, 6 см).
    garm = {}
    for side, s in SIDES:
        S = J[side + 'Arm']; Sx = s * S[0]; xs = s * x; ap = None
        # Силуэт спереди на сетке 4 мм (треугольники рассыпаны точками): по срезам вершин зазор не найти,
        # сетка Meshy редкая и даёт ложные дыры. Снизу вверх, пока между боком и рукой есть пустота; где её нет — подмышка.
        x0, y0, px = Sx - 0.07, S[1] - 0.35, 0.004
        T = TRI[(TRI[:, :, 1].max(1) > y0) & (TRI[:, :, 1].min(1) < S[1]) & ((s * TRI[:, :, 0]).max(1) > x0) & ((s * TRI[:, :, 0]).min(1) < Sx + 0.04)]
        pts = np.einsum('kj,tjc->tkc', BARY, T).reshape(-1, 3)
        ix = np.floor((s * pts[:, 0] - x0) / px).astype(int); iy = np.floor((pts[:, 1] - y0) / px).astype(int)
        nx, ny = int(0.11 / px), int(0.35 / px); ok = (ix >= 0) & (ix < nx) & (iy >= 0) & (iy < ny)
        occ = np.zeros((ny, nx), bool); occ[iy[ok], ix[ok]] = True
        miss = 0
        for r in range(ny):
            idx = np.where(occ[r])[0]
            run = np.diff(idx) - 1 if len(idx) > 1 else np.zeros(1, int)  # пустота между занятыми: бок слева, рука справа
            if run.max() >= 2: ap = (y0 + (r + 0.5) * px, x0 + (idx[run.argmax()] + idx[run.argmax() + 1] + 1) / 2 * px); miss = 0
            elif ap:
                # У мускулистой модели рука касается широчайшей на 1–3 см ниже подмышки: короткое касание пропускаем,
                # иначе подмышка находится на 12 см ниже настоящей (coach, 23.11: слева 1.142 вместо 1.26).
                miss += 1
                if miss > 8: break
        y_ap, x_ap = ap or (S[1] - 0.16, Sx - 0.005)
        slope = (Sx - 0.02 - x_ap) / (S[1] + 0.05 - y_ap)
        L = xs - (x_ap + (y - y_ap) * slope)
        g = ss(L, -0.045, 0.045)
        # Ниже подмышки рука и бок — разные куски сетки, плоскость между ними не провести (зазор 1–2 см): рукой
        # считаем всё, что связано с плечом над локтем, не поднимаясь выше подмышки. Иначе внутренняя сторона руки
        # оставалась наполовину на позвоночнике и рвалась белой полосой, когда рука поднята.
        E, hy = J[side + 'ForeArm'], J['Hips'][1]
        sub = (y < y_ap) & (y > hy) & (xs > 0.04)
        reach = sub & (xs > Sx + 0.02) & (y > E[1] - 0.05) & (y < y_ap - 0.05)
        a, b = ed[sub[ed[:, 0]] & sub[ed[:, 1]]].T
        while True:
            n0 = reach.sum(); reach[b[reach[a]]] = True; reach[a[reach[b]]] = True
            if reach.sum() == n0: break
        leak = (reach & (xs < x_ap - 0.03)).sum()
        if leak > 50: print(f'{side}: рука срослась с боком ({leak} вершин), подмышка только плоскостью'); reach[:] = False
        conn = np.where(sub, reach * 1.0, g)
        g = np.where(xs > 0.04, conn + (g - conn) * ss(y, y_ap - 0.01, y_ap + 0.02), g)
        # Складки подмышки (край грудной и широчайшей) идут за рукой наполовину и слабеют за 10 см по сетке:
        # так кожа тянется по площади. С узкой полосой (7 см, рампа ±3 см) перед подмышки на бэкхенде
        # сминался внахлёст: рукав рвался пилой, изнанка проступала (test-out/rig-m2/zd.png).
        d = np.where(g >= 0.5, 0.0, np.inf)
        for _ in range(40):
            np.minimum.at(d, ed[:, 1], d[ed[:, 0]] + elen); np.minimum.at(d, ed[:, 0], d[ed[:, 1]] + elen)
        fold = 0.55 * (1 - ss(d, 0, 0.10)) * (1 - ss(y, y_ap + 0.06, y_ap + 0.14)) * (xs > 0.03) * (y > hy)
        garm[side] = np.where(y < hy - 0.05, 1, np.maximum(g, fold))
        print(f'{side}: подмышка y {y_ap:.3f} x {x_ap:.3f}, рука ниже подмышки {reach.sum()} вершин')
    arm_cols = {side: [C[n] for n in names if n.startswith(side) and any(k in n for k in ('Arm', 'Hand'))] for side, _ in SIDES}
    removed = np.zeros(N)
    for side, _ in SIDES:
        for c in arm_cols[side]:
            removed += W[:, c] * (1 - garm[side]); W[:, c] *= garm[side]
    other = [c for c in range(len(names)) if c not in arm_cols['Left'] + arm_cols['Right']]
    osum = W[:, other].sum(1)
    prop = osum > 0.1  # есть свои кости туловища — раздаём им поровну с их долями, иначе позвоночнику по высоте
    W[np.ix_(prop, other)] *= ((osum + removed) / np.maximum(osum, 1e-9))[prop, None]
    give_spine(np.where(prop, 0, removed))
    # Ключица держит только верх плеча и трапецию; середину груди и спины — позвоночник.
    for side, s in SIDES:
        S = J[side + 'Arm']; c = C[side + 'Shoulder']
        keep = ss(s * x, 0.06, 0.13) * ss(y, S[1] - 0.06, S[1] + 0.01)
        give_spine(W[:, c] * (1 - keep)); W[:, c] *= keep
    # Шея — кости Neck, голова начинается от своего сустава; ниже нового сустава шеи — грудной отдел.
    H, Nk = J['Head'], J['Neck']
    f = (1 - ss(y, H[1] - 0.03, H[1] + 0.02)) * (np.abs(x) < 0.15)
    give_spine(W[:, C['Head']] * f); W[:, C['Head']] *= 1 - f
    f = 1 - ss(y, Nk[1] - 0.06, Nk[1])
    nw = W[:, C['Neck']] * f; W[:, C['Neck']] -= nw; give_spine(nw)
    # Сглаживание границ: туловище, плечи и шея, не дальше 6 см вглубь руки.
    reach = np.maximum(*(ss(s * x - s * J[side + 'Arm'][0], 0.06, 0.10) for side, s in SIDES))
    mask = ss(y, J['Hips'][1], J['Hips'][1] + 0.08) * (1 - ss(y, H[1] + 0.03, H[1] + 0.08)) * (1 - reach)
    smooth(mask, 16)


if '--no-clean' not in FLAGS: clean()


# 3. Скрутки. Плечо: скрутка у плечевого сустава держит верхнюю половину плеча, в коде она доворачивается обратно
#    (−0,6 прокрута плеча). Предплечье: скрутка на 2/3 длины, её доля растёт от 0 у локтя до 1 у запястья, в коде
#    она берёт 0,65 пронации кисти, а само предплечье не крутится.
def add_twists():
    global W, names
    activate(arm); bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    plan = []
    for side, _ in SIDES:
        for seg, child, h0, t0, share in (('Arm', 'ForeArm', 0.25, 0.5, lambda t: 1 - ss(t, 0.1, 0.65)),
                                          ('ForeArm', 'Hand', 0.66, 1.0, lambda t: ss(t, 0.15, 0.8))):
            par = eb[PRE + side + seg]; a, c = par.head.copy(), eb[PRE + side + child].head.copy()
            b = eb.new(PRE + side + seg + 'Twist')
            b.head, b.tail = a.lerp(c, h0), a.lerp(c, t0)
            b.align_roll(par.z_axis); b.parent = par; b.use_connect = False; b.use_deform = True
            plan.append((side + seg, side + seg + 'Twist', gl(a), gl(c), share))
    bpy.ops.object.mode_set(mode='OBJECT')
    for src, dst, a, c, share in plan:
        body.vertex_groups.new(name=PRE + dst); names.append(dst); C[dst] = len(names) - 1
        d = c - a; t = (P - a) @ d / (d @ d)
        W = np.hstack([W, (W[:, C[src]] * share(t))[:, None]]); W[:, C[src]] -= W[:, -1]


if '--no-twist' not in FLAGS: add_twists()

# 4. Не больше 4 влияний (столько читает three.js), сумма 1.
W[W < 1e-4] = 0
top = np.argsort(-W, 1)[:, :4]
W4 = np.zeros_like(W); np.put_along_axis(W4, top, np.take_along_axis(W, top, 1), 1)
W = W4 / W4.sum(1, keepdims=True)
Wv = W[wid]
for vg in list(body.vertex_groups): body.vertex_groups.remove(vg)
vgs = [body.vertex_groups.new(name=(PRE + n) if (PRE + n) in arm.data.bones else n) for n in names]
nz = np.nonzero(Wv)
for i, c in zip(*nz): vgs[c].add([int(i)], float(Wv[i, c]), 'REPLACE')
print('групп', len(vgs), 'вершин', NV, 'сшито', N)

bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_animations=False, export_influence_nb=4,
                          export_yup=True, export_def_bones=False, export_leaf_bone=False)
