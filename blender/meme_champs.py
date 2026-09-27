# Builds the meme champion models and exports them to client/public/models/<id>.glb.
# Kanye is not built here: blender/kanye_donda.py rigs a Sketchfab model instead.
# Run: blender -b --python blender/meme_champs.py   (or exec() it through the Blender MCP)
#
# GLB contract: root <id> -> "body" armature (identity, feet at origin) with bones root/hips/spine/head/arm_L/arm_R/leg_L/leg_R;
# meshes are rigid children of bones. Clips: idle, run (loops), attack, cast, death (once). Extras toggled by the client:
# "belly", "tank", "halo", "sheet", and Mortadelo's "filemon" node holding a second "filBody" armature (fil_* bones).
# Blender front = -Y, up = +Z (the glTF exporter turns that into three's +Z front / +Y up).
import bpy, bmesh, math, os
from mathutils import Euler, Matrix, Vector

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "public", "models"))
TAU = math.tau

# ---------------------------------------------------------------- scene / materials
def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for coll in (bpy.data.meshes, bpy.data.materials):
        for d in list(coll): coll.remove(d)
    MATS.clear()

def lin(c):  # sRGB byte -> linear float
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgba(hexcol, a=1.0): return (lin(hexcol >> 16 & 255), lin(hexcol >> 8 & 255), lin(hexcol & 255), a)

MATS = {}
def mat(hexcol, emit=None, alpha=1.0):
    k = (hexcol, emit, alpha)
    if k in MATS: return MATS[k]
    m = bpy.data.materials.new(f"c{hexcol:06x}")
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba(hexcol)
    b.inputs["Roughness"].default_value = 0.8
    if emit is not None:
        b.inputs["Emission Color"].default_value = rgba(emit)
        b.inputs["Emission Strength"].default_value = 1.0
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    m.diffuse_color = rgba(hexcol, alpha)  # workbench preview
    MATS[k] = m
    return m

# ---------------------------------------------------------------- geometry helpers (bmesh, baked in parent-local space)
def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    s = scale if isinstance(scale, (tuple, list)) else (scale,) * 3
    S = Matrix.Diagonal((*s, 1))
    R = Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    return Matrix.Translation(loc) @ R @ S

def lathe(profile, segs=16, caps=True):
    """Revolve [(radius, z), ...] (bottom to top) around Z. Radius 0 at an end closes it with a pole."""
    bm = bmesh.new()
    rings = []
    profile = [pt for i, pt in enumerate(profile) if not (i and pt[0] <= 1e-5 and profile[i - 1][0] <= 1e-5)]  # collapse pole-to-pole
    for r, z in profile:
        if r <= 1e-5: rings.append([bm.verts.new((0, 0, z))])
        else: rings.append([bm.verts.new((r * math.cos(i / segs * TAU), r * math.sin(i / segs * TAU), z)) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1: bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1: bm.faces.new((a[j], a[i], b[0]))
            else: bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps and len(rings[0]) > 1: bm.faces.new(list(reversed(rings[0])))
    if caps and len(rings[-1]) > 1: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def sphere(r=1.0, segs=16, rings=10):
    return lathe([(r * math.sin(i / rings * math.pi), -r * math.cos(i / rings * math.pi)) for i in range(rings + 1)], segs)

def capsule(r, h, segs=12, rings=8):
    half = rings // 2
    pt = lambda i, dz: (r * math.sin(i / rings * math.pi), -r * math.cos(i / rings * math.pi) + dz)
    return lathe([pt(i, -h / 2) for i in range(half + 1)] + [pt(i, h / 2) for i in range(half, rings + 1)], segs)

def cyl(r1, r2, h, segs=12):
    return lathe([(0, -h / 2), (r1, -h / 2), (r2, h / 2), (0, h / 2)], segs)

def box(w, d, h, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    if bevel: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    return bm

def torus(R, r, segs=20, tube=6, arc=1.0):
    bm = bmesh.new()
    n = segs if arc >= 1 else segs + 1
    rings = []
    for i in range(n):
        a = i / segs * TAU * arc
        c = Vector((math.cos(a), math.sin(a), 0))
        rings.append([bm.verts.new(c * (R + r * math.cos(j / tube * TAU)) + Vector((0, 0, r * math.sin(j / tube * TAU)))) for j in range(tube)])
    for i in range(n if arc >= 1 else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(tube):
            k = (j + 1) % tube
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def prism(pts, depth):
    """Extrude a closed 2D outline [(x, y), ...] (XY plane, may be concave) along Z, centred on z=0."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    hi = [bm.verts.new((x, y, depth / 2)) for x, y in pts]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(pts)
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def star(points, r_out, r_in):
    return [((r_out if i % 2 == 0 else r_in) * math.sin(i * math.pi / points), (r_out if i % 2 == 0 else r_in) * math.cos(i * math.pi / points)) for i in range(points * 2)]

def sphere_split(r, segs, rings, keep):
    """UV sphere keeping only the faces whose index satisfies keep(i) (two calls = two-material mirror ball)."""
    bm = sphere(r, segs, rings)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for i, f in enumerate(bm.faces) if not keep(i)], context="FACES")
    return bm

COLL = None
RIGS, CUR = [], None  # one rig per armature (Mortadelo has two: himself + Filemón)

def new_rig(name, prefix, parent):
    global CUR
    CUR = {"name": name, "prefix": prefix, "parent": parent, "parts": [], "sk": {}}
    RIGS.append(CUR)
    return "auto"

def part(name, bm, color, parent="auto", loc=(0, 0, 0), rot=(0, 0, 0), scale=1, smooth=True, emit=None, alpha=1.0):
    """parent: "auto" (bone picked by height), a bone name, or (bone, offset) as returned by arm()."""
    bone, off = (parent, (0, 0, 0)) if isinstance(parent, str) else parent
    bm.transform(Matrix.Translation(off) @ xf(loc, rot, scale))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(mat(color, emit, alpha))
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    zs = [v.co.z for v in me.vertices]
    CUR["parts"].append((o, bone, (min(zs) + max(zs)) / 2))
    return o

def node(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    COLL.objects.link(o)
    o.parent = parent
    o.location = loc
    return o

def mirror(fn):
    for s in (-1, 1): fn(s)

# ---------------------------------------------------------------- shared body parts (they also record the skeleton)
def legs(pants, shoe, hip=0.55, spread=0.14, r=0.1, shoe_scale=1.0):
    CUR["sk"].update(hip=hip, spread=spread)
    def leg(s):
        b = "leg_L" if s < 0 else "leg_R"
        part("leg", capsule(r, hip - 0.12), pants, b, (spread * s, 0, hip / 2 + 0.02))
        part("shoe", sphere(0.13, 12, 8), shoe, b, (spread * s, -0.06, 0.06), scale=(0.85 * shoe_scale, 1.35 * shoe_scale, 0.6 * shoe_scale))
    mirror(leg)

def arm(x, z, sleeve, skin, length=0.42, r=0.085, hand=0.095):
    CUR["sk"].update(sx=abs(x), sz=z, alen=length + 0.04)
    b = ("arm_L" if x < 0 else "arm_R", (x, 0, z))
    part("sleeve", capsule(r, length - 2 * r + 0.06), sleeve, b, (0, 0, -length / 2))
    part("hand", sphere(hand, 10, 8), skin, b, (0, 0, -length - 0.04))
    return b

def prop(name, hand):
    """A held prop gets its own bone at the hand, scaled ~0 except in the clips that key "%prop_<name>"."""
    CUR.setdefault("props", []).append((name, hand))
    return ("prop_" + name, hand[1])

def face(body, z, skin, head_r=0.26, eye_y=None, nose=0.055, ears=True, eyes=True):
    CUR["sk"]["hz"] = z
    ey = -head_r * 0.88 if eye_y is None else eye_y
    part("head", sphere(head_r, 18, 12), skin, body, (0, 0, z))
    if eyes: mirror(lambda s: part("eye", sphere(0.035, 8, 6), 0x111111, body, (0.085 * s, ey, z + 0.04)))
    if nose: part("nose", sphere(nose, 10, 7), skin, body, (0, -head_r - nose * 0.3, z - 0.02), scale=(0.9, 1, 1.1))
    if ears: mirror(lambda s: part("ear", sphere(0.06, 8, 6), skin, body, ((head_r - 0.01) * s, 0, z), scale=(0.5, 1, 1.2)))

def shades(body, z, head_r, color=0x111111, w=0.1, h=0.075):
    def lens(s): part("lens", box(w, 0.03, h, 0.012), color, body, (0.075 * s, -head_r * 0.93, z), rot=(0, 0, 0.18 * s))
    mirror(lens)
    part("bridge", box(0.34, 0.02, 0.022), color, body, (0, -head_r * 0.92, z + h / 2 - 0.01), smooth=False)

def chain(body, z, r=0.22, pendant=None):
    part("chain", torus(r, 0.022, 20, 6), 0xffd24a, body, (0, -0.06, z), rot=(1.25, 0, 0), emit=0x553300)
    if pendant: part("pendant", pendant, 0xffd24a, body, (0, -0.33, z - 0.17), emit=0x553300)

# ---------------------------------------------------------------- champions
def torrente(body, root):
    SKIN, PANTS, SHIRT, TANK = 0xf1c27d, 0x2f2f33, 0x5a6b4a, 0xf1f1e0
    legs(PANTS, 0x1a1a1a, hip=0.5, spread=0.17, r=0.12)
    # pear torso: olive shirt back/sides, belly bulging out front
    part("torso", lathe([(0, 0.45), (0.36, 0.48), (0.46, 0.62), (0.45, 0.82), (0.38, 1.0), (0.28, 1.12), (0, 1.16)], 18), SHIRT, body, scale=(1.05, 0.95, 1))
    part("belly", sphere(0.42, 18, 12), SKIN, body, (0, -0.14, 0.72), scale=(1.05, 1, 0.95))
    part("tank", lathe([(0.0, -0.26), (0.36, -0.24), (0.44, -0.05), (0.43, 0.14), (0.34, 0.3), (0.0, 0.34)], 18), TANK, body, (0, -0.15, 0.74), scale=(1.03, 1.05, 1))
    mirror(lambda s: part("stain", sphere(0.07, 8, 6), 0xc9a94a, body, (0.12 * s - 0.05, -0.58, 0.8 - 0.1 * s), scale=(1, 0.3, 0.8)))
    part("belt", torus(0.45, 0.035, 24, 5), 0x3a2410, body, (0, -0.02, 0.5), scale=(1.02, 0.95, 1))
    part("buckle", box(0.11, 0.04, 0.08, 0.01), 0xd4af37, body, (0, -0.47, 0.5), emit=0x332200)
    # head: fat, double chin, combover, moustache, sideburns
    HZ = 1.36
    part("chin", sphere(0.2, 12, 8), SKIN, body, (0, -0.08, HZ - 0.2), scale=(1.2, 1, 0.6))
    face(body, HZ, SKIN, head_r=0.28, nose=0.07, eyes=False)
    shades(body, HZ + 0.04, 0.28, 0x3a2a10)
    part("tache", box(0.2, 0.05, 0.05, 0.02), 0x1a1a1a, body, (0, -0.3, HZ - 0.08))
    mirror(lambda s: part("sideburn", box(0.04, 0.1, 0.16, 0.015), 0x1a1a1a, body, (0.27 * s, -0.02, HZ + 0.03)))
    part("hair", sphere(0.285, 16, 10), 0x1a1a1a, body, (0, 0.03, HZ + 0.06), scale=(1, 1, 0.55))
    for i in range(4): part("strand", box(0.5, 0.035, 0.018), 0x1a1a1a, body, (0.02, -0.12 + i * 0.07, HZ + 0.22 - abs(i - 1.5) * 0.02), rot=(0, 0.35, 0.05))
    part("cigar", cyl(0.018, 0.02, 0.2, 6), 0x7a4a20, body, (0.1, -0.36, HZ - 0.13), rot=(math.pi / 2 - 0.25, 0, 0.5))
    part("ember", sphere(0.024, 6, 4), 0xff5a1a, body, (0.15, -0.45, HZ - 0.1), emit=0xff3300)
    # arms: whisky in the left hand, gun in the right
    aL = arm(-0.5, 1.02, SHIRT, SKIN, r=0.1, hand=0.1)
    part("glass", cyl(0.07, 0.08, 0.16, 12), 0xd8e8f0, aL, (0, -0.06, -0.5), alpha=0.55)
    part("whisky", cyl(0.065, 0.065, 0.08, 12), 0xb8641a, aL, (0, -0.06, -0.53), alpha=0.9)
    aR = arm(0.5, 1.02, SHIRT, SKIN, r=0.1, hand=0.1)
    part("gun", box(0.05, 0.22, 0.08, 0.01), 0x2a2a2a, aR, (0, -0.1, -0.5), smooth=False)
    part("grip", box(0.05, 0.06, 0.12, 0.01), 0x4a2a14, aR, (0, 0.0, -0.57), rot=(-0.3, 0, 0), smooth=False)
    badge = prop("badge", aR)  # W: shown to the target, faces forward once the arm is raised
    part("badge", prism(star(6, 0.17, 0.11), 0.03), 0xe8c14c, badge, (0, 0, -0.6), emit=0x443300)
    part("badgeshield", cyl(0.075, 0.075, 0.036, 14), 0x1a3a8a, badge, (0, 0, -0.6))


def epstein(body, root):
    SKIN, SUIT, SHIRT = 0xe8c0a0, 0x1c2240, 0xf2f2f2
    legs(SUIT, 0x151515, hip=0.56, r=0.1)
    part("torso", lathe([(0, 0.5), (0.34, 0.52), (0.35, 0.72), (0.38, 0.98), (0.36, 1.12), (0.2, 1.2), (0, 1.21)], 16), SUIT, body)
    part("shirt", box(0.16, 0.05, 0.42), SHIRT, body, (0, -0.33, 0.98), smooth=False)
    mirror(lambda s: part("lapel", box(0.08, 0.04, 0.38), 0x151a33, body, (0.1 * s, -0.34, 0.97), rot=(0, 0.25 * s, 0), smooth=False))
    part("collar", torus(0.14, 0.03, 14, 5), SHIRT, body, (0, -0.02, 1.19))
    for i in range(3): part("button", sphere(0.018, 6, 4), 0xd4af37, body, (0, -0.37, 0.62 + i * 0.1))
    part("pocketsq", box(0.08, 0.02, 0.05), 0xe8c14c, body, (0.2, -0.35, 1.02), smooth=False)
    HZ = 1.47
    face(body, HZ, SKIN, head_r=0.25, nose=0.06)
    part("jaw", sphere(0.2, 12, 8), SKIN, body, (0, -0.05, HZ - 0.12), scale=(1.1, 1, 0.7))
    part("hair", sphere(0.265, 16, 10), 0xcfcfcf, body, (0, 0.05, HZ + 0.06), scale=(1.02, 1, 0.8))
    part("quiff", sphere(0.14, 12, 8), 0xdedede, body, (0.05, -0.12, HZ + 0.2), scale=(1.4, 1, 0.6))
    mirror(lambda s: part("brow", box(0.09, 0.02, 0.02, 0.005), 0x9a9a9a, body, (0.085 * s, -0.24, HZ + 0.1), rot=(0, -0.15 * s, 0)))
    part("smirk", torus(0.05, 0.01, 10, 4, 0.5), 0x8a3a3a, body, (0.02, -0.235, HZ - 0.08), rot=(math.pi / 2, 0, math.pi))
    aL = arm(-0.44, 1.1, SUIT, SKIN)
    aR = arm(0.44, 1.1, SUIT, SKIN)
    part("book", box(0.2, 0.05, 0.26, 0.01), 0x111111, aR, (0, -0.08, -0.52))
    part("booklabel", box(0.12, 0.01, 0.04), 0xffd24a, aR, (0, -0.11, -0.47), emit=0x443300, smooth=False)
    part("tickets", box(0.16, 0.02, 0.1, 0.005), 0xffd24a, aL, (0, -0.05, -0.52), emit=0x443300)
    case = prop("case", aL)  # E: evidence briefcase
    part("case", box(0.42, 0.12, 0.3, 0.03), 0x5a3a1a, case, (0, 0, -0.78))
    part("casehandle", torus(0.07, 0.018, 12, 5, 0.5), 0x2a1a0a, case, (0, 0, -0.6), rot=(math.pi / 2, 0, 0))
    mirror(lambda s: part("clasp", box(0.05, 0.02, 0.04), 0xd4af37, case, (0.12 * s, -0.065, -0.66), emit=0x332200))
    part("classified", box(0.3, 0.01, 0.05), 0xc0392b, case, (0, -0.065, -0.8))
    # "sheet" extra: hanging bedsheet shown during the sheet ability
    part("sheet", box(1.4, 0.05, 1.8), 0xf8f8f8, body, (0, -0.6, 1.0), alpha=0.85, smooth=False)

def diddy(body, root):
    SKIN, SUIT = 0x6a3a1a, 0xf4f4f4
    legs(SUIT, 0xf4f4f4, hip=0.56, r=0.1)
    part("torso", lathe([(0, 0.5), (0.34, 0.52), (0.35, 0.72), (0.39, 0.98), (0.37, 1.12), (0.2, 1.2), (0, 1.21)], 16), SUIT, body)
    mirror(lambda s: part("lapel", box(0.08, 0.04, 0.4), 0xe0e0e0, body, (0.11 * s, -0.34, 0.95), rot=(0, 0.25 * s, 0), smooth=False))
    chain(body, 1.12, 0.23, sphere(0.06, 10, 8))
    chain(body, 1.05, 0.27)
    HZ = 1.47
    face(body, HZ, SKIN, head_r=0.25)
    part("scalp", sphere(0.27, 16, 10), 0x1a0e06, body, (0, 0.03, HZ + 0.06), scale=(1, 1, 0.6))
    part("beard", torus(0.17, 0.035, 16, 6, 0.5), 0x1a0e06, body, (0, -0.1, HZ - 0.06), rot=(0.2, 0, math.pi))
    part("goatee", sphere(0.05, 8, 6), 0x1a0e06, body, (0, -0.23, HZ - 0.16))
    shades(body, HZ + 0.04, 0.25)
    part("hat", lathe([(0, 0), (0.36, 0), (0.36, 0.02), (0.2, 0.03), (0.19, 0.18), (0.16, 0.2), (0, 0.2)], 18), 0xf4f4f4, body, (0, 0, HZ + 0.16), rot=(-0.12, 0, 0))
    part("band", cyl(0.198, 0.198, 0.04, 18), 0x111111, body, (0, 0.0, HZ + 0.22), rot=(-0.12, 0, 0))
    aL = arm(-0.44, 1.1, SUIT, SKIN)
    aR = arm(0.44, 1.1, SUIT, SKIN)
    # baby oil bottle + champagne
    part("bottle", lathe([(0, 0), (0.07, 0), (0.075, 0.2), (0.04, 0.26), (0.025, 0.3), (0, 0.3)], 12), 0xfff7c0, aR, (0, -0.06, -0.66), alpha=0.8)
    part("cap", cyl(0.03, 0.03, 0.05, 8), 0x3aa0ff, aR, (0, -0.06, -0.34))
    part("champ", lathe([(0, 0), (0.07, 0), (0.07, 0.22), (0.03, 0.3), (0.025, 0.4), (0, 0.4)], 12), 0x1c4a2a, aL, (0, -0.06, -0.62), rot=(0.5, 0, 0))
    part("foil", cyl(0.028, 0.03, 0.08, 8), 0xffd24a, aL, (0, -0.22, -0.3), rot=(0.5, 0, 0), emit=0x443300)

def mortadelo(body, root):
    SKIN, COAT = 0xf1c27d, 0x151515
    # Mortadelo: very tall and thin, bald, huge nose, round glasses, black frock coat, bow tie
    legs(COAT, 0x111111, hip=0.7, spread=0.1, r=0.075, shoe_scale=1.1)
    part("coat", lathe([(0, 0.46), (0.33, 0.46), (0.28, 0.75), (0.25, 1.1), (0.27, 1.38), (0.18, 1.46), (0, 1.47)], 14), COAT, body)
    part("shirt", box(0.12, 0.04, 0.3), 0xf4f4f4, body, (0, -0.24, 1.3), smooth=False)
    mirror(lambda s: part("bow", cone_bm(0.05, 0.08), 0xd33b2c, body, (0.05 * s, -0.27, 1.43), rot=(0, math.pi / 2 * -s, 0)))
    part("neck", cyl(0.07, 0.07, 0.2, 10), SKIN, body, (0, 0, 1.54))
    HZ = 1.82
    face(body, HZ, SKIN, head_r=0.24, nose=0)
    part("bignose", lathe([(0.065, 0), (0.07, 0.12), (0.06, 0.28), (0.07, 0.36), (0, 0.38)], 10), SKIN, body, (0, -0.2, HZ + 0.0), rot=(math.pi / 2 + 0.35, 0, 0))
    mirror(lambda s: part("glass", torus(0.065, 0.013, 14, 5), 0x111111, body, (0.085 * s, -0.24, HZ + 0.04), rot=(math.pi / 2, 0, 0)))
    for i in range(2): part("hair", torus(0.08, 0.008, 10, 4, 0.5), 0x111111, body, (0.03 * (i * 2 - 1), 0, HZ + 0.3), rot=(math.pi / 2, 0, math.pi / 2 + 0.3 * (i * 2 - 1)))
    arm(-0.33, 1.38, COAT, SKIN, length=0.55, r=0.07)
    arm(0.33, 1.38, COAT, SKIN, length=0.55, r=0.07)
    # Filemón: short, stout, white shirt, red trousers, bald with two hairs, slipper
    fb = new_rig("filBody", "fil_", node("filemon", root, (0.7, 0.6, 0)))
    legs(0xd33b2c, 0x111111, hip=0.4, spread=0.13, r=0.1)
    part("fpants", lathe([(0, 0.34), (0.34, 0.36), (0.38, 0.5), (0, 0.52)], 14), 0xd33b2c, fb)
    part("ftorso", lathe([(0, 0.48), (0.38, 0.5), (0.4, 0.66), (0.33, 0.86), (0.18, 0.94), (0, 0.95)], 14), 0xf4f4f4, fb)
    mirror(lambda s: part("brace", box(0.04, 0.02, 0.44), 0x111111, fb, (0.14 * s, -0.37, 0.7), rot=(0.25, 0, 0), smooth=False))
    FZ = 1.1
    face(fb, FZ, SKIN, head_r=0.25, nose=0.08)
    mirror(lambda s: part("fhair", torus(0.1, 0.01, 10, 4, 0.5), 0x111111, fb, (0.04 * s, 0, FZ + 0.27), rot=(math.pi / 2, 0, math.pi / 2 + 0.4 * s)))
    fl = arm(-0.42, 0.85, 0xf4f4f4, SKIN, length=0.36, r=0.08)
    mallet = prop("mallet", fl)  # R: the mallet that launches Mortadelo
    part("handle", cyl(0.025, 0.025, 0.75, 8), 0x8a5a2a, mallet, (0, 0, -0.62))
    part("mhead", cyl(0.15, 0.15, 0.42, 14), 0xb07a3a, mallet, (0, 0, -1.02), rot=(math.pi / 2, 0, 0))
    mirror(lambda s: part("mband", cyl(0.155, 0.155, 0.04, 14), 0x555555, mallet, (0, 0.17 * s, -1.02), rot=(math.pi / 2, 0, 0)))
    fr = arm(0.42, 0.85, 0xf4f4f4, SKIN, length=0.36, r=0.08)
    part("slipper", sphere(0.12, 10, 8), 0x7a3a1a, fr, (0, -0.1, -0.44), scale=(0.7, 1.6, 0.45))

def cone_bm(r, h): return cyl(0.0, r, h, 8)

def join(objs):
    """Merge meshes that share a material into the first one (all parts have identity transforms)."""
    o = objs[0]
    if len(objs) > 1:
        bm = bmesh.new()
        for x in objs: bm.from_mesh(x.data)
        bm.to_mesh(o.data)
        bm.free()
        for x in objs[1:]:
            me = x.data
            bpy.data.objects.remove(x)
            bpy.data.meshes.remove(me)
    return o

# ---------------------------------------------------------------- skeleton
EXTRAS = {"belly", "tank", "halo", "sheet"}

def skeleton(rig):
    """Armature with rigid bone-parented parts (no skinning: plain clone() + inverted-hull outlines keep working in three)."""
    sk, P = rig["sk"], rig["prefix"]
    A = bpy.data.objects.new(rig["name"], bpy.data.armatures.new(rig["name"]))
    COLL.objects.link(A)
    A.parent = rig["parent"]
    bpy.context.view_layer.objects.active = A
    bpy.ops.object.mode_set(mode="EDIT")
    eb = A.data.edit_bones
    neck = sk["hz"] - 0.25
    def bone(n, h, t, parent=None):
        b = eb.new(P + n)
        b.head, b.tail = h, t
        if parent: b.parent = eb[P + parent]
    bone("root", (0, 0, 0), (0, 0, 0.2))
    bone("hips", (0, 0, sk["hip"]), (0, 0, sk["hip"] + 0.15), "root")
    bone("spine", (0, 0, sk["hip"] + 0.15), (0, 0, neck), "hips")
    bone("head", (0, 0, neck), (0, 0, sk["hz"] + 0.25), "spine")
    for s, side in ((-1, "L"), (1, "R")):
        bone("arm_" + side, (sk["sx"] * s, 0, sk["sz"]), (sk["sx"] * s, 0, sk["sz"] - sk["alen"]), "spine")
        bone("leg_" + side, (sk["spread"] * s, 0, sk["hip"]), (sk["spread"] * s, 0, 0.05), "hips")
    for name, (armb, (x, y, z)) in rig.get("props", []):
        bone("prop_" + name, (x, y, z - sk["alen"]), (x, y - 0.1, z - sk["alen"]), armb)
    bpy.ops.object.mode_set(mode="OBJECT")
    # auto parts go to hips / spine / head by height, then merge per bone + material
    groups = {}
    for o, b, z in rig["parts"]:
        if b == "auto": b = "head" if z >= neck else "spine" if z >= sk["hip"] + 0.05 else "hips"
        key = (o.name, "") if o.name in EXTRAS else (b, o.data.materials[0].name)
        groups.setdefault(key, (P + b, []))[1].append(o)
    for (label, mname), (b, objs) in groups.items():
        o = join(objs)
        if mname: o.name = o.data.name = f"{b}_{mname}"
        o.parent, o.parent_type, o.parent_bone = A, "BONE", b
        bpy.context.view_layer.update()
        o.matrix_world = A.matrix_world.copy()  # geometry is authored in armature space
    return A

# ---------------------------------------------------------------- animation
# Poses are {bone: (rx, ry, rz) degrees about ARMATURE axes, relative to the parent} plus {"@bone": (dx, dy, dz)} offsets.
# Blender front is -Y: a negative X rotation swings a hanging arm/leg forward, but tips an upright bone (spine, head, root)
# BACK (positive X leans forward). +Y swings the left arm outward; on a raised arm +Z brings the left hand inward, -Z the right.
# "%bone": s keys a uniform scale (prop_* bones rest at ~0 = hidden).
FPS = 30

def base_clips():
    run = lambda sgn, up: {"leg_L": (-35 * sgn, 0, 0), "leg_R": (35 * sgn, 0, 0), "arm_L": (35 * sgn, 0, 0), "arm_R": (-35 * sgn, 0, 0),
                           "spine": (10, 0, 8 * sgn), "head": (-6, 0, -6 * sgn), "@hips": (0, 0, 0.05 * up)}
    return {
        "idle": (60, {0: {"arm_L": (0, 4, 0), "arm_R": (0, -4, 0)},
                      30: {"spine": (-3, 0, 0), "head": (-4, 0, 0), "arm_L": (-4, 8, 0), "arm_R": (-4, -8, 0), "@hips": (0, 0, -0.015)},
                      60: {"arm_L": (0, 4, 0), "arm_R": (0, -4, 0)}}),
        "run": (20, {0: run(1, 0), 5: {**run(0, 1), "spine": (10, 0, 0)}, 10: run(-1, 0), 15: {**run(0, 1), "spine": (10, 0, 0)}, 20: run(1, 0)}),
        "attack": (15, {0: {}, 4: {"arm_R": (55, -10, 0), "spine": (0, 0, 18), "arm_L": (-15, 0, 0)},
                        7: {"arm_R": (-115, 0, 0), "spine": (12, 0, -20), "head": (6, 0, 0), "arm_L": (20, 0, 0), "@hips": (0, -0.05, -0.03)},
                        15: {}}),
        "cast": (18, {0: {}, 6: {"arm_L": (-150, 25, 0), "arm_R": (-150, -25, 0), "spine": (-10, 0, 0), "head": (-15, 0, 0), "@hips": (0, 0, 0.1)},
                      10: {"arm_L": (-95, 10, 0), "arm_R": (-95, -10, 0), "spine": (10, 0, 0), "head": (5, 0, 0), "@hips": (0, 0, 0.02)},
                      18: {}}),
        "death": (30, {0: {}, 6: {"spine": (20, 0, 0), "head": (25, 0, 0), "arm_L": (-30, 20, 0), "arm_R": (-30, -20, 0), "leg_L": (-15, 0, 0), "leg_R": (-15, 0, 0), "@root": (0, 0, -0.05)},
                       18: {"root": (-80, 0, 0), "spine": (-5, 0, 0), "head": (-10, 0, 0), "arm_L": (-140, 50, 0), "arm_R": (-140, -50, 0), "@root": (0, 0, 0.2)},
                       24: {"root": (-95, 0, 0), "arm_L": (-160, 70, 0), "arm_R": (-160, -70, 0), "leg_L": (-25, 0, 10), "leg_R": (-5, 0, -10), "@root": (0, 0, 0.42)},
                       30: {"root": (-90, 0, 0), "head": (0, 0, 20), "arm_L": (-165, 75, 0), "arm_R": (-165, -75, 0), "leg_L": (-20, 0, 10), "leg_R": (-8, 0, -10), "@root": (0, 0, 0.42)}}),
    }

def tweak(clips, name, frame, **pose):
    """Merge per-champion flavour into a keyframe (creating it if needed)."""
    keys = clips[name][1]
    keys[frame] = {**keys.get(frame, {}), **{k.replace("at_", "@"): v for k, v in pose.items()}}

def animate(A, prefix, clips):
    ad = A.animation_data_create()
    bones = A.pose.bones
    for pb in bones: pb.rotation_mode = "QUATERNION"
    rest = {b.name: b.matrix_local.to_quaternion() for b in A.data.bones}
    for name, (length, keys) in clips.items():
        act = bpy.data.actions.new(f"{A.name}_{name}")
        ad.action = act
        prev = {}
        for f in sorted(keys):
            pose = keys[f]
            for pb in bones:
                n = pb.name[len(prefix):]
                B = rest[pb.name]
                rx, ry, rz = pose.get(n, (0, 0, 0))
                q = B.inverted() @ Euler((math.radians(rx), math.radians(ry), math.radians(rz))).to_quaternion() @ B
                if pb.name in prev: q.make_compatible(prev[pb.name])
                prev[pb.name] = q
                pb.rotation_quaternion = q
                pb.location = B.inverted() @ Vector(pose.get("@" + n, (0, 0, 0)))
                pb.scale = (pose.get("%" + n, 0.001 if n.startswith("prop_") else 1),) * 3
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("scale", frame=f)
        track = ad.nla_tracks.new()
        track.name = name  # same-named tracks across armatures merge into one glTF animation
        track.strips.new(name, 0, act)
        ad.action = None
    for pb in bones: pb.rotation_quaternion, pb.location, pb.scale = (1, 0, 0, 0), (0, 0, 0), (1, 1, 1)

def pivot(ax, cz, lift=0.0):
    """Root pose rotating the whole body ax degrees about X around its centre (0, 0, cz) instead of the feet."""
    a = math.radians(ax)
    return {"root": (ax, 0, 0), "@root": (0, cz * math.sin(a), cz - cz * math.cos(a) + lift)}

def spells(c, *clips):
    """Ability clips spell1..spell4 (the client plays spell<slot+1> on cast)."""
    for i, (length, keys) in enumerate(clips): c[f"spell{i + 1}"] = (length, keys)

# ---------------------------------------------------------------- per-champion flavour
def torrente_anim(c):
    tweak(c, "idle", 30, arm_L=(-125, 0, 40), head=(-22, 0, 0), spine=(-6, 0, 0))  # swig of whisky
    tweak(c, "idle", 15, arm_L=(-60, 0, 15))
    tweak(c, "idle", 45, arm_L=(-60, 0, 15))
    for f, s in ((0, 1), (10, -1), (20, 1)): tweak(c, "run", f, spine=(6, 10 * s, 8 * s))  # waddle
    c["attack"] = (15, {0: {}, 3: {"arm_R": (-90, 0, 0), "head": (-5, 0, 5)}, 6: {"arm_R": (-110, 0, 0), "spine": (6, 0, 0)},
                        9: {"arm_R": (-90, 0, 0)}, 15: {}})  # aim + recoil
    belly = {"arm_L": (-45, 0, 35), "arm_R": (-45, 0, -35)}
    roll = lambda a, f: {**pivot(a, 0.75, 0.15), "leg_L": (-70, 0, 0), "leg_R": (-70, 0, 0), "arm_L": (-80, 0, 30), "arm_R": (-80, 0, -30), "spine": (25, 0, 0)}
    spells(c,
        # Q Vómito de Soberano: rear back, then heave forward twice
        (24, {0: {}, 5: {**belly, "spine": (-12, 0, 0), "head": (-25, 0, 0), "@hips": (0, 0, 0.03)},
              9: {**belly, "spine": (30, 0, 0), "head": (25, 0, 0), "@hips": (0, 0, -0.05)}, 13: {**belly, "spine": (18, 0, 0), "head": (10, 0, 0)},
              16: {**belly, "spine": (32, 0, 0), "head": (28, 0, 0), "@hips": (0, 0, -0.05)}, 24: {}}),
        # W ¡Alto a la Autoridad!: shove the badge forward, other hand on the hip
        (21, {0: {}, 5: {"arm_R": (-95, 0, -5), "arm_L": (5, 35, 0), "spine": (-6, 0, -12), "head": (-8, 0, 0), "%prop_badge": 1},
              15: {"arm_R": (-100, 0, -5), "arm_L": (5, 35, 0), "spine": (-6, 0, -12), "head": (-8, 0, 0), "%prop_badge": 1}, 21: {}}),
        # E Croqueta Policial: tucked forward roll around the belly
        (15, {0: {}, 2: roll(90, 2), 5: roll(180, 5), 8: roll(270, 8), 11: roll(360, 11), 15: {}}),
        # R Desmadre Descamisado: grab the wifebeater, rip it off, roar
        (30, {0: {}, 6: {"arm_L": (-70, 0, 55), "arm_R": (-70, 0, -55), "spine": (15, 0, 0), "head": (15, 0, 0), "@hips": (0, 0, -0.05)},
              10: {"arm_L": (-165, 75, 0), "arm_R": (-165, -75, 0), "spine": (-15, 0, 0), "head": (-30, 0, 0), "@hips": (0, 0, 0.12)},
              22: {"arm_L": (-170, 85, 0), "arm_R": (-170, -85, 0), "spine": (-12, 0, 0), "head": (-28, 0, 0), "@hips": (0, 0, 0.05)}, 30: {}}),
    )


def epstein_anim(c):
    tweak(c, "idle", 30, head=(4, 0, 10), arm_R=(-30, 0, 0))
    dead = {**pivot(-90, 0, 0.42), "arm_L": (-160, 70, 0), "arm_R": (-160, -70, 0), "head": (0, 0, 25)}
    spells(c,
        # Q Invitación a la Isla: backhand frisbee flick of the envelope
        (15, {0: {}, 4: {"arm_R": (-80, 0, -60), "spine": (0, 0, -25), "arm_L": (-10, 10, 0)},
              8: {"arm_R": (-85, 0, 45), "spine": (5, 0, 22), "head": (0, 0, 8)}, 15: {}}),
        # W Sábanas de la Prisión: hold the bedsheet up as a wall
        (24, {0: {}, 5: {"arm_L": (-150, -10, 0), "arm_R": (-150, 10, 0), "spine": (-5, 0, 0)},
              19: {"arm_L": (-155, -8, 0), "arm_R": (-155, 8, 0), "spine": (-6, 0, 0)}, 24: {}}),
        # E Maletín de Pruebas: raise the briefcase, slam it on the floor
        (18, {0: {}, 5: {"arm_L": (-45, 10, 0), "spine": (-5, 0, 0), "%prop_case": 1},
              9: {"arm_L": (-15, 0, 0), "spine": (28, 0, 0), "head": (10, 0, 0), "leg_L": (-25, 0, 0), "leg_R": (-25, 0, 0), "@hips": (0, 0, -0.14), "%prop_case": 1},
              14: {"arm_L": (-10, 0, 0), "spine": (20, 0, 0), "%prop_case": 1}, 18: {}}),
        # R Epstein no se suicidó: clutch the chest, stagger, drop "dead"
        (24, {0: {}, 4: {"arm_R": (-60, 0, -55), "arm_L": (-60, 0, 55), "spine": (15, 0, 0), "head": (22, 0, 0)},
              10: {"arm_R": (-60, 0, -55), "arm_L": (-60, 0, 55), "spine": (-10, 0, 20), "root": (0, 0, 35), "@root": (0, 0, -0.05)},
              18: {**dead, "root": (-95, 0, 0)}, 24: dead}),
    )

def diddy_anim(c):
    c["idle"] = (60, {f: {"hips": (0, 8 * s, 0), "spine": (0, -6 * s, 5 * s), "head": (6 if i % 2 else -4, 0, 0),
                          "arm_L": (-70 if s > 0 else -25, 10, 0), "arm_R": (-25 if s > 0 else -70, -10, 0)}
                      for i, f in enumerate(range(0, 61, 15)) for s in [1 if i % 2 else -1]})
    roof = lambda a, up: {"arm_L": (a, 25, 0), "arm_R": (a, -25, 0), "head": (-10 if up else 8, 0, 0), "@hips": (0, 0, 0.05 if up else -0.05)}
    slide = lambda l, r: {"leg_L": (l, 0, 0), "leg_R": (r, 0, 0), "spine": (-8, 0, 0), "arm_L": (-15, 12, 0), "arm_R": (-150, 0, -35), "head": (10, 0, 0)}
    spells(c,
        # Q Botella de Aceite de Bebé: underhand lob
        (16, {0: {}, 5: {"arm_R": (45, 0, 0), "spine": (12, 0, 0), "@hips": (0, 0, -0.05)},
              9: {"arm_R": (-125, 0, 0), "spine": (-6, 0, 0), "head": (-12, 0, 0)}, 16: {}}),
        # W Fiesta en la Mansión: raise the roof
        (24, {0: {}, 4: roof(-170, True), 8: roof(-135, False), 12: roof(-170, True), 16: roof(-135, False), 20: roof(-170, True), 24: {}}),
        # E Moonwalk Evasivo: legs sliding back, hand on the hat
        (18, {0: {}, 3: slide(28, -6), 7: slide(-6, 28), 11: slide(28, -6), 15: slide(-6, 28), 18: {}}),
        # R The White Party: point at the sky (disco ball incoming), then ta-da
        (30, {0: {}, 6: {"arm_R": (-175, -10, 0), "arm_L": (10, 30, 0), "head": (-35, 0, 0), "spine": (-10, 0, 0)},
              16: {"arm_R": (-178, -8, 0), "arm_L": (10, 30, 0), "head": (-38, 0, 0), "spine": (-12, 0, 0)},
              22: {"arm_L": (-100, 65, 0), "arm_R": (-100, -65, 0), "spine": (12, 0, 0), "@hips": (0, 0, -0.1)}, 30: {}}),
    )

def mortadelo_anim(c):
    spin = lambda a: {"root": (0, 0, a), "arm_L": (-160, 30, 0), "arm_R": (-160, -30, 0), "@hips": (0, 0, 0.1)}
    hop = {"@hips": (0, 0, 0.3), "leg_L": (-45, 0, 0), "leg_R": (-45, 0, 0), "arm_L": (-40, 40, 0), "arm_R": (-40, -40, 0)}
    torpedo = {**pivot(90, 1.0, 0.25), "arm_L": (-178, 0, 8), "arm_R": (-178, 0, -8), "head": (-30, 0, 0)}
    spells(c,
        # Q Disfraz Inesperado: whirl into the disguise
        (18, {0: {}, **{2 + i * 2: spin(120 * (i + 1)) for i in range(6)}, 18: {}}),
        # W Invento del Profesor Bacterio: lob the flask
        (16, {0: {}, 5: {"arm_R": (45, 0, 0), "spine": (10, 0, 0)}, 9: {"arm_R": (-130, 0, 0), "spine": (-8, 0, 0), "head": (-12, 0, 0)}, 16: {}}),
        # E Cambio de Agente: both hop and swap
        (15, {0: {}, 7: hop, 15: {}}),
        # R ¡¡MORTADELOOOO!!: bonked into a flying torpedo, arms first
        (27, {0: {}, 6: {"spine": (12, 0, 0), "head": (15, 0, 0), "@hips": (0, 0, -0.08)}, 9: torpedo, 24: torpedo, 27: {}}),
    )

def filemon_anim(c):
    for f, a in ((0, -110), (10, -140), (20, -110), (30, -140), (40, -110), (50, -140), (60, -110)): tweak(c, "idle", f, arm_R=(a, -20, 0))
    c["attack"] = (15, {0: {}, 4: {"arm_R": (-170, 0, 0), "spine": (-8, 0, 0)}, 7: {"arm_R": (-40, 0, 0), "spine": (18, 0, 0), "@hips": (0, -0.08, 0)}, 15: {}})
    swing = lambda a, sp, m=1: {"arm_L": (a, -10, 0), "arm_R": (a, 10, 0), "spine": (sp, 0, 0), "%prop_mallet": m}
    spells(c,
        # Q: scratches his head at the disguise
        (18, {0: {}, 5: {"arm_L": (-150, 0, 45), "head": (0, 20, 0)}, 13: {"arm_L": (-155, 0, 40), "head": (0, -15, 0)}, 18: {}}),
        # W: hides his eyes from the flask
        (16, {0: {}, 4: {"arm_L": (-125, 0, 40), "arm_R": (-125, 0, -40), "spine": (10, 0, 0)}, 12: {"arm_L": (-125, 0, 40), "arm_R": (-125, 0, -40), "spine": (12, 0, 0)}, 16: {}}),
        # E: hops too
        (15, {0: {}, 9: {"@hips": (0, 0, 0.25), "leg_L": (-40, 0, 0), "leg_R": (-40, 0, 0), "arm_L": (-50, 40, 0), "arm_R": (-50, -40, 0)}, 15: {}}),
        # R: two-handed mallet swing
        (27, {0: {}, 5: swing(-170, -15), 8: swing(-55, 28), 20: swing(-50, 20), 27: {}}),
    )

CHAMPS = {"torrente": (torrente, torrente_anim), "epstein": (epstein, epstein_anim),
          "diddy": (diddy, diddy_anim), "mortadelo": (mortadelo, mortadelo_anim)}

def build(cid):
    global COLL
    clear()
    RIGS.clear()
    COLL = bpy.context.scene.collection
    root = node(cid)
    fn, anim = CHAMPS[cid]
    fn(new_rig("body", "", root), root)
    for rig in RIGS:
        A = skeleton(rig)
        clips = base_clips()
        flavour = filemon_anim if rig["prefix"] == "fil_" else anim
        if flavour: flavour(clips)
        animate(A, rig["prefix"], clips)
    return root

def export(cid):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, cid + ".glb")
    bpy.context.scene.render.fps, bpy.context.scene.frame_start = FPS, 0
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT",
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                              export_cameras=False, export_lights=False)
    return path

# ---------------------------------------------------------------- ability props (fx.glb)
# One node per prop, named as the client looks it up (client/models.ts fxModel). Base on the ground or centred as noted.
def sketch(fname, rot=(0, 0, 0), length=1.0, width=None, ground=False, pick=None, ratio=1.0, fatten=0.0, color=None, emit=None, axis=1, keep=None, drop=None, at=(0, 0, 0)):
    """Sketchfab prop from blender/src/<fname>.glb (credits in blender/src/CREDITS.txt) as parts: rotated (degrees), scaled so
    its extent along `axis` (0 x, 1 y, 2 z) is `length` (X to `width` if given), centred, base at z=0 if `ground`, then moved
    to `at`. keep/drop: mesh-name substrings to keep only / remove; pick: keep only the largest mesh. Returns the meshes."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, fname + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == "MESH"]
    for o in ms:
        mw = o.matrix_world.copy(); o.parent = None; o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = Matrix()
        o.shape_key_clear()  # rigged sources (tentacle) come in bind pose; props are static
        for md in list(o.modifiers): o.modifiers.remove(md)
    for o in new:
        if o.type != "MESH": bpy.data.objects.remove(o)
    for o in [o for o in ms if (keep and not any(k in o.name for k in keep)) or (drop and any(k in o.name for k in drop))]:
        ms.remove(o); bpy.data.objects.remove(o)
    if pick:
        big = max(ms, key=lambda o: len(o.data.vertices))
        for o in ms:
            if o is not big: bpy.data.objects.remove(o)
        ms = [big]
    R = Euler([math.radians(x) for x in rot]).to_matrix().to_4x4()
    for o in ms: o.data.transform(R)
    pts = [v.co for o in ms for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    sy = length / (hi[axis] - lo[axis])
    S = Matrix.Diagonal((width / (hi.x - lo.x) if width else sy, sy, sy, 1))
    T = Matrix.Translation(at) @ S @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z if ground else (lo.z + hi.z) / 2)))
    for o in ms:
        COLL.objects.link(o) if o.name not in COLL.objects else None
        o.data.transform(T)
        if ratio < 1:
            d = o.modifiers.new("dec", "DECIMATE"); d.ratio = ratio
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="dec")
        if fatten:  # thin strands vanish at MOBA camera distance: push them out along their normals
            for v in o.data.vertices: v.co += v.normal * fatten
        if color is not None: o.data.materials.clear(); o.data.materials.append(mat(color, emit))
        for m in o.data.materials:  # toon shading only reads the base colour map: drop normal/roughness maps from the export
            t = m.node_tree
            emit = next((l.from_node for l in t.links if l.to_node.type == "BSDF_PRINCIPLED" and l.to_socket.name == "Emission Color" and l.from_node.type == "TEX_IMAGE"), None)
            if emit:  # unlit-style sources keep their colour in the emission map and leave the base colour white
                bsdf = next(n for n in t.nodes if n.type == "BSDF_PRINCIPLED"); t.links.new(emit.outputs["Color"], bsdf.inputs["Base Color"])
            for l in [l for l in t.links if l.to_node.type == "BSDF_PRINCIPLED" and l.to_socket.name != "Base Color"]: t.links.remove(l)
            for n in t.nodes:  # unlinked glTF metallic defaults to 1: chrome in previews
                if n.type == "BSDF_PRINCIPLED": n.inputs["Metallic"].default_value, n.inputs["Roughness"].default_value = 0, 0.8
        CUR["parts"].append((o, "auto", 0))
    return ms

def fx_phone():  # Kanye Q projectile, lying flat, centred
    sketch("fx_phone", rot=(90, 0, 0), length=0.48)

def fx_envelope():  # Epstein Q projectile, lying flat, centred
    sketch("fx_envelope", drop=["stand"], axis=0, length=0.52)

def fx_sneaker():  # Kanye W: giant Yeezy dropped from the sky, 1 unit long, sole on the ground, toe at -Y
    sketch("fx_yeezy", rot=(0, 0, 180), length=1.0, ground=True, ratio=0.35)

def fx_bolt():  # Kanye E dash trail: lightning lying on the ground from the origin forward (-Y), 2 units long
    sketch("fx_bolt", rot=(90, 0, 0), length=2.0, width=0.9, pick=True, fatten=0.035, color=0xfff2a0, emit=0xffcc00)
    for o, _, _ in CUR["parts"]: o.data.transform(Matrix.Translation((0, -1.0, 0.1)) @ Matrix.Diagonal((1, 1, 0.2, 1)))  # flat decal, base at the origin, tip at y=-2

def fx_briefcase():  # Epstein E: the evidence case left inside the smoke, on the ground
    sketch("fx_briefcase", keep=["Closed"], axis=0, length=0.62, ground=True)

def fx_cctv():  # Epstein R: the prison camera that "malfunctioned", centred, looking forward
    sketch("fx_cctv", length=0.75)

def fx_tanktop():  # Torrente R: the ripped wifebeater flying off, centred
    part("tank", lathe([(0.36, -0.3), (0.42, -0.05), (0.38, 0.15), (0.3, 0.28)], 18, caps=False), 0xf1f1e0, scale=(1, 0.7, 1))
    mirror(lambda s: part("strap", box(0.07, 0.04, 0.22), 0xf1f1e0, loc=(0.16 * s, 0, 0.36)))
    for x, z in ((0.1, 0.05), (-0.2, -0.12), (0.22, -0.2)): part("stain", sphere(0.07, 8, 6), 0xc9a94a, loc=(x, -0.28, z), scale=(1, 0.3, 0.8))
    part("rip", prism([(0, 0), (0.08, -0.25), (-0.06, -0.12), (0.03, -0.4), (-0.12, -0.1)], 0.02), 0x5a6b4a, loc=(0.05, -0.29, 0.15), rot=(math.pi / 2, 0, 0))

def fx_oilbottle():  # Diddy Q: thrown bottle, centred
    sketch("fx_oilbottle", axis=2, length=0.5)

def fx_puddle():  # Diddy Q: slippery puddle, radius ~1, flat on the ground (client scales to the ability radius)
    blob = [((1 + 0.12 * math.sin(3 * a) + 0.07 * math.sin(7 * a + 1)) * math.cos(a), (1 + 0.12 * math.sin(3 * a) + 0.07 * math.sin(7 * a + 1)) * math.sin(a)) for a in (i / 40 * TAU for i in range(40))]
    part("oil", prism(blob, 0.02), 0xffe890, loc=(0, 0, 0.02), alpha=0.75, smooth=False)
    for x, y, r in ((-0.3, 0.2, 0.18), (0.35, -0.25, 0.12), (0.1, 0.45, 0.08)): part("glint", cyl(r, r, 0.01, 12), 0xffffff, loc=(x, y, 0.035), alpha=0.8)

def fx_speaker():  # Diddy W: speaker stack on the ground
    sketch("fx_speaker", axis=0, length=1.4, ground=True)

def fx_vip():  # Diddy W: VIP stanchions + velvet rope around a radius-3.2 zone (the party radius)
    a = 3.2 * math.cos(math.pi / 6)  # hexagon of rope segments, side = circumradius = 3.2
    seg = sketch("fx_vip", axis=0, length=3.2, ground=True)
    for o in seg:
        for i in range(1, 6):
            c = o.copy(); c.data = o.data.copy(); COLL.objects.link(c); CUR["parts"].append((c, "auto", 0))
            c.data.transform(Matrix.Rotation(i * math.pi / 3, 4, "Z") @ Matrix.Translation((0, -a, 0)))
        o.data.transform(Matrix.Translation((0, -a, 0)))

def fx_discoball():  # Diddy R: mirror ball, centred, hanging chain going up
    sketch("fx_discoball", length=2.2)
    part("cap", cyl(0.2, 0.12, 0.2, 12), 0x888888, loc=(0, 0, 1.15))
    part("chain", cyl(0.03, 0.03, 4, 6), 0x888888, loc=(0, 0, 3.2))

def fx_plant():  # Mortadelo Q: the potted-plant disguise (with Mortadelo peeking out), on the ground
    sketch("fx_plant", axis=2, length=1.8, ground=True)
    mirror(lambda s: part("glass", torus(0.075, 0.015, 14, 5), 0x111111, loc=(0.1 * s, -0.47, 1.12), rot=(math.pi / 2, 0, 0)))
    mirror(lambda s: part("eye", sphere(0.035, 8, 6), 0x111111, loc=(0.1 * s, -0.46, 1.12)))
    part("nose", lathe([(0.06, 0), (0.065, 0.18), (0.055, 0.3), (0, 0.33)], 10), 0xf1c27d, loc=(0, -0.45, 1.05), rot=(math.pi / 2 + 0.3, 0, 0))

def fx_bull():  # Mortadelo Q: cheap bull costume he wears for the charge, on the ground, facing forward
    sketch("fx_bull", length=2.4, ground=True)

def fx_bombbox():  # Mortadelo Q: T.I.A. bomb box that goes off after 1s, on the ground
    sketch("fx_bomb", axis=2, length=0.9, ground=True)

def fx_flask():  # Mortadelo W: Professor Bacterio's flask, centred
    sketch("fx_flask", keep=["big"], axis=2, length=0.55)

def fx_badge():  # Torrente W: big police badge floating over the taunted target, facing forward, centred
    sketch("fx_badge", axis=2, length=1.0)

# LoL champion props (client/game.ts CAST_PROPS, keyed by champion + slot)
def fx_tibbers():  # Annie R: Tibbers, on the ground, facing forward
    sketch("fx_tibbers", axis=2, length=2.6, ground=True)

def fx_garensword():  # Garen E/R: Demacian greatsword, point down, tip on the ground
    sketch("fx_garensword", rot=(90, 0, 0), axis=2, length=3.2, ground=True)

def fx_dariusaxe():  # Darius Q/R: the Noxian axe, centred
    sketch("fx_dariusaxe", axis=0, length=2.0)

def fx_grenade():  # Jhin Q: Dancing Grenade, centred
    sketch("fx_grenade", axis=2, length=0.55)

def fx_fireball():  # Annie Q: fireball, centred
    sketch("fx_fireball", length=0.8)

def fx_baguette():  # caster pigeon projectile, lying along Y, centred
    sketch("fx_baguette", length=0.75)

def fx_slipper():  # Filemón's thrown slipper, lying flat, centred
    sketch("fx_slipper", pick=True, length=0.45)

def fx_trap():  # Caitlyn W: Yordle Snap Trap, on the ground
    sketch("fx_trap", axis=0, length=1.3, ground=True)

def fx_lotus():  # Jhin E / Karma R: lotus on its stem, on the ground
    sketch("fx_lotus", axis=2, length=1.3, ground=True)

def fx_runestones():  # Ryze W: Rune Prison stones, on the ground
    sketch("fx_runestones", axis=0, length=2.6, ground=True)

def fx_scroll():  # Ryze E: Spell Flux scroll, centred
    sketch("fx_scroll", axis=2, length=1.1)

def fx_tentacle():  # Illaoi Q/R: tentacle rising out of the ground
    for o in sketch("fx_tentacle", axis=2, length=3.2, ground=True, pick=True, ratio=0.3):
        for v in o.data.vertices:  # the source is a thin, straight bind pose: thicken it and curl it forward
            h = v.co.z / 3.2
            v.co.x *= 4; v.co.y = v.co.y * 4 - 1.1 * h * h

def fx_idol():  # Illaoi E: the idol, on the ground
    sketch("fx_idol", axis=2, length=1.0, ground=True)

FX = {"phone": fx_phone, "envelope": fx_envelope, "sneaker": fx_sneaker, "bolt": fx_bolt, "briefcase": fx_briefcase, "cctv": fx_cctv,
      "tanktop": fx_tanktop, "oilbottle": fx_oilbottle, "puddle": fx_puddle, "speaker": fx_speaker, "vip": fx_vip, "discoball": fx_discoball,
      "plant": fx_plant, "bull": fx_bull, "bombbox": fx_bombbox, "flask": fx_flask, "badge": fx_badge,
      "tibbers": fx_tibbers, "garensword": fx_garensword, "dariusaxe": fx_dariusaxe, "grenade": fx_grenade, "fireball": fx_fireball,
      "baguette": fx_baguette, "slipper": fx_slipper, "trap": fx_trap, "lotus": fx_lotus, "runestones": fx_runestones,
      "scroll": fx_scroll, "tentacle": fx_tentacle, "idol": fx_idol}

def build_fx():
    global COLL
    clear()
    RIGS.clear()
    COLL = bpy.context.scene.collection
    for i, (name, fn) in enumerate(FX.items()):
        root = node(name)
        new_rig(name, "", None)
        fn()
        by_mat = {}
        for o, _, _ in CUR["parts"]: by_mat.setdefault(o.data.materials[0].name, []).append(o)
        for mname, objs in by_mat.items():
            o = join(objs)
            o.name = o.data.name = f"{name}_{mname}"
            o.parent = root
        root.location.x = i * 4  # spread out for Blender previews; the client resets the position
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "fx.glb")
    for img in bpy.data.images:  # Sketchfab textures: 512 px is plenty at MOBA camera distance
        if max(img.size) > 512: img.scale(*(max(1, c * 512 // max(img.size)) for c in img.size))
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT",
                              export_image_format="WEBP", export_animations=False, export_cameras=False, export_lights=False)
    return path

def main(ids=None):
    for cid in ids or CHAMPS:
        build(cid)
        print("exported", export(cid))
    if not ids: print("exported", build_fx())

if __name__ == "__main__": main()
