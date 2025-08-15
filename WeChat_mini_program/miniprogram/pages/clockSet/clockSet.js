const app = getApp();
const db = wx.cloud.database();
const alarmsCollection = db.collection('alarms');

Page({
  data: {
    alarms: [], // 闹钟列表
    // 时间选择器相关
    showPicker: false,
    hours: Array.from({length: 24}, (_, i) => i),
    minutes: Array.from({length: 60}, (_, i) => i),
    timeValue: [0, 0],
    isEditing: false,
    editingId: null,
    // 震动控制
    vibrateStatus: false,
    // 定时器
    checkTimer: null,
    // 核心：记录【每个闹钟ID】的最近触发时间（仅针对已响应的闹钟）
    triggeredAlarms: {} // 格式: { "alarmId1": 时间戳, "alarmId2": 时间戳, ... }
  },

  config: {
    auth_info: "version=2022-05-01&res=userid%2F434014&et=1775632414&method=sha1&sign=kHWd9elS%2FlUegV9hulrkcrHqcgs%3D",
    product_id: "vg3Awbo66L",
    device_name: "room00",
    api_base_url: "https://iot-api.heclouds.com",
    start_time: 0,
    end_time: 0,
    limit: 1
  },

  onLoad() {
    // 初始化云环境
    if (!app.globalData.cloudInit) {
      wx.cloud.init({ traceUser: true });
      app.globalData.cloudInit = true;
    }
    this.loadAlarms();
    
    // 每分钟检查一次闹钟
    this.data.checkTimer = setInterval(() => this.checkAlarms(), 1000);
    
    // 每分钟清理过期的冷却记录（只保留1分钟内触发的闹钟）
    setInterval(() => this.cleanupCoolingAlarms(), 60000);
  },

  onUnload() {
    if (this.data.checkTimer) clearInterval(this.data.checkTimer);
  },

  // 加载闹钟数据
  async loadAlarms() {
    try {
      const res = await alarmsCollection.get();
      this.setData({ alarms: res.data });
      this.checkAlarms();
    } catch (err) {
      console.error('加载闹钟失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 显示时间选择器
  showTimePicker(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (id) {
      const alarm = this.data.alarms.find(item => item._id === id);
      if (alarm) {
        const [hours, minutes] = alarm.time.split(':').map(Number);
        this.setData({ isEditing: true, editingId: id, timeValue: [hours, minutes] });
      }
    } else {
      const now = new Date();
      this.setData({ isEditing: false, editingId: null, timeValue: [now.getHours(), now.getMinutes()] });
    }
    this.setData({ showPicker: true });
  },

  hideTimePicker() {
    this.setData({ showPicker: false });
  },

  onTimeChange(e) {
    this.setData({ timeValue: e.detail.value });
  },

  confirmTime() {
    const [hour, minute] = this.data.timeValue;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    this.data.isEditing ? this.updateAlarm(timeStr) : this.addAlarm(timeStr);
    this.setData({ showPicker: false });
  },

  // 添加新闹钟
  async addAlarm(time) {
    try {
      await alarmsCollection.add({
        data: { time, enabled: true, createdAt: db.serverDate() }
      });
      wx.showToast({ title: '添加成功' });
      this.loadAlarms();
    } catch (err) {
      console.error('添加失败', err);
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // 更新闹钟
  async updateAlarm(time) {
    try {
      await alarmsCollection.doc(this.data.editingId).update({ data: { time } });
      wx.showToast({ title: '更新成功' });
      this.loadAlarms();
    } catch (err) {
      console.error('更新失败', err);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 切换闹钟启用状态
  async toggleAlarm(e) {
    const { id } = e.currentTarget.dataset;
    const enabled = e.detail.value;
    try {
      await alarmsCollection.doc(id).update({ data: { enabled } });
      this.loadAlarms();
    } catch (err) {
      console.error('切换失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  editAlarm(e) {
    this.showTimePicker(e);
  },

  // 删除闹钟
  async deleteAlarm(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个闹钟吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await alarmsCollection.doc(id).remove();
            wx.showToast({ title: '删除成功' });
            this.loadAlarms();
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 检查闹钟是否需要触发（核心逻辑）
  checkAlarms() {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentTimestamp = now.getTime();

    // 遍历所有闹钟，仅处理“已启用、时间匹配、且不在冷却期”的闹钟
    this.data.alarms.forEach(alarm => {
      // 条件1：闹钟启用
      // 条件2：时间匹配当前时间
      // 条件3：该闹钟未触发过，或已过冷却期（1分钟）
      if (alarm.enabled && 
          alarm.time === currentTime && 
          !this.isInCooling(alarm._id, currentTimestamp)) {
        
        // 记录该闹钟的触发时间（进入冷却期）
        this.setCooling(alarm._id, currentTimestamp);
        
        // 触发震动
        if (!this.data.vibrateStatus) {
          this.setData({ vibrateStatus: true });
          this.sendVibrateCommand(true);
        }
      }
    });
  },

  // 检查指定闹钟是否在冷却期（仅针对单个闹钟）
  isInCooling(alarmId, currentTimestamp) {
    const lastTriggerTime = this.data.triggeredAlarms[alarmId] || 0;
    // 1分钟内视为冷却期（60*1000毫秒）
    return currentTimestamp - lastTriggerTime < 60 * 1000;
  },

  // 记录指定闹钟的触发时间（进入冷却期）
  setCooling(alarmId, timestamp) {
    const triggeredAlarms = { ...this.data.triggeredAlarms };
    triggeredAlarms[alarmId] = timestamp; // 仅记录当前触发的闹钟ID
    this.setData({ triggeredAlarms });
  },

  // 清理过期的冷却记录（超过1分钟的不再保留）
  cleanupCoolingAlarms() {
    const now = new Date().getTime();
    const triggeredAlarms = { ...this.data.triggeredAlarms };
    
    // 只保留1分钟内触发的闹钟记录
    Object.keys(triggeredAlarms).forEach(alarmId => {
      if (now - triggeredAlarms[alarmId] >= 60 * 1000) {
        delete triggeredAlarms[alarmId]; // 移除过期的冷却记录
      }
    });
    
    this.setData({ triggeredAlarms });
  },

  // 手动切换震动状态
  toggleVibrateStatus() {
    const newStatus = !this.data.vibrateStatus;
    this.setData({ vibrateStatus: newStatus });
    this.sendVibrateCommand(newStatus);
  },

  // 发送震动指令到设备
  async sendVibrateCommand(status) {
    const { api_base_url, product_id, device_name, auth_info } = this.config;
    if (!api_base_url || !product_id || !device_name || !auth_info) {
      return wx.showToast({ title: '配置缺失', icon: 'none' });
    }

    /* wx.showLoading({ title: status ? '开启震动...' : '关闭震动...', mask: true }); */
    try {
      await wx.request({
        url: `${api_base_url}/thingmodel/set-device-property`,
        method: 'POST',
        header: { 'Authorization': auth_info },
        data: {
          product_id,
          device_name,
          params: { clock_on: status }
        }
      });
      wx.hideLoading();
      wx.showToast({ title: status ? '震动已开启' : '震动已关闭', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ vibrateStatus: !status }); // 回滚状态
      console.error('指令发送失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  }
});