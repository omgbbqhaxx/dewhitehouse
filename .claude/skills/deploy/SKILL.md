---
name: deploy
description: De White House statik sitesini derler ve GitHub Pages'e (gh-pages dalı) yayınlar. "/deploy" veya "deploy et", "yayınla", "canlıya al" dendiğinde kullan.
---

# /deploy

Statik Next.js çıktısını üretip GitHub Pages'e basar. Sunucu yok, sadece dosya yükleme.

## Adımlar

1. Çalışma ağacı temiz mi bak: `git status --short`. Commit edilmemiş değişiklik varsa önce `/commit` skill'ini çalıştır. Deploy, her zaman commit edilmiş kodu yansıtmalı.

2. Ortam dosyasını kontrol et. `.env.local` yoksa veya `NEXT_PUBLIC_CONTRACT_ADDR` boşsa ya da sıfır adresse kullanıcıya söyle: site "Not deployed" uyarısıyla yayınlanır. Bu bir hata değil, bilgilendirme. Devam et.

3. Kopya kurallarını kontrol et:
   - Arayüzdeki tüm kullanıcıya görünen metin **İngilizce** olmalı. Kod yorumları Türkçe olabilir.
   - "1 VRNouns = 1 vote" ifadesi değişmez. Oy gücü bakiyedir.
   - "No backend", "No servers" iddiaları doğru kalmalı. Sunucuya bağımlı bir şey eklenmişse deploy etme, kullanıcıya söyle.

4. Derle ve yayınla. Tek komut, çıktı dizinini önce temizler:
   ```bash
   npm run deploy
   ```
   Bu komut `rm -rf out && next build && gh-pages -d out -b gh-pages --dotfiles` çalıştırır. `postbuild` adımı `out/.nojekyll` dosyasını ekler; GitHub Pages `_next/` klasörünü bu sayede servis eder.

5. Build hatası çıkarsa çıktıyı olduğu gibi göster ve dur. Hatayı düzeltmeden tekrar deneme.

6. Başarılıysa şunu doğrula:
   ```bash
   git ls-remote --heads origin gh-pages
   ```
   Dal görünüyorsa deploy tamamdır.

7. Sonucu bildir: gh-pages dalına basıldığı, kontrat adresinin ayarlı olup olmadığı ve site adresi. Özel alan adı yoksa adres `https://omgbbqhaxx.github.io/dewhitehouse/` şeklindedir ve deploy scripti `NEXT_PUBLIC_BASE_PATH=/dewhitehouse` ile derler. `public/CNAME` eklenirse o alan adını yaz ve `package.json` deploy scriptinden `NEXT_PUBLIC_BASE_PATH` kısmını kaldır.

## İlk deploy notu

GitHub Pages ilk kez açılıyorsa kullanıcıya hatırlat: repo ayarlarında Pages kaynağı `gh-pages` dalı, kök klasör olmalı. Bu ayar bir kez yapılır.

## Yapma

- `out/` klasörünü git'e commit etme. `.gitignore` içinde, öyle kalmalı.
- `.env.local` dosyasını commit etme veya içeriğini çıktıya yazma.
- `gh-pages` dalına elle push yapma, her zaman `npm run deploy` kullan.
- Kullanıcı istemeden `main` dalına commit atma.
