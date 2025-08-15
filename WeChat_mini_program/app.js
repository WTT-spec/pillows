App({
  globalData: {
    heartRate: [],
    breathRate: [],
    timeNow: [], 
    timestart:'',
    timeout:'',
    Date: 0,
    inbed:0,
    snoreTime:0,
    bodymove:0,
    YWheadheight:1,
    YWneckheight:1,
    CWheadheight:1,
    CWneckheight:1,
    simulateflag:-1,
    snoreTurnFlag:false,
    sleeppose:-1,
    currentMode: 3,
    device_status: 0,
    sleepStages: [], // 存储睡眠阶段分析结果
    sleepScore: 100, // 睡眠评分
    scoreDetails: [], // 扣分详情
    sleepDataMap: {}, // 按日期存储睡眠数据（键：YYYY-MM-DD，值：睡眠数据对象）
  },

  onLaunch() {
    // 初始化云开发环境
    wx.cloud.init({
      env: 'cloud1-1gi4lcv5fab1f2f9', // 替换为你的云开发环境 ID
      traceUser: true
    });

    this.cleanExpiredData(); // 小程序初始化时清理过期数据
  },

  // 存储睡眠数据并自动清理过期记录
  saveSleepData(dateKey, data) {
    if (!dateKey) {
      console.error('dateKey 为空，无法存储数据');
      return;
    }
    const now = new Date();
    const sleepDataMap = this.globalData.sleepDataMap;
    
    // 存储当前数据
    sleepDataMap[dateKey] = {
      ...data,
      // 确保数据格式与report.js一致
      deepSleep: `${data.deepSleepHours}小时${data.deepSleepMinutes}分钟`,
      lightSleep: `${data.lightSleepHours}小时${data.lightSleepMinutes}分钟`,
      remSleep: `${data.remSleepHours}小时${data.remSleepMinutes}分钟`,
      awake: `${data.awakeHours}小时${data.awakeMinutes}分钟`,
      sleepTime: data.sleepTime,
      wakeTime: data.wakeTime,
      score: data.score
    };

    // 正确调用 wx.setStorageSync
    wx.setStorageSync(dateKey, {
      ...data,
      // 确保数据格式与report.js一致
      deepSleep: `${data.deepSleepHours}小时${data.deepSleepMinutes}分钟`,
      lightSleep: `${data.lightSleepHours}小时${data.lightSleepMinutes}分钟`,
      remSleep: `${data.remSleepHours}小时${data.remSleepMinutes}分钟`,
      awake: `${data.awakeHours}小时${data.awakeMinutes}分钟`,
      sleepTime: data.sleepTime,
      wakeTime: data.wakeTime,
      score: data.score
    });

    // 清理超过30天的数据
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    Object.keys(sleepDataMap).forEach(key => {
      if (new Date(key) < thirtyDaysAgo) delete sleepDataMap[key];
    });
  },

  cleanExpiredData() {
    // 清理本地存储过期数据（这里假设过期日期判断逻辑，实际需根据业务调整）
    const now = new Date();
    const keys = wx.getStorageInfoSync().keys;
    keys.forEach(key => {
        const date = new Date(key);
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) { // 假设30天为过期时间
            wx.removeStorageSync(key);
        }
    });
    // 移除 saveSleepData('', {}); 这一行
  }
})