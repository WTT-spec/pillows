// my.js
Page({
  data: {
    userInfo: {},
    summaryData: {
      avgScore: 0,
      days: 0 // 确保变量存在
    },
  },
  onLoad: function() {
    // 从缓存中获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
    }
    this.initData()
  },
   
  initData(callback) {
    /* wx.showLoading({ title: '加载中...' }); */
    this.getDays();
  },

  getDays() {
    /* wx.showLoading({ title: '加载中...' }); */
    
    wx.cloud.callFunction({
      name: 'getDays',
    })
    .then(res => {
      console.log('云函数原始返回结果:', res);
      
      // 直接获取 result 对象
      const result = res.result || {};
      
      // 检查 success 字段
      if (result.success) {
        console.log('获取记录条数成功:', result.data);
        
        this.setData({
          'summaryData.days': result.data
        }, () => {
          /* wx.hideLoading(); */
        });
      } else {
        // 处理云函数内部错误
        const error = result.error || {};
        const errorMsg = result.message || error.message || '未知错误';
        
        console.error('云函数执行失败:', errorMsg, error);
       /*  wx.hideLoading(); */
        
        wx.showToast({
          title: '获取失败: ' + errorMsg,
          icon: 'none',
          duration: 3000
        });
      }
    })
    .catch(err => {
      // 处理云函数调用失败
      console.error('云函数调用失败:', err);
      /* wx.hideLoading(); */
      
      wx.showToast({
        title: '调用失败: ' + err.errMsg,
        icon: 'none',
        duration: 3000
      });
    });
  },

  navigateToBindDevice: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/bindDevice/bindDevice'
    });
  },

  navigateToDeviceInfo: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/deviceInfo/deviceInfo'
    });
  },

  navigateToSettings: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/settings/settings'
    });
  },

  navigateToreport: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/report/report'
    });
  },

  navigateToHelp: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/help/help'
    });
  },

  navigateToFeedback: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/feedback/feedback'
    });
  }
});