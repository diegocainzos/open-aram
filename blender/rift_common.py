# Shared helpers for the Rift environment scripts (arena.py, structures.py, minions.py).
# Geometry helpers (lathe/box/sphere/...) come from meme_champs.py; this adds named materials, UVs, Sketchfab imports,
# EEVEE preview renders at the game camera, GLB export + gltf-transform optimize, and the "run in the open GUI, then quit" loop.
import bpy, bmesh, math, os, subprocess, sys
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meme_champs as mc
from meme_champs import lathe, sphere, capsule, cyl, box, torus, prism, xf, rgba, TAU  # re-exported for the scripts

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = mc.OUT
PREV = os.environ.get("RIFT_PREVIEW", "/tmp/claude-1000/-home-diego-Projects-arameo-spain/e6e21fba-61f8-4ae4-88d4-f364d364ceb8/scratchpad/blender")
COLL = None

def reset():
    global COLL
    for c in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures,
              bpy.data.cameras, bpy.data.lights): [c.remove(d) for d in list(c)]
    bpy.context.scene.camera = None
    M.clear()
    COLL = bpy.context.scene.collection
    mc.COLL = COLL
    mc.MATS.clear()

# ---------------------------------------------------------------- materials
M = {}
def nmat(name, hexcol=0xffffff, emit=None, strength=1.0, tex=None, rough=0.85, clip=False):
    """Named material. name prefixes the client keys on: team* (runtime team tint), glow* (emissive x8 for bloom).
    tex: a bpy image multiplied by hexcol (exported as baseColorTexture + baseColorFactor)."""
    if name in M: return M[name]
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Base Color"].default_value = rgba(hexcol)
    if tex is not None:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = tex
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = rgba(hexcol)
        nt.links.new(t.outputs["Color"], mix.inputs["A"]); nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        if clip:  # alpha-tested cards (leaves): exporter reads Alpha > 0.5 as alphaMode MASK
            gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5
            nt.links.new(t.outputs["Alpha"], gt.inputs[0]); nt.links.new(gt.outputs[0], b.inputs["Alpha"])
            m.surface_render_method = "DITHERED"
    if emit is not None:
        b.inputs["Emission Color"].default_value = rgba(emit)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = rgba(hexcol)
    M[name] = m
    return m

def image(name, arr):
    """numpy HxWx3 float (sRGB 0..1, row 0 = top) -> packed bpy image."""
    import numpy as np
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba_ = np.ones((h, w, 4), np.float32); rgba_[..., :3] = np.clip(arr[::-1], 0, 1)
    img.pixels.foreach_set(rgba_.ravel())
    img.filepath_raw = os.path.join(PREV, name + ".png"); img.file_format = "PNG"; img.save()
    img.pack()
    return img

# ---------------------------------------------------------------- UVs
def uv_planar(bm, scale=1.0, off=(0, 0)):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops: l[uv].uv = (l.vert.co.x / scale + off[0], l.vert.co.y / scale + off[1])

def uv_box(bm, scale=1.0):
    """World-unit box projection (walls, rims): each face projects along its dominant normal axis."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; a = max(range(3), key=lambda i: abs(n[i]))
        i, j = [(1, 2), (0, 2), (0, 1)][a]
        for l in f.loops: l[uv].uv = (l.vert.co[i] / scale, l.vert.co[j] / scale)

def uv_face(bm):
    """Each face mapped to the whole 0..1 texture (per-face worn edges on blocks)."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; a = max(range(3), key=lambda i: abs(n[i]))
        i, j = [(1, 2), (0, 2), (0, 1)][a]
        us = [l.vert.co[i] for l in f.loops]; vs = [l.vert.co[j] for l in f.loops]
        du, dv = max(max(us) - min(us), 1e-6), max(max(vs) - min(vs), 1e-6)
        for l in f.loops: l[uv].uv = ((l.vert.co[i] - min(us)) / du, (l.vert.co[j] - min(vs)) / dv)

# ---------------------------------------------------------------- objects
def obj(name, bm, material, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=1, smooth=False):
    bm.transform(xf(loc, rot, scale))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(material)
    o = bpy.data.objects.new(name, me); COLL.objects.link(o); o.parent = parent
    return o

def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None); COLL.objects.link(o); o.parent = parent; o.location = loc
    return o

def merge(name, objs, parent=None):
    """Join objects (any transforms, any materials) into one mesh object with identity transform."""
    objs = [o for o in objs if o]
    bpy.context.view_layer.update()  # fresh objects have stale matrix_world
    bm = bmesh.new(); mats = []
    for o in objs:
        me = o.data.copy(); me.transform(o.matrix_world)
        idx = []
        for m in me.materials:
            if m not in mats: mats.append(m)
            idx.append(mats.index(m))
        for p in me.polygons: p.material_index = idx[p.material_index] if idx else 0
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    for o in objs: bpy.data.objects.remove(o)  # meshes may be shared sources; orphans are never exported
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    o = bpy.data.objects.new(name, me); COLL.objects.link(o); o.parent = parent
    return o

def load(fname):
    """Import blender/src/<fname>.glb; returns its mesh objects with transforms applied, unparented (empties removed)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, fname + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        if o.type == "MESH":
            mw = o.matrix_world.copy(); o.parent = None; o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = Matrix()
            meshes.append(o)
    for o in new:
        if o.type != "MESH": bpy.data.objects.remove(o)
    return meshes

def decimate(o, ratio):
    if ratio >= 1: return o
    md = o.modifiers.new("dec", "DECIMATE"); md.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data; o.modifiers.clear(); o.data = me
    if old.users == 0: bpy.data.meshes.remove(old)
    return o

def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == "MESH")

def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

# ---------------------------------------------------------------- preview + export
def lights():
    sc = bpy.context.scene
    w = bpy.data.worlds.new("w"); sc.world = w
    w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = rgba(0x6a7090); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    for name, col, energy, rot in (("sun", 0xffe2b8, 3.2, (math.radians(51), 0, math.radians(-35))),
                                   ("fill", 0x8fa8ff, 0.8, (math.radians(60), 0, math.radians(150)))):
        l = bpy.data.lights.new(name, "SUN"); l.color = rgba(col)[:3]; l.energy = energy; l.angle = 0.05
        o = bpy.data.objects.new(name, l); COLL.objects.link(o); o.rotation_euler = rot
    sc.render.engine = "BLENDER_EEVEE"
    sc.view_settings.view_transform = "AgX"
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720

def shot(name, target, dist=24.0, pitch=60.0, yaw=0.0, fov=40.0):
    """Render PREV/<name>.png from the game camera: pitch deg down, dist from target, camera behind -Y (three +Z)."""
    sc = bpy.context.scene
    cam = sc.camera or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if not sc.camera: COLL.objects.link(cam); sc.camera = cam
    cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(fov); cam.data.clip_end = 1000
    p, y = math.radians(pitch), math.radians(yaw)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    os.makedirs(PREV, exist_ok=True)
    sc.render.filepath = os.path.join(PREV, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("preview", sc.render.filepath)

def export(fname, anim=False):
    """Export all scene meshes/empties/armatures to OUT/<fname>.glb, then meshopt + webp it in place."""
    if os.environ.get("RIFT_SAVE"): bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ["RIFT_SAVE"]), compress=True)  # viewer copy
    if os.environ.get("RIFT_NOEXPORT"): return None  # preview-only iteration
    os.makedirs(OUT, exist_ok=True)
    raw = os.path.join(PREV, fname + ".raw.glb"); path = os.path.join(OUT, fname + ".glb")
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT"): bpy.data.objects.remove(o)
    bpy.context.scene.render.fps, bpy.context.scene.frame_start = mc.FPS, 0
    kw = dict(export_animation_mode="NLA_TRACKS", export_force_sampling=True) if anim else {}
    bpy.ops.export_scene.gltf(filepath=raw, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT",
                              export_animations=anim, export_cameras=False, export_lights=False, export_image_format="AUTO", **kw)
    subprocess.run(["npx", "-y", "@gltf-transform/cli", "optimize", raw, path, "--compress", "meshopt", "--texture-compress", "webp",
                    "--texture-size", "2048", "--palette", "false", "--flatten", "false", "--join", "false", "--instance", "false",
                    "--simplify", "false", "--prune-solid-textures", "false"], check=True, cwd=HERE)
    os.remove(raw)
    fix_names(path)
    print("exported", path, os.path.getsize(path) // 1024, "KB")
    return path

def fix_names(path):
    """Strip Blender's unique-name suffixes (core.001 -> core) from glTF node/mesh/material names; glTF allows duplicates."""
    import json, re, struct
    b = open(path, "rb").read()
    n = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + n])
    for k in ("nodes", "meshes", "materials", "animations"):
        for it in j.get(k, []):
            if "name" in it: it["name"] = re.sub(r"\.\d{3}$", "", it["name"])
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * (-len(js) % 4)
    rest = b[20 + n:]
    open(path, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest)

def run(main):
    """Headless (blender -b): run main() now. With the GUI: run it once the window is up, then quit."""
    if bpy.app.background: return main()
    def go():
        win = bpy.context.window_manager.windows[0]
        area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), None)
        try:
            with bpy.context.temp_override(window=win, screen=win.screen, area=area):
                main()
        except Exception:
            import traceback; traceback.print_exc()
        bpy.app.timers.register(lambda: bpy.ops.wm.quit_blender() and None, first_interval=1.5)
    bpy.app.timers.register(go, first_interval=1.0)
