Page({
  data: {
    languageList: ['中文', '英文'],
    selectedLanguage: '中文',
    isNotificationOn: true
  },
  onLoad() {
    // 从缓存获取设置信息
    const selectedLanguage = wx.getStorageSync('selectedLanguage');
    const isNotificationOn = wx.getStorageSync('isNotificationOn');
    if (selectedLanguage) {
      this.setData({
        selectedLanguage
      });
    }
    if (isNotificationOn!== null) {
      this.setData({
        isNotificationOn
      });
    }
  },
  onLanguageChange(e) {
    const index = e.detail.value;
    const selectedLanguage = this.data.languageList[index];
    this.setData({
      selectedLanguage
    });
    wx.setStorageSync('selectedLanguage', selectedLanguage);
  },
  onNotificationChange(e) {
    const isNotificationOn = e.detail.value;
    this.setData({
      isNotificationOn
    });
    wx.setStorageSync('isNotificationOn', isNotificationOn);
  },
  syncData() {
    // 执行数据同步逻辑
    wx.showToast({
      title: '数据同步中...',
      icon: 'loading',
      duration: 2000
    });
  }
});