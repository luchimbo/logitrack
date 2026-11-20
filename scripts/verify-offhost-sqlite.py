import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

prefix = 'data/geomodi.db/dbs/default/'
allowed = {'data', 'data-wal', 'data-shm'}
with tempfile.TemporaryDirectory(prefix='geomodi-restore-check-') as directory:
    root = Path(directory)
    found = set()
    with tarfile.open(fileobj=sys.stdin.buffer, mode='r|gz') as archive:
        for entry in archive:
            if not entry.isfile() or not entry.name.startswith(prefix):
                continue
            name = entry.name[len(prefix):]
            if name not in allowed:
                continue
            source = archive.extractfile(entry)
            if source is None:
                raise RuntimeError('No se pudo leer la base del respaldo')
            with (root / name).open('wb') as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
            found.add(name)
    if 'data' not in found:
        raise RuntimeError('El respaldo no contiene la base operativa')
    db = sqlite3.connect((root / 'data').as_uri() + '?mode=ro', uri=True)
    try:
        check = db.execute('PRAGMA integrity_check').fetchone()[0]
        count = db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        if check != 'ok' or count < 1:
            raise RuntimeError('La base restaurada no pasó el control de integridad')
        print(f'Restauración aislada verificada: integridad correcta, {count} tablas')
    finally:
        db.close()
    if '--simulate-carriers' in sys.argv:
        script = Path(__file__).with_name('simulate-carrier-migration.mjs')
        subprocess.run(['node', str(script), str(root / 'data')], check=True)
