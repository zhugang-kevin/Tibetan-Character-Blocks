// data/lamp.js — 「万家灯火」祈福跳窗的展示数据（本版全部为演示用固定数据）
// 合规边界（与 docs/privilege-system-v1.md 一致）：
//   ① 无任何促销与营销内容，不发奖励凭证，也不使用虚拟币道具；
//   ② 不做竞争性呈现：只作平和的地域灯火展示，不标示高低与位次；
//   ③ 不采集用户任何信息（昵称 / 位置 / 性别均无），页面也不发起任何网络请求。
// 结构约定：provinces 为 5 个地区的灯火数（顺序固定，不代表高低）。
module.exports = {
  total: 128456,
  provinces: [
    { name: '西藏', count: 89201 },
    { name: '四川', count: 76540 },
    { name: '青海', count: 54300 },
    { name: '甘肃', count: 32100 },
    { name: '云南', count: 21800 }
  ],
  home: { name: '浙江', count: 12000 },
  lotus: { gold: 32000, pink: 45000 },
  title: '万家灯火',
  subTemplate: '今日全国共点亮 {total} 盏灯',
  homeTemplate: '你的家乡 · {name} 已有 {count} 盏灯',
  buttonText: '点亮我的一盏灯',
  // D50（用户点名文案）：点亮后的致谢按钮 + 关闭按钮（致谢按钮点击同为收下灯火，不留死按钮）
  thanksText: '感谢您为世界和平祈福',
  closeText: '点击关闭',
  tip: '感恩您的善念，今日之光已汇聚。',
  onceNote: '每天首次打开时，与远方的灯火同明一次。'
};
