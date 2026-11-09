/**
 * 补录批次（2026-10-26）
 *
 * 这 5 座有 CC 图，但不在 168 座名录里，原因各异：
 *   · 拉卜楞寺（甘肃夏河）、塔尔寺（青海湟中）、隆务寺（青海同仁）
 *     —— 在甘肃青海，不在西藏自治区文保名录内
 *   · 雍布拉康（山南乃东）
 *     —— 是宫殿（吐蕃第一座宫殿），不是寺院，之前没收录
 *   · 类乌齐寺（昌都类乌齐）
 *     —— 第二批里名字没对上（批次里收的是「乃塘寺」等同县其他寺）
 *
 * 数据等级：sourceLevel: 'image-only'
 *   只有一张 CC 图和英文/中文常用名，**没有逐条核验的文献依据**。
 *   虽然这三座大寺在藏传佛教地位极高（塔尔寺是宗喀巴诞生地、拉卜楞寺是格鲁派六大寺之一），
 *   但「地位高」不等于「我核过」—— 所以仍标 image-only，不冒充 verified。
 */

module.exports = {
  note: '补录 5 座：有 CC 图、不在西藏文保名录内。sourceLevel=image-only。',
  sourceLevel: 'image-only',
  total: 5,
  list: [
    {
      level: 1201,
      name: '拉卜楞寺',
      nameEn: 'Labrang Monastery',
      tibetan: '',
      county: '甘肃省甘南藏族自治州夏河县',
      sect: '格鲁派',
      founded: '',
      source: 'https://commons.wikimedia.org/wiki/Category:Labrang_Monastery',
      queriedAt: '2026-10-26',
      verified: false,
      sourceLevel: 'image-only',
      atlas: true,          // 2026-11-05：进揭图池（用户选 A：只用可信的 50 条）
      img: '/package-temples-1/new_拉卜楞寺.webp',
      imgCredit: 'SFT HQ / CC BY 2.0',
      imgPage: 'https://commons.wikimedia.org/wiki/Category:Labrang_Monastery'
    },
    {
      level: 1202,
      name: '塔尔寺',
      nameEn: 'Kumbum Monastery',
      tibetan: '',
      county: '青海省西宁市湟中区',
      sect: '格鲁派',
      founded: '',
      source: 'https://commons.wikimedia.org/wiki/Category:Kumbum_Monastery',
      queriedAt: '2026-10-26',
      verified: false,
      sourceLevel: 'image-only',
      atlas: true,          // 2026-11-05：进揭图池（用户选 A：只用可信的 50 条）
      img: '/package-temples-1/new_塔尔寺.webp',
      imgCredit: 'Gombojab Tsybikov / Public domain',
      imgPage: 'https://commons.wikimedia.org/wiki/Category:Kumbum_Monastery'
    },
    {
      level: 1203,
      name: '隆务寺',
      nameEn: 'Rongwo Monastery',
      tibetan: '',
      county: '青海省黄南藏族自治州同仁市',
      sect: '格鲁派',
      founded: '',
      source: 'https://commons.wikimedia.org/wiki/Category:Rongwo_Monastery',
      queriedAt: '2026-10-26',
      verified: false,
      sourceLevel: 'image-only',
      atlas: true,          // 2026-11-05：进揭图池（用户选 A：只用可信的 50 条）
      img: '/package-temples-2/new_隆务寺.webp',
      imgCredit: 'gill_penney / CC BY 2.0',
      imgPage: 'https://commons.wikimedia.org/wiki/Category:Rongwo_Monastery'
    },
    {
      level: 1204,
      name: '雍布拉康',
      nameEn: 'Yumbulagang',
      tibetan: '',
      county: '西藏山南市乃东区昌珠镇',
      sect: '（宫殿，非寺院）',
      founded: '',
      source: 'https://commons.wikimedia.org/wiki/Category:Yumbulagang',
      queriedAt: '2026-10-26',
      verified: false,
      sourceLevel: 'image-only',
      atlas: false,         // 🔴 雍布拉康是「宫殿」不是寺院，不进寺庙图鉴（D170 口径：不拿宫殿冒充寺院）
      img: '',              //       图片已移出包体（assets-src/temples-unused/）
      imgCredit: 'Preston Rhea / CC BY-SA 2.0',
      imgPage: 'https://commons.wikimedia.org/wiki/Category:Yumbulagang'
    },
    {
      level: 1205,
      name: '类乌齐寺',
      nameEn: 'Riwoche Monastery',
      tibetan: 'རི་བོ་ཆེ་',
      county: '西藏昌都市类乌齐县',
      sect: '达隆噶举派',
      founded: '',
      source: 'https://commons.wikimedia.org/wiki/Category:Riwoche_Monastery',
      queriedAt: '2026-10-26',
      verified: false,
      sourceLevel: 'image-only',
      atlas: true,          // 2026-11-05：进揭图池（用户选 A：只用可信的 50 条）
      img: '/package-temples-1/new_类乌齐寺.webp',
      imgCredit: 'Gruschke / CC BY-SA 3.0',
      imgPage: 'https://commons.wikimedia.org/wiki/Category:Riwoche_Monastery'
    }
  ]
};
