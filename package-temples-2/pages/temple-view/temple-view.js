Page({
  data: { img: '', name: '', sub: '' },
  onLoad: function (q) {
    this.setData({
      img: decodeURIComponent(q.img || ''),
      name: decodeURIComponent(q.name || ''),
      sub: decodeURIComponent(q.sub || '')
    });
  }
});
