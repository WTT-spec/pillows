Page({
  data: {
    onenet_data: [], // 用来存储设备属性值的数组
    device_status: [], // 用来存储设备状态信息的数组
    device_status_flag: 0,
    device_status_flag_last:0,
    snore:false,
    cut:1,
    Inbed:false,
    switch1_checked: false, // 气泵开关状态
    switch2_checked: 0,// 仰卧头窝区高度
    switch3_checked: 0,//仰卧颈窝区高度
    switch4_checked: 0,//侧卧头窝区高度
    switch5_checked: 0,//侧卧颈窝区高度
    sleeppose:1,//睡姿判断（1仰睡/2侧睡）
    date: 0,
    runflag:0,
    suggestions:[],
    lastTimestamp: null,
    lastbodymove:false,
    time: 0,
    swiperList:[{id: 1,image: 'https://img1.baidu.com/it/u=3534393333,2421339935&fm=253&fmt=auto&app=138&f=JPEG?w=760&h=452'},
  {id: 2,image: 'https://img0.baidu.com/it/u=1191128215,468152112&fm=253&fmt=auto&app=138&f=PNG?w=860&h=403'}]
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
    // 检查是否已绑定设备
      const deviceInfo = wx.getStorageSync('deviceInfo');
    if (!deviceInfo || !deviceInfo.deviceId) {
      // 未绑定设备，跳转到绑定页面
      wx.reLaunch({
        url: '/miniprogram/pages/bindDevice/bindDevice'
      });
    } 

    const { start_time, end_time } = this.get_timestamps(); // 获取时间戳
    this.config.start_time = start_time;
    this.config.end_time = end_time;
    this.onenet_fetch_device_status(); //先获取设备在线情况
    //this.onenet_fetch_data();   //获取一次设备数据，更新页面
       this.data.timer = setInterval(() => {
       const { start_time, end_time } = this.get_timestamps();
       this.config.start_time = start_time;
       this.config.end_time = end_time;
       this.onenet_fetch_device_status(); // 定期获取设备状态
      //if(this.data.device_status_flag==1){
        if(this.data.device_status_flag==1 || this.data.runflag==1){
          this.setData({
            runflag:1
          })  
       this.onenet_fetch_data()}; //} 定期获取设备数据
    }, 5000); // 推荐每3000毫秒更新一次，根据实际数据刷新情况调整
  },

  get_timestamps() {
    const now = new Date().getTime(); // 当前时间的时间戳
    const one_week_ago = now - 7 * 24 * 60 * 60 * 1000; // 一周前的时间戳
    return {
      start_time: one_week_ago,
      end_time: now
    };
  },

  timestampToTimefull(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  },

  timestampToTime(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  },

  timestampToDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 用于存储上一次获取数据的时间戳
  onenet_fetch_data() {
    const { api_base_url, product_id, device_name, auth_info } = this.config;
    wx.request({
        url: `${api_base_url}/thingmodel/query-device-property?product_id=${product_id}&device_name=${device_name}`,
        method: "GET",
        header: {
            'Authorization': auth_info
        },
        success: (res) => {
            console.log("OneNET数据请求成功，返回数据：", res.data);
            const heartRateItem = res.data.data && res.data.data.find(item => item.identifier === 'HeartRate');
            const respiratoryRateItem = res.data.data && res.data.data.find(item => item.identifier === 'RespiratoryRate');
            const bedStatusItem = res.data.data && res.data.data.find(item => item.identifier === 'BedOff');
            const Inbed = bedStatusItem && bedStatusItem.value === "true" ? false : true; // 修正逻辑
            const snore = res.data.data && res.data.data.find(item => item.identifier === 'Snore');
            const snore_status = snore && snore.value === "true" ? true : false;
            const bodyActive = res.data.data && res.data.data.find(item => item.identifier === 'BodyMotion');
            const currentBody_move = bodyActive && bodyActive.value === "true" ? true : false;
            const inbed = Inbed ? 1: 0;
            const simulate_flag=res.data.data && res.data.data.find(item => item.identifier === 'simulatesnore');
            const simulateflag=simulate_flag && simulate_flag.value === "true" ? 1 : -1;
            if (heartRateItem && respiratoryRateItem) {
                // 将获取到的时间戳字符串转换为数值类型
                const currentTimestamp = parseInt(heartRateItem.time, 10); 
                console.log('当前时间戳:', currentTimestamp);
                console.log('上一次时间戳:', this.data.lastTimestamp);

                // 检查当前时间戳是否和上一次相同
                if (currentTimestamp!== this.data.lastTimestamp) {
                  const app = getApp();  
                  this.setData({
                    lastTimestamp: currentTimestamp,
                    time: this.timestampToTime(heartRateItem.time),
                    Inbed: Inbed,
                    snore:snore_status,
                    date: this.timestampToDate(heartRateItem.time)
                  });
                    console.log(this.data.time);
                    console.log(this.data.date);
              
                    // 处理心率数据
                    console.log('即将添加的心率数据:', heartRateItem.value);
                    app.globalData.heartRate.push(parseInt(heartRateItem.value));
                    console.log('添加后的心率数据数组:', app.globalData.heartRate);

                    // 处理在离床数据
                    app.globalData.inbed=inbed;
                    app.globalData.simulateflag=simulateflag;

                    // 处理呼吸率数据
                    console.log('即将添加的呼吸率数据:', respiratoryRateItem.value);
                    app.globalData.breathRate.push(parseInt(respiratoryRateItem.value));
                    console.log('添加后的呼吸率数据数组:', app.globalData.breathRate);
 
                    //处理四个区气囊高度数据
                    app.globalData.YWheadheight=res.data.data.find(item => item.identifier === 'height0_adjustment').value;
                    app.globalData.YWneckheight=res.data.data.find(item => item.identifier === 'height1_adjustment').value;
                    app.globalData.CWheadheight=res.data.data.find(item => item.identifier === 'height2_adjustment').value;
                    app.globalData.CWneckheight=res.data.data.find(item => item.identifier === 'height3_adjustment').value;

                    //处理模式选择数据
                    const snoreTurn = res.data.data && res.data.data.find(item => item.identifier === 'snore_turn_flag');
                    app.globalData.snoreTurnFlag = snoreTurn && snoreTurn.value === "true" ? true : false;
                    app.globalData.currentMode=res.data.data.find(item => item.identifier === 'current_mode').value;
                    const sleeppose = res.data.data.find(item => item.identifier === 'sleeppose').value;
                    app.globalData.sleeppose= Number(sleeppose);
                    this.setData({
                      sleeppose:app.globalData.sleeppose
                    })

                     //处理打鼾数据
                     if(snore_status){
                      app.globalData.snoreTime += 3;
                    }
                    if(currentBody_move && !this.data.lastbodymove){
                    app.globalData.bodymove += 1;
                    this.setData({
                      lastbodymove: currentBody_move
                    })
                    }

                    // 处理时间数据
                     app.globalData.timeNow.push(this.data.time); 
                    /* if(this.data.device_status_flag===1&&this.data.cut===1){
                       app.globalData.timestart=this.data.time;
                       this.setData({
                         cut:0
                       })
                    }
                    if(this.data.device_status_flag===0&&this.data.device_status_flag_last===1){
                      app.globalData.timeout=this.data.time;
                    } */
                    app.globalData.Date = this.data.date;
                    console.log(app.globalData.Date);

                    if (res.data.code === 0) {
                        this.setData({
                            onenet_data: res.data,/* 
                            switch1_checked: res.data.data.find(item => item.identifier === 'AirPump').value === 'true' ? false : true, */
                            switch2_checked: res.data.data.find(item => item.identifier === 'height0_adjustment').value,
                            switch3_checked: res.data.data.find(item => item.identifier === 'height1_adjustment').value,
                            switch4_checked: res.data.data.find(item => item.identifier === 'height2_adjustment').value,
                            switch5_checked: res.data.data.find(item => item.identifier === 'height3_adjustment').value,
                        });
                    } else {
                        console.log("OneNET请求错误，错误信息：", res.data.msg);
                        wx.showToast({
                            title: res.data.msg || '请求出错',
                            icon: 'none',
                            duration: 2000
                        });
                    }

                    // 调用 line.js 的 processMessage 方法
                    // 通知 line 页面更新数据
            const pages = getCurrentPages();
            for (let i = pages.length - 1; i >= 0; i--) {
              if (pages[i].route === 'miniprogram/pages/line/line') {
                console.log("成功获取到 line.js 页面实例");
                pages[i].processMessage();
                break;
              }
            }
                } else {
                    console.log('获取到重复数据，不进行存储和更新操作');
                    const pages = getCurrentPages();
                    for (let i = pages.length - 1; i >= 0; i--) {
                        if (pages[i].route === 'miniprogram/pages/line/line') {
                            pages[i].updateChartEvenIfDuplicate(); // 调用新方法更新图表
                            break;
                        }
                    }
                }
            } else {
                console.log("未找到HeartRate或RespiratoryRate数据");
            }
        },
        fail: (err) => {
            console.log("OneNET数据请求失败");
            console.error(err);
            wx.showToast({
                title: '请求失败',
                icon: 'none',
                duration: 2000
            });
        }
    });
},

  uploadBatchData() {
    const batchData = this.data.cacheData;
    this.data.cacheData = []; // 清空缓存

    wx.cloud.callFunction({
      name: 'uploadBatchDeviceData', // 新增批量上传云函数
      data: { dataList: batchData },
      success: () => {
        console.log('批量上传成功，共上传', batchData.length, '条数据');
    }
    });
  },

  onenet_fetch_device_status() {
    const { api_base_url, product_id, device_name, auth_info, start_time, end_time, limit } = this.config;
    wx.request({
      url: `${api_base_url}/device/status-history?product_id=${product_id}&device_name=${device_name}&start_time=${start_time}&end_time=${end_time}&limit=${limit}`,
      method: "GET",
      header: {
        'Authorization': auth_info
      },
      success: (res) => {
        const app = getApp();
        const currentStatus = res.data.data.list[0].status;
        this.setData({
          device_status: res.data,
          device_status_flag_last:this.data.device_status_flag,
          device_status_flag:currentStatus// 更新设备状态数据
        });
        console.log(res.data)
        app.globalData.device_status = currentStatus; // 记录上一次状态
      },
      fail: (err) => {
        console.log("设备状态信息请求失败");
        console.error(err); // 处理请求失败的情况
      }
    });
  },

  onenet_set_device_property(event) {
    const param_name = event.currentTarget.dataset.param; // 获取自定义数据
    const is_checked = event.detail.value; // 获取开关状态
    const { api_base_url, product_id, device_name, auth_info } = this.config;
    // 显示加载提示框
    wx.showLoading({
      title: '正在执行...', // 提示文字
      mask: true, // 是否显示透明蒙层，防止触摸穿透
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
          [param_name]: is_checked
        }
      },
      success: (res) => {
        console.log('OneNET属性设置请求成功，返回数据', res.data); // 打印接收到的数据

        // 隐藏加载提示框
        wx.hideLoading();

        // 检查响应是否成功
        if (res.data && res.data.code === 0 && res.data.data && res.data.data.code === 200) {
          // 显示成功提示框
          wx.showToast({
            title: '操作成功', // 提示的文字内容
            icon: 'success', // 图标类型，使用成功图标
            duration: 1500 // 提示框自动隐藏的时间，单位是毫秒
          });
        } else {
          // 显示失败提示框
          wx.showToast({
            title: res.data.msg || '操作失败', // 提示的文字内容，使用服务器返回的msg信息
            icon: 'none', // 不显示图标
            duration: 1500 // 提示框自动隐藏的时间，单位是毫秒
          });
        }
      },
      fail: (err) => {
        console.log('OneNET属性设置请求失败，返回数据：', err); // 打印错误信息
        // 隐藏加载提示框
        wx.hideLoading();
        // 显示失败提示框
        wx.showToast({
          title: '操作失败', // 提示的文字内容
          icon: 'none', // 不显示图标
          duration: 1500 // 提示框自动隐藏的时间，单位是毫秒
        });
      }
    });
  },

  navigateTopillowSet: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/pillowSet/pillowSet'
    });
  },
  navigateToclockSet: function() {
    wx.navigateTo({
      url: '/miniprogram/pages/clockSet/clockSet'
    });
  },

});