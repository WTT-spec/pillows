Page({
  data: {
    deviceInfo: {}
  },
  onLoad() {
    // 从缓存或者接口获取设备信息
    const deviceInfo = wx.getStorageSync('deviceInfo');
    if (deviceInfo) {
      this.setData({
        deviceInfo
      });
    }
  },
  unbindDevice() {
    // 执行解绑设备的逻辑
    wx.removeStorageSync('deviceInfo');
    wx.showToast({
      title: '设备已解绑',
      icon: 'success',
      duration: 2000
    });
    wx.navigateBack();
  }
});