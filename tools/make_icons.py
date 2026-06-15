"""Генерация PNG-иконок PWA из простых примитивов (без Pillow)."""
import struct, zlib, math, os

def make_png(size, path):
    cx, cy = size * 0.5, size * 0.42
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # фон: тёмный радиальный градиент
            d = math.hypot(x - cx, y - cy) / size
            base = max(5, int(22 - d * 18))
            r, g, b = base // 2, base, base * 2
            # неоновая дуга маршрута
            t = x / size
            curve_y = size * (0.82 - 0.6 * t * t)
            dist = abs(y - curve_y)
            w = size * 0.045
            if dist < w * 3:
                glow = math.exp(-(dist / w) ** 2)
                r = min(255, int(r + 0 * glow))
                g = min(255, int(g + 229 * glow))
                b = min(255, int(b + 255 * glow))
            # стартовая точка
            if math.hypot(x - size*0.12, y - size*0.80) < size*0.05:
                r, g, b = 170, 255, 0
            # финиш-кольцо
            dd = math.hypot(x - size*0.86, y - size*0.22)
            if size*0.045 < dd < size*0.075:
                r, g, b = 255, 45, 120
            row += bytes((r, g, b))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path))

make_png(192, 'frontend/public/icons/icon-192.png')
make_png(512, 'frontend/public/icons/icon-512.png')
