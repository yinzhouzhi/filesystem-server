/**
 * 监控器数量管理池
 * 用于管理系统中所有文件和目录监控器数量，防止资源泄漏
 */
const path = require('path');
const logger = require('./logging');
const config = require('../config/defaults');

// 监控器池配置
const MONITOR_POOL = {
  // 监控器集合
  watchers: new Map(),       // 所有活跃的监控器
  pathToId: new Map(),       // 路径到ID的映射
  
  // 监控器限制
  maxWatchers: config.watchPool?.maxWatchers || 200,  // 最大监控器数量
  maxPerPath: config.watchPool?.maxPerPath || 5,      // 每个路径最大监控器数量
  maxPerProcess: config.watchPool?.maxPerProcess || 50, // 每个进程最大监控器数量
  
  // 监控器使用统计
  stats: {
    created: 0,        // 创建的总数
    closed: 0,         // 关闭的总数
    rejected: 0,       // 被拒绝的请求数
    activeCount: 0,    // 当前活跃数量
    processMap: new Map(), // 进程ID到监控数量的映射
  },
  
  // 过期清理
  cleanupInterval: config.watchPool?.cleanupInterval || 3600000, // 默认1小时检查一次
  maxIdleTime: config.watchPool?.maxIdleTime || 7200000,        // 默认最大闲置时间2小时
  cleanupTimer: null,  // 清理定时器引用
};

/**
 * 初始化监控器池
 */
function initMonitorPool() {
  logger.info('初始化文件监控管理池');
  
  // 设置定期清理任务
  MONITOR_POOL.cleanupTimer = setInterval(() => {
    cleanupIdleWatchers();
  }, MONITOR_POOL.cleanupInterval);
  
  // 防止定时器引用导致进程无法退出
  MONITOR_POOL.cleanupTimer.unref();
  
  // 进程退出时清理资源
  process.on('exit', () => {
    logger.info(`进程退出，关闭所有监控器: ${MONITOR_POOL.watchers.size}个`);
    closeAllWatchers();
  });
  
  // 异常退出时也清理资源
  process.on('SIGINT', () => {
    logger.info('接收到SIGINT信号，关闭所有监控器');
    closeAllWatchers();
    process.exit();
  });
  
  process.on('SIGTERM', () => {
    logger.info('接收到SIGTERM信号，关闭所有监控器');
    closeAllWatchers();
    process.exit();
  });
  
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常，关闭所有监控器', { error });
    closeAllWatchers();
    process.exit(1);
  });
}

/**
 * 添加监控器到池中
 * @param {string} targetPath 监控路径
 * @param {object} watcher 监控器实例
 * @param {object} options 监控选项
 * @param {string} type 监控类型 (file|directory)
 * @param {string} processId 请求进程ID
 * @returns {object} 监控器信息对象或null
 */
function addWatcher(targetPath, watcher, options, type, processId = 'main') {
  // 验证参数
  if (!targetPath || !watcher) {
    logger.error('添加监控器失败: 参数无效');
    return null;
  }
  
  // 标准化路径
  targetPath = path.normalize(targetPath);
  
  // 检查是否超过系统总监控数量限制
  if (MONITOR_POOL.watchers.size >= MONITOR_POOL.maxWatchers) {
    logger.warn(`监控器数量已达上限 (${MONITOR_POOL.maxWatchers})，拒绝新监控请求`);
    MONITOR_POOL.stats.rejected++;
    
    // 尝试关闭最早创建的监控器为新监控腾出空间
    removeOldestWatcher();
  }
  
  // 检查当前路径的监控器数量
  let pathWatcherCount = 0;
  if (MONITOR_POOL.pathToId.has(targetPath)) {
    pathWatcherCount = MONITOR_POOL.pathToId.get(targetPath).size;
  }
  
  if (pathWatcherCount >= MONITOR_POOL.maxPerPath) {
    logger.warn(`路径 ${targetPath} 的监控器数量已达上限 (${MONITOR_POOL.maxPerPath})，拒绝新监控请求`);
    MONITOR_POOL.stats.rejected++;
    return null;
  }
  
  // 检查进程的监控器数量
  let processWatcherCount = MONITOR_POOL.stats.processMap.get(processId) || 0;
  if (processWatcherCount >= MONITOR_POOL.maxPerProcess) {
    logger.warn(`进程 ${processId} 的监控器数量已达上限 (${MONITOR_POOL.maxPerProcess})，拒绝新监控请求`);
    MONITOR_POOL.stats.rejected++;
    return null;
  }
  
  // 生成唯一ID
  const watcherId = generateWatcherId();
  
  // 记录监控器信息
  const watcherInfo = {
    id: watcherId,
    path: targetPath,
    instance: watcher,
    options,
    type,
    processId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0
  };
  
  // 添加到集合
  MONITOR_POOL.watchers.set(watcherId, watcherInfo);
  
  // 更新路径到ID的映射
  if (!MONITOR_POOL.pathToId.has(targetPath)) {
    MONITOR_POOL.pathToId.set(targetPath, new Set());
  }
  MONITOR_POOL.pathToId.get(targetPath).add(watcherId);
  
  // 更新进程监控计数
  MONITOR_POOL.stats.processMap.set(processId, processWatcherCount + 1);
  
  // 更新统计信息
  MONITOR_POOL.stats.created++;
  MONITOR_POOL.stats.activeCount = MONITOR_POOL.watchers.size;
  
  logger.info(`监控器已添加: ${targetPath} (${type}), ID: ${watcherId}, 进程: ${processId}`);
  return watcherInfo;
}

/**
 * 从池中移除监控器
 * @param {string} watcherId 监控器ID
 * @returns {boolean} 是否成功移除
 */
function removeWatcher(watcherId) {
  if (!MONITOR_POOL.watchers.has(watcherId)) {
    logger.warn(`尝试移除不存在的监控器: ${watcherId}`);
    return false;
  }
  
  const watcherInfo = MONITOR_POOL.watchers.get(watcherId);
  
  try {
    // 关闭监控器
    if (watcherInfo.instance && typeof watcherInfo.instance.close === 'function') {
      watcherInfo.instance.close();
    }
    
    // 更新路径到ID的映射
    if (MONITOR_POOL.pathToId.has(watcherInfo.path)) {
      MONITOR_POOL.pathToId.get(watcherInfo.path).delete(watcherId);
      if (MONITOR_POOL.pathToId.get(watcherInfo.path).size === 0) {
        MONITOR_POOL.pathToId.delete(watcherInfo.path);
      }
    }
    
    // 更新进程监控计数
    const processId = watcherInfo.processId;
    const processCount = MONITOR_POOL.stats.processMap.get(processId) || 0;
    if (processCount > 1) {
      MONITOR_POOL.stats.processMap.set(processId, processCount - 1);
    } else {
      MONITOR_POOL.stats.processMap.delete(processId);
    }
    
    // 从集合移除
    MONITOR_POOL.watchers.delete(watcherId);
    
    // 更新统计
    MONITOR_POOL.stats.closed++;
    MONITOR_POOL.stats.activeCount = MONITOR_POOL.watchers.size;
    
    logger.info(`监控器已移除: ${watcherInfo.path}, ID: ${watcherId}`);
    return true;
  } catch (error) {
    logger.error(`移除监控器失败: ${watcherId}`, { error });
    return false;
  }
}

/**
 * 根据路径查找监控器
 * @param {string} targetPath 监控路径
 * @param {string} type 监控类型 (file|directory)，可选
 * @returns {Array} 匹配的监控器信息数组
 */
function findWatchersByPath(targetPath, type = null) {
  const results = [];
  
  // 标准化路径
  targetPath = path.normalize(targetPath);
  
  // 检查路径到ID的映射
  if (MONITOR_POOL.pathToId.has(targetPath)) {
    for (const watcherId of MONITOR_POOL.pathToId.get(targetPath)) {
      const watcherInfo = MONITOR_POOL.watchers.get(watcherId);
      
      // 如果指定了类型，则进行过滤
      if (type && watcherInfo.type !== type) {
        continue;
      }
      
      results.push(watcherInfo);
    }
  }
  
  return results;
}

/**
 * 使用监控器（更新最后使用时间）
 * @param {string} watcherId 监控器ID
 */
function useWatcher(watcherId) {
  if (MONITOR_POOL.watchers.has(watcherId)) {
    const watcherInfo = MONITOR_POOL.watchers.get(watcherId);
    watcherInfo.lastUsedAt = Date.now();
    watcherInfo.useCount++;
  }
}

/**
 * 清理长时间未使用的监控器
 */
function cleanupIdleWatchers() {
  const now = Date.now();
  const idleThreshold = now - MONITOR_POOL.maxIdleTime;
  let cleanupCount = 0;
  
  // 找出所有超过闲置时间的监控器
  const idleWatchers = [];
  for (const [watcherId, info] of MONITOR_POOL.watchers.entries()) {
    if (info.lastUsedAt < idleThreshold) {
      idleWatchers.push(watcherId);
    }
  }
  
  // 关闭闲置监控器
  for (const watcherId of idleWatchers) {
    const removed = removeWatcher(watcherId);
    if (removed) {
      cleanupCount++;
    }
  }
  
  if (cleanupCount > 0) {
    logger.info(`定期清理: 已关闭 ${cleanupCount} 个闲置监控器`);
  }
  
  return cleanupCount;
}

/**
 * 移除最早创建的监控器
 */
function removeOldestWatcher() {
  if (MONITOR_POOL.watchers.size === 0) {
    return false;
  }
  
  let oldestTime = Date.now();
  let oldestId = null;
  
  // 查找最早创建的监控器
  for (const [watcherId, info] of MONITOR_POOL.watchers.entries()) {
    if (info.createdAt < oldestTime) {
      oldestTime = info.createdAt;
      oldestId = watcherId;
    }
  }
  
  if (oldestId) {
    const oldestInfo = MONITOR_POOL.watchers.get(oldestId);
    logger.info(`资源回收: 移除最早创建的监控器 (${oldestInfo.path}), 创建时间: ${new Date(oldestTime).toISOString()}`);
    return removeWatcher(oldestId);
  }
  
  return false;
}

/**
 * 关闭所有监控器
 */
function closeAllWatchers() {
  let closedCount = 0;
  
  for (const watcherId of MONITOR_POOL.watchers.keys()) {
    const removed = removeWatcher(watcherId);
    if (removed) {
      closedCount++;
    }
  }
  
  logger.info(`已关闭所有监控器: ${closedCount}个`);
  
  // 重置其他集合和统计
  MONITOR_POOL.pathToId.clear();
  MONITOR_POOL.stats.processMap.clear();
  MONITOR_POOL.stats.activeCount = 0;
  
  // 清除清理定时器
  if (MONITOR_POOL.cleanupTimer) {
    clearInterval(MONITOR_POOL.cleanupTimer);
    MONITOR_POOL.cleanupTimer = null;
  }
  
  return closedCount;
}

/**
 * 生成唯一的监控器ID
 * @returns {string} 监控器ID
 */
function generateWatcherId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `watcher_${timestamp}_${random}`;
}

/**
 * 获取监控器池状态
 * @returns {object} 监控器池状态信息
 */
function getPoolStatus() {
  return {
    activeWatchers: MONITOR_POOL.watchers.size,
    maxWatchers: MONITOR_POOL.maxWatchers,
    maxPerPath: MONITOR_POOL.maxPerPath,
    maxPerProcess: MONITOR_POOL.maxPerProcess,
    stats: {
      created: MONITOR_POOL.stats.created,
      closed: MONITOR_POOL.stats.closed,
      rejected: MONITOR_POOL.stats.rejected,
      activeCount: MONITOR_POOL.stats.activeCount,
      processCount: MONITOR_POOL.stats.processMap.size,
      uniquePathsCount: MONITOR_POOL.pathToId.size
    },
    cleanupSettings: {
      cleanupInterval: MONITOR_POOL.cleanupInterval,
      maxIdleTime: MONITOR_POOL.maxIdleTime
    }
  };
}

/**
 * 设置监控器池配置
 * @param {object} options 配置选项
 */
function setPoolConfig(options) {
  if (!options) return;
  
  // 更新配置
  if (typeof options.maxWatchers === 'number' && options.maxWatchers > 0) {
    MONITOR_POOL.maxWatchers = options.maxWatchers;
  }
  
  if (typeof options.maxPerPath === 'number' && options.maxPerPath > 0) {
    MONITOR_POOL.maxPerPath = options.maxPerPath;
  }
  
  if (typeof options.maxPerProcess === 'number' && options.maxPerProcess > 0) {
    MONITOR_POOL.maxPerProcess = options.maxPerProcess;
  }
  
  if (typeof options.cleanupInterval === 'number' && options.cleanupInterval > 0) {
    // 更新清理间隔
    MONITOR_POOL.cleanupInterval = options.cleanupInterval;
    
    // 重置清理定时器
    if (MONITOR_POOL.cleanupTimer) {
      clearInterval(MONITOR_POOL.cleanupTimer);
      MONITOR_POOL.cleanupTimer = setInterval(() => {
        cleanupIdleWatchers();
      }, MONITOR_POOL.cleanupInterval);
      MONITOR_POOL.cleanupTimer.unref();
    }
  }
  
  if (typeof options.maxIdleTime === 'number' && options.maxIdleTime > 0) {
    MONITOR_POOL.maxIdleTime = options.maxIdleTime;
  }
  
  logger.info('已更新监控器池配置', { newConfig: getPoolStatus() });
}

/**
 * 获取所有监控器
 * @returns {Array} 所有活跃的监控器信息数组
 */
function getAllWatchers() {
  const watchers = [];
  
  for (const [id, watcherInfo] of MONITOR_POOL.watchers.entries()) {
    watchers.push({
      id: id,
      path: watcherInfo.path,
      type: watcherInfo.type,
      instance: watcherInfo.instance,
      processId: watcherInfo.processId,
      createdAt: watcherInfo.createdAt,
      lastUsedAt: watcherInfo.lastUsedAt,
      useCount: watcherInfo.useCount
    });
  }
  
  return watchers;
}

// 导出监控器池模块
module.exports = {
  initMonitorPool,
  addWatcher,
  removeWatcher,
  findWatchersByPath,
  useWatcher,
  cleanupIdleWatchers,
  closeAllWatchers,
  getPoolStatus,
  setPoolConfig,
  getAllWatchers
}; 