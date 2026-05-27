# -*- coding: utf-8 -*-
"""Mevcut Python dict → questions.json dönüştürücü."""
import sys, os, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
PYDATA = os.path.expanduser('~/OneDrive/Desktop/notlar/extracted/fizyoloji-full')
sys.path.insert(0, PYDATA)

from data_mikro_01_06 import QUESTIONS as Q1
from data_mikro_07_12 import QUESTIONS as Q2
from data_mikro_13_17 import QUESTIONS as Q3
from data_mikro_18_22 import QUESTIONS as Q4
from data_fizyo_23_26 import QUESTIONS as Q5
from data_fizyo_27_29 import QUESTIONS as Q6
from data_fizyo_30_38 import QUESTIONS as Q7
from data_histoloji_39_51 import QUESTIONS as Q8
from data_biyokimya_52_63 import QUESTIONS as Q9
from data_anatomi_64_100 import QUESTIONS as Q10
from data_2028_modul4 import QUESTIONS as Q2028

# 2029 D2M4 sorularına exam_source ekle (sonradan eklendiği için varsa atlama)
Q2029 = Q1 + Q2 + Q3 + Q4 + Q5 + Q6 + Q7 + Q8 + Q9 + Q10
for q in Q2029:
    q.setdefault('exam_source', '2029-D2M4')
    q.setdefault('exam_label', '2029 D2M4')

# 2028 Mezunlar — agent zaten exam_source koymuş olmalı (kontrol amaçlı setdefault)
for q in Q2028:
    q.setdefault('exam_source', '2028-MEZUNLAR')
    q.setdefault('exam_label', '2028 Mezunlar Modül 4')

ALL = Q2029 + Q2028


def derive_tags(q):
    """Konudan tag çıkar — keyword bazlı."""
    text = (q.get('konu','') + ' ' + q.get('title','') + ' ' + q.get('stem','')).lower()
    candidates = [
        'enflamasyon','lökosit','selektin','integrin','kemokin','sitokin','fagosit',
        'mantar','dermatofit','candida','cryptococcus','aspergillus','mikoloji',
        'mhc','sınıf-i','sınıf-ii','antijen sunum','tap','clip','ubikitin',
        'b hücre','t hücre','bcr','tcr','antikor','immünoglobulin','ig',
        'kompleman','c3','c3a','c3b','c3d','mac','opsoniz',
        'virüs','viroloji','rna','dna','kapsid','retrovir','hiv','aids',
        'aşı','eradikasyon','immün yetmezlik','primer','sekonder',
        'renin','aldosteron','natriüretik','potasyum','sodyum','elektrolit',
        'sertoli','leydig','inhibin','testosteron','spermatogenez',
        'oogenez','folikül','fsh','lh','progesteron','östrojen',
        'doğum','laktasyon','gebelik','plasenta','oksitosin',
        'hipersensitivite','tip 2','tip 3','arf','apsgn',
        'shell vial','hücre kültür','immünfloresan',
    ]
    tags = [c for c in candidates if c in text]
    return tags[:6]


def derive_topic(q):
    """Ana konu/alt konu çıkar."""
    konu = q.get('konu', '')
    k_low = konu.lower()
    if k_low == 'fizyoloji':
        main = 'Fizyoloji'
    elif k_low == 'histoloji':
        main = 'Histoloji'
    elif k_low == 'biyokimya':
        main = 'Biyokimya'
    elif k_low == 'anatomi':
        main = 'Anatomi'
    elif 'mikrobiyoloji' in k_low or 'immün' in k_low:
        main = 'İmmünoloji'
    elif 'mikoloji' in k_low or 'mantar' in k_low:
        main = 'Mikoloji'
    elif 'virol' in k_low:
        main = 'Viroloji'
    elif 'böbrek' in k_low or 'raas' in k_low or 'elektro' in k_low or 'tonisite' in k_low:
        main = 'Fizyoloji · Böbrek'
    elif 'üreme' in k_low or 'sertoli' in k_low or 'ejakül' in k_low or 'oogen' in k_low or 'gebelik' in k_low or 'doğum' in k_low:
        main = 'Fizyoloji · Üreme'
    else:
        main = q.get('konu', 'Genel')
    return {'main': main, 'sub': q.get('konu',''), 'tags': derive_tags(q)}


def convert_question(q, idx):
    """Tek soruyu JSON formatına çevir."""
    # Profesör soruları — yeni yapı: 5 orta + 3 zor (P1-P5 orta, P6-P8 zor)
    profs = []
    for i, pq in enumerate(q.get('prof_qs', []), 1):
        # Eğer level explicit verilmişse onu kullan; yoksa eski mantık (P1-P2 orta, P3-P4 zor)
        level = pq.get('level')
        if not level:
            if len(q.get('prof_qs', [])) <= 4:
                level = 'zor' if i >= 3 else 'orta'  # eski 4-soru yapısı
            else:
                level = 'zor' if i >= 6 else 'orta'  # yeni 8-soru yapısı (5 orta + 3 zor)
        profs.append({
            'id': f"{q['num']}_P{i}",
            'level': level,
            'subtopic': pq.get('subtopic', ''),
            'note': pq.get('note', ''),
            'stem': pq['stem'],
            'extra_block': pq.get('extra_block', ''),
            'choices': pq['choices'],
            'correct': pq['correct'],
            'explain': pq['explain'],
            # Yeni: prof seviyesinde note_quote + note_ref (teyit edilmiş birebir alıntı)
            'note_quote': pq.get('note_quote') or pq.get('note', ''),
            'note_ref': pq.get('note_ref', {})
        })

    # Ana kaynak pasajı
    sources = q.get('sources', [])
    note_quote = ''
    note_full = ''
    note_ref = {'file': '', 'week': '', 'type': '', 'pages': ''}
    if sources:
        s = sources[0]
        # İlk 300 karakter quote olarak; tam metin full_passage
        text = s['text']
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        quote_lines = []
        char_count = 0
        for line in lines:
            if char_count + len(line) > 300: break
            quote_lines.append(line)
            char_count += len(line)
        note_quote = '\n'.join(quote_lines)
        note_full = text

        # Label parse → file/week/type
        label = s['label']
        # Örnek: "M4H1/Not — Mikrobiyoloji s7 · Doğal Bağışıklık-Enflamasyon (s.1-2)"
        m = re.match(r'(M4H\d+)/(Not|Slayt)\s*[—-]\s*(.+?)(?:\s*\(s\.([\d\-]+)\))?$', label)
        if m:
            note_ref = {
                'week': m.group(1),
                'type': m.group(2),
                'file': m.group(3).strip(),
                'pages': m.group(4) or ''
            }
        else:
            note_ref['file'] = label

    return {
        'id': q['num'],
        'num': q['num'],
        'exam_source': q.get('exam_source', '2029-D2M4'),
        'exam_label': q.get('exam_label', '2029 D2M4'),
        'exam_page': q.get('source_page', 1),
        'topic': derive_topic(q),
        'title': q.get('title', ''),
        'stem': q['stem'],
        'extra_block': q.get('extra_stem') or q.get('extra_block', ''),
        'choices': q['choices'],
        'correct': q['correct'],
        'explain': q['explain'],
        'note_quote': note_quote,
        'note_full_passage': note_full,
        'note_ref': note_ref,
        'prof_questions': profs,
        'similar_top': q.get('similar_top', []),  # konu çatısı altında 5 benzer soru
        'similar_questions': q.get('similar_questions', []),  # 2028 cross-reference
        'images': []
    }


STOPWORDS = {
    'bir','ile','ve','için','olan','olur','olarak','olduğu','aşağıdaki','aşağıdakilerden','hangisi',
    'doğru','yanlış','aşağıda','arasında','üzerinde','dair','sonra','önce','tüm','bütün',
    'eşleştirme','eşleştirmelerden','sayesinde','ilgili','aşağıdakilerden','aşağıda','aşağıdakilerden','de','da','ve',
}

def _keywords(q):
    """Soru için anahtar kelime havuzu — title + topic + stem'den."""
    import re
    text = (q.get('title','') + ' ' + q['topic']['main'] + ' ' +
            (q['topic'].get('sub') or '') + ' ' + q['stem']).lower()
    # Türkçe karakter normalize
    text = text.replace('ı','i').replace('ş','s').replace('ğ','g').replace('ü','u').replace('ö','o').replace('ç','c')
    words = re.findall(r'[a-z]{4,}', text)  # min 4 harf
    return set(w for w in words if w not in STOPWORDS)


def _topic_group(t):
    """Ana modül grubunu çıkar — 'İmmünoloji — X' → 'İmmünoloji', 'Fizyoloji · Y' → 'Fizyoloji'."""
    main = t.get('main','')
    # Ayraç karakterleri: —, ·, -, /
    for sep in ['—','·','-','/']:
        if sep in main:
            return main.split(sep)[0].strip()
    return main.strip()


def add_cross_references(questions):
    """Her sorudaki similar_questions alanını doldur (aynı modül grup + keyword overlap)."""
    for q in questions:
        q['_kw'] = _keywords(q)
        q['_grp'] = _topic_group(q['topic'])
    for q in questions:
        candidates = []
        for o in questions:
            if o['num'] == q['num']: continue
            same_grp = (o['_grp'] == q['_grp'])
            overlap = len(q['_kw'] & o['_kw'])
            # Eşik: aynı grup + 2 keyword, veya farklı grup + 4 keyword
            if (same_grp and overlap >= 2) or (overlap >= 4):
                candidates.append((o['num'], o.get('exam_source',''), overlap, same_grp))
        # Sırala: overlap desc, farklı kaynak öncelik
        candidates.sort(key=lambda x: (-x[2], -int(x[3]), x[1] == q.get('exam_source','')))
        q['similar_questions'] = [{'id': c[0], 'source': c[1], 'score': c[2]} for c in candidates[:5]]
    for q in questions:
        del q['_kw']; del q['_grp']


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    questions = [convert_question(q, i) for i, q in enumerate(ALL)]
    add_cross_references(questions)
    data = {
        'version': '1.1',
        'exam': 'D2M4 Çıkmış Sorular (2029 + 2028)',
        'last_updated': '2026-05-27',
        'total_questions': len(ALL),
        'questions': questions
    }
    out = os.path.join(HERE, 'questions.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Özet
    print(f'✓ {len(ALL)} soru → {out}')
    print(f'  Dosya boyutu: {os.path.getsize(out)/1024:.0f} KB')
    # Konu dağılımı
    from collections import Counter
    topics = Counter(q['topic']['main'] for q in data['questions'])
    print('\nKonu dağılımı:')
    for t, c in topics.most_common():
        print(f'  {t:<30} {c:>3}')


if __name__ == '__main__':
    main()
