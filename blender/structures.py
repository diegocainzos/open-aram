# Builds the lane structures + neutral props -> client/public/models/structures.glb
# Run: blender -b --python blender/structures.py
#
# Root nodes (each centred at the origin, facing -Y = toward the enemy, team-neutral):
#   tower (child "crystal"), inhib (child "core"), nexus (child "core" + "piece0".."piece7"), shop, guardian, relic (child "gem").
# Materials: team* = tinted to the team colour at runtime (light neutral base); glow* = emissive (boosted for bloom);
#   team_glow* = both (team crystals).
import bpy, bmesh, math, os, random, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rift_common import *
import rift_common as rc

R = random.Random(11)

def mats():
    return dict(
        stone=nmat("stone", 0xc8c1b4), stone_dark=nmat("stone_dark", 0x5d5a72), gold=nmat("gold", 0xe0a93e, rough=0.4),
        iron=nmat("iron", 0x3d3848, rough=0.5), cloth=nmat("team_cloth", 0xf2f2f2), trim=nmat("team_trim", 0xd9d9e0),
        crystal=nmat("team_glow_crystal", 0xffffff, emit=0xe8f0ff), ring=nmat("team_glow_ring", 0xffffff, emit=0xd0e0ff),
        eyes=nmat("glow_eyes", 0xfff2b0, emit=0xffd060), cyan=nmat("glow_cyan", 0x8ff6ff, emit=0x30d8ff),
        violet=nmat("glow_violet", 0xd08cff, emit=0x9040ff), green=nmat("glow_heal", 0x9dffb0, emit=0x2dff6a),
        skin=nmat("skin", 0xe8b890), wood=nmat("wood", 0x7a5334), beard=nmat("beard", 0xe8e4dc), robe=nmat("robe", 0x5b3f8f))

def crystal_bm(r, h, sides=6, tip=0.28):
    """Bipyramid crystal centred on z=0 (for floating cores)."""
    return lathe([(0.0, -h / 2), (r, -h / 2 + h * tip), (r, h / 2 - h * tip), (0.0, h / 2)], sides)

def recentre(o, anchor="centre"):
    lo, hi = rc.bounds([o]); c = (lo + hi) / 2
    if anchor == "bottom": c.z = lo.z
    o.data.transform(Matrix.Translation(-c)); o.location = c
    return o

# ---------------------------------------------------------------- tower (Sketchfab LoL turret, re-materialised)
def tower(m):
    root = empty("tower")
    parts = {}
    for o in rc.load("tower"):
        if o.name.startswith("Plane"): bpy.data.objects.remove(o)  # baked-light cards
        else: parts[o.data.materials[0].name] = o
    S = 9.5 / 14.0
    remap = {"Base_Metal": m["stone_dark"], "Glow_Base": m["ring"], "Stone_Metal": m["stone"], "Stone_Bronze": m["gold"],
             "Red_Cloth": m["cloth"], "Red_Tower_Gem": m["crystal"], "Glow_Tower": m["eyes"]}
    ratio = {"Stone_Metal": 0.22, "Base_Metal": 0.25, "Stone_Bronze": 0.3, "Red_Cloth": 0.4}
    out = []
    for name, o in parts.items():
        o.data.transform(Matrix.Scale(S, 4))
        if name in ("Base_Metal", "Glow_Base"): o.data.transform(Matrix.Diagonal((0.62, 0.62, 1, 1)))  # footprint ~1.8
        o.data.materials.clear(); o.data.materials.append(remap[name])
        rc.decimate(o, ratio.get(name, 1))
        out.append(o)
    # split the floating gem off the staff: faces above the staff head
    gem_src = parts["Red_Tower_Gem"]
    bm = bmesh.new(); bm.from_mesh(gem_src.data)
    zs = sorted(v.co.z for v in bm.verts)
    top = [f for f in bm.faces if f.calc_center_median().z > 8.05]
    gbm = bmesh.new()
    vm = {}
    for f in top:
        gbm.faces.new([vm.setdefault(v.index, gbm.verts.new(v.co)) for v in f.verts])
    bmesh.ops.delete(bm, geom=top, context="FACES")
    bm.to_mesh(gem_src.data); bm.free()
    gem_src.data.materials.clear(); gem_src.data.materials.append(m["gold"])  # staff remains gold
    body = rc.merge("tower_body", out, root)
    gem = rc.obj("crystal", gbm, m["crystal"], root, smooth=False)
    recentre(gem)
    print("tower gem at", tuple(round(x, 2) for x in gem.location), "tris", rc.tris([body, gem]))
    return root

# ---------------------------------------------------------------- inhibitor
def inhib(m):
    root = empty("inhib")
    p = []
    p.append(rc.obj("base", lathe([(0.0, 0), (1.75, 0), (1.75, 0.18), (1.55, 0.3), (1.35, 0.3), (1.3, 0.55), (0.0, 0.55)], 8), m["stone_dark"], root))
    p.append(rc.obj("trim", torus(1.42, 0.07, 32, 6), m["gold"], root, loc=(0, 0, 0.32)))
    p.append(rc.obj("ring", lathe([(0.9, 0.56), (1.2, 0.56), (1.2, 0.6), (0.9, 0.6)], 24, caps=False), m["ring"], root))
    for i in range(4):  # four curved stone claws holding the core
        a = i * TAU / 4 + TAU / 8
        for k, (r, z, h, t) in enumerate(((1.15, 0.55, 1.0, 0.12), (1.0, 1.45, 0.9, -0.35), (0.72, 2.2, 0.6, -0.75))):
            bm = box(0.34 - k * 0.06, 0.3 - k * 0.05, h, 0.05)
            p.append(rc.obj("claw", bm, m["stone"], root, loc=(r * math.cos(a), r * math.sin(a), z + h / 2 * 0.8), rot=(0, t, a)))
        p.append(rc.obj("tip", crystal_bm(0.1, 0.4, 4), m["gold"], root, loc=(0.55 * math.cos(a), 0.55 * math.sin(a), 2.7), rot=(0, -1.0, a)))
    p.append(rc.obj("halo", torus(0.62, 0.05, 28, 6), m["gold"], root, loc=(0, 0, 1.9), rot=(0.3, 0, 0)))
    body = rc.merge("inhib_body", p, root)
    core = rc.obj("core", crystal_bm(0.42, 1.25, 6), m["crystal"], root); core.location = (0, 0, 1.9)
    for s in (-1, 1): rc.obj("shard", crystal_bm(0.12, 0.4, 4), m["crystal"], core, loc=(0.7 * s, 0, 0.1), rot=(0, 0.4 * s, 0))
    return root

# ---------------------------------------------------------------- nexus
def nexus(m):
    root = empty("nexus")
    base = [rc.obj("t0", lathe([(0.0, 0), (3.2, 0), (3.2, 0.35), (2.95, 0.5), (0.0, 0.5)], 12), m["stone_dark"], root),
            rc.obj("t1", lathe([(0.0, 0.5), (2.55, 0.5), (2.55, 0.9), (2.35, 1.05), (0.0, 1.05)], 12), m["stone"], root),
            rc.obj("tr0", torus(2.95, 0.09, 48, 6), m["gold"], root, loc=(0, 0, 0.5)),
            rc.obj("tr1", torus(2.4, 0.08, 40, 6), m["gold"], root, loc=(0, 0, 1.05)),
            rc.obj("rune", lathe([(1.9, 1.06), (2.2, 1.06), (2.2, 1.08), (1.9, 1.08)], 36, caps=False), m["ring"], root),
            rc.obj("dais", lathe([(0.0, 1.05), (1.5, 1.05), (1.25, 1.5), (0.0, 1.5)], 8), m["stone_dark"], root),
            rc.obj("cup", lathe([(0.3, 1.5), (0.9, 1.7), (1.25, 2.1), (1.15, 2.15), (0.8, 1.8), (0.3, 1.7)], 8), m["gold"], root, smooth=True)]
    rc.merge("nexus_base", base, root)
    pieces = []
    for i in range(6):  # pillars with crystal tips: the chunks flung when the nexus dies
        a = i * TAU / 6 + TAU / 12; x, y = 2.75 * math.cos(a), 2.75 * math.sin(a)
        pp = [rc.obj("col", box(0.55, 0.55, 2.0, 0.06), m["stone"], None, loc=(0, 0, 1.0), rot=(0, 0, a)),
              rc.obj("cap", box(0.75, 0.75, 0.22, 0.05), m["gold"], None, loc=(0, 0, 2.1), rot=(0, 0, a)),
              rc.obj("tipc", crystal_bm(0.2, 0.9, 5), m["crystal"], None, loc=(0, 0, 2.6))]
        pc = rc.merge(f"piece{i}", pp, root)
        pc.data.transform(Matrix.Translation((0, 0, -1.2))); pc.location = (x, y, 0.5 + 1.2)
        pieces.append(pc)
    for i in range(2):  # two floating gold arcs around the core
        bm = torus(1.55, 0.09, 40, 6, arc=0.42)
        pc = rc.obj(f"piece{6 + i}", bm, m["gold"], root, rot=(0.35, 0, i * math.pi + 0.4))
        pc.data.transform(Matrix.Translation((0, 0, 0))); pc.location = (0, 0, 3.6)
    core = rc.obj("core", crystal_bm(0.95, 2.6, 6, 0.3), m["crystal"], root); core.location = (0, 0, 3.95)
    for k in range(3):  # orbiting shards ride the core
        a = k * TAU / 3
        rc.obj("shard", crystal_bm(0.16, 0.6, 4), m["crystal"], core, loc=(1.35 * math.cos(a), 1.35 * math.sin(a), -0.3), rot=(0, 0.3, a))
    return root

# ---------------------------------------------------------------- shop (Sketchfab merchant hut + procedural shopkeeper)
def brighten(img, gain=1.3, sat=1.1):
    px = np.array(img.pixels[:], np.float32).reshape(-1, 4)
    rgb = px[:, :3] ** (1 / 2.2)
    g = rgb.mean(1, keepdims=True); rgb = np.clip((g + (rgb - g) * sat) * gain, 0, 1)
    px[:, :3] = rgb ** 2.2
    img.pixels.foreach_set(px.ravel()); img.pack()

def shop(m):
    root = empty("shop")
    hut = rc.load("shop")[0]
    lo, hi = rc.bounds([hut]); s = 3.4 / (hi.z - lo.z)
    hut.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))); hut.data.transform(Matrix.Scale(s, 4))
    rc.decimate(hut, 0.35)
    mt = hut.data.materials[0]; mt.name = "shop_hut"
    img = next(n.image for n in mt.node_tree.nodes if n.type == "TEX_IMAGE"); brighten(img)
    hut.name = "shop_hut"; hut.parent = root
    # shopkeeper: gnome-ish merchant in a purple robe with a lantern staff, standing at the counter's left
    k = []
    X, Y = -1.1, -2.1
    k.append(rc.obj("robe", lathe([(0.0, 0), (0.42, 0), (0.36, 0.5), (0.26, 0.85), (0.0, 0.9)], 12), m["robe"], None, loc=(X, Y, 0), smooth=True))
    k.append(rc.obj("belt", torus(0.3, 0.045, 16, 6), m["gold"], None, loc=(X, Y, 0.55)))
    k.append(rc.obj("head", sphere(0.2, 14, 10), m["skin"], None, loc=(X, Y, 1.02), smooth=True))
    k.append(rc.obj("nose", sphere(0.07, 8, 6), m["skin"], None, loc=(X, Y - 0.2, 1.0), smooth=True))
    k.append(rc.obj("beard", lathe([(0.0, 0.45), (0.12, 0.5), (0.2, 0.75), (0.17, 0.95), (0.0, 0.97)], 10), m["beard"], None, loc=(X, Y - 0.1, 0), smooth=True))
    k.append(rc.obj("hat", lathe([(0.0, 1.1), (0.4, 1.1), (0.38, 1.15), (0.2, 1.2), (0.05, 1.7), (0.0, 1.72)], 12), m["robe"], None, loc=(X, Y, 0), rot=(0.25, 0.2, 0), smooth=True))
    for sx in (-1, 1): k.append(rc.obj("eye", sphere(0.03, 6, 5), m["eyes"], None, loc=(X + 0.07 * sx, Y - 0.18, 1.07)))
    k.append(rc.obj("staff", cyl(0.035, 0.035, 1.9, 6), m["wood"], None, loc=(X + 0.42, Y - 0.05, 0.95)))
    k.append(rc.obj("hand", sphere(0.07, 8, 6), m["skin"], None, loc=(X + 0.4, Y - 0.08, 0.95)))
    k.append(rc.obj("lantern", crystal_bm(0.12, 0.3, 6, 0.3), m["eyes"], None, loc=(X + 0.42, Y - 0.05, 2.0)))
    k.append(rc.obj("pack", box(0.45, 0.3, 0.55, 0.06), m["wood"], None, loc=(X, Y + 0.3, 0.72)))
    rc.merge("shopkeeper", k, root)
    return root

# ---------------------------------------------------------------- guardian (rock golem around the Crystal Golem Heart)
def guardian(m):
    root = empty("guardian")
    rock_src = rc.load("rocks")
    t_rock = next(n.image for n in rock_src[0].data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    rmat = nmat("rock", 0xf0ecff, tex=t_rock)
    rocks = []
    for o in rock_src:
        lo, hi = rc.bounds([o]); me = o.data
        me.transform(Matrix.Translation(-(lo + hi) / 2)); d = hi - lo
        me.transform(Matrix.Diagonal((1 / d.x, 1 / d.y, 1 / d.z, 1)))  # unit cube-ish chunk, centred
        me.materials.clear(); me.materials.append(rmat)
        bpy.data.objects.remove(o); rocks.append(me)
    big = [me for me in rocks if len(me.polygons) > 100]
    body = []
    def chunk(loc, size, rot=(0, 0, 0), pool=big):
        o = bpy.data.objects.new("r", R.choice(pool)); rc.COLL.objects.link(o)
        o.location, o.scale, o.rotation_euler = loc, size, rot
        body.append(o)
    for s in (-1, 1):
        chunk((0.55 * s, 0, 0.55), (0.75, 0.75, 1.1), (0, 0, R.uniform(0, 3)))               # legs
        chunk((0.6 * s, -0.12, 0.12), (0.85, 1.0, 0.35))                                       # feet
        chunk((1.35 * s, 0.05, 3.05), (1.2, 1.1, 1.0), (0, 0.3 * s, R.uniform(0, 3)))          # shoulders
        chunk((1.65 * s, -0.05, 2.1), (0.7, 0.7, 1.3), (0, -0.15 * s, 0))                        # upper arm
        chunk((1.75 * s, -0.2, 1.0), (0.95, 0.95, 1.0), (0.2, 0, R.uniform(0, 3)))              # fists
    chunk((0, 0.05, 1.45), (1.6, 1.1, 0.8))                                                      # pelvis
    chunk((0, 0.25, 2.45), (2.3, 1.5, 1.9), (0, 0, 0.2))                                        # torso
    chunk((0, -0.25, 3.45), (0.75, 0.7, 0.6), (0.2, 0, 0.3))                                    # head
    rc.merge("guardian_body", body, root)
    glow = []
    for s in (-1, 1):
        glow.append(rc.obj("eye", sphere(0.08, 8, 6), m["eyes"], None, loc=(0.17 * s, -0.58, 3.5)))
        for i in range(4):  # crystal clusters on the shoulders and back
            h = R.uniform(0.6, 1.2)
            glow.append(rc.obj("cr", lathe([(0.0, 0), (0.13, 0), (0.16, h * 0.15), (0.16, h * 0.72), (0.0, h)], 6), m["cyan"] if i % 2 else m["violet"], None,
                               loc=(s * R.uniform(1.1, 1.6), R.uniform(-0.1, 0.5), 3.4), rot=(R.uniform(-0.4, 0.4), s * R.uniform(0.2, 0.7), R.uniform(0, 3))))
    for i in range(3):
        h = R.uniform(0.9, 1.4)
        glow.append(rc.obj("cr", lathe([(0.0, 0), (0.16, 0), (0.2, h * 0.15), (0.2, h * 0.72), (0.0, h)], 6), m["violet"], None,
                           loc=(R.uniform(-0.6, 0.6), 0.9, 2.9), rot=(R.uniform(0.2, 0.6), R.uniform(-0.4, 0.4), R.uniform(0, 3))))
    rc.merge("guardian_crystals", glow, root)
    heart = rc.load("guardian")[0]
    lo, hi = rc.bounds([heart]); heart.data.transform(Matrix.Translation(-(lo + hi) / 2))
    heart.data.transform(Matrix.Scale(1.25 / max(hi - lo), 4))
    rc.decimate(heart, 0.35)
    hm = heart.data.materials[0]; hm.name = "glow_heart"
    b = hm.node_tree.nodes["Principled BSDF"]
    if not b.inputs["Emission Color"].links: b.inputs["Emission Color"].default_value = rgba(0xff2266)
    b.inputs["Emission Strength"].default_value = 0.6
    heart.name = "heart"; heart.parent = root; heart.location = (0, -0.55, 2.45); heart.rotation_euler = (0, 0, math.pi)
    return root

# ---------------------------------------------------------------- health relic
def relic(m):
    root = empty("relic")
    p = [rc.obj("disc", lathe([(0.0, 0), (0.75, 0), (0.7, 0.08), (0.0, 0.08)], 16), m["stone_dark"], root),
         rc.obj("ring", lathe([(0.5, 0.085), (0.62, 0.085), (0.62, 0.095), (0.5, 0.095)], 24, caps=False), m["green"], root)]
    for i in range(4):
        a = i * TAU / 4
        p.append(rc.obj("pip", box(0.12, 0.12, 0.02), m["green"], root, loc=(0.35 * math.cos(a), 0.35 * math.sin(a), 0.09), rot=(0, 0, a + 0.78)))
    rc.merge("relic_base", p, root)
    gem = rc.obj("gem", crystal_bm(0.2, 0.55, 6), m["green"], root); gem.location = (0, 0, 0.72)
    rc.obj("band", torus(0.24, 0.025, 18, 4), m["gold"], gem)
    return root

def main():
    rc.reset()
    m = mats()
    roots = [tower(m), inhib(m), nexus(m), shop(m), guardian(m), relic(m)]
    for mt in list(bpy.data.materials):
        if mt.users == 0: bpy.data.materials.remove(mt)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for r in roots: print("ROOT", r.name, rc.tris([o for o in r.children_recursive if o.type == "MESH"]), [c.name for c in r.children])
    print("TRIS", rc.tris(meshes))
    # preview: lined up on a stone floor, game camera
    rc.lights()
    xs = [-9, -3.5, 3, 10, -16, 15]
    for r, x in zip(roots, xs): r.location.x = x
    fl = rc.obj("floor", box(60, 20, 0.2), nmat("pfloor", 0x8a8698), loc=(0, 0, -0.1))
    mk = rc.obj("mk", capsule(0.45, 0.9), nmat("marker", 0xff3355), loc=(-6, -3, 0.9))
    rc.shot("structures_game", (0, 0, 1.5), dist=30)
    rc.shot("structures_low", (0, 0, 3), dist=26, pitch=18)
    rc.shot("st_tower", (-9, 0, 4.5), dist=15, pitch=25)
    rc.shot("st_guardian", (-16, 0, 2), dist=9, pitch=25)
    for o in (fl, mk): bpy.data.objects.remove(o)
    for r in roots: r.location.x = 0
    rc.export("structures")

if __name__ == "__main__": rc.run(main)
