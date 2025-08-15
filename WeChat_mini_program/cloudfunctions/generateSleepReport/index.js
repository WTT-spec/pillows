// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-1gi4lcv5fab1f2f9' })
const db = cloud.database()
const _ = db.command

/**
 * 睡眠报告生成云函数
 * 支持三种调用方式：
 * 1. 自动触发（用户起床时）：{ sleepStart: "2025-05-24T23:00:00", deviceId: "xxx" }
 * 2. 指定日期生成：{ date: "2025-05-24", force: true }
 * 3. 补全历史报告：{ repair: true, days: 7 }
 */
exports.main = async (event, context) => {
  try {
    let reportDate, sleepStart, sleepEnd, deviceId;
    
    // 1. 解析调用参数，确定报告日期和数据范围
    if (event.sleepStart) {
      // 场景1：用户起床时触发，根据入睡时间和当前时间生成报告
      sleepStart = new Date(event.sleepStart);
      sleepEnd = new Date();
      reportDate = sleepStart.toISOString().split('T')[0];
      deviceId = event.deviceId || 'default';
    } else if (event.date) {
      // 场景2：指定日期生成报告（如手动触发）
      reportDate = event.date;
      sleepStart = new Date(`${reportDate}T00:00:00`);
      sleepEnd = new Date(`${reportDate}T23:59:59`);
      deviceId = event.deviceId || 'default';
    } else if (event.repair) {
      // 场景3：补全历史报告
      return await repairHistoricalReports(event.days || 7);
    } else {
      return { code: 4001, message: '参数错误：请提供sleepStart、date或repair参数' };
    }
    
    // 2. 检查报告是否已存在（除非强制生成）
    if (!event.force) {
      const existingReport = await db.collection('sleepReports')
        .where({ date: reportDate, deviceId })
        .get();
      
      if (existingReport.data.length > 0) {
        return { code: 4002, message: `报告${reportDate}已存在`, report: existingReport.data[0] };
      }
    }
    
    // 3. 获取睡眠期间的设备数据
    const deviceData = await fetchSleepData(sleepStart, sleepEnd, deviceId);
    if (deviceData.length === 0) {
      return { code: 4003, message: `未找到${reportDate}的睡眠数据` };
    }
    
    // 4. 分析睡眠数据
    const analysisResult = analyzeSleepData(deviceData);
    
    // 5. 生成综合评分
    const sleepScore = calculateSleepScore(analysisResult);
    
    // 6. 构建完整报告
    const sleepReport = {
      date: reportDate,
      deviceId,
      createTime: new Date(),
      bedTime: sleepStart.toISOString().split('T')[1].slice(0, 5),
      wakeTime: sleepEnd.toISOString().split('T')[1].slice(0, 5),
      totalSleepTime: analysisResult.totalSleepTime,
      sleepEfficiency: analysisResult.sleepEfficiency,
      deepSleepTime: analysisResult.deepSleepTime,
      lightSleepTime: analysisResult.lightSleepTime,
      remSleepTime: analysisResult.remSleepTime,
      awakeTime: analysisResult.awakeTime,
      heartRateAvg: analysisResult.heartRateAvg,
      heartRateMin: analysisResult.heartRateMin,
      heartRateMax: analysisResult.heartRateMax,
      breathRateAvg: analysisResult.breathRateAvg,
      breathRateMin: analysisResult.breathRateMin,
      breathRateMax: analysisResult.breathRateMax,
      sleepQualityScore: sleepScore,
      sleepQualityLabel: getSleepQualityLabel(sleepScore),
      sleepStages: analysisResult.sleepStages,
      heartRateTrend: analysisResult.heartRateTrend,
      breathRateTrend: analysisResult.breathRateTrend,
      recommendations: generateRecommendations(analysisResult, sleepScore)
    };
    
    // 7. 保存报告到数据库
    await db.collection('sleepReports').add({ data: sleepReport });
    
    // 8. 返回结果
    return { code: 0, message: `生成${reportDate}睡眠报告成功`, report: sleepReport };
  } catch (error) {
    console.error('生成睡眠报告失败:', error);
    return { code: 5000, message: '生成睡眠报告失败', error: error.message };
  }
};

/**
 * 获取睡眠期间的设备数据
 */
async function fetchSleepData(startTime, endTime, deviceId) {
  const result = await db.collection('deviceData')
    .where({
      deviceId,
      timestamp: _.gte(startTime).and(_.lte(endTime))
    })
    .orderBy('timestamp', 'asc')
    .get();
  
  return result.data.map(item => ({
    timestamp: item.timestamp,
    heartRate: item.heartRate,
    breathRate: item.breathRate
  }));
}

/**
 * 分析睡眠数据，识别睡眠阶段
 */
function analyzeSleepData(data) {
  if (!data || data.length === 0) {
    return { error: 'No data to analyze' };
  }
  
  // 按时间排序（确保数据有序）
  data.sort((a, b) => a.timestamp - b.timestamp);
  
  // 提取心率和呼吸率数据
  const heartRates = data.map(item => item.heartRate);
  const breathRates = data.map(item => item.breathRate);
  const timestamps = data.map(item => item.timestamp);
  
  // 计算基础统计数据
  const heartRateStats = calculateStats(heartRates);
  const breathRateStats = calculateStats(breathRates);
  
  // 识别睡眠阶段（基于心率和呼吸率）
  const sleepStages = classifySleepStages(heartRates, breathRates);
  
  // 计算各阶段时间
  const stageDurations = calculateStageDurations(sleepStages, timestamps);
  
  // 计算睡眠效率
  const totalTime = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60); // 总分钟数
  const awakeTime = stageDurations.awake;
  const sleepEfficiency = ((totalTime - awakeTime) / totalTime * 100).toFixed(1);
  
  // 构建心率和呼吸率趋势数据（每5分钟取一个点）
  const heartRateTrend = calculateTrend(heartRates, timestamps, 5 * 60 * 1000);
  const breathRateTrend = calculateTrend(breathRates, timestamps, 5 * 60 * 1000);
  
  return {
    totalSleepTime: (totalTime - awakeTime).toFixed(1), // 总睡眠时间（分钟）
    sleepEfficiency,
    deepSleepTime: stageDurations.deep,
    lightSleepTime: stageDurations.light,
    remSleepTime: stageDurations.rem,
    awakeTime: stageDurations.awake,
    heartRateAvg: heartRateStats.avg.toFixed(1),
    heartRateMin: heartRateStats.min,
    heartRateMax: heartRateStats.max,
    breathRateAvg: breathRateStats.avg.toFixed(1),
    breathRateMin: breathRateStats.min,
    breathRateMax: breathRateStats.max,
    sleepStages,
    heartRateTrend,
    breathRateTrend
  };
}

/**
 * 计算基本统计数据（平均值、最小值、最大值）
 */
function calculateStats(values) {
  const sum = values.reduce((acc, val) => acc + val, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { avg, min, max };
}

/**
 * 基于心率和呼吸率识别睡眠阶段
 * 0: 清醒, 1: 浅睡, 2: 深睡, 3: REM
 */
function classifySleepStages(heartRates, breathRates) {
  const stages = [];
  
  // 确定基准值（取前10%的数据作为参考）
  const baseIndex = Math.max(1, Math.floor(heartRates.length * 0.1));
  const heartRateBase = heartRates.slice(0, baseIndex).reduce((a, b) => a + b, 0) / baseIndex;
  const breathRateBase = breathRates.slice(0, baseIndex).reduce((a, b) => a + b, 0) / baseIndex;
  
  for (let i = 0; i < heartRates.length; i++) {
    const hr = heartRates[i];
    const br = breathRates[i];
    
    // 算法逻辑（简化版）：基于心率和呼吸率相对于基准值的变化来判断
    if (hr > heartRateBase * 1.1 || br > breathRateBase * 1.1) {
      stages.push(0); // 清醒
    } else if (hr < heartRateBase * 0.85 && br < breathRateBase * 0.85) {
      stages.push(2); // 深睡
    } else if (hr > heartRateBase * 0.95 && br > breathRateBase * 0.95) {
      stages.push(3); // REM
    } else {
      stages.push(1); // 浅睡
    }
  }
  
  // 平滑处理（减少阶段频繁切换）
  return smoothSleepStages(stages);
}

/**
 * 平滑睡眠阶段（减少频繁切换）
 */
function smoothSleepStages(stages) {
  const windowSize = 3; // 滑动窗口大小
  const smoothedStages = [...stages];
  
  for (let i = windowSize; i < stages.length - windowSize; i++) {
    const window = stages.slice(i - windowSize, i + windowSize + 1);
    const counts = [0, 0, 0, 0]; // 对应阶段0-3的计数
    
    window.forEach(stage => {
      counts[stage]++;
    });
    
    // 找出出现次数最多的阶段
    let maxCount = 0;
    let mostFrequentStage = stages[i];
    
    counts.forEach((count, stage) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentStage = stage;
      }
    });
    
    smoothedStages[i] = mostFrequentStage;
  }
  
  return smoothedStages;
}

/**
 * 计算各睡眠阶段的持续时间（分钟）
 */
function calculateStageDurations(stages, timestamps) {
  const durations = { awake: 0, light: 0, deep: 0, rem: 0 };
  let currentStage = stages[0];
  let startTime = timestamps[0];
  
  for (let i = 1; i < stages.length; i++) {
    if (stages[i] !== currentStage) {
      const endTime = timestamps[i];
      const duration = (endTime - startTime) / (1000 * 60); // 转换为分钟
      
      switch (currentStage) {
        case 0: durations.awake += duration; break;
        case 1: durations.light += duration; break;
        case 2: durations.deep += duration; break;
        case 3: durations.rem += duration; break;
      }
      
      currentStage = stages[i];
      startTime = endTime;
    }
  }
  
  // 处理最后一个阶段
  const endTime = timestamps[timestamps.length - 1];
  const duration = (endTime - startTime) / (1000 * 60);
  
  switch (currentStage) {
    case 0: durations.awake += duration; break;
    case 1: durations.light += duration; break;
    case 2: durations.deep += duration; break;
    case 3: durations.rem += duration; break;
  }
  
  return {
    awake: durations.awake.toFixed(1),
    light: durations.light.toFixed(1),
    deep: durations.deep.toFixed(1),
    rem: durations.rem.toFixed(1)
  };
}

/**
 * 计算趋势数据（按指定时间间隔取平均值）
 */
function calculateTrend(values, timestamps, interval) {
  if (values.length === 0) return [];
  
  const trend = [];
  let currentGroup = [];
  let groupStartTime = timestamps[0];
  
  for (let i = 0; i < values.length; i++) {
    if (timestamps[i] - groupStartTime > interval) {
      if (currentGroup.length > 0) {
        const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
        trend.push({
          timestamp: groupStartTime + interval / 2,
          value: avg.toFixed(1)
        });
      }
      
      currentGroup = [values[i]];
      groupStartTime = timestamps[i];
    } else {
      currentGroup.push(values[i]);
    }
  }
  
  // 处理最后一组
  if (currentGroup.length > 0) {
    const avg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
    trend.push({
      timestamp: groupStartTime + interval / 2,
      value: avg.toFixed(1)
    });
  }
  
  return trend;
}

/**
 * 计算综合睡眠评分
 */
function calculateSleepScore(analysis) {
  // 基础评分（0-100分）
  let score = 70; // 基准分
  
  // 睡眠时间（理想7-9小时）
  const sleepTime = parseFloat(analysis.totalSleepTime) / 60;
  if (sleepTime >= 7 && sleepTime <= 9) {
    score += 15;
  } else if (sleepTime >= 6 && sleepTime < 7) {
    score += 10;
  } else if (sleepTime >= 5 && sleepTime < 6) {
    score += 5;
  } else if (sleepTime >= 9.5) {
    score -= 5;
  } else {
    score -= 10;
  }
  
  // 睡眠效率（理想>85%）
  const efficiency = parseFloat(analysis.sleepEfficiency);
  if (efficiency >= 90) {
    score += 10;
  } else if (efficiency >= 85) {
    score += 5;
  } else if (efficiency < 75) {
    score -= 10;
  }
  
  // 深睡比例（理想20-25%）
  const deepSleepTime = parseFloat(analysis.deepSleepTime);
  const totalSleepTime = parseFloat(analysis.totalSleepTime);
  const deepPercentage = (deepSleepTime / totalSleepTime) * 100;
  
  if (deepPercentage >= 18 && deepPercentage <= 25) {
    score += 10;
  } else if (deepPercentage >= 15 && deepPercentage < 18) {
    score += 5;
  } else if (deepPercentage < 12) {
    score -= 10;
  }
  
  // REM比例（理想20-25%）
  const remSleepTime = parseFloat(analysis.remSleepTime);
  const remPercentage = (remSleepTime / totalSleepTime) * 100;
  
  if (remPercentage >= 18 && remPercentage <= 25) {
    score += 10;
  } else if (remPercentage >= 15 && remPercentage < 18) {
    score += 5;
  } else if (remPercentage < 12) {
    score -= 5;
  }
  
  // 心率稳定性（波动越小越好）
  const heartRateVariability = (parseFloat(analysis.heartRateMax) - parseFloat(analysis.heartRateMin)) / parseFloat(analysis.heartRateAvg);
  if (heartRateVariability < 0.25) {
    score += 5;
  } else if (heartRateVariability > 0.4) {
    score -= 5;
  }
  
  // 确保分数在0-100之间
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 获取睡眠质量标签
 */
function getSleepQualityLabel(score) {
  if (score >= 90) return '极佳';
  if (score >= 80) return '良好';
  if (score >= 65) return '一般';
  if (score >= 50) return '较差';
  return '很差';
}

/**
 * 生成睡眠建议
 */
function generateRecommendations(analysis, score) {
  const recommendations = [];
  
  // 总睡眠时间建议
  const sleepTime = parseFloat(analysis.totalSleepTime) / 60;
  if (sleepTime < 6.5) {
    recommendations.push('您的睡眠时间较短，建议增加1-2小时睡眠时间，保证充足休息');
  } else if (sleepTime > 9) {
    recommendations.push('您的睡眠时间较长，可能会导致白天困倦，建议调整至7-9小时');
  }
  
  // 睡眠效率建议
  const efficiency = parseFloat(analysis.sleepEfficiency);
  if (efficiency < 85) {
    recommendations.push('您的睡眠效率偏低，建议睡前避免使用电子设备，保持卧室黑暗安静');
  }
  
  // 深睡比例建议
  const deepSleepTime = parseFloat(analysis.deepSleepTime);
  const totalSleepTime = parseFloat(analysis.totalSleepTime);
  const deepPercentage = (deepSleepTime / totalSleepTime) * 100;
  
  if (deepPercentage < 15) {
    recommendations.push('您的深睡眠时间较短，建议增加日间轻度运动，避免晚餐过饱');
  }
  
  // REM睡眠建议
  const remSleepTime = parseFloat(analysis.remSleepTime);
  const remPercentage = (remSleepTime / totalSleepTime) * 100;
  
  if (remPercentage < 15) {
    recommendations.push('您的REM睡眠时间不足，建议保持规律作息时间，避免熬夜');
  }
  
  // 心率/呼吸率建议
  const heartRateAvg = parseFloat(analysis.heartRateAvg);
  if (heartRateAvg > 75) {
    recommendations.push('您的平均心率偏高，建议减少咖啡因摄入，睡前尝试放松练习');
  }
  
  // 综合评分建议
  if (score < 60) {
    recommendations.push('您的整体睡眠质量较差，建议记录睡眠日志，必要时咨询医生');
  } else if (score < 75) {
    recommendations.push('您的睡眠质量一般，可尝试调整睡前习惯，如泡脚、听轻音乐');
  } else if (score >= 90) {
    recommendations.push('您的睡眠质量极佳，继续保持良好的睡眠习惯！');
  }
  
  return recommendations;
}

/**
 * 补全历史报告
 */
async function repairHistoricalReports(days = 7) {
  const today = new Date();
  const missingReports = [];
  
  for (let i = 1; i <= days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // 检查报告是否存在
    const existingReport = await db.collection('sleepReports')
      .where({ date: dateStr })
      .get();
    
    if (existingReport.data.length === 0) {
      // 尝试生成该日报告
      try {
        const sleepStart = new Date(`${dateStr}T22:00:00`);
        const sleepEnd = new Date(`${dateStr}T23:59:59`);
        
        const deviceData = await fetchSleepData(sleepStart, sleepEnd, 'default');
        if (deviceData.length > 0) {
          const analysisResult = analyzeSleepData(deviceData);
          const sleepScore = calculateSleepScore(analysisResult);
          
          const sleepReport = {
            date: dateStr,
            deviceId: 'default',
            createTime: new Date(),
            bedTime: '22:00',
            wakeTime: '07:00', // 假设
            // 其他字段...
          };
          
          await db.collection('sleepReports').add({ data: sleepReport });
          missingReports.push({ date: dateStr, status: 'success' });
        } else {
          missingReports.push({ date: dateStr, status: 'no-data' });
        }
      } catch (error) {
        missingReports.push({ date: dateStr, status: 'error', message: error.message });
      }
    }
  }
  
  return { code: 0, message: `检查历史报告完成`, results: missingReports };
}  