Page({
  data: {
    deviceId: '',
    devicePassword: '',
    errorMsg: ''
  },

  onDeviceIdInput(e) {
    this.setData({
      deviceId: e.detail.value.trim() // 添加trim()去除前后空格
    });
  },

  onDevicePasswordInput(e) {
    this.setData({
      devicePassword: e.detail.value.trim() // 添加trim()去除前后空格
    });
  },

  onBind() {
    const { deviceId, devicePassword } = this.data;
    
    // 基础验证
    if (!deviceId) {
      this.setData({
        errorMsg: '请输入设备号'
      });
      return;
    }
    
    if (!devicePassword) {
      this.setData({
        errorMsg: '请输入设备密码'
      });
      return;
    }
    
    // 硬编码验证逻辑
    if (this.validateDevice(deviceId, devicePassword)) {
      // 验证成功，跳转到主页面
      wx.reLaunch({
        url: '/miniprogram/pages/index/index'
      });
      
      // 存储设备信息到本地
      wx.setStorageSync('deviceInfo', {
        deviceId,
        deviceName: this.getDeviceName(deviceId) // 添加设备名称
      });
    } else {
      this.setData({
        errorMsg: '设备号或密码错误'
      });
    }
  },
  
  // 硬编码验证函数
  validateDevice(deviceId, password) {
    // 检查密码
    if (password !== '666') return false;
    
    // 检查格式：SL开头 + 3位数字
    if (!/^SL\d{3}$/.test(deviceId)) return false;
    
    // 检查数字范围
    const num = parseInt(deviceId.slice(2), 10);
    return num >= 1 && num <= 10;
  },
  
  // 获取设备名称（可选）
  getDeviceName(deviceId) {
    return `设备 ${deviceId}`;
  }
});