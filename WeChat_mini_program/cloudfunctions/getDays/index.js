// onenet15/cloudfunctions/getDays/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-1gi4lcv5fab1f2f9' })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    console.log('开始获取记录条数');
    
    // 执行计数查询
    const countResult = await db.collection('report').count()
    const total = countResult.total
    
    console.log('获取记录条数成功:', total);
    
    return {
      success: true,  // 使用更标准的 success 字段
      data: total,
      message: '获取记录条数成功'
    }
  } catch (error) {
    console.error('获取记录条数失败:', error);
    
    return {
      success: false,
      error: {
        name: error.name,
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      },
      message: '获取记录条数失败'
    }
  }
}