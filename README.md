# dewhitehouse

Bu doküman iki projeyi karşılaştırır: **Prop House** (eski, backend'li mimari) ve **flooor.fun** (backend'siz, tamamen zincir üstü mimari). Amaç, dışarıdan bakan birinin iki yaklaşım arasındaki farkı ve neden backend'siz yolun tercih edildiğini net olarak anlamasıdır.

Kaynak kodlar:

- Prop House: https://github.com/omgbbqhaxx/prop-house-monorepo-for-flooorfun
- flooor.fun: https://github.com/omgbbqhaxx/flooor

---

## 1. Prop House nedir?

Prop House, Nouns DAO ekosisteminden çıkan bir **"teklif müzayedesi"** sistemidir. Klasik müzayedede insanlar bir ürün için para teklif eder. Prop House'ta ise tam tersi: topluluk bir para havuzu koyar, insanlar bu para için **fikir ve proje teklifi** verir, topluluk üyeleri oy kullanır, en çok oyu alan teklifler parayı kazanır.

### Temel kavramlar

| Kavram | Anlamı |
|---|---|
| **House / Community** | Bir topluluk. Bir NFT kontrat adresiyle tanımlanır (örneğin Nouns). Bu adres, kimin oy verebileceğini belirlemek için sorgulanır. |
| **Round / Auction** | Bir yarışma turu. Bir topluluğa aittir, belirli bir ödül havuzu ve kazanan sayısı vardır. |
| **Proposal** | Bir kullanıcının o tura yazdığı teklif. Başlık, kısa özet ve detaylı açıklama içerir. |
| **Vote** | Bir kullanıcının bir teklife verdiği oy. Oy gücü NFT bakiyesinden hesaplanır. |

### Tur tipleri

**Zamanlı tur (Timed Round):** Üç zaman damgası vardır.

1. Başlangıç öncesi: Bekleme.
2. Başlangıç ile teklif bitişi arası: Teklif yazma dönemi.
3. Teklif bitişi ile oylama bitişi arası: Oylama dönemi.
4. Oylama bitişi sonrası: Teklifler oy gücüne göre sıralanır, belirlenen sayıda kazanan ödülü alır.

**Sonsuz tur (Infinite Round):** Zaman sınırı yoktur. Her teklif kendi istediği tutarı belirtir. Oylar lehte veya aleyhte verilir. Lehte oy eşiğine ulaşan teklif hemen fonlanır, aleyhte eşiğe ulaşan reddedilir.

### Oy gücü nasıl hesaplanır?

Her turun iki stratejisi vardır ve bunlar veritabanında JSON olarak saklanır:

- `propStrategy`: Kim teklif yazabilir?
- `voteStrategy`: Kim oy verebilir ve kaç oyu var?

Stratejiler ayrı bir paketteki fonksiyonlardır. Örneğin `balanceOfErc721` stratejisi, cüzdanın NFT sayısını çarpanla çarpıp oy gücü üretir. `nounsDelegatedVotes` ise Nouns kontratından delegasyon sayısını okur. Oy gücü belirli bir blok numarasındaki bakiye üzerinden hesaplanır. Böylece oylama sırasında NFT alıp satarak oy manipülasyonu engellenir.

---

## 2. Prop House mimarisi: Backend'li yaklaşım

Prop House'un eski sürümü **zincir üstünde değildir**. Merkezi bir sunucu ve veritabanı üzerinde çalışır.

```
┌──────────────┐    imzalı istek    ┌──────────────────┐    RPC     ┌──────────┐
│  React       │ ─────────────────► │  NestJS Backend  │ ─────────► │ Ethereum │
│  Frontend    │ ◄───────────────── │  + PostgreSQL    │ ◄───────── │  (oku)   │
└──────────────┘    JSON cevap      └──────────────────┘            └──────────┘
```

### Bileşenler

| Paket | Görevi |
|---|---|
| `prop-house-backend` | NestJS ile yazılmış REST ve GraphQL API. PostgreSQL veritabanı. İmza doğrulama, strateji çalıştırma, oy sayma. |
| `prop-house-communities` | Oy gücü stratejileri. RPC üzerinden kontrat bakiyelerini okur. |
| `prop-house-wrapper` | Frontend'in backend ile konuşma katmanı. Cüzdan imzalama işlemlerini yapar. |
| `prop-house-webapp` | React arayüzü. |

### Bir oy nasıl verilir?

1. Kullanıcı arayüzde bir teklife oy verir.
2. Wrapper paketi, oy verisini EIP-712 formatında cüzdana imzalatır.
3. İmzalı veri backend'e HTTP ile gönderilir.
4. Backend imzayı doğrular. Normal cüzdanlar için ECDSA, akıllı kontrat cüzdanları için EIP-1271 kullanılır.
5. Backend şu kontrolleri yapar: Teklif var mı? İmzalı mesaj gönderilen veriyle eşleşiyor mu? Aynı oy daha önce verilmiş mi? Kullanıcının oy gücü var mı? Toplam oy gücünü aşıyor mu?
6. Oy veritabanına kaydedilir ve teklifin oy sayısı güncellenir.

### Neden imza gerekiyor?

Veri merkezi bir veritabanında durduğu için "backend bu oyu değiştirmedi" garantisi imzadan gelir. Herkes bir oyun gerçekten o cüzdan tarafından verildiğini imzayla doğrulayabilir. Ama bu bir **kısmi** garantidir. Backend'in stratejiyi doğru çalıştırdığına, oyu doğru saydığına ve hiçbir oyu sessizce silmediğine yine de güvenmek zorundasınız.

### Bu mimarinin yükleri

- Sunucu kiralamak ve ayakta tutmak gerekir.
- PostgreSQL veritabanı, migration'lar ve yedekleme gerekir.
- Docker ile konteyner yönetimi gerekir.
- Zamanlanmış görevler (cron) gerekir. Örneğin bekleyen kontrat imzalarını periyodik olarak doğrulayan bir görev vardır.
- Backend ile zincir arasında senkron sorunları çıkar. `balanceBlockTag`, `signatureState`, `PENDING_VALIDATION` gibi kavramlar tamamen bu iki dünyayı uzlaştırmak için vardır.
- Sunucu kapanırsa sistem durur. Veritabanı bozulursa oylar kaybolur.
- Kullanıcılar, arayüzü ve backend'i işleten kişiye güvenmek zorundadır.

Not: Prop House daha sonra bu sorunları çözmek için Starknet ve Ethereum üzerinde çalışan bir zincir üstü protokol geliştirdi. Ancak bu sürüm iki zincir, köprü ve karmaşık bir SDK gerektirir.

---

## 3. flooor.fun nedir?

flooor.fun, Base zinciri üzerinde çalışan bir **sürekli NFT müzayedesi ve gelir paylaşımı** protokolüdür. Her NFT koleksiyonu için ayrı bir kontrat deploy edilmiştir.

### Üç işlem

**Teklif ver (placeBid):** Herkes ETH ile teklif verir. Yeni teklif öncekinin en az yüzde 2 üstünde olmalıdır. Önceki teklif sahibine parası anında iade edilir. Kontrata düz ETH göndermek de teklif sayılır.

**Sat (sellToHighest):** NFT sahibi istediği an en yüksek teklife satar. Müzayedenin belirli bir bitiş zamanı yoktur, sadece "şu an en yüksek teklif" vardır.

| Kime | Oran |
|---|---|
| Satıcı | %95 |
| Ortak havuz | %4.5 |
| Protokol | %0.5 |

**İmzala veya al (signOrClaim):** Tek fonksiyon, zamana göre iki farklı iş yapar. Zaman 24 saatlik epoch'lara bölünmüştür.

- İlk 16 saat **imza fazı:** NFT sahipleri "ben buradayım" der. Cüzdan başına ve NFT başına epoch'ta bir kez.
- Son 8 saat **alım fazı:** Havuzda biriken ETH, imzalayanlar arasında eşit bölünür. Herkes payını çeker.
- Alınmayan pay bir sonraki epoch'un havuzuna devreder.

Kural: Yazma işlemleri için cüzdanda o koleksiyondan **tam olarak 1 NFT** olmalıdır. Her NFT bir koltuktur, fazlasını tutamazsınız.

---

## 4. flooor.fun mimarisi: Backend'siz yaklaşım

flooor.fun'da backend yoktur. Veritabanı yoktur. API yoktur. Her şey iki yerde yaşar:

```
┌──────────────────┐      RPC (oku / yaz)      ┌──────────────┐
│  Statik HTML/JS  │ ◄───────────────────────► │  Base zinciri│
│  (GitHub Pages)  │                           │  (kontrat)   │
└──────────────────┘                           └──────────────┘
```

- **Zincir:** Tek doğruluk kaynağı kontrattır. Teklif, satış, imza, alım, havuz bakiyesi, epoch durumu hepsi kontrattadır.
- **Statik dosyalar:** Arayüz Next.js ile düz HTML ve JavaScript olarak derlenir ve GitHub Pages'e yüklenir. Hiçbir sunucu çalışmaz.

Arayüz, tarayıcıdan doğrudan Base RPC'ye bağlanır. Okuma işlemleri için `eth_call`, yazma işlemleri için kullanıcının cüzdanı kullanılır. Arayüz sadece bir penceredir. Kapatılsa bile kontrat aynen çalışmaya devam eder.

Bunun somut kanıtı `public/flooor.md` dosyasıdır. Bu dosya bir yapay zeka ajanının, arayüze hiç ihtiyaç duymadan, sadece fonksiyon seçicileri (selector) ile kontratı okuyup imza, alım ve satış yapabilmesini tarif eder.

---

## 5. İki yaklaşımın karşılaştırması

| Konu | Prop House (backend'li) | flooor.fun (backend'siz) |
|---|---|---|
| **Doğruluk kaynağı** | PostgreSQL veritabanı | Akıllı kontrat |
| **Sunucu** | NestJS backend, sürekli çalışmalı | Yok |
| **Veritabanı** | PostgreSQL, migration, yedek | Yok |
| **Deploy** | Docker, sunucu, env yönetimi | Tek komut, statik dosya yükleme |
| **Aylık maliyet** | Sunucu, veritabanı, RPC | Sadece RPC (genellikle ücretsiz katman) |
| **Güven modeli** | İşletmeciye güvenmek gerekir | Kontrata güvenmek yeterli |
| **Kapatılabilirlik** | Sunucu kapanırsa sistem durur | Arayüz kapansa bile kontrat çalışır |
| **Veri kaybı riski** | Veritabanı bozulursa oylar gider | Zincir kalıcıdır |
| **İmza doğrulama** | Backend'de ECDSA ve EIP-1271 kodu | Zincir zaten doğrular |
| **Senkron sorunu** | Backend ve zincir arasında var | Yok, tek durum |
| **Ajan erişimi** | API'yi öğrenmesi gerekir | Sadece RPC ve selector yeter |
| **Şeffaflık** | Kısmi, imzalar doğrulanabilir | Tam, her işlem zincirde |

### Backend'siz yaklaşımın bedeli

Backend'siz yol her şeyi bedava vermez. Şu maliyetler vardır:

- **Uzun metin pahalıdır.** Teklif açıklaması gibi uzun içerikleri zincirde tutmak gas yakar. Bu tür veriler için IPFS gibi zincir dışı bir depo veya kısa tutulan zincir üstü metin kullanılır.
- **Sıralama ve arama arayüzde yapılır.** Veritabanı olmadığı için filtreleme, sıralama ve arama işlemleri tarayıcıda çalışır.
- **Geçmiş için event log gerekir.** "Kim ne zaman ne yaptı" sorusunun cevabı kontrat olaylarını (event) taramaktan geçer. Büyük veri için bir indexer gerekebilir.
- **Her sayfa kendi verisini çeker.** Her açılışta RPC'ye birden fazla çağrı yapılır. Önbellek yoktur.

Bu maliyetler, flooor.fun gibi az sayıda sayısal durum tutan protokoller için önemsizdir. Bir teklif sistemi gibi metin ağırlıklı işler için ise tasarım kararı gerektirir.

---

## 6. Sonuç

Prop House, 2022 döneminin tipik "hibrit" mimarisidir. Zincirden bakiye okur ama veriyi kendi sunucusunda tutar. Bu, hızlı geliştirme sağlar ama işletme yükü, güven sorunu ve tek hata noktası getirir.

flooor.fun ise "kontrat her şeydir" prensibiyle kurulmuştur. Arayüz sadece bir pencere, backend hiç yok. Bu yaklaşım daha az özellik sunar ama sıfır işletme maliyeti, tam şeffaflık ve kapatılamazlık sağlar.

Bu projenin amacı, Prop House'un teklif ve oylama mantığını, flooor.fun'un backend'siz felsefesiyle yeniden kurmaktır. Yani teklif ve oylama kontrata girer, arayüz statik olur, sunucu hiç olmaz.
