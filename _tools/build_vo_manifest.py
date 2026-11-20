import json, os, re, subprocess, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, 'assets', 'vo', 'VO_SCRIPT.md')
OUT = os.path.join(ROOT, 'assets', 'vo', 'manifest.json')
FFPROBE = shutil.which('ffprobe') or r'C:\Users\Administrator\.dsh\skills\video-watch\tools\ffprobe.exe'


def duration(path):
    r = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return round(float(r.stdout.strip()), 3)


text = open(MD, encoding='utf-8').read()
parts = re.split(r'^#### ', text, flags=re.M)[1:]
lines = []
chapter = 0
ch_positions = [(m.start(), int(m.group(1))) for m in re.finditer(r'^### 第 (\d+) 章', text, flags=re.M)]

for part in parts:
    head, _, body = part.partition('\n')
    lid = head.strip()
    pos = text.find('#### ' + lid)
    chapter = 0
    for p, n in ch_positions:
        if p < pos:
            chapter = n
    speaker = re.search(r'- 角色：([^｜\n]+)', body)
    speaker = speaker.group(1).strip() if speaker else 'Raven One'
    en_m = re.search(r'\*\*英文\*\*\s*\n(.*?)\n\s*\*\*中文字幕\*\*', body, flags=re.S)
    zh_m = re.search(r'\*\*中文字幕\*\*\s*\n(.*?)\n\s*朗读：', body, flags=re.S)
    en = ' '.join(x[2:].strip() for x in en_m.group(1).splitlines() if x.startswith('> ')) if en_m else ''
    zh = '\n'.join(x[2:].strip() for x in zh_m.group(1).splitlines() if x.startswith('> ')) if zh_m else ''
    audio = os.path.join(ROOT, 'assets', 'vo', lid + '.mp3')
    lines.append({
        'id': lid,
        'file': 'assets/vo/' + lid + '.mp3',
        'mode': 'story' if chapter else 'match',
        'chapter': chapter,
        'speaker': 'Raven One',
        'voice': 'raven',
        'priority': 2 if chapter else 1,
        'en': en,
        'zh': zh,
        'dur': duration(audio) if os.path.exists(audio) else 0,
    })

missing = [x['id'] for x in lines if not x['en'] or not x['zh'] or not x['dur']]
data = {
    'version': '2026-11-15',
    'voice': 'MiMo TTS · Dean · English · 44.1k mono source, 128 kbps mp3',
    'lines': lines,
}
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('lines', len(lines), 'missing', missing, 'out', len(json.dumps(data, ensure_ascii=False)))
