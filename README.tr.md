<p align="center">
  <img src="assets/logo.jpg" width="160" height="160" alt="AtrisTracker Logosu" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(6, 182, 212, 0.3);"/>
</p>

<h1 align="center">AtrisTracker</h1>

<p align="center">
  <b>Yapay Zeka CLI Araçları ve Kota Limitleri İçin Profesyonel Masaüstü Overlay Takip Uygulaması</b>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English README</b></a> •
  <a href="#öne-çıkan-özellikler">Özellikler</a> •
  <a href="#teknoloji-yığını">Teknolojiler</a> •
  <a href="#kurulum-ve-çalıştırma">Kurulum</a> •
  <a href="#proje-mimarisi">Mimari</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-34.x-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron"/>
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/SQLite-sql.js-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"/>
  <img src="https://img.shields.io/badge/Lisans-MIT-blue?style=for-the-badge" alt="Lisans"/>
</p>

---

## 📌 Genel Bakış

**AtrisTracker**, **Antigravity CLI**, **Codex CLI** ve **Claude Code** gibi yapay zeka araçlarını kullanan yazılımcılar için özel olarak geliştirilmiş, ultra hızlı ve şık bir masaüstü yüzen pencere (overlay) uygulamasıdır.

Ekranınızda diğer pencerelerin üstünde katman olarak durarak 5 saatlik kayan pencere kullanım yüzdelerini, kalan kota sürelerini, haftalık sıfırlanma takvimini ve giriş yapılan aktif hesap oturumlarını anlık olarak takip etmenizi sağlar. Tüm veriler bilgisayarınızda yerel SQLite veritabanında güvenle saklanır.

---

## ✨ Öne Çıkan Özellikler

- **🛸 Sürüklenebilir Masaüstü Overlay Penceresi**:
  - Kod yazarken verileri her an görebilmeniz için **Her Zaman Üstte (Pin)** modu.
  - Özel sürüklenebilir pencere başlığı (`-webkit-app-region: drag`).
  - Sistem Tepsisi (Tray) entegrasyonu (Arka planda çalışma, Göster/Gizle, Anlık Yenile, Çıkış).

- **📊 Çoklu CLI Aracı Desteği**:
  - **Antigravity CLI**: Oturum açılan aktif hesabı (tek oturum yapısını), kota kullanım yüzdesini ve 5 saatlik sıfırlanma zamanını takip eder.
  - **Codex CLI**: İstek kotalarını, 5h kalan süre gerisayımını ve haftalık jeton kullanımını izler.
  - **Claude Code**: Kullanım yüzdesini ve haftalık sıfırlanma takvimini görüntüler.
  - **Özet Sekmesi**: Tüm 3 CLI aracını tek ekranda yan yana karşılaştırır.

- **⏱️ Canlı Gerisayım Sayacı & Radyal Göstergeler**:
  - Dinamik renk geçişli (Yeşil -> Turuncu -> Kırmızı) dairesel SVG % kullanım halkası.
  - 5 saatlik kotanın sıfırlanmasına kalan süreyi gösteren canlı dijital sayaç (`saat:dakika:saniye`).
  - Haftalık toplam kullanım ve sıfırlanma takvimi.

- **💾 Yerel SQLite Veritabanı**:
  - Veriler `%APPDATA%\ai-usage-tracker\ai_usage_tracker.db` dosyasında yerel olarak saklanır.
  - Recharts grafikleri ile geçmiş kullanım trendi izleme.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Masaüstü Çatısı** | [Electron 34](https://www.electronjs.org/) | Frameless overlay pencere, sistem tepsisi, IPC köprüsü |
| **Ön Yüz** | [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/) | Hızlı HMR ve reaktif bileşen mimarisi |
| **Stil / Tasarım** | [Tailwind CSS 3](https://tailwindcss.com/) | Özel koyu Glassmorphism (buzlu cam) tema sistemi |
| **Veritabanı** | [SQLite (`sql.js`)](https://sql.js.org/) | Yerel dosyaya yazılan WebAssembly SQLite motoru |
| **Grafik & İkonlar** | [Recharts](https://recharts.org/) & [Lucide Icons](https://lucide.dev/) | Trend grafik kütüphanesi ve modern vektör ikonlar |

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler

- **Node.js**: v18.x veya üzeri (v24+ desteklenmektedir)
- **npm**: v9.x veya üzeri

### Adım Adım Kurulum

1. **Projeyi klonlayın**:
   ```bash
   git clone https://github.com/kullaniciadi/atristracker.git
   cd atristracker
   ```

2. **Bağımlılıkları yükleyin**:
   ```bash
   npm install
   ```

3. **Electron ikili dosyalarını hazırlayın** (Windows için gerekiyorsa):
   ```bash
   node scripts/setupElectron.js
   ```

---

## 💻 Uygulamayı Başlatma

### Geliştirici Modu (Vite HMR + Electron)
```bash
npm run electron:dev
```

### Üretim Derlemesi ve Başlatma
```bash
# 1. Ön yüzü derleyin
npm run build

# 2. Electron uygulamasını başlatın
npm run electron:start
```

---

## 📜 Lisans

Bu proje **MIT Lisansı** altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakabilirsiniz.
