import type { Messages } from './en';

export const tr: Messages = {
  meta: {
    title: 'Benchbite: antrenman ve beslenme tek uygulamada',
    description:
      'Antrenman ve beslenme tek uygulamada; sana göre hazırlanan bir plan ve konuşabileceğin bir koçla.',
  },
  language: 'Dil',
  hero: {
    title: ['Kaldır.', 'Ye.', 'Planda kal.'],
    text: 'Antrenman ve beslenme tek uygulamada; planını sadece göstermeyen, seninle birlikte değiştiren bir koçla.',
    soon: 'iOS ve Android için yakında',
    greeting: 'Merhaba, ben Bite.',
    promise: 'Planını seninle şekillendiririm.',
    biteAlt: 'Bite, mutlu yüzlü, ısırılmış beyaz bir tabak',
  },
  day: {
    label: 'Bite ile bir gün',
    plan: {
      nav: 'Plan',
      title: 'Bite planını sadece okumaz. Yazılmasına da yardım eder.',
      text: 'Vaktin mi az, salondan uzakta mısın? Bite yeni antrenmanlar, farklı ekipmana göre alternatifler ve yeni hedefler önerir. Sen tek dokunuşla onaylarsın, plan da uyum sağlar.',
      chips: ['Yeni antrenmanlar', 'Farklı ekipman', 'Yeni hedefler'],
      you: 'Bu hafta sadece dambıl var ve günde 30 dakikam.',
      bite: 'O zaman haftanı değiştirelim. Önerim şu:',
      cardTitle: 'Dambılla üst vücut',
      cardMeta: '5 egzersiz · yaklaşık 30 dk',
      cardAdd: 'Planıma ekle',
      cardEdit: 'Düzenle',
    },
    breakfast: {
      nav: 'Kahvaltı',
      title: 'Kahve soğumadan kahvaltı kaydedilir.',
      text: 'Geniş bir besin kütüphanesi, kendi besin ve tariflerin, kilona göre değişen hedefler.',
      alt: 'Günün öğünleri, makrolar ve su',
    },
    lunch: {
      nav: 'Öğle',
      title: '“Üç yumurta ve tost.” Gerisi Bite’ta.',
      text: 'Bir öğünü anlat veya fotoğrafını gönder; tek dokunuşla ekleyeceğin bir kart hazırlansın. Kararı sen verirsin.',
      alt: 'Anlatılan bir öğle yemeğini karta dönüştüren Bite sohbeti',
    },
    workout: {
      nav: 'Antrenman',
      title: 'Geçen sefer: 77,5 kg × 11. Geç bakalım.',
      text: 'Görselli yaklaşık 870 egzersiz, her setin yanında geçen seferki setler, dinlenme sayacı ve egzersiz başına rekorlar.',
      alt: 'Setler ve dinlenme sayacıyla devam eden bir antrenman',
    },
    progress: {
      nav: 'İlerleme',
      title: 'Seri tamam. Yarın görüşürüz.',
      text: 'Zaman içindeki kilon, aylık özetler ve zor günler için seri dondurma hakları.',
      alt: 'Üç aylık kilo grafiği ve geçen ayın özeti',
    },
  },
  footer: {
    night: 'İyi geceler. Yarın aynı plan.',
    question: 'O zamana kadar bir şey lazım olursa:',
    biteAlt: 'Uyuyan Bite',
    note: 'Benchbite tıbbi tavsiyenin yerini tutmaz.',
    links: 'Diğer',
    privacy: 'Gizlilik',
    terms: 'Koşullar',
    imprint: 'Künye',
    support: 'Destek',
    deleteAccount: 'Hesabı sil',
  },
  legal: {
    draft: 'Yer tutucu. Yasal metin henüz yazılmadı.',
    version: 'Sürüm',
    versionPlaceholder: '[SÜRÜM TARİHİ]',
    onThisPage: 'Bu sayfada',
  },
  privacy: {
    title: 'Gizlilik politikası',
    sections: [
      {
        id: 'controller',
        title: 'Sorumlu kim',
        placeholder: '[GİZLİLİK METNİ: VERİ SORUMLUSU, AD VE ADRES]',
      },
      {
        id: 'data',
        title: 'İşlediğimiz veriler',
        placeholder: '[GİZLİLİK METNİ: VERİLER, AMAÇLAR, HUKUKİ DAYANAKLAR, SAKLAMA]',
      },
      {
        id: 'health',
        title: 'Sağlık verileri',
        placeholder: '[GİZLİLİK METNİ: ONAY VE GERİ ÇEKME]',
      },
      {
        id: 'ai',
        title: 'Yapay zeka koçu',
        placeholder: '[GİZLİLİK METNİ: BITE NEYİ, KİME GÖNDERİR, GERİ ÇEKME]',
      },
      {
        id: 'processors',
        title: 'Hizmet sağlayıcılar',
        placeholder: '[GİZLİLİK METNİ: SAĞLAYICILAR VE VERİ KONUMLARI]',
      },
      {
        id: 'rights',
        title: 'Hakların',
        placeholder: '[GİZLİLİK METNİ: HAKLAR, İLETİŞİM, ŞİKAYET]',
      },
    ],
  },
  terms: {
    title: 'Kullanım koşulları',
    sections: [
      { id: 'scope', title: 'Kapsam', placeholder: '[KOŞUL METNİ: SAĞLAYICI VE KAPSAM]' },
      {
        id: 'eligibility',
        title: 'Benchbite’ı kimler kullanabilir',
        placeholder: '[KOŞUL METNİ: YAŞ VE HESAPLAR]',
      },
      {
        id: 'health',
        title: 'Sağlık uyarısı',
        placeholder: '[KOŞUL METNİ: TIBBİ TAVSİYE DEĞİLDİR, KULLANIM SINIRLARI]',
      },
      { id: 'premium', title: 'Premium', placeholder: '[KOŞUL METNİ: PLANLAR, ÖDEME, İPTAL]' },
      {
        id: 'ending',
        title: 'Kullanımın sona ermesi',
        placeholder: '[KOŞUL METNİ: SİLME, FESİH, UYGULANACAK HUKUK]',
      },
    ],
  },
  imprint: {
    title: 'Künye',
    draft: 'Yer tutucu. Ad, adres, e-posta ve yasal metin yayından önce eklenecek.',
    provider: 'Sağlayıcı',
    name: '[AD SOYAD]',
    street: '[SOKAK VE NUMARA]',
    city: '[POSTA KODU VE ŞEHİR]',
    country: '[ÜLKE]',
    contact: 'İletişim',
    email: 'E-posta',
    emailAddress: '[E-POSTA ADRESİ]',
    fastContact: '[TELEFON VEYA DİĞER HIZLI İLETİŞİM, GEREKİYORSA]',
    further: 'Diğer bilgiler',
    register: '[VERGİ NO VEYA SİCİL BİLGİLERİ, VARSA]',
    notes: '[DİĞER YASAL NOTLAR]',
  },
  support: {
    title: 'Nasıl yardımcı olabiliriz?',
    text: 'Bize yaz; bir şey çalışmıyorsa cihazını ve uygulama sürümünü de belirt.',
    app: 'Uygulamayla ilgili yardım',
    privacy: 'Verilerin ve gizlilik',
    questions: 'Sık sorulan sorular',
    deleteQuestion: 'Hesabımı veya misafir verilerimi nasıl silerim?',
    questionPlaceholder: '[SORU VE YANIT]',
  },
  deleteAccount: {
    title: 'Benchbite hesabını sil',
    text: 'Hesaplar ve misafir verileri uygulamadan silinebilir. Silme işlemi geri alınamaz.',
    inApp: 'Uygulamada',
    steps: [
      'Benchbite’ı aç. Hesabın varsa önce giriş yap.',
      'Ayarlar’a git ve hesabını veya misafir verilerini silme seçeneğini seç.',
      'Onayla.',
    ],
    guestNote:
      'Benchbite’ı misafir olarak mı kullanıyorsun? Uygulamayı kaldırmadan önce verilerini uygulamanın içinden sil. Misafir verilerinin e-posta adresi olmadığı için onları sonradan bulamayız.',
    withoutApp: 'Uygulama olmadan',
    withoutAppText:
      'Uygulamayı kaldırdın ve hesabın var mı? Hesabını silmek için uygulamayı yeniden kurup giriş yap. Yakında silme isteğini buradan da gönderip e-postayla onaylayabileceksin.',
    kept: 'Neler silinir, neler kalır',
    keptPlaceholder: '[YASAL METİN: SİLİNEN VERİLER, KALAN VERİLER, SÜRELER]',
  },
};
