# SON NÖBET: KUZGUN ADASI

Kuzgun Adası Hastanesi'nde geçen, başı ve sonu olan tek oyunculu bir 3D FPS korku prototipi. Bu proje **Unreal Engine değil**; React, Vite ve Three.js/WebGL 2 ile tarayıcıda çalışır.

## Başlatma

```sh
npm install
npm run dev
```

Terminaldeki adresi WebGL 2 destekli bir masaüstü tarayıcısında aç. **Yeni Oyun** ile başla. Kamerayı kontrol etmek için oyun alanına tıkla; fare kilidi kısıtlı önizlemelerde sürükleme ve yön tuşları çalışır. `E` ile acil servisteki çantayı al. Ana merdivenin tabelalarını, `M` krokisini ve sağ üstteki Kaçış Planı'nı izle.

| Girdi | İşlev |
| --- | --- |
| WASD, fare | Hareket, bakış |
| Shift, Ctrl, Boşluk | Koş, çömel, engel üzerinden atla |
| E, F | Etkileşim, el feneri |
| Tab, M | Envanter, kroki |
| 1–4, R | Hızlı yuva, seçili eşyayı kullan |
| Sol tık, Q, B | Sendelet, dikkat dağıtıcı at, uygun kapıya geçici barikat kur |
| Esc | Duraklat |

Kontroller, altyazı, görüntü ve ses seçenekleri ana menüden değiştirilebilir. Oyun otomatik kilometre taşlarını ve güvenli oda kayıt konumunu bu tarayıcıda saklar. Önemli eşyalar ve görev parçaları sırt çantasından ayrı tutulur; düşürülemezler. Ölümden sonra son güvenli odaya dönülür.

## Prototip Kapsamı

- B1, zemin, 1., 2., 3. kat ve çatı. Ana merdiven, levye ile açılan servis merdiveni, asansör, dar geçit ve garaja bağlı küçük karantina avlusu.
- Personel ve laboratuvar erişim kartları, sigorta bulmacası, beş parça ve alet çantası. Son onarım, rotor kalkış devri, çatıya çıkan Dev Nöbetçi ve helikopterle kaçış. İsteğe bağlı kayıt yayını.
- Duvar ve kapı engelli görüş; ses, araştırma, kovalama, son görülme noktasını arama ve devriyeye dönüş. Nöbetçiler canlı karakterlerdir. Ateşli silah veya başka kaçış aracı yoktur.
- Geçici prosedürel 3D modeller ve sentezlenmiş Türkçe kayıtlar. Tam boyutlu 300 × 300 m kampüs, açılış sinematiği, profesyonel seslendirme, bütün isteğe bağlı eşya çeşitleri ve oyun kolu desteği bu sürümde yoktur. İlk oynayış süresi ve fiziksel bir orta seviye PC'de 1080p FPS ölçülmemiştir.

## Kod ve Testler

`src/App.tsx` oturum ile arayüzü bağlar. `src/game/data.ts` eşya, görev ve kayıt durumunu, `src/game/layout.ts` kat planlarını tanımlar. `world.ts` 3D geometri, çarpışma ve yol bulmayı; `enemies.ts` algı ve davranışı; `game.ts` oyuncu girişi, etkileşim ve kaçış akışını; `audio.ts` sesleri yönetir.

```sh
npm run build
npx tsc --noEmit
npx playwright install chromium
# Vite dev sunucusu çalışırken:
node tests/browser-smoke.cjs
node tests/vertical-slice.cjs
NOBET_DIFFICULTY=normal node tests/vertical-slice.cjs
```

İlk test React menüsünü, tuş atamayı, başlangıç eşyalarını, envanteri, krokileri ve kayıt yüklemeyi tarayıcıdan doğrular. İkinci test Vite modüllerini yükler, oyuncuyu gerçek çarpışma ve merdiven rotalarından geçirir, erişim kurallarını, ölümden dönüşü, düşman durumlarını ve tamamlanmış kaçış kaydını kontrol eder. Testler `NOBET_URL` ile başka bir dev sunucusuna yöneltilebilir. `tools/generate-voice.py`, eSpeak NG ve LAME yüklüyse yerel Türkçe MP3 kliplerini yeniden üretir.