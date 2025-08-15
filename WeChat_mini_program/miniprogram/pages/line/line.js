import * as echarts from '../../ec-canvas/echarts';
const util = require('../../utils/util.js');

let windowInfo = null;
const app = getApp();

Page({
  data: {
    ec: {
      lazyLoad: true
    },
    heartChart: null,
    breathChart: null,
    breathData: [],
    heartData: [],
    timestamps: [],
    lastUpdateTime: '等待数据...',
    chartInitialized: false,
    maxheartData: 0,
    minheartData: 0,
    aveheartData: 0,
    maxbreathData: 0,
    minbreathData: 0,
    avebreathData: 0,
    snoreTime:0,
    NosnoreTime:0,
    bodymove:0,
    date: 0,
    isSuggestionListExpanded:false,
    isWarningListExpanded: false,
    warningList: [],
    Lastinbed_status:0,
    Nowinbed_status:0,
    index1:0,
    index2:0,
    //饼状图数据
    ecPie: {
      lazyLoad: true
    },
    pieChart: null,
    sleepData: {
      inBedDuration: '0小时0分钟',
      sleepDuration: '0小时0分钟',
      bedTime: '--:--',
      wakeTime: '--:--',
      deepSleep: 0,
      lightSleep: 0,
      remSleep: 0,
      awake: 0
    },
    sleepScore: 100,
    scoreDetails: [],
    suggestions: [],
    isScoreDetailsExpanded: false
  },

  onReady() {
    this.setData({
      warningList: ['睡觉时心率正常范围：女性60-70/分钟，男性50-70次/分钟',
                   '睡觉时呼吸率正常范围：12-20次/分钟']
    })
    
    windowInfo = wx.getWindowInfo();
    
    // 初始化心率图表
    setTimeout(() => {
      this.heartEcComponent = this.selectComponent('#heart-chart');
      if (this.heartEcComponent) {
        this.initHeartChart();
      }
    }, 500);
    
    // 初始化呼吸率图表
    setTimeout(() => {
      this.breathEcComponent = this.selectComponent('#breath-chart');
      if (this.breathEcComponent) {
        this.initBreathChart();
      }
    }, 800);
    
    // 初始化饼图
    setTimeout(() => {
      this.pieEcComponent = this.selectComponent('#pie-chart');
      if (this.pieEcComponent) {
        this.initPieChart();
      }
    }, 1000);

  //初始化打鼾饼图
  setTimeout(() => {
        this.snoreEcComponent = this.selectComponent('#snore-chart');
        if (this.snoreEcComponent) {
          this.initSnoreChart();
        }
      }, 1200);
},
 
  initHeartChart() {
    this.heartEcComponent.init((canvas, width, height) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: 1.2 * height,
        devicePixelRatio: windowInfo.pixelRatio
      });
      this.heartChart = chart;
      chart.setOption(this.getHeartOption());
      return chart;
    });
  },

  initBreathChart() {
    this.breathEcComponent.init((canvas, width, height) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: 1.3 * height,
        devicePixelRatio: windowInfo.pixelRatio
      });
      this.breathChart = chart;
      chart.setOption(this.getBreathOption());
      return chart;
    });
  },

  initPieChart() {
    this.pieEcComponent.init((canvas, width, height) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: windowInfo.pixelRatio
      });
      this.pieChart = chart;
      chart.setOption(this.getPieOption());
      return chart;
    });
  },

  initSnoreChart() {
      this.snoreEcComponent.init((canvas, width, height) => {
        const chart = echarts.init(canvas, null, {
          width: width,
          height: height,
          devicePixelRatio: windowInfo.pixelRatio
        });
        this.snoreChart = chart;
        chart.setOption(this.getSnoreOption());
        return chart;
      });
    },  

  getHeartOption() {
    return {
      tooltip: {
        trigger: 'axis',
        formatter: '时间: {b0}<br>心率: {c0}次/分钟'
      },
      xAxis: {
        type: 'category',
        data: this.data.timestamps,
        axisLabel: { rotate: 60, fontSize: 8 }
      },
      yAxis: { type: 'value', min: 0, max: 100 },
      series: [{
        name: '心率',
        type: 'line',
        data: this.data.heartData,
        itemStyle: { color: '#ff0000' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255,0,0,0.8)' },
            { offset: 1, color: 'rgba(255,0,0,0.1)' }
          ])
        }
      }]
    };
  },

  getBreathOption() {
    return {
      tooltip: {
        trigger: 'axis',
        formatter: '时间: {b0}<br>呼吸率: {c0}次/分钟'
      },
      xAxis: {
        type: 'category',
        data: this.data.timestamps,
        axisLabel: { rotate: 60, fontSize: 8 }
      },
      yAxis: { type: 'value', min: 0, max: 30 }, // 呼吸率范围调整为0-30
      series: [{
        name: '呼吸率',
        type: 'line',
        data: this.data.breathData,
        itemStyle: { color: '#00bfff' }, // 蓝色线条
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0,191,255,0.8)' },
            { offset: 1, color: 'rgba(0,191,255,0.1)' }
          ])
        }
      }]
    };
  },

  getPieOption() {
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c}分钟 ({d}%)'
      },
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        textStyle: {
          color: '#fff' // 图例文字颜色
        },
        data: ['深睡', '浅睡', 'REM', '清醒'],
      },
      series: [
        {
          name: '睡眠阶段',
          type: 'pie',
          radius: ['50%', '70%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
            position: 'center',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '18',
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: [
            { value: this.data.sleepData.deepSleep, name: '深睡', itemStyle: { color: '#5470c6' } },
            { value: this.data.sleepData.lightSleep, name: '浅睡', itemStyle: { color: '#91cc75' } },
            { value: this.data.sleepData.remSleep, name: 'REM', itemStyle: { color: '#fac858' } },
            { value: this.data.sleepData.awake, name: '清醒', itemStyle: { color: '#ee6666' } }
          ]
        }
      ]
    };
  },

  getSnoreOption() {
      return {
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c}分钟 ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          textStyle: {
            color: '#fff' // 图例文字颜色
          },
          data: ['打鼾', '未打鼾'],
        },
        series: [
          {
            name: '打鼾状态',
            type: 'pie',
            radius: ['0%', '70%'],
            avoidLabelOverlap: false,
            label: {
              show: false,
              position: 'center',
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '18',
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: [
              { value: this.data.snoreTime, name: '打鼾', itemStyle: { color: '#5470c6' } },
              { value: this.data.NosnoreTime, name: '未打鼾', itemStyle: { color: '#ee6666' } }
            ]
          }
        ]
      };
    },

  processMessage() {
    try {
      const app = getApp();
      const arrbreath = app.globalData.breathRate.map(Number);
      const arrheart = app.globalData.heartRate.map(Number);
      const snore = app.globalData.snoreTime;
      const bodymoveT = app.globalData.bodymove;
       let arrtime = app.globalData.timeNow;
      
      // 对齐数据长度
       while (arrtime.length < arrbreath.length) {
                arrtime.unshift('');
              }
      while (arrtime.length > arrbreath.length) {
                arrtime.shift();
              } 
        if(this.data.Lastinbed_status === 0 || this.data.Nowinbed_status ===1){
        this.setData({
        Lastinbed_status: this.data.Nowinbed_status,
        Nowinbed_status: app.globalData.inbed
      })
    }
      console.log('获取的呼吸率数据:', arrbreath);
      console.log('获取的心率数据:', arrheart);
      console.log('获取的时间数据:', arrtime);
      if(this.data.Nowinbed_status===1) {
      if(this.data.date==0) {
      this.setData({
          date:app.globalData.Date})}
      this.setData({
        breathData: arrbreath, 
        heartData: arrheart,
        snoreTime: snore/60,
        NosnoreTime: 24*60 - snore/60,  
        bodymove: bodymoveT,
        timestamps: arrtime,
        lastUpdateTime: arrtime[arrtime.length - 1],
        maxheartData: Math.max(...arrheart),
        minheartData: Math.min(...arrheart),
        aveheartData: Math.round(arrheart.reduce((a, b) => a + b) / arrheart.length),
        maxbreathData: Math.max(...arrbreath),
        minbreathData: Math.min(...arrbreath),
        avebreathData: Math.round(arrbreath.reduce((a, b) => a + b) / arrbreath.length),
      }, () => {
        this.updateCharts();
        this.analyzeSleep();
         if(this.data.Lastinbed_status===1 && app.globalData.inbed/* this.data.Nowinbed_status */===0){
          this.uploadreport();
          this.AIsuggession();
          this.setData({
            Lastinbed_status:0
          })
        }
      });
    }} catch (error) {
      console.error('处理数据出错:', error);
    }
  },

  async AIsuggession() {
    try {
      // 初始化云开发
      wx.cloud.init({ env: "cloud1-1gi4lcv5fab1f2f9" });
      // 创建模型实例
      const { deepSleep, lightSleep, remSleep, awake, bedTime, wakeTime } = this.data.sleepData;
      const snoreTime = this.data.snoreTime;
      const bodymove = this.data.bodymove;
      const aveheartData = this.data.aveheartData;
      const avebreathData = this.data.avebreathData;
      // 动态构建提示词
      const prompt = `
        深睡时长：${deepSleep}分钟，
        浅睡时长：${lightSleep}分钟，
        REM时长：${remSleep}分钟，
        清醒时长：${awake}分钟，
        入睡时间：${bedTime}，
        起床时间：${wakeTime}，
        平均心率：${aveheartData}，
        平均呼吸率：${avebreathData}，
        打鼾时长：${snoreTime}分钟，
        体动次数：${bodymove}次。

        这是我昨晚的睡眠数据，请你结合睡眠参数专业参考范围，帮我分析一下我昨晚睡眠质量如何，并给我提一些睡眠建议，其中睡眠建议请用数字序号列出，回复中不要有*符号，避免使用markdown格式。
       `;
        
          // 调用AI接口
          const model = wx.cloud.extend.AI.createModel("deepseek");
          const res = await model.streamText({
            data: {
              model: "deepseek-v3",
              messages: [
                {
                  role: "user",
                  content: prompt.trim() // 去除首尾空格
                }
              ]
            }
          });
          
          // 处理流式响应
          let fullResponse = "";
          for await (const event of res.eventStream) {
            if (event.data === "[DONE]") break;
            try {
              const data = JSON.parse(event.data);
              const text = data?.choices?.[0]?.delta?.content;
              if (text) fullResponse += text;
            } catch (error) {
              console.error("解析失败:", error);
            }
          }
          // 解析建议并更新UI
          const suggestions = this.parseSuggestions(fullResponse);
          this.setData({ suggestions:suggestions });
          console.log('AI分析如下：',this.data.suggestions);
          wx.showToast({ title: '获取AI建议成功' });
        } catch (error) {
          console.error("获取建议失败:", error);
          wx.showToast({ title: "获取建议失败", icon: "none" });
        }
      },
      // 解析建议文本
      parseSuggestions(text) {
        return text
          .split("\n")
          .filter(item => item.trim().match(/^\d+\./))
          .map(item => item.trim());
      },

  analyzeSleep() {
    const app = getApp();
    const heartRates = app.globalData.heartRate;
    const breathRates = app.globalData.breathRate;
    /* const bedTime = app.globalData.timestart,//bedTime
    const wakeTime = app.globalData.timeout, */
    const timestamps = app.globalData.timeNow;
    const deviceStatus = app.globalData.device_status;
  
    if (heartRates.length === 0 || breathRates.length === 0) return;
  
    // 1. 计算睡眠阶段
    const stages = this.classifySleepStages(heartRates, breathRates);
    app.globalData.sleepStages = stages;
  
    // 2. 计算各阶段时长 (每3秒一个数据点)
    const stageCounts = { deep: 0, light: 0, rem: 0, awake: 0 };
    stages.forEach(stage => {
      stageCounts[stage] += 5; // 每个数据点代表5秒
    });
  
    // 转换为分钟
    const deepSleep = Math.round(stageCounts.deep / 60);
    const lightSleep = Math.round(stageCounts.light / 60);
    const remSleep = Math.round(stageCounts.rem / 60);
    const awake = Math.round(stageCounts.awake / 60);
  
    // 3. 计算睡眠时间统计
    const totalSleep = deepSleep + lightSleep + remSleep;
    const totalInBed = totalSleep + awake;
    
    // 4. 判断上下床时间（基于设备状态和生理信号）
    let bedTime = '--:--';
    let wakeTime = '--:--';
     
    // 时间戳数据
     if (timestamps.length > 1) {
      // 默认取第二个和最后一个时间点
      bedTime = timestamps[1];
      wakeTime = timestamps[timestamps.length - 1];
      
      // 如果有设备状态数据（假设1=在线，0=离线）
       /* if (deviceStatus !== undefined) {
        // 查找设备状态变化点
        let firstOnlineIndex = 0;
        let lastOnlineIndex = timestamps.length - 1;
        
        // 如果设备状态是数组（多个时间点的状态）
        if (Array.isArray(deviceStatus)) {
          for (let i = 0; i < deviceStatus.length; i++) {
            if (deviceStatus[i] === 1) {
              firstOnlineIndex = i;
              break;
            } 
          }
           for (let i = deviceStatus.length - 1; i >= 0; i--) {
            if (deviceStatus[i] === 1) {
              lastOnlineIndex = i;
              break;
            }
          }
          bedTime = timestamps[firstOnlineIndex] || bedTime;
          wakeTime = timestamps[lastOnlineIndex] || wakeTime; 
        }
        // 如果是单个状态值
         else if (deviceStatus === 1) {
          // 设备在线，使用默认时间
        } else {
          // 设备离线，可能需要特殊处理
        }  
      }*/
      
      // 5. 结合生理信号修正时间
       /* const { bedTimeIndex, wakeTimeIndex } = this.classifySleepByPhysio(heartRates, breathRates);
      if (bedTimeIndex !== null) {
        bedTime = timestamps[bedTimeIndex] || bedTime;
      }
      if (wakeTimeIndex !== null) {
        wakeTime = timestamps[wakeTimeIndex] || wakeTime;
      }  */
    } 
  
    // 6. 计算睡眠评分
    const { score, details } = this.calculateSleepScore(deepSleep, lightSleep, remSleep, awake);

    this.setData({
      sleepData: {
        inBedDuration: `${Math.floor(totalInBed/60)}小时${totalInBed%60}分钟`,
        sleepDuration: `${Math.floor(totalSleep/60)}小时${totalSleep%60}分钟`,
         bedTime: bedTime,
        wakeTime: wakeTime,
        deepSleep: deepSleep,
        lightSleep: lightSleep,
        remSleep: remSleep,
        awake: awake
      },
      sleepScore: score,
      scoreDetails: details
    }, () => {
      this.updatePieChart();
    });
  },

  uploadreport() {
    wx.cloud.callFunction({
      name: 'uploadBatchDeviceData',
      data: {
        description: "上传报告数据",
        DATE: this.data.date,
        sleepData: this.data.sleepData,
        sleepScore: this.data.sleepScore,
        snoreTime: this.data.snoreTime,
        bodymove: this.data.bodymove,
        aveheartData: this.data.aveheartData,
        avebreathData: this.data.avebreathData
      }
    })
    .then(res => {
      console.log('云函数返回完整结果:', res);
      
      // 检查云函数执行状态
      if (res.result && res.result.status === 'success') {
        console.log('数据上传成功:', res.result);
        wx.showToast({ title: '报告上传成功', icon: 'success' });
      } else {
        const error = res.result || {};
        const errorMsg = error.message || '未知错误';
        const errorDetails = error.error ? 
          `\n${error.error.name}: ${error.error.code}` : '';
        
        console.error('上传失败:', errorMsg, errorDetails);
        
        wx.showModal({
          title: '上传失败',
          content: `${errorMsg}${errorDetails}`,
          showCancel: false
        });
      }
    })
    .catch(err => {
      console.error('云函数调用失败:', err);
      wx.showToast({
        title: '调用失败: ' + err.errMsg,
        icon: 'none'
      });
    });
  },
  
  // 检测设备在线/离线状态切换的时间点
/*  detectDeviceStatusChanges(timestamps, device_status) {
  const changes = {
    onlineStart: null,  // 首次在线时间（上床）
    onlineEnd: null     // 最后离线时间（起床）
  };

  let lastStatus = null;
  for (let i = 0; i < device_status.length; i++) {
    const currentStatus = device_status[i];
    if (currentStatus !== lastStatus) {
      if (currentStatus === 1) {
        changes.onlineStart = timestamps[i]; // 设备上线→上床
      } else {
        changes.onlineEnd = timestamps[i];   // 设备离线→起床
      }
      lastStatus = currentStatus;
    }
  }

  return changes;
}, 

// 根据心率和呼吸率判断睡眠阶段，并返回上下床时间索引
 classifySleepByPhysio(heartRates, breathRates) {
  const baselineHR = this.calculateBaseline(heartRates);
  const baselineBR = this.calculateBaseline(breathRates);
  
  let bedTimeIndex = null;
  let wakeTimeIndex = null;

  for (let i = 0; i < heartRates.length; i++) {
    const isAsleep = heartRates[i] < baselineHR * 0.9 && 
                     breathRates[i] < baselineBR * 0.9;

    // 找到第一个入睡点（上床时间）
    if (isAsleep && bedTimeIndex === null) {
      bedTimeIndex = i;
    }
    // 找到最后一个清醒点（起床时间）
    if (!isAsleep) {
      wakeTimeIndex = i;
    }
  }

  return { bedTimeIndex, wakeTimeIndex };
}, 
 */
  classifySleepStages(heartRates, breathRates) {
    // 获取基础心率 (取前5分钟平均值作为清醒时心率)
    for (let i = 0; i < heartRates.length; i++) {
      if (heartRates[i] !== 0){
        this.setData({
          index1:i
        })
      }}
    const baselineHeartRate = this.calculateBaseline(heartRates.slice(this.data.index1, Math.min(100, heartRates.length)));
    const baselineBreathRate = this.calculateBaseline(breathRates.slice(this.data.index2, Math.min(100, breathRates.length)));
    
    const stages = [];
    
    for (let i = 0; i < heartRates.length; i++) {
      const hr = heartRates[i];
      const br = breathRates[i];
      
      // 1. 判断是否清醒
      if (hr > baselineHeartRate * 0.95 || br > baselineBreathRate * 0.95) {
        stages.push('awake');
        continue;
      }
      
      // 2. 判断深睡 (心率和呼吸率显著降低)
      if (hr < baselineHeartRate * 0.8 && br < baselineBreathRate * 0.8) {
        stages.push('deep');
      } 
      // 3. 判断REM (心率接近清醒但呼吸不规则)
      else if (Math.abs(hr - baselineHeartRate) < baselineHeartRate * 0.1 && 
               this.isIrregularBreath(br, breathRates, i)) {
        stages.push('rem');
      }
      // 4. 其余为浅睡
      else {
        stages.push('light');
      }
    }
    
    return stages;
  },

  calculateBaseline(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  },

  isIrregularBreath(currentBr, breathRates, index) {
    // 检查前后5个数据点的呼吸率变化是否大于20%
    const start = Math.max(0, index - 5);
    const end = Math.min(breathRates.length - 1, index + 5);
    const range = breathRates.slice(start, end + 1);
    const max = Math.max(...range);
    const min = Math.min(...range);
    return (max - min) > (currentBr * 0.2);
  },

  calculateSleepScore(deep, light, rem, awake) {
    let score = 100;
    const details = [];
    
    // 1. 深睡比例评分 (理想30%)
    const total = deep + light + rem;
    const deepPercentage = total > 0 ? (deep / total) * 100 : 0;
    if (deepPercentage < 20) {
      const deduction = Math.round((20 - deepPercentage) * 2);
      score -= deduction;
      details.push(`深睡比例低(仅${deepPercentage.toFixed(1)}%) -${deduction}分`);
    }
    
    // 2. 清醒时间评分
    if (awake > 30) {
      const deduction = Math.min(20, Math.floor(awake / 5));
      score -= deduction;
      details.push(`夜间清醒时间过长(${awake}分钟) -${deduction}分`);
    }
    
    // 3. 睡眠效率评分 (睡眠时间/在床时间)
    const efficiency = total / (total + awake);
    if (efficiency < 0.85) {
      const deduction = Math.round((0.85 - efficiency) * 100);
      score -= deduction;
      details.push(`睡眠效率较低(${(efficiency*100).toFixed(1)}%) -${deduction}分`);
    }
    
    // 4. REM睡眠评分 (理想20-25%)
    const remPercentage = total > 0 ? (rem / total) * 100 : 0;
    if (remPercentage < 15) {
      const deduction = Math.round((15 - remPercentage));
      score -= deduction;
      details.push(`REM睡眠不足(${remPercentage.toFixed(1)}%) -${deduction}分`);
    }

    
    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      details: details.length > 0 ? details : ['睡眠质量良好，无扣分项']
    };
  },

  updateCharts() {
    console.log('进入 safeUpdateChart 方法');
    const { timestamps, breathData, heartData } = this.data;
    if (!this.heartChart ||!this.breathChart ||!this.snoreChart ||!timestamps ||!breathData ||!heartData) return;
    // 计算需要显示标签的索引（第二个和最后一个）
    const showLabelIndices = new Set([
      Math.min(1, timestamps.length - 1),  // 第二个（如果存在）
      timestamps.length - 1                // 最后一个
  ]);

  // 配置坐标轴标签显示逻辑
  const axisLabelConfig = {
      formatter: (value, index) => {
          return showLabelIndices.has(index) ? value : '';
      }
  };

    if (this.heartChart) {
      this.heartChart.setOption({
        xAxis: { 
          data: timestamps,  // 保持完整的时间戳数据
          axisLabel: axisLabelConfig,
          axisTick: {
            show: (value, index) => showLabelIndices.has(index)  // 仅显示选中的刻度线
          } },
        series: [{ data: this.data.heartData }]
      });
    }
    if (this.breathChart) {
      this.breathChart.setOption({
        xAxis: { 
          data: timestamps,  // 保持完整的时间戳数据
          axisLabel: axisLabelConfig,
          axisTick: {
            show: (value, index) => showLabelIndices.has(index)  // 仅显示选中的刻度线
          } },
        series: [{ data: this.data.breathData, }]
      });
    }
    if (this.snoreChart) {
      this.snoreChart.setOption({
        series: [{
          data: [
            { value: this.data.snoreTime, name: '打鼾' },
            { value: this.data.NosnoreTime, name: '未打鼾' }
          ]
        }]
      });
    }
  },
  
  updateChartEvenIfDuplicate() {
        console.log("updateChartEvenIfDuplicate 方法被调用");
        const app = getApp();
        const arrbreath = app.globalData.breathRate.map(Number);
        const arrheart = app.globalData.heartRate.map(Number);
        const snore = app.globalData.snoreTime;
        const bodymoveT = app.globalData.bodymove;
        let arrtime = app.globalData.timeNow;
    
        // 确保时间数据数组长度和心率、呼吸率数据数组长度一致
        while (arrtime.length < arrbreath.length) {
          arrtime.unshift('');
        }
        while (arrtime.length > arrbreath.length) {
          arrtime.shift();
        }
    if(this.data.Lastinbed_status != 1 || this.data.Nowinbed_status != 0){
      this.setData({
      Lastinbed_status: this.data.Nowinbed_status,
      Nowinbed_status:app.globalData.inbed
      }) 
    }
    if(this.data.Lastinbed_status == 1 && this.data.Nowinbed_status == 0){
      this.uploadreport();
      this.AIsuggession();
      this.setData({
        Lastinbed_status:0
      })
    }
       if(this.data.Nowinbed_status) {
        if(this.data.date==0) {
        this.setData({
            date:app.globalData.Date})}
       this.setData({
          breathData: arrbreath, 
          heartData: arrheart,
          timestamps: arrtime,
          snoreTime: Math.round(snore/60),
          NosnoreTime: Math.round(24*60 - snore/60),
          bodymove: bodymoveT,
          lastUpdateTime: arrtime[arrtime.length - 1],
          maxheartData: Math.max(...arrheart),
          minheartData: Math.min(...arrheart),
          aveheartData: Math.round(arrheart.reduce((a, b) => a + b) / arrheart.length),
          maxbreathData: Math.max(...arrbreath),
          minbreathData: Math.min(...arrbreath),
          avebreathData: Math.round(arrbreath.reduce((a, b) => a + b) / arrbreath.length),
        }, () => {
          this.updateCharts();
          this.analyzeSleep();
        });
      }},
  
    updatePieChart() {
      if (this.pieChart) {
        this.pieChart.setOption({
          series: [{
            data: [
              { value: this.data.sleepData.deepSleep, name: '深睡' },
              { value: this.data.sleepData.lightSleep, name: '浅睡' },
              { value: this.data.sleepData.remSleep, name: 'REM' },
              { value: this.data.sleepData.awake, name: '清醒' }
            ]
          }]
        });
      }
    },
  
  toggleScoreDetails() {
    this.setData({
      isScoreDetailsExpanded: !this.data.isScoreDetailsExpanded
    });
  },

  toggleWarningList() {
    this.setData({
      isWarningListExpanded: !this.data.isWarningListExpanded
    });
  },

  toggleSuggestionList() {
    this.setData({
      isSuggestionListExpanded: !this.data.isSuggestionListExpanded
    });
  },

  onUnload() {
    this.heartChart && this.heartChart.dispose();
    this.breathChart && this.breathChart.dispose();
  }
});