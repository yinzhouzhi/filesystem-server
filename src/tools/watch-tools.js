/**
 * 文件监控工具
 * 用于监控文件或目录变更
 */
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logging');
const pathUtils = require('../utils/path-utils');
const securityUtils = require('../config/security');
const config = require('../config');
const monitorPool = require('../utils/monitor-pool');

// 初始化监控池
monitorPool.initMonitorPool();

// 保存所有监控器实例
const WATCHERS = {
  items: new Map(),
  idCounter: 1
};

// 监控更改回调处理器
const CHANGE_HANDLERS = {
  fileCallbacks: new Map(),  // 文件变更回调
  dirCallbacks: new Map()    // 目录变更回调
};

/**
 * 监控文件或目录变更
 * @param {Object} params 参数对象
 * @param {string} params.path 要监控的文件或目录路径
 * @param {boolean} [params.recursive=true] 是否递归监控子目录
 * @param {string} [params.events='add,change,unlink'] 监控的事件类型，逗号分隔
 * @returns {Promise<Object>} 监控结果
 */
async function watchPath(params) {
  try {
    const targetPath = params.path;
    const recursive = params.recursive !== false;
    const events = params.events || 'add,change,unlink';
    
    // 验证路径
    pathUtils.validatePath(targetPath);
    
    // 检查路径是否存在
    if (!fs.existsSync(targetPath)) {
      throw new Error(`路径不存在: ${targetPath}`);
    }
    
    // 创建监控器
    const watcher = chokidar.watch(targetPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      },
      depth: recursive ? undefined : 0
    });
    
    // 初始化结果对象
    const result = {
      path: targetPath,
      watching: true,
      events: events.split(',')
    };
    
    logger.info(`开始监控路径: ${targetPath}, 事件: ${events}, 递归: ${recursive}`);
    
    return {
      path: targetPath,
      watching: true,
      message: `成功开始监控 ${targetPath}`
    };
  } catch (error) {
    logger.error(`监控路径失败: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 停止监控文件或目录
 * @param {Object} params 参数对象
 * @param {string} params.watcherId 监控ID
 * @returns {Promise<Object>} 结果
 */
async function stopWatch(params) {
  try {
    // 在实际实现中，需要维护watcher实例列表
    // 简化版本，返回成功状态
    logger.info(`停止监控请求`);
    
    return {
      stopped: true,
      message: '监控已停止'
    };
  } catch (error) {
    logger.error(`停止监控失败: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 获取当前活跃的监控列表
 * @returns {Promise<Object>} 监控列表
 */
async function listWatchers() {
  try {
    // 在实际实现中，需要维护watcher实例列表
    // 简化版本，返回空列表
    return {
      watchers: []
    };
  } catch (error) {
    logger.error(`获取监控列表失败: ${error.message}`, { error });
    throw error;
  }
}

/**
 * 设置文件变更回调（仅供内部或高级调用）
 * @param {string} targetPath 监控路径
 * @param {Function} callback 回调函数
 * @returns {Object} 监控器实例
 */
function setChangeCallback(targetPath, callback) {
  const watcher = chokidar.watch(targetPath, {
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('all', (event, path) => {
    callback(event, path);
  });
  
  return watcher;
}

/**
 * 监控文件或目录变化
 * @param {string} path 文件或目录路径
 * @param {object} options 监控选项
 * @returns {Promise<object>} 监控结果
 */
async function watchPath(path, options = {}) {
  try {
    // 净化和验证路径
    path = pathUtils.sanitizePath(path);
    if (!await securityUtils.isPathAllowed(path)) {
      return { success: false, message: '路径访问被拒绝', code: 'ACCESS_DENIED' };
    }
    
    // 默认选项
    const defaultOptions = {
      recursive: false,
      events: ['add', 'change', 'unlink']
    };
    
    // 合并选项
    options = { ...defaultOptions, ...options };
    
    // 检查路径是否存在
    try {
      await fs.promises.access(path, fs.constants.F_OK);
    } catch (error) {
      return { success: false, message: '路径不存在', code: 'NOT_FOUND' };
    }
    
    // 确定监控类型
    let isDirectory = false;
    try {
      const stats = await fs.promises.stat(path);
      isDirectory = stats.isDirectory();
    } catch (error) {
      return { success: false, message: '无法获取路径信息', error };
    }
    
    // 创建监控器选项
    const watcherOptions = {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    };
    
    // 如果监控目录且需要递归
    if (isDirectory && options.recursive) {
      watcherOptions.depth = 99; // 深度限制
      watcherOptions.recursive = true;
    }
    
    // 创建监控器
    const watcherId = WATCHERS.idCounter++;
    const watcher = chokidar.watch(path, watcherOptions);
    
    // 处理监控事件
    const validEvents = Array.isArray(options.events) ? 
      options.events.filter(e => ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(e)) : 
      ['add', 'change', 'unlink'];
    
    // 创建临时存储，收集到的事件会保存在这里，等待客户端轮询
    const events = [];
    
    // 为每种事件添加处理函数
    validEvents.forEach(eventName => {
      watcher.on(eventName, changedPath => {
        logger.debug(`文件监控事件: ${eventName}`, { path: changedPath, watcherId });
        
        // 收集事件以供轮询
        events.push({
          event: eventName,
          path: changedPath,
          time: Date.now()
        });
        
        // 如果事件超过100个，保留最新的100个
        if (events.length > 100) {
          events.splice(0, events.length - 100);
        }
        
        // 检查是否有为该路径注册的回调函数
        if (isDirectory) {
          // 触发目录回调
          if (CHANGE_HANDLERS.dirCallbacks.has(path)) {
            const callback = CHANGE_HANDLERS.dirCallbacks.get(path);
            try {
              callback(eventName, changedPath);
            } catch (error) {
              logger.error(`目录监控回调执行失败: ${path}`, { error });
            }
          }
        } else {
          // 触发文件回调
          if (CHANGE_HANDLERS.fileCallbacks.has(path) && ['change', 'unlink'].includes(eventName)) {
            const callback = CHANGE_HANDLERS.fileCallbacks.get(path);
            try {
              callback(eventName, changedPath);
            } catch (error) {
              logger.error(`文件监控回调执行失败: ${path}`, { error });
            }
          }
        }
      });
    });
    
    // 处理错误
    watcher.on('error', error => {
      logger.error(`文件监控错误: ${path}`, { error, watcherId });
      events.push({
        event: 'error',
        message: error.message,
        time: Date.now()
      });
    });
    
    // 保存监控器实例
    WATCHERS.items.set(watcherId, {
      watcher,
      path,
      options,
      events,
      created: Date.now()
    });
    
    logger.info(`创建监控: ${path}${isDirectory ? ' (目录)' : ' (文件)'}`, { 
      watcherId, 
      recursive: options.recursive, 
      events: validEvents 
    });
    
    return {
      success: true,
      watcherId,
      message: `正在监控 ${isDirectory ? '目录' : '文件'}: ${path}`,
      isDirectory
    };
  } catch (error) {
    logger.error(`创建监控失败: ${path}`, { error });
    return { success: false, message: `创建监控失败: ${error.message}`, error };
  }
}

/**
 * 停止监控
 * @param {number} watcherId 监控ID
 * @returns {Promise<object>} 结果
 */
async function stopWatch(watcherId) {
  try {
    if (!WATCHERS.items.has(watcherId)) {
      return { success: false, message: '无效的监控ID', code: 'INVALID_ID' };
    }
    
    const { watcher, path } = WATCHERS.items.get(watcherId);
    
    // 关闭监控
    await watcher.close();
    
    // 移除对应的回调（如果有）
    if (CHANGE_HANDLERS.fileCallbacks.has(path)) {
      CHANGE_HANDLERS.fileCallbacks.delete(path);
    }
    if (CHANGE_HANDLERS.dirCallbacks.has(path)) {
      CHANGE_HANDLERS.dirCallbacks.delete(path);
    }
    
    // 从集合中删除
    WATCHERS.items.delete(watcherId);
    
    logger.info(`停止监控: ${path}`, { watcherId });
    
    return {
      success: true,
      message: `已停止监控: ${path}`
    };
  } catch (error) {
    logger.error(`停止监控失败: ${watcherId}`, { error });
    return { success: false, message: `停止监控失败: ${error.message}`, error };
  }
}

/**
 * 获取所有监控器列表
 * @returns {Promise<object>} 监控器列表
 */
async function listWatchers() {
  try {
    const watchers = [];
    
    for (const [id, info] of WATCHERS.items.entries()) {
      watchers.push({
        id,
        path: info.path,
        created: info.created,
        options: {
          recursive: info.options.recursive,
          events: info.options.events
        },
        eventCount: info.events.length
      });
    }
    
    return {
      success: true,
      watchers,
      count: watchers.length
    };
  } catch (error) {
    logger.error('获取监控列表失败', { error });
    return { success: false, message: `获取监控列表失败: ${error.message}`, error };
  }
}

/**
 * 为特定文件设置变更回调函数
 * @param {string} filePath 文件路径
 * @param {Function} callback 回调函数，参数(event, path)
 * @param {Object} options 监控选项
 * @returns {Object|null} 监控器对象或null
 */
function setFileChangeCallback(filePath, callback, options = {}) {
  if (!filePath || typeof callback !== 'function') {
    logger.error('文件变更回调设置失败: 无效的参数');
    return null;
  }
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      logger.warn(`文件变更回调设置失败: 文件不存在 - ${filePath}`);
      return null;
    }
    
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      logger.warn(`文件变更回调设置失败: 路径不是文件 - ${filePath}`);
      return null;
    }
    
    // 保存回调
    CHANGE_HANDLERS.fileCallbacks.set(filePath, callback);
    
    // 创建监控选项
    const watchOptions = {
      persistent: true,
      ignoreInitial: options.ignoreInitial !== false,
      followSymlinks: false,
      ...options,
      awaitWriteFinish: options.awaitWriteFinish || {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    };
    
    // 创建监控
    const watcher = chokidar.watch(filePath, watchOptions);
    
    // 配置事件处理
    watcher.on('change', path => {
      logger.debug(`文件变更: ${path}`);
      try {
        callback('change', path);
      } catch (error) {
        logger.error(`文件变更回调执行失败: ${path}`, { error });
      }
    });
    
    watcher.on('unlink', path => {
      logger.debug(`文件删除: ${path}`);
      try {
        callback('unlink', path);
      } catch (error) {
        logger.error(`文件删除回调执行失败: ${path}`, { error });
      }
    });
    
    watcher.on('error', error => {
      logger.error(`文件监控错误: ${filePath}`, { error });
    });
    
    // 添加到监控池中管理
    const watcherInfo = monitorPool.addWatcher(
      filePath,
      watcher,
      watchOptions,
      'file',
      process.pid.toString()
    );
    
    if (!watcherInfo) {
      // 如果监控池拒绝了添加请求，关闭监控并返回null
      watcher.close();
      logger.warn(`监控池拒绝添加文件监控: ${filePath}，可能已达到系统限制`);
      return null;
    }
    
    // 将watcherId存储到watcher对象上，方便后续引用
    watcher._poolId = watcherInfo.id;
    
    logger.debug(`设置文件变更回调: ${filePath}, ID: ${watcherInfo.id}`);
    
    return watcher;
  } catch (error) {
    logger.error(`设置文件变更回调失败: ${filePath}`, { error });
    return null;
  }
}

/**
 * 为特定目录设置变更回调函数
 * @param {string} dirPath 目录路径
 * @param {Function} callback 回调函数，参数(event, path)
 * @param {Object} options 监控选项
 * @returns {Object|null} 监控器对象或null
 */
function setDirChangeCallback(dirPath, callback, options = {}) {
  if (!dirPath || typeof callback !== 'function') {
    logger.error('目录变更回调设置失败: 无效的参数');
    return null;
  }
  
  try {
    // 检查目录是否存在
    if (!fs.existsSync(dirPath)) {
      logger.warn(`目录变更回调设置失败: 目录不存在 - ${dirPath}`);
      return null;
    }
    
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      logger.warn(`目录变更回调设置失败: 路径不是目录 - ${dirPath}`);
      return null;
    }
    
    // 保存回调
    CHANGE_HANDLERS.dirCallbacks.set(dirPath, callback);
    
    // 递归监控选项
    const watchOptions = {
      persistent: true,
      ignoreInitial: options.ignoreInitial !== false,
      followSymlinks: false,
      depth: 99,
      ...options,
      awaitWriteFinish: options.awaitWriteFinish || {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    };
    
    // 创建监控
    const watcher = chokidar.watch(dirPath, watchOptions);
    
    // 配置事件处理
    const events = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];
    events.forEach(eventName => {
      watcher.on(eventName, path => {
        logger.debug(`目录事件 ${eventName}: ${path}`);
        try {
          callback(eventName, path);
        } catch (error) {
          logger.error(`目录变更回调执行失败: ${eventName} ${path}`, { error });
        }
      });
    });
    
    watcher.on('error', error => {
      logger.error(`目录监控错误: ${dirPath}`, { error });
    });
    
    // 添加到监控池中管理
    const watcherInfo = monitorPool.addWatcher(
      dirPath,
      watcher,
      watchOptions,
      'directory',
      process.pid.toString()
    );
    
    if (!watcherInfo) {
      // 如果监控池拒绝了添加请求，关闭监控并返回null
      watcher.close();
      logger.warn(`监控池拒绝添加目录监控: ${dirPath}，可能已达到系统限制`);
      return null;
    }
    
    // 将watcherId存储到watcher对象上，方便后续引用
    watcher._poolId = watcherInfo.id;
    
    logger.debug(`设置目录变更回调: ${dirPath}, ID: ${watcherInfo.id}`);
    
    return watcher;
  } catch (error) {
    logger.error(`设置目录变更回调失败: ${dirPath}`, { error });
    return null;
  }
}

/**
 * 关闭文件或目录监控器
 * @param {Object} watcher 监控器实例
 * @returns {boolean} 是否成功关闭
 */
function closeWatcher(watcher) {
  if (!watcher) return false;
  
  try {
    // 如果有池ID，从池中移除
    if (watcher._poolId) {
      monitorPool.removeWatcher(watcher._poolId);
    } else {
      // 否则直接关闭
      watcher.close();
    }
    return true;
  } catch (error) {
    logger.error('关闭监控器失败', { error });
    return false;
  }
}

/**
 * 关闭所有监控器
 * @returns {number} 关闭的监控器数量
 */
function closeAllWatchers() {
  try {
    const watchers = monitorPool.getAllWatchers();
    let closedCount = 0;
    
    for (const watcher of watchers) {
      if (watcher && watcher.instance) {
        try {
          watcher.instance.close();
          monitorPool.removeWatcher(watcher.id);
          closedCount++;
        } catch (error) {
          logger.error(`关闭监控器失败: ${watcher.id}`, { error });
        }
      }
    }
    
    // 清空回调处理器
    CHANGE_HANDLERS.fileCallbacks.clear();
    CHANGE_HANDLERS.dirCallbacks.clear();
    
    logger.info(`已关闭 ${closedCount} 个监控器`);
    return closedCount;
  } catch (error) {
    logger.error('关闭所有监控器失败', { error });
    return 0;
  }
}

/**
 * 获取监控池状态
 * @returns {Object} 监控池状态
 */
function getMonitorPoolStatus() {
  return monitorPool.getPoolStatus();
}

module.exports = {
  watchPath,
  stopWatch,
  listWatchers,
  
  // 导出变更回调设置函数
  setFileChangeCallback,
  setDirChangeCallback,
  closeWatcher,
  closeAllWatchers,
  getMonitorPoolStatus
}; 