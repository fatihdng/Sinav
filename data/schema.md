# Soru Veri Şeması — questions.json

Tüm sorular tek bir JSON dosyasında, liste olarak.

## Şema

```json
{
  "version": "1.0",
  "exam": "2029 D2M4",
  "questions": [
    {
      "id": 1,
      "num": 1,
      "exam_page": 1,
      "topic": {
        "main": "İmmünoloji",
        "sub": "Doğal Bağışıklık",
        "tags": ["enflamasyon", "lökosit kaskadı", "selektin", "integrin"]
      },
      "title": "Akut enflamasyon / lökosit kaskadı",
      "stem": "Akut enflamasyonda fagositozu takiben...",
      "extra_block": "I. Integrin aracılı tutunma<br>II. ...",
      "choices": [
        {"letter": "A", "text": "IV – III – I – II"},
        {"letter": "B", "text": "II – III – I – IV"},
        {"letter": "C", "text": "IV – I – III – II"},
        {"letter": "D", "text": "III – I – II – IV"},
        {"letter": "E", "text": "III – I – IV – II"}
      ],
      "correct": "A",
      "explain": "Lökositlerin enfeksiyon bölgesine ulaşması...",
      "note_quote": "Selektinler lökosit yüzeyindeki şekerleri bağlar...",
      "note_full_passage": "Tam ders notu pasajı (uzun, scroll edilebilir alanda gösterilecek)...",
      "note_ref": {
        "file": "Mikrobiyoloji s7 — Doğal Bağışıklık-Enflamasyon",
        "week": "M4H1",
        "type": "Not",
        "pages": "1-2"
      },
      "prof_questions": [
        {
          "id": "1_P1",
          "level": "orta",
          "subtopic": "Akut enflamasyonun 6 adımı sıralaması",
          "note": "Hoca dipnotu...",
          "stem": "...",
          "extra_block": "...",
          "choices": [...],
          "correct": "A",
          "explain": "...",
          "note_quote": "..."
        }
        // ... toplam 8 adet (5 orta + 3 zor)
      ],
      "similar_questions": [
        {
          "source": "2028 MEZUNLAR",
          "num": 47,
          "stem": "...",
          "choices": [...],
          "correct": "B",
          "similarity_reason": "Aynı kavram, farklı açıdan"
        }
      ],
      "images": [
        {"src": "data/images/q1_diagram.png", "caption": "Lökosit kaskadı şeması"}
      ]
    }
  ]
}
```

## Notlar
- `note_full_passage`: Web app'te "Notu Aç" butonu ile scroll edilebilir bölmede gösterilir
- `images`: Notlardan çıkarılan görseller (sonraki fazda)
- `prof_questions[i].level`: "orta" veya "zor"
- `similar_questions`: 2028 + NYUS'tan eşleşenler (sonraki fazda)
