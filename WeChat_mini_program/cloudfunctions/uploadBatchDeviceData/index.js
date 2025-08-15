// cloudfunctions/uploadBatchDeviceData/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-1gi4lcv5fab1f2f9' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  console.log('云函数开始执行，环境:', cloud.DYNAMIC_CURRENT_ENV);
  
  try {
    console.log('接收参数:', JSON.stringify(event, null, 2));
    
    const targetDate = event.DATE;
    const targetOpenid = event.userInfo.openId;
    
    console.log('查询条件 - DATE:', targetDate);
    console.log('查询条件 - openid:', targetOpenid);
    
    // 执行查询
    const queryResult = await db.collection('report')
      .where({
        DATE: targetDate,
        openid: targetOpenid
      })
      .get();
    
    console.log('查询结果 - 记录数量:', queryResult.data.length);
    
    // 详细输出查询到的记录（如果有）
    if (queryResult.data.length > 0) {
      console.log('查询结果 - 首条记录详情:', JSON.stringify({
        _id: queryResult.data[0]._id,
        DATE: queryResult.data[0].DATE,
        openid: queryResult.data[0].openid,
        createdAt: queryResult.data[0].createdAt,
        updateTime: queryResult.data[0].updateTime
      }, null, 2));
    } else {
      console.log('查询结果 - 无匹配记录，准备插入新数据');
    }
    
    let res;
    
    if (queryResult.data.length > 0) {
      // 存在记录，执行更新操作
      const recordId = queryResult.data[0]._id;
      // 构建更新数据
      const updateData = {
        sleepData: event.sleepData,
        sleepScore: event.sleepScore,
        snoreTime: event.snoreTime,
        bodymove: event.bodymove,
        aveheartData: event.aveheartData,
        avebreathData: event.avebreathData,
        updateTime: db.serverDate()
      };
      res = await db.collection('report').doc(recordId).update({
        data: updateData
      });
      console.log('数据库更新成功 - 更新结果:', JSON.stringify(res, null, 2));
      return {
        status: 'success',
        message: '数据更新成功',
        operationType: 'update',
        result: res,
        env: cloud.DYNAMIC_CURRENT_ENV
      };
    } else {
      // 不存在记录，执行添加操作
      const newData = {
        description: "上传报告数据",
        DATE: targetDate,
        sleepData: event.sleepData,
        sleepScore: event.sleepScore,
        snoreTime: event.snoreTime,
        bodymove: event.bodymove,
        aveheartData: event.aveheartData,
        avebreathData: event.avebreathData,
        openid: targetOpenid,
        createdAt: db.serverDate(),  // 添加创建时间
        updateTime: db.serverDate()  // 添加更新时间
      };
      res = await db.collection('report').add({
        data: newData
      });
      console.log('数据库插入成功 - 插入结果:', JSON.stringify(res, null, 2));
      
      return {
        status: 'success',
        message: '数据插入成功',
        operationType: 'add',
        result: res,
        env: cloud.DYNAMIC_CURRENT_ENV
      };
    }
  } catch (err) {
    // 捕获并返回错误信息
    console.error('发生错误:', JSON.stringify(err, null, 2));
    
    return {
      status: 'error',
      message: err.message || '未知错误',
      error: {
        name: err.name,
        code: err.code,
        stack: err.stack
      },
      env: cloud.DYNAMIC_CURRENT_ENV
    };
  }
};