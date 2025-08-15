// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 尝试向 deviceData 集合中插入一条测试数据
    const res = await db.collection('deviceData').add({
      data: {
        testField: 'This is a test data',
        timestamp: db.serverDate()
      }
    })
    console.log('插入数据成功，记录 ID:', res._id)
    return {
      code: 0,
      message: '插入数据成功',
      data: res
    }
  } catch (error) {
    console.error('插入数据失败:', error)
    return {
      code: 500,
      message: '插入数据失败',
      error: error.message
    }
  }
}