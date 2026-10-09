// 표현집 (인터넷 없이도 됨) — 한국어 · 튀르키예어 · 영어 · 일본어
// jaKana: 일본어 읽기(히라가나, 조사는 소리대로 わ·え·お, 낱말 띄어 쓰기) → 화면에서 한글 발음으로
// only: 그 상대 언어일 때만 보이는 문장
export const PHRASE_CATS = [
  { id: 'greet', name: '인사', icon: '👋' },
  { id: 'talk', name: '소통', icon: '💬' },
  { id: 'food', name: '식당', icon: '🍽️' },
  { id: 'shop', name: '쇼핑', icon: '🛍️' },
  { id: 'move', name: '길·교통', icon: '🚌' },
  { id: 'stay', name: '숙소', icon: '🏨' },
  { id: 'help', name: '긴급', icon: '🚑' },
];

export const PHRASES = [
  // 인사
  { cat: 'greet', ko: '안녕하세요.', tr: 'Merhaba.', en: 'Hello.', ja: 'こんにちは。', jaKana: 'こんにちわ' },
  { cat: 'greet', ko: '만나서 반가워요.', tr: 'Tanıştığımıza memnun oldum.', en: 'Nice to meet you.', ja: 'はじめまして。', jaKana: 'はじめまして' },
  { cat: 'greet', ko: '감사합니다.', tr: 'Teşekkür ederim.', en: 'Thank you.', ja: 'ありがとうございます。', jaKana: 'ありがとう ございます' },
  { cat: 'greet', ko: '천만에요.', tr: 'Rica ederim.', en: "You're welcome.", ja: 'どういたしまして。', jaKana: 'どう いたしまして' },
  { cat: 'greet', ko: '죄송합니다.', tr: 'Özür dilerim.', en: "I'm sorry.", ja: 'ごめんなさい。', jaKana: 'ごめんなさい' },
  { cat: 'greet', ko: '실례합니다.', tr: 'Affedersiniz.', en: 'Excuse me.', ja: 'すみません。', jaKana: 'すみません' },
  { cat: 'greet', ko: '네.', tr: 'Evet.', en: 'Yes.', ja: 'はい。', jaKana: 'はい' },
  { cat: 'greet', ko: '아니요.', tr: 'Hayır.', en: 'No.', ja: 'いいえ。', jaKana: 'いいえ' },
  { cat: 'greet', ko: '괜찮아요.', tr: 'Sorun değil.', en: "It's okay.", ja: '大丈夫です。', jaKana: 'だいじょうぶ です' },
  { cat: 'greet', ko: '안녕히 계세요.', tr: 'Hoşça kalın.', en: 'Goodbye.', ja: 'さようなら。', jaKana: 'さようなら' },
  { cat: 'greet', ko: '좋은 하루 보내세요.', tr: 'İyi günler.', en: 'Have a nice day.', ja: 'よい一日を。', jaKana: 'よい いちにちお' },
  // 소통
  { cat: 'talk', ko: '저는 한국 사람이에요.', tr: 'Ben Koreliyim.', en: "I'm Korean.", ja: '私は韓国人です。', jaKana: 'わたしわ かんこくじん です' },
  { cat: 'talk', ko: '튀르키예어를 잘 못해요.', tr: 'Türkçeyi iyi konuşamıyorum.', en: "I don't speak Turkish well.", ja: 'トルコ語はあまり話せません。', jaKana: 'とるこごわ あまり はなせません', only: 'tr' },
  { cat: 'talk', ko: '영어를 잘 못해요.', tr: 'İngilizceyi iyi konuşamıyorum.', en: "I don't speak English well.", ja: '英語はあまり話せません。', jaKana: 'えいごわ あまり はなせません', only: 'en' },
  { cat: 'talk', ko: '일본어를 잘 못해요.', tr: 'Japoncayı iyi konuşamıyorum.', en: "I don't speak Japanese well.", ja: '日本語はあまり話せません。', jaKana: 'にほんごわ あまり はなせません', only: 'ja' },
  { cat: 'talk', ko: '천천히 말해 주세요.', tr: 'Lütfen yavaş konuşun.', en: 'Please speak slowly.', ja: 'ゆっくり話してください。', jaKana: 'ゆっくり はなして ください' },
  { cat: 'talk', ko: '다시 한번 말해 주시겠어요?', tr: 'Tekrar söyler misiniz?', en: 'Could you say that again?', ja: 'もう一度言っていただけますか？', jaKana: 'もう いちど いって いただけますか' },
  { cat: 'talk', ko: '이해했어요.', tr: 'Anladım.', en: 'I understand.', ja: 'わかりました。', jaKana: 'わかりました' },
  { cat: 'talk', ko: '이해하지 못했어요.', tr: 'Anlamadım.', en: "I don't understand.", ja: 'わかりません。', jaKana: 'わかりません' },
  { cat: 'talk', ko: '이 화면을 봐 주세요.', tr: 'Lütfen bu ekrana bakın.', en: 'Please look at this screen.', ja: 'この画面を見てください。', jaKana: 'この がめんお みて ください' },
  { cat: 'talk', ko: '휴대폰에 대고 말해 주세요.', tr: 'Lütfen telefona doğru konuşun.', en: 'Please speak into the phone.', ja: 'スマホに向かって話してください。', jaKana: 'すまほに むかって はなして ください' },
  { cat: 'talk', ko: '번역 앱을 쓰고 있어요.', tr: 'Çeviri uygulaması kullanıyorum.', en: "I'm using a translation app.", ja: '翻訳アプリを使っています。', jaKana: 'ほんやく あぷりお つかって います' },
  // 식당
  { cat: 'food', ko: '메뉴판 좀 주시겠어요?', tr: 'Menüyü alabilir miyim?', en: 'Could I have the menu?', ja: 'メニューをいただけますか？', jaKana: 'めにゅーお いただけますか' },
  { cat: 'food', ko: '뭘 추천하세요?', tr: 'Ne tavsiye edersiniz?', en: 'What do you recommend?', ja: 'おすすめは何ですか？', jaKana: 'おすすめわ なん ですか' },
  { cat: 'food', ko: '이걸로 주세요.', tr: 'Bunu alayım.', en: "I'll have this.", ja: 'これをください。', jaKana: 'これお ください' },
  { cat: 'food', ko: '물 좀 주시겠어요?', tr: 'Su alabilir miyim?', en: 'Could I have some water?', ja: 'お水をいただけますか？', jaKana: 'おみずお いただけますか' },
  { cat: 'food', ko: '맵지 않게 해 주세요.', tr: 'Acısız olsun lütfen.', en: 'Not spicy, please.', ja: '辛くしないでください。', jaKana: 'からく しないで ください' },
  { cat: 'food', ko: '땅콩 알레르기가 있어요.', tr: 'Fıstık alerjim var.', en: "I'm allergic to peanuts.", ja: 'ピーナッツアレルギーがあります。', jaKana: 'ぴーなっつ あれるぎーが あります' },
  { cat: 'food', ko: '정말 맛있어요.', tr: 'Çok lezzetli.', en: "It's delicious.", ja: 'とてもおいしいです。', jaKana: 'とても おいしい です' },
  { cat: 'food', ko: '포장해 주실 수 있어요?', tr: 'Paket yapabilir misiniz?', en: 'Can I get this to go?', ja: '持ち帰りにできますか？', jaKana: 'もちかえりに できますか' },
  { cat: 'food', ko: '계산서 주세요.', tr: 'Hesap lütfen.', en: 'The bill, please.', ja: 'お会計をお願いします。', jaKana: 'おかいけいお おねがい します' },
  { cat: 'food', ko: '카드로 계산할 수 있어요?', tr: 'Kartla ödeyebilir miyim?', en: 'Can I pay by card?', ja: 'カードで払えますか？', jaKana: 'かーどで はらえますか' },
  // 쇼핑
  { cat: 'shop', ko: '이거 얼마예요?', tr: 'Bu ne kadar?', en: 'How much is this?', ja: 'これはいくらですか？', jaKana: 'これわ いくら ですか' },
  { cat: 'shop', ko: '너무 비싸요.', tr: 'Çok pahalı.', en: "It's too expensive.", ja: '高すぎます。', jaKana: 'たかすぎます' },
  { cat: 'shop', ko: '좀 깎아 주실 수 있어요?', tr: 'İndirim yapabilir misiniz?', en: 'Could you give me a discount?', ja: '少し安くしてもらえますか？', jaKana: 'すこし やすく して もらえますか' },
  { cat: 'shop', ko: '다른 색 있어요?', tr: 'Başka rengi var mı?', en: 'Do you have it in another color?', ja: '他の色はありますか？', jaKana: 'ほかの いろわ ありますか' },
  { cat: 'shop', ko: '더 큰 사이즈 있어요?', tr: 'Daha büyük bedeni var mı?', en: 'Do you have a bigger size?', ja: 'もっと大きいサイズはありますか？', jaKana: 'もっと おおきい さいずわ ありますか' },
  { cat: 'shop', ko: '입어 봐도 돼요?', tr: 'Deneyebilir miyim?', en: 'Can I try it on?', ja: '試着してもいいですか？', jaKana: 'しちゃく しても いい ですか' },
  { cat: 'shop', ko: '그냥 구경하는 거예요.', tr: 'Sadece bakıyorum.', en: "I'm just looking.", ja: '見ているだけです。', jaKana: 'みて いる だけ です' },
  { cat: 'shop', ko: '이걸로 살게요.', tr: 'Bunu alıyorum.', en: "I'll take it.", ja: 'これにします。', jaKana: 'これに します' },
  { cat: 'shop', ko: '영수증 주시겠어요?', tr: 'Fiş alabilir miyim?', en: 'Could I have a receipt?', ja: 'レシートをいただけますか？', jaKana: 'れしーとお いただけますか' },
  // 길·교통
  { cat: 'move', ko: '화장실이 어디예요?', tr: 'Tuvalet nerede?', en: 'Where is the restroom?', ja: 'トイレはどこですか？', jaKana: 'といれわ どこ ですか' },
  { cat: 'move', ko: '지하철역이 어디예요?', tr: 'Metro istasyonu nerede?', en: 'Where is the subway station?', ja: '地下鉄の駅はどこですか？', jaKana: 'ちかてつの えきわ どこ ですか' },
  { cat: 'move', ko: '길을 잃었어요.', tr: 'Kayboldum.', en: "I'm lost.", ja: '道に迷いました。', jaKana: 'みちに まよいました' },
  { cat: 'move', ko: '지도에서 보여 주시겠어요?', tr: 'Haritada gösterebilir misiniz?', en: 'Could you show me on the map?', ja: '地図で教えていただけますか？', jaKana: 'ちずで おしえて いただけますか' },
  { cat: 'move', ko: '걸어서 갈 수 있어요?', tr: 'Yürüyerek gidilebilir mi?', en: 'Can I walk there?', ja: '歩いて行けますか？', jaKana: 'あるいて いけますか' },
  { cat: 'move', ko: '얼마나 걸려요?', tr: 'Ne kadar sürer?', en: 'How long does it take?', ja: 'どのくらいかかりますか？', jaKana: 'どのくらい かかりますか' },
  { cat: 'move', ko: '이 버스 시내로 가요?', tr: 'Bu otobüs şehir merkezine gidiyor mu?', en: 'Does this bus go downtown?', ja: 'このバスは市内に行きますか？', jaKana: 'この ばすわ しないに いきますか' },
  { cat: 'move', ko: '표 한 장 주세요.', tr: 'Bir bilet lütfen.', en: 'One ticket, please.', ja: '切符を一枚ください。', jaKana: 'きっぷお いちまい ください' },
  { cat: 'move', ko: '이 주소로 가 주세요.', tr: 'Beni bu adrese götürür müsünüz?', en: 'Could you take me to this address?', ja: 'この住所までお願いします。', jaKana: 'この じゅうしょまで おねがい します' },
  { cat: 'move', ko: '여기서 세워 주세요.', tr: 'Burada durabilir misiniz?', en: 'Could you stop here, please?', ja: 'ここで止めてください。', jaKana: 'ここで とめて ください' },
  // 숙소
  { cat: 'stay', ko: '예약했어요.', tr: 'Rezervasyonum var.', en: 'I have a reservation.', ja: '予約しています。', jaKana: 'よやく して います' },
  { cat: 'stay', ko: '체크인하고 싶어요.', tr: 'Giriş yapmak istiyorum.', en: "I'd like to check in.", ja: 'チェックインをお願いします。', jaKana: 'ちぇっくいんお おねがい します' },
  { cat: 'stay', ko: '체크아웃은 몇 시예요?', tr: 'Çıkış saat kaçta?', en: 'What time is check-out?', ja: 'チェックアウトは何時ですか？', jaKana: 'ちぇっくあうとわ なんじ ですか' },
  { cat: 'stay', ko: '와이파이 비밀번호가 뭐예요?', tr: 'Wi-Fi şifresi nedir?', en: "What's the Wi-Fi password?", ja: 'Wi-Fiのパスワードは何ですか？', jaKana: 'わいふぁいの ぱすわーどわ なん ですか' },
  { cat: 'stay', ko: '짐을 맡겨도 될까요?', tr: 'Bavulumu bırakabilir miyim?', en: 'Can I leave my luggage here?', ja: '荷物を預けてもいいですか？', jaKana: 'にもつお あずけても いい ですか' },
  { cat: 'stay', ko: '수건을 더 주시겠어요?', tr: 'Biraz daha havlu alabilir miyim?', en: 'Could I have some more towels?', ja: 'タオルをもう少しいただけますか？', jaKana: 'たおるお もう すこし いただけますか' },
  { cat: 'stay', ko: '에어컨이 안 돼요.', tr: 'Klima çalışmıyor.', en: "The air conditioner isn't working.", ja: 'エアコンが動きません。', jaKana: 'えあこんが うごきません' },
  // 긴급
  { cat: 'help', ko: '도와주세요!', tr: 'İmdat!', en: 'Help!', ja: '助けてください！', jaKana: 'たすけて ください' },
  { cat: 'help', ko: '경찰을 불러 주세요!', tr: 'Polis çağırın!', en: 'Call the police!', ja: '警察を呼んでください！', jaKana: 'けいさつお よんで ください' },
  { cat: 'help', ko: '구급차를 불러 주세요!', tr: 'Ambulans çağırın!', en: 'Call an ambulance!', ja: '救急車を呼んでください！', jaKana: 'きゅうきゅうしゃお よんで ください' },
  { cat: 'help', ko: '병원에 가야 해요.', tr: 'Hastaneye gitmem lazım.', en: 'I need to go to the hospital.', ja: '病院に行かなければなりません。', jaKana: 'びょういんに いかなければ なりません' },
  { cat: 'help', ko: '약국이 어디예요?', tr: 'Eczane nerede?', en: 'Where is the pharmacy?', ja: '薬局はどこですか？', jaKana: 'やっきょくわ どこ ですか' },
  { cat: 'help', ko: '머리가 아파요.', tr: 'Başım ağrıyor.', en: 'I have a headache.', ja: '頭が痛いです。', jaKana: 'あたまが いたい です' },
  { cat: 'help', ko: '배가 아파요.', tr: 'Midem ağrıyor.', en: 'I have a stomachache.', ja: 'お腹が痛いです。', jaKana: 'おなかが いたい です' },
  { cat: 'help', ko: '알레르기가 있어요.', tr: 'Alerjim var.', en: 'I have an allergy.', ja: 'アレルギーがあります。', jaKana: 'あれるぎーが あります' },
  { cat: 'help', ko: '여권을 잃어버렸어요.', tr: 'Pasaportumu kaybettim.', en: 'I lost my passport.', ja: 'パスポートをなくしました。', jaKana: 'ぱすぽーとお なくしました' },
  { cat: 'help', ko: '한국 대사관에 연락해 주세요.', tr: "Lütfen Kore Büyükelçiliği'ni arayın.", en: 'Please contact the Korean Embassy.', ja: '韓国大使館に連絡してください。', jaKana: 'かんこく たいしかんに れんらく して ください' },
];

/** 상대 언어에 맞는 표현 */
export const phrasesFor = (cat, partner) => PHRASES.filter((p) => p.cat === cat && (!p.only || p.only === partner));
