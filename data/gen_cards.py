# -*- coding: utf-8 -*-
"""Sorulardan hap bilgi kartı üreteci."""
import sys, os, json, re

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))

def load():
    with open(os.path.join(HERE, 'questions.json'), encoding='utf-8') as f:
        return json.load(f)

def strip_html(s):
    """HTML taglerini temizle."""
    if not s: return ''
    s = re.sub(r'<br\s*/?>', ' · ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def short(s, max_len=180):
    s = strip_html(s)
    if len(s) <= max_len: return s
    cut = s[:max_len].rsplit(' ', 1)[0]
    return cut + '…'

def find_list_in_text(text):
    """Notta liste varsa parse et: 1. ... 2. ... veya • ..."""
    text = strip_html(text)
    # Numaralı liste: "1. xxx" veya "1) xxx"
    items = re.findall(r'(?:^|\n)\s*(?:\d+[\.\)])\s*([^\n\d]{8,180})', text)
    if len(items) >= 3:
        return [i.strip().rstrip('.,;') for i in items[:7]]
    # Madde işaretli liste: "• xxx"
    items = re.findall(r'(?:^|\n)\s*[•▪◦·]\s*([^\n•▪◦·]{8,180})', text)
    if len(items) >= 3:
        return [i.strip().rstrip('.,;') for i in items[:7]]
    return None

def gen_cards_for_question(q):
    """Sadece liste/mekanizma/tuzak kartları otomatik üret.
    Düz tanım kartları cards_manual.json'da elle yazılır."""
    cards = []
    qid = q['id']
    topic_main = q['topic']['main']
    # Not: 'tanım' ve 'ezber' otomatik üretimi kaldırıldı —
    # kavramsal hap bilgi kartları cards_manual.json'da

    # 3) EXTRA BLOCK liste varsa → liste kartı
    if q.get('extra_block'):
        items = find_list_in_text(q['extra_block'])
        if items:
            list_back = '\n'.join(f'{i+1}. {it}' for i, it in enumerate(items))
            cards.append({
                'id': f'card_{qid}_list',
                'type': 'liste',
                'topic': topic_main,
                'front': f"{q['title']} — sıralama / liste",
                'back': list_back,
                'related_qid': qid
            })

    # 4) FULL PASAJDA liste varsa
    if q.get('note_full_passage'):
        items = find_list_in_text(q['note_full_passage'])
        if items and len(items) >= 3:
            list_back = '\n'.join(f'{i+1}. {it}' for i, it in enumerate(items))
            cards.append({
                'id': f'card_{qid}_notelist',
                'type': 'liste',
                'topic': topic_main,
                'front': f"📋 {q['title']} — notta geçen liste",
                'back': list_back,
                'related_qid': qid,
                'source': q['note_ref'].get('file', '')
            })

    # 5) PROFESÖR SORULARI — her "note" (hoca vurgusu) bir tuzak kartı olur
    for pq in q.get('prof_questions', []):
        if pq.get('note') and len(pq['note']) > 30:
            note_clean = strip_html(pq['note'])
            # Hoca vurgu kartı
            cards.append({
                'id': f'card_{qid}_{pq["id"]}_trap',
                'type': 'tuzak',
                'topic': topic_main,
                'front': f"⚠️ {pq.get('subtopic','Hoca vurgusu')} — hoca neyi vurguladı?",
                'back': note_clean,
                'related_qid': qid,
                'related_pid': pq['id']
            })
        # Profesör sorusundan mekanizma kartı (orta zorluk olanlardan)
        if pq.get('level') == 'orta' and pq.get('subtopic'):
            correct_text = next((c['text'] for c in pq['choices'] if c['letter'] == pq['correct']), '')
            mech_back = f"<b>Cevap: {pq['correct']}</b> · {strip_html(correct_text)}\n\n{short(pq['explain'], 220)}"
            cards.append({
                'id': f'card_{qid}_{pq["id"]}_mech',
                'type': 'mekanizma',
                'topic': topic_main,
                'front': pq['subtopic'],
                'back': mech_back,
                'related_qid': qid,
                'related_pid': pq['id']
            })

    return cards


def main():
    data = load()

    # 1) Manuel kartları yükle (kavramsal hap bilgi)
    manual_cards = []
    manual_path = os.path.join(HERE, 'cards_manual.json')
    if os.path.exists(manual_path):
        with open(manual_path, encoding='utf-8') as f:
            mdata = json.load(f)
            for i, c in enumerate(mdata.get('cards', [])):
                c['id'] = c.get('id', f'manual_{i+1:03d}')
                c.setdefault('source', '')
                manual_cards.append(c)

    # 2) Otomatik kartlar (liste/mekanizma/tuzak/ezber)
    auto_cards = []
    for q in data['questions']:
        auto_cards.extend(gen_cards_for_question(q))

    all_cards = manual_cards + auto_cards

    # Tekrarlı front'ları sil (aynı başlıkta farklı tipte kart varsa korunur)
    seen = set()
    unique = []
    for c in all_cards:
        key = (c['front'].strip(), c['type'])
        if key in seen: continue
        seen.add(key)
        unique.append(c)

    out = {
        'version': '1.0',
        'total_cards': len(unique),
        'last_updated': data.get('last_updated', ''),
        'cards': unique
    }
    out_path = os.path.join(HERE, 'cards.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # Özet
    print(f'✓ {len(unique)} hap bilgi kartı → {out_path}')
    print(f'  Dosya boyutu: {os.path.getsize(out_path)/1024:.0f} KB')
    from collections import Counter
    types = Counter(c['type'] for c in unique)
    print('\nTür dağılımı:')
    for t, cnt in types.most_common():
        print(f'  {t:<12} {cnt:>3}')
    topics = Counter(c['topic'] for c in unique)
    print('\nKonu dağılımı:')
    for t, cnt in topics.most_common():
        print(f'  {t:<35} {cnt:>3}')


if __name__ == '__main__':
    main()
