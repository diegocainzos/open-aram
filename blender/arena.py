# Builds the whole static map (bridge lane, walls + lamps, fountains, the crystal abyss, bushes) -> client/public/models/arena.glb
# Run: blender -b --python blender/arena.py   (renders previews to $RIFT_PREVIEW, exports)
#
# World contract: 1 unit = 1 three.js unit, Blender (x, y, z) = three (x, z-up..., -z): three z = -Blender y.
# Lane top is exactly Z=0 over x in [-70, 70], |y| <= 9.6. Nothing but walls/lamps rises above Z=0 inside |y| < 10.
# Nodes: lane, walls, lamps, fountain_blue (x=-63), fountain_red (x=+63), abyss, crystals, bush0..bush3 (origin = bush rect centre).
# Materials: glow_* are emissive (client boosts them for bloom); fountains use glow_blue / glow_red (already team coloured, not team*).
import bpy, bmesh, math, os, random, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rift_common import *
import rift_common as rc

R = random.Random(7)

# ---------------------------------------------------------------- procedural textures (numpy, sRGB)
def tnoise(n, freq, rng):
    """Tileable value noise, n x n pixels, freq cells per side, smooth-step bilinear."""
    g = rng.random((freq, freq))
    t = np.arange(n) * freq / n
    i0 = t.astype(int); f = t - i0; f = f * f * (3 - 2 * f); i1 = (i0 + 1) % freq
    a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
    b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]

def stamp(mask, pts, r, n):
    for x, y in pts:
        x, y = int(x) % n, int(y) % n
        ys, xs = np.arange(y - r, y + r + 1) % n, np.arange(x - r, x + r + 1) % n
        mask[np.ix_(ys, xs)] = 1

def crack(rng, x, y, steps, n):
    a = rng.uniform(0, TAU); pts = []
    for _ in range(steps):
        a += rng.normal(0, 0.35); x += math.cos(a) * 3; y += math.sin(a) * 3; pts.append((x, y))
    return pts

def floor_tex(n=2048, tile=16.0, cells=11, seed=3):
    """Irregular flagstones (tileable Voronoi): per-stone value, lit/shadowed bevels, chipped edges, cracks, moss in the joints."""
    rng = np.random.default_rng(seed)
    pal = np.array([(0.66, 0.64, 0.70), (0.58, 0.56, 0.64), (0.73, 0.71, 0.75), (0.52, 0.51, 0.60), (0.66, 0.62, 0.60), (0.61, 0.60, 0.69)])
    c = n / cells
    jit = rng.uniform(0.15, 0.85, (cells, cells, 2))
    col = pal[rng.integers(0, len(pal), (cells, cells))] * rng.uniform(0.9, 1.07, (cells, cells, 1))
    Y, X = np.mgrid[0:n, 0:n].astype(np.float32)
    gx, gy = (X // c).astype(int), (Y // c).astype(int)
    d1 = np.full((n, n), 1e9, np.float32); d2 = d1.copy(); cid = np.zeros((n, n, 2), int); off = np.zeros((n, n, 2), np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx, cy = gx + dx, gy + dy; wx, wy = cx % cells, cy % cells
            px, py = (cx + jit[wy, wx, 0]) * c, (cy + jit[wy, wx, 1]) * c
            d = np.hypot(X - px, Y - py)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            d1 = np.where(closer, d, d1)
            cid[closer] = np.stack([wy, wx], -1)[closer]
            off[closer] = np.stack([X - px, Y - py], -1)[closer]
    edge = (d2 - d1) / 2                                     # ~ pixel distance to the joint
    img = col[cid[..., 0], cid[..., 1]]
    lo, hi, grain = tnoise(n, 6, rng), tnoise(n, 48, rng), rng.random((n, n))
    r = np.maximum(d1, 1)[..., None]
    lit = (-(off[..., 0] + off[..., 1]) / r[..., 0]) / 1.414  # +1 toward the top-left of each stone
    bevel = np.clip(1 - edge / 16, 0, 1)
    shade = 1 + 0.10 * (lo - 0.5) + 0.07 * (hi - 0.5) + 0.03 * (grain - 0.5) + 0.05 * np.clip(edge / 50, 0, 1)
    shade += bevel * np.where(lit > 0, 0.16 * lit, 0.26 * lit)
    img = img * shade[..., None]
    img[(edge < 20) & (hi * 0.6 + grain * 0.4 > 0.74)] *= 0.62  # chipped edges
    mask = np.zeros((n, n))
    for _ in range(26): stamp(mask, crack(rng, rng.uniform(0, n), rng.uniform(0, n), int(rng.integers(40, 110)), n), 1, n)
    img[(mask > 0) & (edge > 5)] *= 0.45
    moss = np.clip((tnoise(n, 5, rng) - 0.56) * 5, 0, 1) * np.clip(1 - edge / 30, 0, 1) * (0.6 + 0.4 * hi)
    img = img * (1 - moss[..., None] * 0.75) + np.array([0.36, 0.47, 0.25]) * moss[..., None] * 0.75
    j = edge < 4
    img[j] = np.array([0.15, 0.13, 0.19]) * (0.8 + 0.4 * lo[j])[:, None]  # joints
    return image("tex_floor", img)

def block_tex(n=512, seed=5):
    """One cut-stone face (mapped per face): worn bright top edge, dark chipped border, noise, one crack."""
    rng = np.random.default_rng(seed)
    Y, X = np.mgrid[0:n, 0:n]
    d = np.minimum(np.minimum(X, n - 1 - X), np.minimum(Y, n - 1 - Y))
    lo, hi, grain = tnoise(n, 4, rng), tnoise(n, 24, rng), rng.random((n, n))
    v = 0.82 + 0.12 * (lo - 0.5) + 0.08 * (hi - 0.5) + 0.03 * (grain - 0.5)
    v -= np.where(d < 30, 0.25 * (1 - d / 30), 0)
    v += np.where(Y < 22, 0.12 * (1 - Y / 22), 0)       # image top = face top after flip -> lit lip
    v[(d < 40) & (hi * 0.6 + grain * 0.4 > 0.72)] *= 0.7
    mask = np.zeros((n, n)); stamp(mask, crack(rng, n * 0.3, n * 0.2, 80, n), 1, n); v[mask > 0] *= 0.5
    img = v[..., None] * np.array([1.0, 0.98, 1.04])
    return image("tex_block", img)

# ---------------------------------------------------------------- geometry
def fillet_box(w, d, h, bev=0.08):
    bm = box(w, d, h, bev)
    return bm

def lane(mat_floor, mat_block):
    bm = box(140, 19.2, 1.6); bm.transform(Matrix.Translation((0, 0, -0.8)))
    o = rc.obj("lane", bm, mat_floor)
    for s in (-1, 1):  # cut the fountain discs out; they're separate coplanar meshes
        cut = rc.obj("cut", cyl(8.0, 8.0, 4, 64), mat_floor, loc=(63 * s, 0, 0))
        md = o.modifiers.new("b", "BOOLEAN"); md.operation = "DIFFERENCE"; md.object = cut; md.solver = "EXACT"
        bpy.context.view_layer.objects.active = o
        dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear(); old = o.data; o.data = me; bpy.data.meshes.remove(old); bpy.data.objects.remove(cut)
    bm = bmesh.new(); bm.from_mesh(o.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            c = l.vert.co
            l[uv].uv = (c.x / 16, c.y / 16) if f.normal.z > 0.5 else ((c.x + c.y) / 16, c.z / 16)
    bm.to_mesh(o.data); bm.free()
    parts = [o]
    # under-deck trim band + buttresses dropping into the abyss
    parts.append(rc.obj("trim", box(141, 20.2, 0.7, 0.12), mat_block, loc=(0, 0, -1.9)))
    for x in (-48, -24, 0, 24, 48):
        for s in (-1, 1):
            bm = lathe([(0.0, -16), (1.3, -16), (1.6, -8), (2.4, -3), (3.2, -2.2), (0.0, -2.2)], 8)
            rc.uv_box(bm, 3)
            parts.append(rc.obj("buttress", bm, mat_block, loc=(x, 6.5 * s, 0), rot=(0, 0, R.uniform(0, 1))))
        bm = box(4, 18, 3, 0.2); rc.uv_box(bm, 3)  # cross beam between the pair
        parts.append(rc.obj("beam", bm, mat_block, loc=(x, 0, -3.6)))
    for p in parts[1:]:
        if not p.data.uv_layers:
            bm = bmesh.new(); bm.from_mesh(p.data); rc.uv_face(bm); bm.to_mesh(p.data); bm.free()
    return rc.merge("lane", parts)

def walls(mat_block, mat_cap, mat_iron, mat_fire, mat_cyan):
    parts, lamps = [], []
    lamp_x = [-52.5 + 15 * i for i in range(8)]
    for s in (-1, 1):
        y = 9.75 * s
        x = -70.0
        while x < 70:
            L = R.uniform(1.4, 2.2); cx = x + L / 2; x += L + 0.06
            if any(abs(cx - lx) < 1.3 for lx in lamp_x): continue
            if R.random() < 0.1:  # broken: rubble instead of a block
                for _ in range(R.randint(1, 3)):
                    bm = box(R.uniform(0.4, 0.8), R.uniform(0.4, 0.7), R.uniform(0.3, 0.5), 0.06); rc.uv_face(bm)
                    parts.append(rc.obj("rubble", bm, mat_block, loc=(cx + R.uniform(-0.6, 0.6), y + R.uniform(-0.3, 0.3), 0.15),
                                        rot=(R.uniform(-0.3, 0.3), R.uniform(-0.3, 0.3), R.uniform(0, 3))))
                continue
            h = R.uniform(0.62, 0.82)
            bm = box(L - 0.08, 0.62, h, 0.07); rc.uv_face(bm)
            parts.append(rc.obj("block", bm, mat_block, loc=(cx, y + R.uniform(-0.04, 0.04), h / 2), rot=(0, 0, R.uniform(-0.03, 0.03))))
            if R.random() < 0.8:  # cap slab (missing on some = worn)
                bm = box(L + 0.02, 0.8, 0.16, 0.05); rc.uv_face(bm)
                parts.append(rc.obj("cap", bm, mat_cap, loc=(cx, y, h + 0.08), rot=(R.uniform(-0.03, 0.03), R.uniform(-0.04, 0.04), R.uniform(-0.04, 0.04))))
        for i, lx in enumerate(lamp_x):  # lamp pillars: alternate fire braziers and cyan crystal lamps
            bm = box(1.1, 1.1, 1.3, 0.1); rc.uv_face(bm); parts.append(rc.obj("pillar", bm, mat_block, loc=(lx, y, 0.65)))
            bm = box(1.35, 1.35, 0.2, 0.06); rc.uv_face(bm); parts.append(rc.obj("pcap", bm, mat_cap, loc=(lx, y, 1.4)))
            if (i + (s > 0)) % 2 == 0:
                lamps.append(rc.obj("bowl", lathe([(0.0, 0), (0.22, 0), (0.28, 0.25), (0.55, 0.45), (0.6, 0.62), (0.48, 0.6), (0.0, 0.5)], 12), mat_iron, loc=(lx, y, 1.5), smooth=True))
                for j in range(3):
                    a = j * TAU / 3 + R.uniform(0, 1)
                    lamps.append(rc.obj("flame", lathe([(0.0, 0), (0.3, 0.1), (0.22, 0.45), (0.0, 0.95)], 7), mat_fire,
                                        loc=(lx + 0.16 * math.cos(a), y + 0.16 * math.sin(a), 2.0), rot=(0.15 * math.sin(a), 0.15 * math.cos(a), a), scale=(1, 1, R.uniform(0.7, 1.1)), smooth=True))
                lamps.append(rc.obj("flame", lathe([(0.0, 0), (0.34, 0.12), (0.25, 0.5), (0.0, 1.25)], 7), mat_fire, loc=(lx, y, 2.0), smooth=True))
            else:
                lamps.append(rc.obj("socket", lathe([(0.0, 0), (0.45, 0), (0.5, 0.18), (0.3, 0.3), (0.0, 0.3)], 8), mat_iron, loc=(lx, y, 1.5)))
                for j, (dx, dy, t, h) in enumerate(((0, 0, 0, 1.3), (0.2, 0.1, 0.35, 0.8), (-0.18, 0.12, -0.4, 0.7), (0.05, -0.2, 0.3, 0.6))):
                    lamps.append(rc.obj("lampcrystal", crystal_bm(0.2, h), mat_cyan, loc=(lx + dx, y + dy, 1.62), rot=(t, -t * 0.5, R.uniform(0, 3))))
    # end walls behind the fountains
    for s in (-1, 1):
        for y in np.arange(-9.2, 9.3, 1.85):
            h = R.uniform(0.9, 1.2)
            bm = box(0.7, 1.8, h, 0.07); rc.uv_face(bm); parts.append(rc.obj("block", bm, mat_block, loc=(70.4 * s, y, h / 2)))
    return rc.merge("walls", parts), rc.merge("lamps", lamps)

def crystal_bm(r, h, sides=6):
    """Hexagonal crystal: prism body + pointed tip, base at z=0."""
    return lathe([(0.0, 0), (r * 0.8, 0), (r, h * 0.12), (r, h * 0.72), (0.0, h)], sides)

def fountain(name, s, mat_floor, mat_block, mat_glow, mat_dark):
    parts = []
    def annulus(r0, r1, a0, a1, segs):
        bm = bmesh.new()
        a = np.linspace(a0, a1, segs + 1)
        inner = [bm.verts.new((r0 * math.cos(t), r0 * math.sin(t), 0)) for t in a] if r0 > 0 else None
        outer = [bm.verts.new((r1 * math.cos(t), r1 * math.sin(t), 0)) for t in a]
        if inner is None:
            c = bm.verts.new((0, 0, 0))
            for i in range(segs): bm.faces.new((c, outer[i], outer[i + 1]))
        else:
            for i in range(segs): bm.faces.new((inner[i], outer[i], outer[i + 1], inner[i + 1]))
        return bm
    cx = 63 * s
    bm = annulus(0, 5.9, 0, TAU, 64); rc.uv_planar(bm, 16, (cx / 16, 0)); parts.append(rc.obj("disc", bm, mat_floor, loc=(cx, 0, 0)))
    n = 24
    for i in range(n):  # rune band: glowing glyph slabs between dark stone separators
        a0, a1 = i * TAU / n, (i + 1) * TAU / n
        bm = annulus(5.9, 6.2, a0, a1, 2); rc.uv_face(bm); parts.append(rc.obj("band", bm, mat_block, loc=(cx, 0, 0)))
        bm = annulus(6.2, 7.0, a0, a0 + (a1 - a0) * 0.2, 1); parts.append(rc.obj("sep", bm, mat_dark, loc=(cx, 0, 0)))
        bm = annulus(6.2, 7.0, a0 + (a1 - a0) * 0.2, a1, 3); parts.append(rc.obj("rune", bm, mat_glow if i % 3 else mat_dark, loc=(cx, 0, 0)))
        bm = annulus(7.0, 8.0, a0, a1, 3); rc.uv_face(bm); parts.append(rc.obj("rim", bm, mat_block, loc=(cx, 0, 0)))
    bm = annulus(1.6, 1.9, 0, TAU, 48); parts.append(rc.obj("inner", bm, mat_glow, loc=(cx, 0, 0)))
    for p in parts:
        if not p.data.uv_layers:
            bm = bmesh.new(); bm.from_mesh(p.data); rc.uv_face(bm); bm.to_mesh(p.data); bm.free()
    return rc.merge(name, parts)

# ---------------------------------------------------------------- abyss
def abyss(rocks, crystals, mats, mat_cyan, mat_violet, mat_floor_abyss):
    """rocks: list of (mesh, height); mats: (near, mid, far) rock materials. Rocks are placed by their TOP height."""
    parts, glow, variants = [], [], {}
    def rock(x, y, top, size, zmul=1.0, tier=0, big=True, tilt=0.2, flip=False):
        if abs(y) < 12.5 and abs(x) < 72: top = min(top, -1.0)  # never poke through / above the lane
        me, h = R.choice([r for r in rocks if r[1] > 0.8] if big else rocks)
        key = (me.name, tier)
        if key not in variants:
            v = me.copy(); v.materials.clear(); v.materials.append(mats[tier]); variants[key] = v
        o = bpy.data.objects.new("rock", variants[key]); rc.COLL.objects.link(o)
        sz = size * zmul / h * (-1 if flip else 1)  # normalise every rock to height size*zmul
        o.location = (x, y, top if flip else top - abs(sz) * h)
        o.rotation_euler = (R.uniform(-tilt, tilt), R.uniform(-tilt, tilt), R.uniform(0, TAU))
        o.scale = (size, size, sz)
        parts.append(o)
    def cluster(x, y, z, size, mat=None, n=None):
        mat = mat or (mat_cyan if R.random() < 0.6 else mat_violet)
        for i in range(n or R.randint(3, 5)):
            h = size * (1 if i == 0 else R.uniform(0.35, 0.75)); a = R.uniform(0, TAU); d = 0 if i == 0 else size * R.uniform(0.12, 0.3)
            o = bpy.data.objects.new("crystal", R.choice(crystals).copy()); rc.COLL.objects.link(o)
            o.location = (x + d * math.cos(a), y + d * math.sin(a), z)
            o.rotation_euler = (R.uniform(-0.5, 0.5) * (i > 0), R.uniform(-0.5, 0.5) * (i > 0), R.uniform(0, TAU))
            o.scale = (h * 0.8, h * 0.8, h)
            o.data.materials.clear(); o.data.materials.append(mat)
            glow.append(o)
    for s in (-1, 1):
        # tier 0: cliff lip right under the bridge edges (lit, detailed), crystals growing out of it
        x = -80.0
        while x < 80:  # three stepped rows falling away from the deck edge
            for k, (y0, y1, t0, t1) in enumerate(((11.5, 14, -3.5, -1.2), (15, 19, -11, -6))):
                sz = R.uniform(3.5, 5.5) + k; y = s * R.uniform(y0, y1); top = R.uniform(t0, t1)
                rock(x + R.uniform(-1, 1), y, top, sz, R.uniform(1.4, 2.2), tier=min(k, 1))
                if R.random() < (0.3 if k == 0 else 0.4): cluster(x + R.uniform(-1.5, 1.5), y, top - 0.4, R.uniform(1.4, 2.6) + k * 0.6)
            x += R.uniform(3.2, 5.0)
        # tier 1: deeper ledge
        x = -85.0
        while x < 85:
            sz = R.uniform(6, 10); y = s * R.uniform(22, 30); top = R.uniform(-12, -5)
            rock(x, y, top, sz, R.uniform(1.2, 2.0), tier=1)
            if R.random() < 0.5: cluster(x + R.uniform(-1, 1), y - s * R.uniform(0, 1.5), top - 0.5, R.uniform(2.5, 4.5))
            x += R.uniform(7, 11)
        # floating islands with crystals
        for i in range(6):
            x = R.uniform(-75, 75); y = s * R.uniform(24, 36); z = R.uniform(-9, -2); sz = R.uniform(1.8, 3.4)
            rock(x, y, z, sz, 0.5, tilt=0.1, big=False)
            rock(x, y, z - 0.2 * sz, sz * 0.85, 1.4, tilt=0.1, flip=True)  # hanging underside
            if R.random() < 0.75: cluster(x, y, z - 0.2, sz * R.uniform(0.6, 1.0))
        # tier 2: far silhouettes (mesas rising out of the depths)
        for i in range(16):
            x = R.uniform(-120, 120); y = s * R.uniform(42, 80); sz = R.uniform(14, 24); top = R.uniform(-14, -2)
            rock(x, y, top, sz, R.uniform(0.9, 1.4), tier=2, tilt=0.05)
            if R.random() < 0.6: cluster(x + R.uniform(-3, 3), y, top - 0.8, R.uniform(4, 8), mat_violet)
    # deep: rocks and big crystals under the deck
    for x in np.arange(-66, 67, 9):
        rock(x + R.uniform(-3, 3), R.uniform(-8, 8), R.uniform(-26, -18), R.uniform(5, 9), 1.2, tier=1)
        cx, cy, ct = x + R.uniform(-4, 4), R.choice((-1, 1)) * R.uniform(4, 12), R.uniform(-30, -20)
        rock(cx, cy, ct, R.uniform(4, 6), 0.9, tier=1); cluster(cx, cy, ct - 0.5, R.uniform(3, 6))
    for i in range(10):
        cx, cy, ct = R.uniform(-90, 90), R.choice((-1, 1)) * R.uniform(12, 40), R.uniform(-50, -38)
        rock(cx, cy, ct, R.uniform(9, 14), 1.0, tier=2); cluster(cx, cy, ct - 0.8, R.uniform(8, 14))
    # the cliffs the bridge ends are anchored on, and crags behind the fountains
    for s in (-1, 1):
        for i in range(10):
            a = R.uniform(-1.4, 1.4); d = R.uniform(3, 10)
            rock(66 * s + s * d * math.cos(a), d * math.sin(a) * 1.3, R.uniform(-6, -2), R.uniform(6, 9), R.uniform(1.4, 2.2))
        for i in range(8):
            y = R.uniform(-24, 24); x = s * R.uniform(74, 88); top = R.uniform(-1, 4) if abs(y) > 11 else R.uniform(-3, -1)
            rock(x, y, top, R.uniform(4, 7), R.uniform(1.5, 2.5))
            if R.random() < 0.6: cluster(x, y, top - 0.6, R.uniform(2, 3.5))
    # floor: elliptical rings stepping from a violet glow under the bridge to near-black at the rim (lost in the fog)
    # ponytail: stepped rings instead of a gradient texture (texture budget is 4); vertex colours if the steps ever show
    steps = len(mat_floor_abyss); radii = [0] + [30 * (1.28 ** k) for k in range(steps)]
    for k in range(steps):
        bm = bmesh.new(); a = np.linspace(0, TAU, 65)[:-1]; r0, r1 = radii[k], radii[k + 1]
        vi = [bm.verts.new((r0 * math.cos(t), 0.45 * r0 * math.sin(t), 0)) for t in a] if r0 else [bm.verts.new((0, 0, 0))]
        vo = [bm.verts.new((r1 * math.cos(t), 0.45 * r1 * math.sin(t), 0)) for t in a]
        for i in range(64):
            j = (i + 1) % 64
            bm.faces.new((vi[0], vo[i], vo[j]) if not r0 else (vi[i], vo[i], vo[j], vi[j]))
        parts.append(rc.obj("floor", bm, mat_floor_abyss[k], loc=(0, 0, -60)))
    return rc.merge("abyss", parts), rc.merge("crystals", glow)

def runes(mat_glow, mat_dark):
    """Glowing rune circle inlaid (0.01 above the deck) under the centre guardian, plus small glyph rings along the lane."""
    parts = []
    def ring(cx, r0, r1, n, fill=0.7, z=0.01, mat=mat_glow):
        for i in range(n):
            a0 = i * TAU / n; a1 = a0 + TAU / n * fill
            k = max(3, int((a1 - a0) * r1 * 3)); bm = bmesh.new(); a = np.linspace(a0, a1, k + 1)
            vi = [bm.verts.new((cx + r0 * math.cos(t), r0 * math.sin(t), z)) for t in a]
            vo = [bm.verts.new((cx + r1 * math.cos(t), r1 * math.sin(t), z)) for t in a]
            for j in range(k): bm.faces.new((vi[j], vo[j], vo[j + 1], vi[j + 1]))
            parts.append(rc.obj("rune", bm, mat))
    ring(0, 3.6, 3.9, 1, 1.0)
    ring(0, 3.0, 3.45, 16, 0.6)
    ring(0, 1.2, 1.4, 1, 1.0)
    ring(0, 2.1, 2.2, 1, 1.0)
    for i in range(6):  # spokes between the inner rings + diamond glyphs in the outer band
        a = i * TAU / 6; bm = box(0.65, 0.1, 0.01); parts.append(rc.obj("rune", bm, mat_glow, loc=(1.75 * math.cos(a), 1.75 * math.sin(a), 0.01), rot=(0, 0, a)))
        b = a + TAU / 12; bm = box(0.32, 0.32, 0.01); parts.append(rc.obj("rune", bm, mat_glow, loc=(2.65 * math.cos(b), 2.65 * math.sin(b), 0.01), rot=(0, 0, b + math.pi / 4)))
    return rc.merge("runes", parts)

def bushes(src):
    rects = [((-6, 7), 5, 3.5), ((6, -7), 5, 3.5), ((-20, -7), 4, 3.5), ((20, 7), 4, 3.5)]  # three (x, z) -> Blender (x, -z)
    out = []
    for k, ((cx, cy), w, d) in enumerate(rects):
        pts = [(u, v) for u in np.linspace(-w / 2 + 0.9, w / 2 - 0.9, 3) for v in (-d / 2 + 0.8, d / 2 - 0.8)]
        pts += [(R.uniform(-w / 4, w / 4), 0) for _ in range(2 if w > 4.5 else 1)]
        objs = []
        for u, v in pts:
            o = bpy.data.objects.new("b", src); rc.COLL.objects.link(o)
            s = R.uniform(1.15, 1.4)
            o.location = (cx + u + R.uniform(-0.2, 0.2), cy + v + R.uniform(-0.15, 0.15), -0.05); o.rotation_euler = (0, 0, R.uniform(0, TAU)); o.scale = (s * 1.05, s, s * R.uniform(1.4, 1.7))
            objs.append(o)
        b = rc.merge(f"bush{k}", objs)
        b.data.transform(Matrix.Translation((-cx, -cy, 0))); b.location = (cx, cy, 0)
        out.append(b)
    return out

# ---------------------------------------------------------------- main
def main():
    rc.reset()
    t_floor, t_block = floor_tex(), block_tex()
    # sources
    rock_src = rc.load("rocks")
    t_rock = rock_src[0].data.materials[0].node_tree.nodes["Image Texture"].image if any(n.type == "TEX_IMAGE" for n in rock_src[0].data.materials[0].node_tree.nodes) else None
    t_rock = next(n.image for n in rock_src[0].data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    rocks = []
    for o in rock_src:  # recentre every rock on its footprint, keep the mesh, drop the object
        me = o.data; lo, hi = rc.bounds([o])
        me.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
        s = 1 / max(hi.x - lo.x, hi.y - lo.y); me.transform(Matrix.Scale(s, 4))
        rocks.append((me, (hi.z - lo.z) * s)); bpy.data.objects.remove(o)
    cry = []
    for sides, r in ((6, 0.2), (5, 0.24), (4, 0.18), (6, 0.15)):  # unit-height crystal shapes
        o = rc.obj("c", crystal_bm(r, 1.0, sides), nmat("tmp")); cry.append(o.data); bpy.data.objects.remove(o)
    bush_src = rc.load("bush")[0]
    bmat = bush_src.data.materials[0]; print("bush mat", bmat.name, bmat.surface_render_method, [n.type for n in bmat.node_tree.nodes])
    lo, hi = rc.bounds([bush_src]); bush_src.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    t_bush = next(n.image for n in bmat.node_tree.nodes if n.type == "TEX_IMAGE")
    bush_me = bush_src.data; bpy.data.objects.remove(bush_src)
    bush_me.materials.clear(); bush_me.materials.append(nmat("bush", 0xd8ffd0, tex=t_bush, clip=True))
    for m in list(bpy.data.materials):
        if m.users == 0: bpy.data.materials.remove(m)
    # materials
    floor = nmat("stone_floor", 0xffffff, tex=t_floor)
    block = nmat("stone_block", 0xb4aebf, tex=t_block)
    cap = nmat("stone_cap", 0xd8d2dc, tex=t_block)
    iron = nmat("iron", 0x3b3544, rough=0.5)
    fire = nmat("glow_fire", 0xffc060, emit=0xff8a20)
    cyan = nmat("glow_cyan", 0x8ff6ff, emit=0x30d8ff)
    violet = nmat("glow_violet", 0xd08cff, emit=0x9040ff)
    rmats = (nmat("rock", 0xc4bce0, tex=t_rock), nmat("rock_mid", 0x9a90b8, tex=t_rock), nmat("rock_far", 0x7a70a4, tex=t_rock))
    glo, dark = np.array((0x7a, 0x4f, 0xc0)), np.array((0x10, 0x0a, 0x1e))
    deep = []
    for k in range(10):  # 10 rings lerped glow -> dark
        r, g, b = (glo + (dark - glo) * (k / 9) ** 0.8).astype(int); c = (r << 16) | (g << 8) | b
        deep.append(nmat(f"abyss{k}", c, emit=c, strength=0.35))
    # build
    lane(floor, block)
    walls(block, cap, iron, fire, cyan)
    fountain("fountain_blue", -1, floor, block, nmat("glow_blue", 0x7ab8ff, emit=0x3a8cff), nmat("stone_dark", 0x3a3548))
    fountain("fountain_red", 1, floor, block, nmat("glow_red", 0xff8a8a, emit=0xff4545), nmat("stone_dark", 0x3a3548))
    abyss(rocks, cry, rmats, cyan, violet, deep)
    runes(violet, nmat("stone_dark", 0x3a3548))
    bushes(bush_me)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes: print("BB", o.name, [tuple(round(x, 1) for x in v) for v in rc.bounds([o])])
    print("ROCKH", [(m.name, round(h, 2), [round(d, 2) for d in m.vertices[0].co]) for m, h in rocks])
    print("TRIS", rc.tris(meshes), {o.name: rc.tris([o]) for o in meshes})
    # previews (with scale markers: a champion capsule + tower/nexus stand-ins, removed before export)
    rc.lights()
    mk = nmat("marker", 0xff3355)
    marks = [rc.obj("mk", capsule(0.45, 0.9), mk, loc=(0, -2, 0.9)), rc.obj("mk", capsule(0.45, 0.9), mk, loc=(-40, 3, 0.9))]
    for x in (-24, -40, 24, 40): marks.append(rc.obj("mk", cyl(1.4, 1.2, 9.5, 12), nmat("marker2", 0x9999aa), loc=(x, 0, 4.75)))
    rc.shot("arena_mid", (0, 0, 0))
    rc.shot("arena_edge", (-12, 7, 0))
    rc.shot("arena_base", (-56, 0, 0))
    rc.shot("arena_over", (0, 0, -10), dist=130, pitch=48, yaw=20)
    for o in marks: bpy.data.objects.remove(o)
    rc.export("arena")

if __name__ == "__main__": rc.run(main)
