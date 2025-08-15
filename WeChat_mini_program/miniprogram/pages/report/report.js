const app = getApp();
const util = require('../../utils/util.js');


Page({
  data: {
    currentDate: '',
    selectedDate: '',
    calendarDates: [],
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    sleepData:{  
      score: 0,
      deepSleep: '0小时0分钟',
      lightSleep: '0小时0分钟',
      remSleep: '0小时0分钟',
      awake: '0小时0分钟',
      sleepTime: '00:00',
      wakeTime: '00:00',
      snoreTime:'0小时0分钟',
      bodymove: 0,
      aveheartData: 0,
      avebreathData:0
    },
    starArray: [0, 0, 0, 0, 0],
    isDataLoaded: false,
    showCalendar: false,
  },

  onLoad: function(options) {
    // 初始化日历
    this.initCalendar();
    this.setData({
      currentDate: this.formatDate(new Date()),
      selectedDate: this.formatDate(new Date()) // 默认显示今天
    });
    // 加载当前日期的睡眠报告
    this.loadSleepReport(this.data.selectedDate);
  },

  // 初始化日历
  initCalendar() {
    const today = new Date();
    const calendarDates = [];
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const formattedDate = this.formatDate(date);
      calendarDates.push({
        date: formattedDate,
        displayDate: date.getDate(),
        dayOfWeek: date.getDay(),
        isToday: i === 0
      });
    }
    
    this.setData({ calendarDates });
  },

  // 日期格式化
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 切换日历显示
  toggleCalendar() {
    this.setData({ showCalendar: !this.data.showCalendar });
  },

  // 选择日期
  selectDate: function(e) {
    const selectedDate = e.currentTarget.dataset.date;
    this.setData({ selectedDate, showCalendar: false });
    // 加载选中日期的睡眠报告
    this.loadSleepReport(selectedDate);
  },

  // 加载睡眠报告
  loadSleepReport: function(dateStr) {
    this.setData({ isDataLoaded: false });
    const db = wx.cloud.database();
    db.collection('report').where({
      DATE: dateStr
    })
    .get({
      success: (res) => {
        // res.data 是包含以上定义的两条记录的数组
        console.log('获取到睡眠报告：',res.data)
      this.processSleepReport(res.data[0])
      },
      fail: (err) => {
        wx.hideLoading();
      console.error('从云数据库获取报告失败:', err);
      wx.showToast({ 
        title: `获取失败：${err.errMsg}`, 
        icon: 'none', 
        duration: 3000 
      });
     }
    })
  },

  // 处理睡眠报告数据
  processSleepReport: function(report) {
    if (!report || report.length === 0) {
      console.warn('睡眠报告数据为空');
      return;
    }
    // 格式化数据
    const formattedData = {
      score: report.sleepScore,
      deepSleep: this.formatDuration(parseFloat(report.sleepData.deepSleep)),
      lightSleep: this.formatDuration(parseFloat(report.sleepData.lightSleep)),
      remSleep: this.formatDuration(parseFloat(report.sleepData.remSleep)),
      awake: this.formatDuration(parseFloat(report.sleepData.awake)),
      snoreTime: this.formatDuration(parseFloat(report.snoreTime)),
      sleepTime: report.sleepData.bedTime,
      wakeTime: report.sleepData.wakeTime,
      bodymove: report.bodymove,
      aveheartData: report.aveheartData,
      avebreathData: report.avebreathData
    };
    
    // 生成星级评分
    const stars = [];
    const fullStars = Math.floor(report.sleepScore / 20);
    const halfStar = report.sleepScore % 20 >= 10;
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) stars.push('full');
      else if (i === fullStars + 1 && halfStar) stars.push('half');
      else stars.push('empty');
    }
    
    this.setData({
      sleepData: formattedData,
      starArray: stars,
      isDataLoaded: true
    });
  },

  // 格式化时长（分钟转小时和分钟）
  formatDuration: function(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}小时${mins}分钟`;
  }
});  