---
name: commit
description: Çalışma ağacındaki değişiklikleri inceler, anlamlı bir commit mesajı yazar, commit eder ve push eder. "/commit" veya "commit et" dendiğinde kullan. İsteğe bağlı olarak "/commit mesaj" şeklinde mesaj verilebilir.
---

# /commit

Değişiklikleri analiz edip tek bir anlamlı commit oluştur ve uzak depoya push et.

## Adımlar

1. Durumu öğren. Şu üç komutu tek seferde çalıştır:
   ```
   git status --short
   git diff --stat
   git log --oneline -5
   ```
   Değişiklik yoksa "Commit edilecek değişiklik yok" de ve dur.

2. Diff'i oku. `git diff` ve staged olmayan yeni dosyalar için içeriğe bak. Ne değiştiğini, neden değiştiğini anla.

3. Hassas dosya kontrolü yap. Şunlardan biri varsa commit etme, kullanıcıya söyle:
   - `.env`, `.env.local`, `*.pem`, `*.key`, özel anahtar veya seed içeren dosyalar
   - `node_modules/`, `out/`, `.next/` gibi build çıktıları
   Bu dosyalar `.gitignore`'da değilse önce eklemeyi öner.

4. Branch kontrolü yap. `main` üzerindeysen ve kullanıcı açıkça branch istemediyse doğrudan `main`'e commit et. Bu proje tek kişilik, PR akışı yok.

5. Commit mesajı yaz. Kullanıcı `/commit <mesaj>` şeklinde argüman verdiyse o mesajı kullan. Vermediyse şu kurallara göre yaz:
   - İlk satır 50 karakteri geçmesin, emir kipi, Türkçe.
   - Ne yapıldığını söyle, nasıl yapıldığını değil. Örnek: `README'ye Prop House ve flooor karşılaştırması ekle`
   - Birden fazla bağımsız değişiklik varsa boş satırdan sonra madde madde listele.
   - Sonuna şu satırı ekle:
     ```
     Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
     ```

6. Stage ve commit et:
   ```
   git add -A
   git commit -m "$(cat <<'EOF'
   <mesaj>
   EOF
   )"
   ```

7. Push et:
   ```
   git push
   ```
   Upstream yoksa `git push -u origin <branch>` kullan. Push reddedilirse `git pull --rebase` dene, tekrar push et. Çakışma çıkarsa dur ve kullanıcıya bildir.

8. Sonucu tek satırda bildir: commit hash, mesajın ilk satırı, kaç dosya değişti.

## Yapma

- `--no-verify` kullanma.
- `git push --force` kullanma.
- Kullanıcı istemeden commit'i amend etme.
- Diff'i okumadan mesaj uydurma.
