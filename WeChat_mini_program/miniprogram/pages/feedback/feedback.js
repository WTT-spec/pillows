Page({
  data: {
    feedbackContent: ''
  },
  onFeedbackInput(e) {
    const feedbackContent = e.detail.value;
    this.setData({
      feedbackContent
    });
  },
  submitFeedback() {
    const feedbackContent = this.data.feedbackContent;
    if (feedbackContent.trim() === '') {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    // 执行提交反馈逻辑，如发送到服务器
    wx.showToast({
      title: '反馈提交成功',
      icon: 'success',
      duration: 2000
    });
    this.setData({
      feedbackContent: ''
    });
  }
});