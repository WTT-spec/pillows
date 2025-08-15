Page({
  data: {
    // 使用设备属性名直接作为数据字段名
    YWheadheight: 1,
    CW_head_height2: 1,
    YWneckheight: 1,
    YW_left_height2: 1,
    CWheadheight: 1,
    YW_right_height2: 1,
    CWneckheight: 1,
    neck_height2: 1,
    currentMode: 0,
    currentMode2: 3,
    snoreTurnFlag: false,
    snoreTurnFlag2: false,
    simulateflag:-1,
    simulateflag2:-1,
    isPreferenceSent: false,
    lastSleepPose:-1,
    currentSleepPose:-1,
    simulateValue:false,
    ywLeftHeight: 1,
    ywRightHeight: 1,
    ywNeckHeight: 1,
    cwHeadHeight: 1,
    cwNeckHeight: 1,
    // it:0,
    button:0
  },

  config: {
    auth_info: "version=2022-05-01&res=userid%2F434014&et=1775632414&method=sha1&sign=kHWd9elS%2FlUegV9hulrkcrHqcgs%3D", // 鉴权信息
    product_id: "vg3Awbo66L", // 产品ID
    device_name: "room00", // 设备名称
    api_base_url: "https://iot-api.heclouds.com", // OneNET API基础URL
    start_time: 0, // 开始时间，用于请求数据时间戳区间
    end_time: 0, // 结束时间，用于请求数据时间戳区间
    limit: 1 // 获取最近的一个数据
  },

  onLoad(options) {
    const app = getApp();
    
    // 初始化云开发环境
    if (!app.globalData.cloudInit) {
      wx.cloud.init({ traceUser: true });
      app.globalData.cloudInit = true;
    }
    
    // 加载偏好设置
    this.loadPreferences();
    
    // 启动睡姿检测定时器
    this.data.poseCheckTimer = setInterval(() => {
      this.checkSleepPose();
      console.log('定时器工作')
    }, 1000); 
    this.updatedata0();
    // 设备状态更新定时器
     this.data.update1timer = setInterval(() => {
      const { start_time, end_time } = this.get_timestamps();
      this.config.start_time = start_time;
      this.config.end_time = end_time;
      this.updatedata();
    }, 1000); 
  },

  // 页面卸载时清理所有定时器
   onUnload() {
    if (this.data.updatetimer) clearInterval(this.data.updatetimer);
    if (this.data.sendtimer) clearInterval(this.data.sendtimer);
    if (this.data.poseCheckTimer) clearInterval(this.data.poseCheckTimer);
  }, 

  get_timestamps() {
    const now = new Date().getTime(); // 当前时间的时间戳
    const one_week_ago = now - 7 * 24 * 60 * 60 * 1000; // 一周前的时间戳
    return {
      start_time: one_week_ago,
      end_time: now
    };
  },

  updatedata0() {
    const app =getApp();
    this.setData({
      CW_head_height2:app.globalData.YWheadheight,
      YW_left_height2: app.globalData.YWneckheight,
      YW_right_height2: app.globalData.CWheadheight,
      neck_height2: app.globalData.CWneckheight,
      currentMode2: app.globalData.currentMode,
      snoreTurnFlag2: app.globalData.snoreTurnFlag,
      simulateflag2:app.globalData.simulateflag, 
    })
  },

  updatedata() {
    const app =getApp();
    if(this.data.currentMode2 ==1 || this.data.currentMode2 ==2){
    this.setData({
      CW_head_height2:app.globalData.YWheadheight,
      YW_left_height2: app.globalData.YWneckheight,
      YW_right_height2: app.globalData.CWheadheight,
      neck_height2: app.globalData.CWneckheight,
/*    currentMode2: app.globalData.currentMode,
      snoreTurnFlag2: app.globalData.snoreTurnFlag,
      simulateflag2:app.globalData.simulateflag, 
      it:1 */
    })
  }
  },

  onenet_set_device_property(event) {
    const param_name = event.currentTarget.dataset.param; // 获取自定义数据
    // 针对滑块组件获取正确的值
    const value = typeof event.detail.value === 'string' 
  ? parseFloat(event.detail.value) 
  : event.detail.value;
    const { api_base_url, product_id, device_name, auth_info } = this.config;
    if(param_name=="height0_adjustment"){
    this.setData({
      CW_head_height2:value
    })
  } 
    if(param_name=="height1_adjustment"){
      this.setData({
        YW_left_height2:value
      })
    }
    if(param_name=="height2_adjustment"){
      this.setData({
        YW_right_height2:value
      })
    }
    if(param_name=="height3_adjustment"){
      this.setData({
        neck_height2:value
      })
    }
    if(param_name=="snore_turn_flag"){
      this.setData({
        snoreTurnFlag2:value
      })
    }
    console.log(`准备设置属性: ${param_name}, 值: ${value}, 类型: ${typeof value}`);

    // 显示加载提示框
      /* wx.showLoading({
      title: '正在执行...',
      mask: true,
    });  */ 
    
    wx.request({
      url: `${api_base_url}/thingmodel/set-device-property`,
      method: 'POST',
      header: {
        "Authorization": auth_info,
      },
      data: {
        "product_id": product_id,
        "device_name": device_name, 
        "params": {
          [param_name]: value // 直接使用滑块的值
        }
      },
        /* timeout: 20000, // 设置超时时间为10秒
      success: (res) => {
        console.log('OneNET属性设置请求成功，返回数据', res.data);
        
        // 隐藏加载提示框
         wx.hideLoading(); 

        // 更全面的响应检查
         if (res.statusCode === 200 && 
            res.data && 
            res.data.code === 0 && 
            res.data.data && 
            res.data.data.code === 200) {
          wx.showToast({
            title: '操作成功',
            icon: 'success',
            duration: 1500
          });
        } else {
          console.error('服务器返回错误:', res.data);
          wx.showToast({
            title: res.data.msg || '操作失败',
            icon: 'none',
            duration: 1500
          });
        } 
       },
      fail: (err) => {
        console.error('OneNET属性设置请求失败，错误信息：', err);
        
        // 隐藏加载提示框
        wx.hideLoading(); 
        
        // 根据错误类型提供更具体的提示
         let errorMsg = '操作失败';
        if (err.errMsg.includes('timeout')) {
          errorMsg = '请求超时，请检查网络连接';
        } else if (err.errMsg.includes('network')) {
          errorMsg = '网络错误，请检查连接';
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 2000
        }); 
      } */  
    });
    wx.showToast({ 
      title: '操作成功', 
      icon: 'success' 
    });
  },

  selectMode(event) {
    const selectedMode = parseInt(event.currentTarget.dataset.mode);
    console.log("当前模式选择：",selectedMode)
    if (isNaN(selectedMode) || selectedMode < 0 || selectedMode > 3) {
      return wx.showToast({ title: '模式选择错误', icon: 'none' });
    }

    // 切换选中状态
    this.setData({ currentMode2: selectedMode });
    
    // 调用OneNET属性设置函数
    this.setDeviceMode(selectedMode);
  },

  // .js 文件
simulatesnore(event) {
  const currentMode = this.data.simulateflag2;
  const newMode = currentMode === 1 ? -1 : 1; // 切换状态：1(激活) <-> -1(未激活)
  const simulateValue = newMode === 1; // 转换为布尔值
  
  console.log("当前模拟止鼾状态：", simulateValue);
  
  // 切换选中状态
  this.setData({ 
    simulateflag2: newMode,
    simulateValue:simulateValue});
  
  // 显示加载中
  // wx.showLoading({ title: '设置中...', mask: true });
  
  // 调用OneNET属性设置函数
  this.setsimulatesnore("simulatesnore", simulateValue);
  if(this.data.simulateflag2===1){
    this.data.sendtimer = setInterval(() => {
      const { start_time, end_time } = this.get_timestamps();
      this.config.start_time = start_time;
      this.config.end_time = end_time;
      this.senddata(); // 定期发送模拟数据
    }, 5000);
    console.log('已启动数据发送定时器');
  } else {
    // 关闭模拟：停止定时器
    if (this.data.sendtimer) {
      clearInterval(this.data.sendtimer);
      this.data.sendtimer = null;
      console.log('已停止数据发送定时器');
    }
  }
},

senddata(){
   const { api_base_url, product_id, device_name, auth_info } = this.config;
   const heartRate = Math.floor(Math.random() * 11) + 70; // 50-60之间
   const respiratoryRate = Math.floor(Math.random() * 11) + 10; // 10-20之间
  wx.request({
    url: `${api_base_url}/thingmodel/set-device-property`,
    method: 'POST',
    header: {
      'Authorization': auth_info,
    },
    data: {
      "product_id": product_id,
      "device_name": device_name,
      "params": {
        "HeartRate":heartRate,
        "Snore": true,
        "RespiratoryRate":respiratoryRate
      }
    },
    success: () => {
      console.log("模拟数据")
    },
    fail: (err) => {
      // wx.hideLoading();
      wx.showToast({ 
        title: '网络请求失败', 
        icon: 'none', 
        duration: 1500 
      });
    }
  }); 
}, 

setsimulatesnore(propertyName, propertyValue) {
  const { api_base_url, product_id, device_name, auth_info } = this.config;
  wx.showToast({ 
    title: propertyValue ? '开启模拟':'关闭模拟', 
    icon: 'success' 
  });
  wx.request({
    url: `${api_base_url}/thingmodel/set-device-property`,
    method: 'POST',
    header: {
      'Authorization': auth_info,
    },
    data: {
      "product_id": product_id,
      "device_name": device_name,
      "params": {
        [propertyName]: propertyValue // 设置指定属性名和对应值
      }
    },
     success: () => {
     console.log("设置模拟止鼾")
      // wx.hidmo'ing();
      /* if (res.data.code === 0 && res.data.data.code === 200) {
        wx.showToast({ 
          title: `${propertyValue ? '开启' : '关闭'}模拟止鼾成功`, 
          icon: 'success', 
          duration: 1500 
        });
      } else {
        wx.showToast({ 
          title: `设置失败：${res.data.msg || '未知错误'}`, 
          icon: 'none' 
        });
        // 失败时恢复原状态
        this.setData({ currentMode: this.data.currentMode === 1 ? -1 : 1 });
      } */
    },
    fail: (err) => {
      // wx.hideLoading();
      wx.showToast({ 
        title: '网络请求失败', 
        icon: 'none', 
        duration: 1500 
      });
      // 失败时恢复原状态
      this.setData({ currentMode: this.data.currentMode === 1 ? -1 : 1 });
    }
  }); 
},

  /**
   * 设置设备模式（调用OneNET API）
   */
  setDeviceMode(mode) {
    const { api_base_url, product_id, device_name, auth_info } = this.config;
    
    /* wx.showLoading({ title: '正在设置模式...', mask: true }); */
    
    wx.request({
      url: `${api_base_url}/thingmodel/set-device-property`,
      method: 'POST',
      header: {
        'Authorization': auth_info,
      },
      data: {
        "product_id": product_id,
        "device_name": device_name,
        "params": {
          current_mode: mode // 设置属性名为"current_mode"，值为0/1/2/3
        }
      },
      /* success: (res) => {
        wx.hideLoading();
        if (res.data.code === 0 && res.data.data.code === 200) {
          wx.showToast({ 
            title: `模式设置成功（${mode}）`, 
            icon: 'success', 
            duration: 1500 
          });
          // 这里可以添加设备响应成功后的逻辑（如下发指令）
        } else {
          wx.showToast({ 
            title: `设置失败：${res.data.msg || '未知错误'}`, 
            icon: 'none' 
          });
          // 失败时恢复未选择状态（可选）
          this.setData({ currentMode: -1 });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ 
          title: '网络请求失败', 
          icon: 'none', 
          duration: 1500 
        });
        // 失败时恢复未选择状态（可选）
        this.setData({ currentMode: -1 });
      }*/
    }); 
    wx.showToast({ 
      title: '操作成功', 
      icon: 'success' 
    });
   },

// 偏好设置加减控制（修复参数名：使用action而非op）
changePreference(e) {
  console.log('点击按钮')
  const type = e.currentTarget.dataset.type;
  console.log(type,'参数')
  const action = e.currentTarget.dataset.action; // 与WXML中的data-action一致
  console.log(action,'动作')
  const currentValue = this.data[type];
  
  const newValue = action === 'plus' 
    ? (currentValue < 7 ? currentValue + 1 : 7)
    : (currentValue > 1 ? currentValue - 1 : 1);
  
  this.setData({ [type]: newValue });
},

// 加载保存的偏好设置
async loadPreferences() {
  try {
    const db = wx.cloud.database();
    const res = await db.collection('sleep_preferences').doc('user_preference').get();
    if (res.data) {
      this.setData({
        ywLeftHeight: res.data.ywLeftHeight,
        ywRightHeight: res.data.ywRightHeight,
        ywNeckHeight: res.data.ywNeckHeight,
        cwHeadHeight: res.data.cwHeadHeight,
        cwNeckHeight: res.data.cwNeckHeight
      });
    }
  } catch (err) {
    console.error('加载偏好设置失败', err);
    // 首次使用无数据时初始化
    this.savePreferences();
  }
},

// 保存偏好设置到云数据库
async savePreferences() {
  const { ywLeftHeight, ywRightHeight, ywNeckHeight, cwHeadHeight, cwNeckHeight } = this.data;
  const db = wx.cloud.database();
  
  try {
    // 先检查是否已有偏好数据
    const countResult = await db.collection('sleep_preferences')
      .where({ _id: 'user_preference' })
      .count();
    
    if (countResult.total > 0) {
      await db.collection('sleep_preferences').doc('user_preference').update({
        data: {
          ywLeftHeight,
          ywRightHeight,
          ywNeckHeight,
          cwHeadHeight,
          cwNeckHeight,
          updatedAt: db.serverDate()
        }
      });
      console.log('偏好数据已更新');
    } else {
      await db.collection('sleep_preferences').add({
        data: {
          _id: 'user_preference',
          ywLeftHeight,
          ywRightHeight,
          ywNeckHeight,
          cwHeadHeight,
          cwNeckHeight,
          createdAt: db.serverDate()
        }
      });
      console.log('偏好数据已创建');
    }
    
    wx.showToast({ title: '偏好设置已保存', icon: 'success' });
  } catch (err) {
    console.error('保存偏好设置失败', err);
    wx.showToast({ title: '保存失败', icon: 'none' });
  }
},

checkSleepPose0() {
  this.setData({
    button:1
  })
  this.checkSleepPose();
  },

// 检查当前睡姿并执行偏好高度
checkSleepPose() {
  const app = getApp();
  const currentSleepPose = app.globalData.sleeppose; // 确保全局变量存在
  this.setData({
    currentSleepPose:currentSleepPose
  })
  console.log(this.data.currentMode2)
  // 仅在正常模式下生效
   if (this.data.currentMode2 == 1 || this.data.currentMode2 == 2 || this.data.currentMode2 == 3) {
    return;
  } 
  console.log('shuizi',this.data.currentSleepPose)
  // 睡姿未变化或未检测到时不执行
  if ((this.data.currentSleepPose === this.data.lastSleepPose || this.data.currentSleepPose === -1) && this.data.button == 0) return;

  // 执行对应睡姿的偏好设置
  if (this.data.currentSleepPose === 1) {
    this.sendSleepPreference('yw');
  } else if (this.data.currentSleepPose === 2) {
    this.sendSleepPreference('cw');
  }
  if(this.data.button == 1){
    this.setData({
      button:0
    })
  }
},

// 发送睡姿偏好命令
sendSleepPreference(type) {
  const { api_base_url, product_id, device_name, auth_info } = this.config;
  let params = {};
  console.log('发送睡姿偏好设置命令')
  // 组装仰睡参数
  if (type === 'yw') {
    this.setData({
      YW_left_height2: this.data.ywLeftHeight,
      YW_right_height2: this.data.ywRightHeight,
      neck_height2: this.data.ywNeckHeight
    })
    params = {
      height1_adjustment: this.data.ywLeftHeight,
      height2_adjustment: this.data.ywRightHeight,
      height3_adjustment: this.data.ywNeckHeight
    };
    wx.showToast({ title: '仰睡偏好设置已发送', icon: 'success' });
  }
  // 组装侧睡参数
  else if (type === 'cw') {
    this.setData({
      CW_head_height2: this.data.cwHeadHeight,
      neck_height2: this.data.cwNeckHeight
    })
    params = {
      height0_adjustment: this.data.cwHeadHeight,
      height3_adjustment: this.data.cwNeckHeight
    };
    wx.showToast({ title: '侧睡偏好设置已发送', icon: 'success' });
  }
// 更新状态标记（避免重复发送）
  this.setData({
    lastSleepPose: type === 'yw' ? 1 : 2,
    isPreferenceSent: true
  })

  // 发送命令到设备
  wx.request({
    url: `${api_base_url}/thingmodel/set-device-property`,
    method: 'POST',
    header: { 'Authorization': auth_info },
    data: {
      product_id,
      device_name,
      params
    },
    success: (res) => {
      console.log(`${type === 'yw' ? '仰睡' : '侧睡'}偏好已下发`);

    },
    fail: (err) => {
      console.error('发送偏好命令失败', err);
    }
  });
}

});