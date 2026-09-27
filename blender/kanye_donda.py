# Rigs + animates the Sketchfab "Kanye Model Donda" (blender/src/kanye_donda.glb, credits in blender/src/CREDITS.txt)
# and exports client/public/models/kanye.glb. Replaces the procedural Kanye from meme_champs.py.
# Run: blender -b --python blender/kanye_donda.py   (or exec() it through the Blender MCP)
#
# Same GLB contract as meme_champs.py: root "kanye" -> armature "body" (feet at origin, front = -Y), "halo" extra on the
# head, clips idle/run/recall (loop), attack/attack2/cast/death/spell1..4 (once). The mesh is skinned with automatic
# weights to a 16-bone skeleton placed by hand on the model's rest pose (a crouched boxing guard).
import bpy, math, os
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src", "kanye_donda.glb")
OUT = os.path.normpath(os.path.join(HERE, "..", "client", "public", "models", "kanye.glb"))
HEIGHT, FACES, FPS = 2.0, 24000, 30

# (name, head, tail, parent) in the normalized model space: feet at z=0, front -Y, character's left = +X.
BONES = [
    ("root", (0, 0, 0), (0, 0, 0.3), None),
    ("hips", (0, 0, 0.9), (0, 0, 1.1), "root"),
    ("spine", (0, 0.02, 1.1), (0, 0.03, 1.48), "hips"),
    ("chest", (0, 0.03, 1.48), (0, 0, 1.7), "spine"),
    ("head", (0, -0.03, 1.72), (0, -0.06, 2.0), "chest"),
    *[b for s, n in ((1, "L"), (-1, "R")) for b in (
        (f"arm_{n}", (0.3 * s, 0.03, 1.6), (0.46 * s, 0.03, 1.34), "chest"),
        (f"fore_{n}", (0.46 * s, 0.03, 1.34), ((0.14 if s > 0 else -0.4), -0.22, 1.22), f"arm_{n}"),
        (f"thigh_{n}", (0.16 * s, 0, 0.95), (0.44 * s, -0.05, 0.5), "hips"),
        (f"shin_{n}", (0.44 * s, -0.05, 0.5), (0.43 * s, 0.02, 0.13), f"thigh_{n}"),
        (f"foot_{n}", (0.43 * s, 0.02, 0.13), (0.43 * s, -0.26, 0.04), f"shin_{n}"),
    )],
]

def load_mesh():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=SRC)
    m = next(o for o in bpy.data.objects if o.type == "MESH")
    mw = m.matrix_world.copy()
    m.parent = None
    m.data.transform(mw)
    m.matrix_world = Matrix()
    for o in list(bpy.data.objects):
        if o is not m: bpy.data.objects.remove(o)
    me = m.data
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    s = HEIGHT / (hi.z - lo.z)
    # centre on X/Y, feet at 0, scale, turn to face -Y (the source faces +Y)
    me.transform(Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    m.name = me.name = "kanye_mesh"
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.select_all(action="DESELECT"); m.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.object.mode_set(mode="OBJECT")
    dec = m.modifiers.new("dec", "DECIMATE"); dec.ratio = min(1, FACES / len(me.polygons))
    bpy.ops.object.modifier_apply(modifier="dec")
    return m

def build():
    m = load_mesh()
    root = bpy.data.objects.new("kanye", None); bpy.context.scene.collection.objects.link(root)
    A = bpy.data.objects.new("body", bpy.data.armatures.new("body")); bpy.context.scene.collection.objects.link(A)
    A.parent = root
    bpy.context.view_layer.objects.active = A
    bpy.ops.object.mode_set(mode="EDIT")
    for n, h, t, p in BONES:
        b = A.data.edit_bones.new(n); b.head, b.tail = h, t
        if p: b.parent = A.data.edit_bones[p]; b.use_connect = Vector(h) == A.data.edit_bones[p].tail
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT"); m.select_set(True); A.select_set(True)
    bpy.context.view_layer.objects.active = A
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bare = [v.index for v in m.data.vertices if not any(g.weight > 0.01 for g in v.groups)]
    if bare:  # heat weighting leaves islands (spikes, loose shells) empty: give them to the nearest bone
        segs = [(b.name, b.head_local, b.tail_local) for b in A.data.bones if b.name != "root"]
        def near(p): return min(segs, key=lambda s: (p - (s[1] + (s[2] - s[1]) * max(0, min(1, (p - s[1]).dot(s[2] - s[1]) / (s[2] - s[1]).length_squared)))).length)[0]
        for i in bare: m.vertex_groups[near(m.data.vertices[i].co)].add([i], 1.0, "REPLACE")
    halo(A)
    animate(A, clips())
    return root, len(bare), len(m.data.polygons)

def halo(A):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.03, major_segments=32, minor_segments=8, location=(0, -0.03, 2.14))
    h = bpy.context.object; h.name = "halo"
    mat = bpy.data.materials.new("halo"); mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 0.75, 0.05, 1)
    bsdf.inputs["Emission Color"].default_value = (0.4, 0.26, 0, 1); bsdf.inputs["Emission Strength"].default_value = 1
    h.data.materials.append(mat)
    mw = h.matrix_world.copy()
    h.parent, h.parent_type, h.parent_bone = A, "BONE", "head"
    h.matrix_world = mw

# ---------------------------------------------------------------- animation
# Poses: {bone: (rx, ry, rz) degrees about world axes at rest, "@bone": world offset}. -X raises an arm/leg forward,
# +X bends the spine forward, -Y swings the left arm out sideways (+Y the right one), Z twists.
def clips():
    breathe = lambda k: {"spine": (-2 * k, 0, 0), "chest": (-2 * k, 0, 0), "head": (3 * k, 0, 0), "arm_L": (0, -3 * k, 0), "arm_R": (0, 3 * k, 0), "@hips": (0, 0, -0.012 * k)}
    stride = lambda s: {"thigh_L": (-28 * s, 0, 0), "thigh_R": (28 * s, 0, 0), "shin_L": (30 * max(0, -s) + 8, 0, 0), "shin_R": (30 * max(0, s) + 8, 0, 0),
                        "arm_L": (30 * s, 0, 0), "arm_R": (-30 * s, 0, 0), "spine": (12, 0, 6 * s), "head": (-8, 0, -6 * s), "@hips": (0, 0, -0.03)}
    up = lambda d: {"@hips": (0, 0, d)}
    jab = lambda side, t: {f"arm_{side}": (-75 * t, 0, 0), f"fore_{side}": (-30 * t, (25 if side == "R" else -25) * t, 0), "chest": (0, 0, (-28 if side == "R" else 28) * t), "spine": (8 * t, 0, 0)}
    wide = lambda a, lift: {"arm_L": (-15, -a, 0), "arm_R": (-15, a, 0), "fore_L": (0, -35, 0), "fore_R": (0, 35, 0), "head": (-38, 0, 0), "chest": (-14, 0, 0), "spine": (-8, 0, 0), "@hips": (0, 0, lift)}
    sprint = lambda s: {**stride(s * 1.5), "spine": (32, 0, 0), "chest": (8, 0, 0), "head": (-26, 0, 0), "arm_L": (70, -20, 0), "arm_R": (70, 20, 0), "fore_L": (40, 0, 0), "fore_R": (40, 0, 0), "@hips": (0, 0, -0.08)}
    dead = {"root": (-90, 0, 0), "@root": (0, 0, 0.18), "arm_L": (-40, -60, 0), "arm_R": (-40, 60, 0), "head": (0, 0, 25), "thigh_L": (-20, 0, 0)}
    return {
        "idle": (60, {0: breathe(0), 30: breathe(1), 60: breathe(0)}),
        "run": (20, {0: stride(1), 5: {**stride(0), **up(0.02)}, 10: stride(-1), 15: {**stride(0), **up(0.02)}, 20: stride(1)}),
        "recall": (60, {0: {}, 15: {"arm_L": (-80, 0, -40), "arm_R": (-80, 0, 40), "fore_L": (0, 0, -50), "fore_R": (0, 0, 50), "head": (30, 0, 0), "spine": (10, 0, 0)},
                        45: {"arm_L": (-82, 0, -40), "arm_R": (-82, 0, 40), "fore_L": (0, 0, -50), "fore_R": (0, 0, 50), "head": (34, 0, 0), "spine": (12, 0, 0)}, 60: {}}),
        "attack": (15, {0: {}, 3: jab("R", -0.3), 6: jab("R", 1), 10: jab("R", 0.8), 15: {}}),
        "attack2": (15, {0: {}, 3: jab("L", -0.3), 6: jab("L", 1), 10: jab("L", 0.8), 15: {}}),
        "cast": (15, {0: {}, 6: wide(60, 0.03), 15: {}}),
        "death": (30, {0: {}, 6: {"spine": (-20, 0, 0), "head": (-30, 0, 0), "arm_L": (-60, -30, 0), "arm_R": (-60, 30, 0)}, 20: {**dead, "@root": (0, 0, 0.3)}, 26: dead, 30: dead}),
        # Q Tweet Polémico: wind up behind the head, overhand phone throw with the right hand
        "spell1": (15, {0: {}, 4: {"arm_R": (40, 30, 0), "fore_R": (-60, 0, 0), "chest": (-10, 0, 30), "spine": (-6, 0, 0), "arm_L": (-50, 0, 0)},
                        7: {"arm_R": (-150, 0, 0), "fore_R": (-20, 0, 0), "chest": (15, 0, -30), "spine": (14, 0, 0), "head": (8, 0, 0), "arm_L": (30, 0, 0)}, 15: {}}),
        # W Yeezy Drop: point at the sky, then slam both fists down into a crouch as the sneaker lands
        "spell2": (18, {0: {}, 5: {"arm_R": (-170, 0, 0), "fore_R": (0, 30, 0), "arm_L": (10, -15, 0), "head": (-32, 0, 0), "chest": (-10, 0, 0)},
                        10: {"arm_L": (-50, 0, 0), "arm_R": (-50, 0, 0), "spine": (30, 0, 0), "head": (15, 0, 0), "thigh_L": (-35, 0, 0), "thigh_R": (-35, 0, 0), "shin_L": (60, 0, 0), "shin_R": (60, 0, 0), "@hips": (0, 0, -0.2)},
                        14: {"arm_L": (-45, 0, 0), "arm_R": (-45, 0, 0), "spine": (25, 0, 0), "thigh_L": (-30, 0, 0), "thigh_R": (-30, 0, 0), "shin_L": (50, 0, 0), "shin_R": (50, 0, 0), "@hips": (0, 0, -0.16)}, 18: {}}),
        # E I Wonder Dash: low ninja sprint
        "spell3": (12, {0: {}, 3: sprint(1), 6: sprint(-1), 9: sprint(1), 12: {}}),
        # R Episodio Maníaco: arms flung wide, face to the heavens, rising (the client lifts him into levitation after)
        "spell4": (30, {0: {}, 8: wide(75, 0.15), 22: wide(85, 0.22), 30: wide(70, 0.1)}),
    }

def animate(A, clips):
    ad = A.animation_data_create()
    for pb in A.pose.bones: pb.rotation_mode = "QUATERNION"
    rest = {b.name: b.matrix_local.to_quaternion() for b in A.data.bones}
    for name, (_, keys) in clips.items():
        act = bpy.data.actions.new(name); ad.action = act
        prev = {}
        for f in sorted(keys):
            for pb in A.pose.bones:
                B = rest[pb.name]
                q = B.inverted() @ Euler([math.radians(a) for a in keys[f].get(pb.name, (0, 0, 0))]).to_quaternion() @ B
                if pb.name in prev: q.make_compatible(prev[pb.name])
                prev[pb.name] = pb.rotation_quaternion = q
                pb.location = B.inverted() @ Vector(keys[f].get("@" + pb.name, (0, 0, 0)))
                pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("location", frame=f)
        track = ad.nla_tracks.new(); track.name = name
        track.strips.new(name, 0, act)
        ad.action = None
    for pb in A.pose.bones: pb.rotation_quaternion, pb.location = (1, 0, 0, 0), (0, 0, 0)

def export():
    sc = bpy.context.scene
    sc.render.fps, sc.frame_start = FPS, 0
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_materials="EXPORT", export_image_format="WEBP",
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                              export_cameras=False, export_lights=False)
    return OUT

def main():
    _, bare, faces = build()
    print("kanye: faces", faces, "unweighted fixed", bare, "->", export())

if __name__ == "__main__": main()
