# Builds the four lane minions -> client/public/models/minion_{melee,caster,siege,super}.glb
# Run: blender -b --python blender/minions.py   (renders previews to $RIFT_PREVIEW, exports)
#
# GLB contract (same as meme_champs.py): root "minion" -> "body" armature (feet at origin, facing -Y) with bones
# root/hips/spine/head/arm_L/arm_R/leg_L/leg_R (siege: the legs are the wheels); rigid bone-parented meshes.
# Clips: idle, run (loop), attack, death (once). team_* materials are tinted to the team colour at runtime (neutral light base).
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rift_common as rc
import meme_champs as mc
from meme_champs import part, legs, arm, mirror, lathe, sphere, capsule, cyl, box, torus, prism, star

# colour -> material name (mc.mat names by hex; renamed before the rig merge so node names read well)
TEAM, TEAM2, ORB = 0xf2f2f2, 0xdcdce4, 0xfefefe
NAMES = {TEAM: "team_cloth", TEAM2: "team_plate", ORB: "team_glow_orb", 0x8f96a8: "steel", 0x565c6e: "steel_dark", 0xd9a441: "gold",
         0x4a3322: "leather", 0x6b4a2e: "wood", 0x2a2630: "iron", 0x15121c: "shadow", 0xffe27a: "glow_eyes", 0xe9b98f: "skin",
         0x8a8296: "stone", 0xdfe6ee: "blade"}
STEEL, DARK, GOLD, LEATHER, WOOD, IRON, SHADOW, EYES, SKIN, STONE = 0x8f96a8, 0x565c6e, 0xd9a441, 0x4a3322, 0x6b4a2e, 0x2a2630, 0x15121c, 0xffe27a, 0xe9b98f, 0x8a8296

def eye(body, x, y, z, r=0.03): part("eye", sphere(r, 8, 6), EYES, body, (x, y, z), emit=EYES)

# ---------------------------------------------------------------- models (big head + shoulders, short legs)
def melee(body):
    legs(DARK, LEATHER, hip=0.3, spread=0.1, r=0.065, shoe_scale=0.8)
    part("torso", lathe([(0, 0.26), (0.19, 0.28), (0.24, 0.42), (0.25, 0.56), (0.2, 0.68), (0, 0.71)], 14), STEEL, "spine")
    part("tabard", box(0.3, 0.05, 0.42, 0.02), TEAM, "spine", (0, -0.235, 0.45))
    part("tabardb", box(0.3, 0.05, 0.36, 0.02), TEAM, "spine", (0, 0.22, 0.47))
    part("belt", torus(0.22, 0.03, 16, 5), LEATHER, "hips", (0, 0, 0.32))
    mirror(lambda s: part("pauldron", sphere(0.14, 12, 8), STEEL, "spine", (0.25 * s, 0, 0.66), scale=(1.1, 1, 0.8)))
    mirror(lambda s: part("pauldtrim", torus(0.12, 0.022, 14, 4), TEAM2, "spine", (0.26 * s, 0, 0.62), rot=(0, 0.35 * s, 0)))
    HZ = 0.88
    mc.CUR["sk"]["hz"] = HZ
    part("helm", sphere(0.21, 16, 10), STEEL, "head", (0, 0, HZ), scale=(1, 1.05, 1.02))
    part("visor", box(0.3, 0.06, 0.07, 0.02), SHADOW, "head", (0, -0.2, HZ - 0.01), rot=(0.15, 0, 0))
    mirror(lambda s: eye("head", 0.07 * s, -0.225, HZ - 0.005, 0.028))
    part("rim", torus(0.2, 0.025, 18, 5), GOLD, "head", (0, 0, HZ - 0.07))
    part("crest", box(0.04, 0.34, 0.14, 0.02), TEAM, "head", (0, 0.02, HZ + 0.2))
    aL = arm(-0.29, 0.62, STEEL, LEATHER, length=0.27, r=0.055, hand=0.07)
    part("shield", cyl(0.2, 0.2, 0.05, 16), TEAM2, aL, (-0.07, -0.08, -0.22), rot=(0, math.pi / 2, 0.35))
    part("boss", sphere(0.06, 10, 6), GOLD, aL, (-0.11, -0.07, -0.22))
    part("shieldrim", torus(0.2, 0.02, 16, 4), STEEL, aL, (-0.09, -0.08, -0.22), rot=(0, math.pi / 2, 0.35))
    aR = arm(0.29, 0.62, STEEL, LEATHER, length=0.27, r=0.055, hand=0.07)
    part("blade", box(0.05, 0.02, 0.42, 0.01), 0xdfe6ee, aR, (0, -0.2, -0.28), rot=(-0.95, 0, 0), smooth=False)
    part("guard", box(0.16, 0.04, 0.035, 0.01), GOLD, aR, (0, -0.05, -0.31), rot=(-0.95, 0, 0))

def caster(body):
    legs(DARK, LEATHER, hip=0.25, spread=0.08, r=0.055, shoe_scale=0.7)
    part("robe", lathe([(0.0, 0.1), (0.25, 0.1), (0.24, 0.2), (0.19, 0.42), (0.17, 0.58), (0.0, 0.6)], 14), TEAM, "hips")
    part("chest", lathe([(0.0, 0.38), (0.19, 0.4), (0.2, 0.52), (0.15, 0.64), (0.0, 0.66)], 12), TEAM, "spine")
    part("sash", torus(0.19, 0.03, 16, 5), GOLD, "spine", (0, 0, 0.42))
    part("mantle", lathe([(0.12, 0.54), (0.3, 0.55), (0.3, 0.6), (0.12, 0.67)], 14), TEAM2, "spine")
    HZ = 0.8
    mc.CUR["sk"]["hz"] = HZ
    part("hood", sphere(0.21, 16, 10), TEAM, "head", (0, 0.02, HZ), scale=(1, 1.05, 1.05))
    part("hoodtip", lathe([(0.0, 0), (0.1, 0.02), (0.0, 0.22)], 8), TEAM, "head", (0, 0.14, HZ + 0.14), rot=(-1.1, 0, 0))
    part("face", sphere(0.15, 12, 8), SHADOW, "head", (0, -0.1, HZ - 0.01), scale=(1, 0.7, 1))
    mirror(lambda s: eye("head", 0.055 * s, -0.2, HZ, 0.03))
    aL = arm(-0.22, 0.6, TEAM, SKIN, length=0.24, r=0.05, hand=0.055)
    aR = arm(0.22, 0.6, TEAM, SKIN, length=0.24, r=0.05, hand=0.055)
    part("staff", cyl(0.025, 0.03, 0.95, 6), WOOD, aR, (0, -0.06, -0.2))
    part("claw", torus(0.08, 0.018, 10, 4), GOLD, aR, (0, -0.06, 0.3), rot=(math.pi / 2, 0, 0))
    part("orb", sphere(0.08, 12, 8), ORB, aR, (0, -0.06, 0.32), emit=0xe0ecff)

def siege(body):
    mc.CUR["sk"].update(hip=0.3, spread=0.42)  # "legs" are the wheels: bone heads sit on the axle
    def wheel(s):
        b = "leg_L" if s < 0 else "leg_R"
        part("wheel", cyl(0.3, 0.3, 0.1, 14), WOOD, b, (0.42 * s, 0, 0.3), rot=(0, math.pi / 2, 0))
        part("tyre", torus(0.3, 0.035, 18, 5), IRON, b, (0.42 * s, 0, 0.3), rot=(0, math.pi / 2, 0))
        for k in range(3): part("spoke", box(0.03, 0.5, 0.05), IRON, b, (0.42 * s + 0.055 * s, 0, 0.3), rot=(k * math.pi / 3, 0, 0))
        part("hub", sphere(0.07, 8, 6), GOLD, b, (0.49 * s, 0, 0.3))
    mirror(wheel)
    part("chassis", box(0.72, 1.05, 0.16, 0.03), WOOD, "hips", (0, 0.05, 0.38))
    part("axle", cyl(0.04, 0.04, 0.84, 6), IRON, "hips", (0, 0, 0.3), rot=(0, math.pi / 2, 0))
    part("plate", box(0.74, 0.05, 0.3, 0.02), TEAM2, "hips", (0, -0.5, 0.42), rot=(-0.3, 0, 0))
    part("emblem", prism(star(4, 0.1, 0.045), 0.03), GOLD, "hips", (0, -0.54, 0.43), rot=(math.pi / 2 - 0.3, 0, 0))
    # cannon on the spine (recoils with it)
    part("cradle", box(0.4, 0.4, 0.16, 0.03), IRON, "spine", (0, -0.05, 0.53))
    part("barrel", lathe([(0.0, 0), (0.17, 0), (0.16, 0.3), (0.13, 0.55), (0.16, 0.62), (0.16, 0.7), (0.1, 0.7), (0.0, 0.62)], 12), IRON, "spine", (0, 0.2, 0.72), rot=(math.pi / 2, 0, 0))
    part("band", torus(0.155, 0.025, 14, 4), GOLD, "spine", (0, -0.1, 0.72), rot=(math.pi / 2, 0, 0))
    part("muzzle", torus(0.15, 0.03, 14, 4), GOLD, "spine", (0, -0.47, 0.72), rot=(math.pi / 2, 0, 0))
    part("banner", box(0.03, 0.26, 0.34, 0.01), TEAM, "spine", (-0.3, 0.42, 0.95))
    part("pole", cyl(0.018, 0.018, 0.8, 5), WOOD, "spine", (-0.3, 0.3, 0.8))
    # gunner sitting at the back
    part("gunner", lathe([(0.0, 0.46), (0.17, 0.48), (0.2, 0.62), (0.16, 0.8), (0.0, 0.83)], 12), TEAM, "spine", (0, 0.36, 0))
    HZ = 1.02
    mc.CUR["sk"]["hz"] = HZ
    part("head", sphere(0.17, 14, 10), SKIN, "head", (0, 0.36, HZ))
    part("goggles", box(0.26, 0.06, 0.07, 0.02), GOLD, "head", (0, 0.2, HZ + 0.03))
    mirror(lambda s: eye("head", 0.06 * s, 0.17, HZ + 0.03, 0.03))
    part("cap", sphere(0.18, 14, 8), STEEL, "head", (0, 0.37, HZ + 0.05), scale=(1, 1, 0.65))
    part("capfin", box(0.035, 0.24, 0.1, 0.01), TEAM, "head", (0, 0.38, HZ + 0.17))
    arm(-0.22, 0.78, TEAM, SKIN, length=0.22, r=0.045, hand=0.055)
    arm(0.22, 0.78, TEAM, SKIN, length=0.22, r=0.045, hand=0.055)

def superm(body):
    legs(DARK, IRON, hip=0.55, spread=0.24, r=0.14, shoe_scale=1.25)
    part("torso", lathe([(0, 0.5), (0.36, 0.55), (0.48, 0.8), (0.52, 1.1), (0.46, 1.35), (0.25, 1.48), (0, 1.5)], 16), STONE, "spine", scale=(1.1, 0.9, 1))
    part("chestplate", lathe([(0, 0.8), (0.42, 0.82), (0.47, 1.05), (0.42, 1.3), (0, 1.33)], 14), STEEL, "spine", (0, -0.06, 0), scale=(1.12, 0.85, 1))
    part("loin", box(0.4, 0.06, 0.45, 0.02), TEAM, "hips", (0, -0.38, 0.45), rot=(0.12, 0, 0))
    part("belt", torus(0.44, 0.05, 18, 5), LEATHER, "hips", (0, 0, 0.62), scale=(1.1, 0.88, 1))
    part("buckle", sphere(0.1, 10, 6), GOLD, "hips", (0, -0.42, 0.62), scale=(1, 0.5, 1))
    def shoulder(s):
        part("pauldron", sphere(0.32, 14, 10), STEEL, "spine", (0.55 * s, 0, 1.38), scale=(1.1, 1, 0.85))
        part("pcloth", box(0.4, 0.46, 0.05, 0.02), TEAM, "spine", (0.56 * s, 0, 1.22), rot=(0, 0.5 * s, 0))
        for k in range(2): part("spike", lathe([(0.0, 0), (0.07, 0), (0.0, 0.26)], 6), GOLD, "spine", (0.6 * s, -0.12 + k * 0.24, 1.58), rot=(0, 0.35 * s, 0))
    mirror(shoulder)
    HZ = 1.58
    mc.CUR["sk"]["hz"] = HZ
    part("helm", sphere(0.23, 14, 10), DARK, "head", (0, -0.12, HZ), scale=(1, 1.05, 0.95))
    part("visor", box(0.3, 0.06, 0.06, 0.02), SHADOW, "head", (0, -0.34, HZ - 0.01))
    mirror(lambda s: eye("head", 0.08 * s, -0.36, HZ - 0.005, 0.035))
    mirror(lambda s: part("horn", lathe([(0.0, 0), (0.07, 0), (0.0, 0.34)], 7), TEAM2, "head", (0.2 * s, -0.1, HZ + 0.08), rot=(0, 0.9 * s, 0)))
    for s in (-1, 1):
        a = arm(0.66 * s, 1.3, STONE, IRON, length=0.72, r=0.13, hand=0.2)
        part("bracer", cyl(0.16, 0.18, 0.22, 10), STEEL, a, (0, 0, -0.55))

# ---------------------------------------------------------------- clips
def clips(kind):
    c = mc.base_clips(); del c["cast"]
    if kind == "melee":  # overhead sword chop
        c["attack"] = (15, {0: {}, 5: {"arm_R": (-160, 0, -10), "spine": (-8, 0, 12), "head": (-6, 0, 0), "arm_L": (-30, 10, 0)},
                            9: {"arm_R": (-45, 0, 0), "spine": (18, 0, -10), "head": (8, 0, 0), "arm_L": (-40, 10, 0), "@hips": (0, -0.04, -0.03)}, 15: {}})
    elif kind == "caster":  # thrust the staff forward
        c["attack"] = (15, {0: {}, 5: {"arm_R": (-30, 0, 0), "spine": (-8, 0, 0), "arm_L": (-40, 20, 0)},
                            9: {"arm_R": (-95, 0, 8), "spine": (12, 0, 0), "head": (6, 0, 0), "arm_L": (-70, 30, 0)}, 15: {}})
    elif kind == "super":  # two-fisted slam
        c["attack"] = (18, {0: {}, 6: {"arm_L": (-165, 15, 0), "arm_R": (-165, -15, 0), "spine": (-12, 0, 0), "head": (-10, 0, 0), "@hips": (0, 0, 0.05)},
                            10: {"arm_L": (-50, 5, 0), "arm_R": (-50, -5, 0), "spine": (28, 0, 0), "head": (10, 0, 0), "@hips": (0, -0.05, -0.12)}, 18: {}})
        for f in (0, 10, 20): mc.tweak(c, "run", f, spine=(14, 0, 0))
    elif kind == "siege":
        spin = lambda f: {"leg_L": (-90 * f, 0, 0), "leg_R": (-90 * f, 0, 0)}
        c["run"] = (20, {f * 5: {**spin(f), "@hips": (0, 0, 0.015 * (f % 2)), "arm_L": (-60, 0, 0), "arm_R": (-60, 0, 0), "head": (5 * (f % 2), 0, 0)} for f in range(5)})
        c["idle"] = (60, {0: {"arm_L": (-60, 0, 0), "arm_R": (-60, 0, 0)}, 30: {"arm_L": (-55, 0, 0), "arm_R": (-65, 0, 0), "head": (0, 0, 12), "@hips": (0, 0, -0.01)},
                          60: {"arm_L": (-60, 0, 0), "arm_R": (-60, 0, 0)}})
        c["attack"] = (18, {0: {"arm_L": (-60, 0, 0), "arm_R": (-60, 0, 0)}, 3: {"spine": (-10, 0, 0), "@spine": (0, 0.14, 0), "head": (-15, 0, 0), "arm_L": (-100, 0, 0), "arm_R": (-100, 0, 0), "leg_L": (15, 0, 0), "leg_R": (15, 0, 0)},
                            10: {"spine": (-3, 0, 0), "@spine": (0, 0.03, 0), "arm_L": (-70, 0, 0), "arm_R": (-70, 0, 0)}, 18: {"arm_L": (-60, 0, 0), "arm_R": (-60, 0, 0)}})
        c["death"] = (30, {0: {}, 8: {"root": (0, 35, 0), "@root": (0, 0, 0.15), "head": (-20, 0, 0)},
                           18: {"root": (0, 95, 0), "@root": (0.35, 0, 0.3), "head": (-30, 0, 20), "arm_L": (-150, 40, 0), "arm_R": (-120, -40, 0)},
                           30: {"root": (0, 90, 0), "@root": (0.4, 0, 0.42), "head": (-30, 0, 20), "arm_L": (-160, 50, 0), "arm_R": (-130, -40, 0), "leg_L": (-120, 0, 0), "leg_R": (-60, 0, 0)}})
    return c

BUILD = {"melee": melee, "caster": caster, "siege": siege, "super": superm}

def build(kind):
    rc.reset(); mc.RIGS.clear()
    root = rc.empty("minion")
    BUILD[kind](mc.new_rig("body", "", root))
    for m in bpy.data.materials:
        k = int(m.name[1:7], 16) if m.name.startswith("c") and len(m.name) >= 7 else None
        if k in NAMES: m.name = NAMES[k]
    A = mc.skeleton(mc.RIGS[0])
    mc.animate(A, "", clips(kind))
    return root, A

def pose(A, clip, frame):
    for tr in A.animation_data.nla_tracks: tr.mute = tr.name != clip
    bpy.context.scene.frame_set(frame)

def main():
    shots = []
    for kind in BUILD:
        root, A = build(kind)
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        lo, hi = rc.bounds(meshes)
        print("MINION", kind, "tris", rc.tris(meshes), "height", round(hi.z - lo.z, 2), "nodes", sorted(o.name for o in meshes))
        rc.lights()
        champ = rc.obj("mk", capsule(0.4, 1.0), rc.nmat("marker", 0xff3355), loc=(1.6, 0.5, 0.9))
        pose(A, "idle", 0); rc.shot(f"minion_{kind}", (0.6, 0, 0.7), dist=6, pitch=35, yaw=-25)
        pose(A, "attack", 6 if kind != "siege" else 3); rc.shot(f"minion_{kind}_atk", (0.6, 0, 0.7), dist=6, pitch=35, yaw=-25)
        pose(A, "death", 30); rc.shot(f"minion_{kind}_death", (0.6, 0, 0.7), dist=6, pitch=35, yaw=-25)
        for tr in A.animation_data.nla_tracks: tr.mute = False
        bpy.context.scene.frame_set(0)
        bpy.data.objects.remove(champ)
        rc.export(f"minion_{kind}", anim=True)

if __name__ == "__main__": rc.run(main)
