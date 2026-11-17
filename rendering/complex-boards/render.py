"""Render a hero composition of complex tscircuit boards.

blender --background --python rendering/complex-boards/render.py -- \
    --layout rendering/complex-boards/layout.json --output assets/hero-complex-boards.png
        [--engine eevee|cycles] [--samples 64] [--scale 50]

Scene units are centimetres. Boards keep their true relative size (all GLBs come
from the same exporter, so one global unit conversion applies to every board).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--layout", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--scale", type=int, default=100, help="resolution percentage")
    p.add_argument("--dry", action="store_true", help="only print each board's normalized screen bbox")
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:])


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_bounds(objects):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            pt = obj.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, pt))
            hi = Vector(map(max, hi, pt))
    return lo, hi


def is_board_material(material):
    name = material.name.lower()
    return any(k in name for k in ("topmaterial", "bottommaterial", "boardsidematerial"))


def principled(material):
    if not material.use_nodes or not material.node_tree:
        return None
    return next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def set_input(node, value, *names):
    for name in names:
        sock = node.inputs.get(name)
        if sock is not None and not sock.is_linked:
            sock.default_value = value
            return


def tune_materials():
    """Same component material treatment as rendering/hero-boards/render.py."""
    for m in bpy.data.materials:
        if is_board_material(m):
            node = principled(m)
            if node is not None and "side" not in m.name.lower():
                # solder mask has a thin glossy lacquer over the textured board face
                set_input(node, 0.38, "Coat Weight", "Clearcoat")
                set_input(node, 0.08, "Coat Roughness", "Clearcoat Roughness")
            continue
        node = principled(m)
        if node is None:
            continue
        base = node.inputs.get("Base Color")
        c = tuple(base.default_value[:3]) if base else (0.5, 0.5, 0.5)
        lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        chroma = max(c) - min(c)
        if c[0] > 0.55 and c[1] > 0.35 and c[2] < 0.35:  # gold / copper
            set_input(node, 0.24, "Roughness"); set_input(node, 0.78, "Metallic")
        elif lum < 0.28:  # dark packages
            set_input(node, 0.34, "Roughness"); set_input(node, 0.06, "Metallic")
            set_input(node, 0.06, "Coat Weight", "Clearcoat")
        elif lum > 0.72 and chroma < 0.2:  # light plastics
            set_input(node, 0.42, "Roughness"); set_input(node, 0.08, "Metallic")
        else:
            set_input(node, 0.48, "Roughness"); set_input(node, 0.16, "Metallic")


def import_board(spec, glb_dir, unit_scale):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, spec["file"]))
    objs = [o for o in bpy.context.scene.objects if o not in before]
    lo, hi = mesh_bounds(objs)
    short = spec["file"].split("__")[-1].replace(".glb", "")[:48]
    root = bpy.data.objects.new(short + " root", None)
    spec["_root"] = root
    bpy.context.scene.collection.objects.link(root)
    # pivot: board centre in XY, bottom of the model in Z
    root.location = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    keep = set(objs)
    for o in [o for o in objs if o.parent not in keep]:
        mw = o.matrix_world.copy()
        o.parent = root
        o.matrix_world = mw
    s = unit_scale * spec.get("scale", 1.0)
    root.scale = (s, s, s)
    root.rotation_euler = (
        math.radians(spec.get("tilt_x", 0.0)),
        math.radians(spec.get("tilt_y", 0.0)),
        math.radians(spec.get("rotation", 0.0)),
    )
    x, y = spec.get("center", (0.0, 0.0))
    root.location = (x, y, spec.get("z", 0.0))
    size = (hi - lo) * s
    print("PLACED", spec["file"], "size_cm", round(size.x, 2), round(size.y, 2), round(size.z, 2))
    return objs


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_light(kind, name, loc, target, color, energy, size=1.0):
    data = bpy.data.lights.new(name=name, type=kind)
    data.color = color
    data.energy = energy
    if kind == "AREA":
        data.shape = "DISK"
        data.size = size
    elif kind == "SPOT":
        data.shadow_soft_size = size
        data.spot_size = math.radians(60)
        data.spot_blend = 0.8
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    look_at(obj, target)


def screen_center(scene, cam, root):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    xs, ys = [], []
    for o in root.children_recursive:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            v = world_to_camera_view(scene, cam, o.matrix_world @ Vector(c))
            xs.append(v.x); ys.append(1 - v.y)
    return Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))


def solve_screen_targets(scene, cam, layout):
    """Move each board with a "screen": [u, v] target so its bbox centre lands there."""
    for spec in layout["boards"]:
        target = spec.get("screen")
        if not target:
            continue
        root = spec["_root"]; target = Vector(target)
        for _ in range(6):
            c0 = screen_center(scene, cam, root)
            err = target - c0
            if err.length < 0.002:
                break
            root.location.x += 1.0; cx = screen_center(scene, cam, root); root.location.x -= 1.0
            root.location.y += 1.0; cy = screen_center(scene, cam, root); root.location.y -= 1.0
            j = [[cx.x - c0.x, cy.x - c0.x], [cx.y - c0.y, cy.y - c0.y]]
            det = j[0][0] * j[1][1] - j[0][1] * j[1][0]
            dx = (j[1][1] * err.x - j[0][1] * err.y) / det
            dy = (-j[1][0] * err.x + j[0][0] * err.y) / det
            root.location.x += dx; root.location.y += dy
        print(f"SOLVED {root.name[:-5][:40]:40} center [{root.location.x:.2f}, {root.location.y:.2f}]")


def report_screen_bboxes(scene, cam, layout):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    roots = [o for o in scene.objects if o.name.endswith(" root")]
    for root in roots:
        pts = []
        for o in root.children_recursive:
            if o.type != "MESH":
                continue
            for c in o.bound_box:
                v = world_to_camera_view(scene, cam, o.matrix_world @ Vector(c))
                pts.append((v.x, 1 - v.y))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        print(f"BBOX {root.name[:-5][:40]:40} x {min(xs):.2f}-{max(xs):.2f}  y {min(ys):.2f}-{max(ys):.2f}")


def main():
    args = parse_args()
    layout = json.load(open(args.layout))
    reset_scene()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = layout.get("resolution", (2000, 1875))
    glb_dir = os.environ.get("HERO_GLB_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(args.layout)), layout["glb_dir"])

    imported = []
    for spec in layout["boards"]:
        imported += import_board(spec, glb_dir, layout["unit_scale"])
    tune_materials()

    # shadow catcher floor
    if layout.get("floor", True):
        bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, layout.get("floor_z", -0.05)))
        floor = bpy.context.active_object
        floor.name = "Shadow catcher"
        floor.is_shadow_catcher = True

    cam = layout["camera"]
    cd = bpy.data.cameras.new("Hero camera")
    cd.lens = cam.get("lens", 85)
    cd.sensor_width = 36
    if cam.get("ortho"):
        cd.type = "ORTHO"
        cd.ortho_scale = cam["ortho_scale"]
    co = bpy.data.objects.new("Hero camera", cd)
    scene.collection.objects.link(co)
    co.location = cam["location"]
    look_at(co, cam["target"])
    if cam.get("roll"):
        co.rotation_euler.rotate_axis("Z", math.radians(cam["roll"]))
    if cam.get("dof_target"):
        cd.dof.use_dof = True
        focus = bpy.data.objects.new("Focus", None)
        scene.collection.objects.link(focus)
        focus.location = cam["dof_target"]
        cd.dof.focus_object = focus
        cd.dof.aperture_fstop = cam.get("fstop", 8.0)
    cd.shift_x = cam.get("shift_x", 0.0)
    cd.shift_y = cam.get("shift_y", 0.0)
    scene.camera = co
    solve_screen_targets(scene, co, layout)

    for L in layout["lights"]:
        add_light(L["kind"], L["name"], L["location"], L["target"], L["color"], L["energy"], L.get("size", 1.0))

    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = layout.get("world_color", (0.74, 0.78, 0.84, 1.0))
    bg.inputs["Strength"].default_value = layout.get("world_strength", 0.35)

    r = scene.render
    r.engine = "CYCLES" if args.engine == "cycles" else "BLENDER_EEVEE_NEXT"
    if args.engine == "cycles":
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = True
        scene.cycles.use_adaptive_sampling = True
        scene.cycles.adaptive_threshold = 0.015
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "METAL"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
        except Exception as e:
            print("GPU setup failed, using CPU:", e)
    r.resolution_x, r.resolution_y = layout.get("resolution", (2000, 1875))
    r.resolution_percentage = args.scale
    r.film_transparent = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "16" if args.engine == "cycles" else "8"
    scene.view_settings.view_transform = layout.get("view_transform", "AgX")
    scene.view_settings.look = layout.get("look", "None")
    r.filepath = os.path.abspath(args.output)
    report_screen_bboxes(scene, co, layout)
    if args.dry:
        return
    bpy.ops.render.render(write_still=True)
    print("RENDERED", r.filepath)


if __name__ == "__main__":
    main()
