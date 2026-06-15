import json, struct, sys
path = sys.argv[1]
with open(path, 'rb') as f:
    magic, version, length = struct.unpack('<III', f.read(12))
    assert magic == 0x46546C67, 'not glb'
    clen, ctype = struct.unpack('<II', f.read(8))
    data = json.loads(f.read(clen))
print('asset:', data.get('asset'))
print('scenes:', len(data.get('scenes', [])), 'nodes:', len(data.get('nodes', [])), 'meshes:', len(data.get('meshes', [])), 'materials:', len(data.get('materials', [])))
nodes = data.get('nodes', [])
meshes = data.get('meshes', [])
accs = data.get('accessors', [])

def mesh_bounds(mi):
    mn = [1e9]*3; mx = [-1e9]*3
    for prim in meshes[mi].get('primitives', []):
        pa = prim.get('attributes', {}).get('POSITION')
        if pa is None: continue
        a = accs[pa]
        if 'min' in a and 'max' in a:
            for i in range(3):
                mn[i] = min(mn[i], a['min'][i]); mx[i] = max(mx[i], a['max'][i])
    return mn, mx

# print node tree
children_of = {}
roots = set(range(len(nodes)))
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        roots.discard(c)
        children_of.setdefault(i, []).append(c)

def walk(i, depth=0, limit=[0]):
    if limit[0] > 400: return
    limit[0] += 1
    n = nodes[i]
    name = n.get('name', f'node{i}')
    t = n.get('translation')
    extra = ''
    if 'mesh' in n:
        mn, mx = mesh_bounds(n['mesh'])
        extra = f" mesh bbox=({[round(v,1) for v in mn]} .. {[round(v,1) for v in mx]})"
    print('  '*depth + f"[{i}] {name}" + (f" t={[round(v,1) for v in t]}" if t else '') + extra)
    for c in children_of.get(i, []):
        walk(c, depth+1, limit)

for r in sorted(roots):
    walk(r)
